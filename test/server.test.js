import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { STATIONS, CHESTS, TRAINING, GARDENS, decorAt, distance } from '../public/catalog.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,timeout=5000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return fn();await sleep(25);}throw new Error('Condition timed out');}
async function client(port,session){
  const ws=new WebSocket(`ws://127.0.0.1:${port}`),state={ws,events:[],players:new Map(),resources:new Map()};
  ws.on('message',data=>{const m=JSON.parse(data);state.events.push(m);if(m.t==='session')state.session=m.session;if(m.t==='init'){state.init=m;state.me=m.you;m.players.forEach(p=>state.players.set(p.id,p));m.resources.forEach(r=>state.resources.set(r.id,r));}if(m.t==='you')state.you=m;if(m.t==='pm')Object.assign(state.players.get(m.id)??{},{x:m.x,y:m.y});if(m.t==='pj')state.players.set(m.player.id,m.player);if(m.t==='pu')Object.assign(state.players.get(m.player.id)??{},m.player);if(m.t==='res')state.resources.set(m.r.id,m.r);});
  state.send=m=>ws.send(JSON.stringify(m));await once(ws,'open');state.send({t:'hello',name:'QA traveler',session});await waitFor(()=>state.you);return state;
}
function route(c,target){
  const {W,H,tiles}=c.init,start=c.players.get(c.me),resources=new Set([...c.resources.values()].filter(r=>r.alive).map(r=>r.y*W+r.x));
  const walk=(x,y)=>!GARDENS.some(g=>g.x===x&&g.y===y)&&!(x===TRAINING.x&&y===TRAINING.y)&&x>=0&&y>=0&&x<W&&y<H&&tiles[y][x]!=='w'&&!decorAt(x,y)&&!resources.has(y*W+x)&&!STATIONS.some(s=>s.x===x&&s.y===y)&&!CHESTS.some(s=>s.x===x&&s.y===y);
  const q=[start],visited=new Map([[start.y*W+start.x,null]]);let end;
  for(let i=0;i<q.length;i++){const p=q[i];if(distance(p,target)<=1){end=p;break;}for(const[dx,dy]of[[0,1],[1,0],[-1,0],[0,-1]]){const x=p.x+dx,y=p.y+dy,k=y*W+x;if(!visited.has(k)&&walk(x,y)){visited.set(k,p);q.push({x,y});}}}
  if(!end)return null;const result=[];while(end.x!==start.x||end.y!==start.y){result.unshift(end);end=visited.get(end.y*W+end.x);}return result;
}
test('real HTTP / multiplayer / gather / reward / reconnect / disk persistence', {timeout:45000}, async()=>{
  const dir=await mkdtemp(join(tmpdir(),'viber-qa-')),dataFile=join(dir,'save.json');
  const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',OFFLINE:'1',DATA_FILE:dataFile},stdio:['ignore','pipe','pipe']});
  const clients=[];let output='';child.stdout.on('data',x=>output+=x);
  try{
    await waitFor(()=>/localhost:(\d+)/.test(output));const port=Number(output.match(/localhost:(\d+)/)[1]);
    const cfg=await(await fetch(`http://127.0.0.1:${port}/api/config`)).json();assert.equal(cfg.token.reason,'OFFLINE');assert.equal(cfg.token.buyable,false);
    const a=await client(port);clients.push(a);const b=await client(port);clients.push(b);await waitFor(()=>a.players.has(b.me));assert.equal(a.you.stats.explored,1);
    assert.equal(a.you.stamina,100);assert.ok(a.init.enemies.some(e=>e.id==='training'));
    const moduleResponse=await fetch(`http://127.0.0.1:${port}/vendor/three.module.js`);assert.equal(moduleResponse.status,200);assert.match(moduleResponse.headers.get('content-type'),/javascript/);
    a.send({t:'skill'});await waitFor(()=>a.events.some(m=>m.t==='combat'&&m.stamina===65));assert.ok(b.events.some(m=>m.t==='fx'&&m.kind==='skill'));
    a.send({t:'skill'});await sleep(100);assert.equal(a.events.filter(m=>m.t==='fx'&&m.kind==='skill').length,1);
    await waitFor(()=>a.events.some(m=>m.t==='combat'&&m.stamina===100));
    a.send(null);a.send({t:'constructor'});a.send({t:'gather',x:999,y:31});a.send({t:'claim',id:'wood'});await sleep(100);assert.equal(a.you.gold,0);
    while(a.you.stats.log<5){
      const trees=[...a.resources.values()].filter(r=>r.type==='tree'&&r.alive).map(r=>({r,path:route(a,r)})).filter(x=>x.path).sort((x,y)=>x.path.length-y.path.length);
      const {r,path}=trees[0];for(const step of path){const p=a.players.get(a.me);a.send({t:'move',dx:step.x-p.x,dy:step.y-p.y});await waitFor(()=>a.players.get(a.me).x===step.x&&a.players.get(a.me).y===step.y);await sleep(115);}
      await waitFor(()=>b.players.get(a.me).x===a.players.get(a.me).x);
      let tries=0;while(a.resources.get(r.id).alive&&a.you.stats.log<5){assert.ok(tries++<20);a.send({t:'gather',x:r.x,y:r.y});await sleep(930);}
    }
    a.send({t:'claim',id:'wood'});await waitFor(()=>a.you.claimed.includes('wood'));const reward=a.you.gold;a.send({t:'claim',id:'wood'});await sleep(100);assert.equal(a.you.gold,reward);assert.equal(reward,20);
    const session=a.session,inventory=structuredClone(a.you.inv);a.ws.close();await once(a.ws,'close');await sleep(100);
    const restored=await client(port,session);clients.push(restored);assert.deepEqual(restored.you.inv,inventory);assert.equal(restored.you.gold,20);assert.ok(restored.you.claimed.includes('wood'));
    restored.send({t:'move',dx:-1,dy:0});await waitFor(()=>restored.players.get(restored.me).x===39);
    restored.send({t:'companion',action:'adopt',kind:'fox'});restored.send({t:'wardrobe',color:'sky'});restored.send({t:'garden',action:'plant',id:'star',crop:'starflower'});
    await waitFor(()=>restored.you.garden.star&&restored.you.companion.kind==='fox'&&restored.you.color==='sky');const deadline=restored.you.garden.star.readyAt;
    restored.send({t:'garden',action:'water',id:'star'});restored.send({t:'companion',action:'rename',name:'松果'});await waitFor(()=>restored.you.garden.star.watered&&restored.you.companion.name==='松果');assert.ok(restored.you.garden.star.readyAt<deadline);
    await waitFor(()=>b.players.get(restored.me)?.color==='sky'&&b.players.get(restored.me)?.companion?.name==='松果');assert.deepEqual(b.you.garden,{});
    const oldClosed=once(restored.ws,'close');const takeover=await client(port,session);clients.push(takeover);const [code]=await oldClosed;assert.equal(code,4001);assert.deepEqual(takeover.you.inv,inventory);assert.equal(takeover.you.seeds,2);assert.equal(takeover.you.garden.star.watered,true);assert.equal(takeover.you.companion.name,'松果');assert.equal(takeover.you.color,'sky');
    takeover.ws.close();await once(takeover.ws,'close');await sleep(100);const saved=JSON.parse(await readFile(dataFile,'utf8'));assert.equal(saved.guests[session].gold,20);assert.equal(saved.guests[session].inv.log,inventory.log);
    const response=await fetch(`http://127.0.0.1:${port}/api/buy?eth=0.001&to=0x0000000000000000000000000000000000000001`);assert.equal(response.status,409);
  }finally{for(const c of clients)c.ws.close();child.kill('SIGTERM');await once(child,'exit');await rm(dir,{recursive:true,force:true});}
});
