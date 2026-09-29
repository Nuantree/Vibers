import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrate, progress, createGameplay } from '../gameplay.js';
import { generateWorld, W, H, SPAWN } from '../world.js';
import { STATIONS, CHESTS, decorAt, QUESTS, POIS, maxHealth } from '../public/catalog.js';
function harness(old={}) {
  const p={id:1,x:44,y:30,wallet:null},messages=[];hydrate(p,old);
  const world=generateWorld(),players=new Map([[1,p]]);
  const game=createGameplay({world,players,send:(_,m)=>messages.push(m),broadcast:m=>messages.push(m),sys:(_,text)=>messages.push({t:'sys',text}),sendYou:()=>{},persist:()=>{},walkable:(x,y)=>x>0&&y>0&&x<W-1&&y<H-1&&world.tiles[y][x]!=='w'});
  return {p,game,messages};
}
test('old wallet saves gain defaults without losing inventory or skills',()=>{
  const p={};hydrate(p,{skills:{mining:27.2},inv:{log:17,ore:4}});
  assert.equal(p.inv.log,17);assert.equal(p.inv.potion,2);assert.equal(p.skills.mining,27.2);assert.equal(p.skills.fishing,10);
  const snapshot=progress(p);p.inv.log++;assert.equal(snapshot.inv.log,17);
});
test('crafting validates station, ingredients, and cannot duplicate equipment',()=>{
  const {p,game}=harness({inv:{log:10,ore:10}});p.x=1;p.y=1;game.handlers.craft(p,{id:'axe'});assert.equal(p.inv.log,10);
  p.x=44;p.y=30;game.handlers.craft(p,{id:'axe'});assert.equal(p.inv.log,5);assert.equal(p.inv.ore,7);assert.equal(p.equipment.axe,true);
  const before=progress(p);game.handlers.craft(p,{id:'axe'});assert.deepEqual(progress(p),before);
  game.handlers.craft(p,{id:'potion'});assert.equal(p.inv.potion,2);assert.equal(p.stats.crafted,1);
});
test('quest rewards are gated by lifetime stats and claimed exactly once',()=>{
  const {p,game}=harness();game.handlers.claim(p,{id:'wood'});assert.equal(p.gold,0);
  p.stats.log=5;game.handlers.claim(p,{id:'wood'});assert.equal(p.gold,20);assert.equal(p.xp,35);assert.deepEqual(p.claimed,['wood']);
  game.handlers.claim(p,{id:'wood'});assert.equal(p.gold,20);assert.equal(p.xp,35);
});
test('personal chests require proximity and never award twice',()=>{
  const {p,game}=harness();const c=CHESTS[0];game.handlers.chest(p,c);assert.equal(p.gold,0);
  p.x=c.x;p.y=c.y+1;game.handlers.chest(p,c);assert.equal(p.gold,25);assert.equal(p.inv.crystal,1);assert.equal(p.inv.potion,3);
  game.handlers.chest(p,c);assert.equal(p.gold,25);assert.equal(p.stats.chests,1);
});
test('combat validates proximity, enforces cooldown, grants one kill, and supports respawn',()=>{
  const {p,game}=harness();const e=game.enemies[0];game.handlers.attack(p,{id:e.id});assert.equal(e.hp,48);
  p.x=e.x;p.y=e.y+1;game.handlers.attack(p,{id:e.id});const hp=e.hp;assert.ok(hp<48);game.handlers.attack(p,{id:e.id});assert.equal(e.hp,hp);
  for(let i=0;i<5&&e.alive;i++){p.attackReady=0;p.lastAttack=0;game.handlers.attack(p,{id:e.id});}assert.equal(e.alive,false);assert.equal(p.stats.kills,1);
  p.attackReady=0;game.handlers.attack(p,{id:e.id});assert.equal(p.stats.kills,1);p.x=SPAWN.x;p.y=SPAWN.y;e.respawnAt=0;game.tick();assert.equal(e.alive,true);assert.equal(e.hp,e.maxHp);
});
test('fishing needs a rod and water; early, late and repeated reels cannot earn fish',()=>{
  const {p,game}=harness();p.x=50;p.y=21;game.handlers.fish(p,{x:49,y:21});assert.equal(p.fishing,undefined);
  p.equipment.rod=true;game.handlers.fish(p,{x:49,y:21});assert.ok(p.fishing);game.handlers.reel(p);assert.equal(p.inv.fish,0);
  p.fishing={biteAt:Date.now()-100,endsAt:Date.now()+1000};game.handlers.reel(p);assert.equal(p.inv.fish,1);game.handlers.reel(p);assert.equal(p.inv.fish,1);
  p.fishing={biteAt:Date.now()-5000,endsAt:Date.now()-1000};game.handlers.reel(p);assert.equal(p.inv.fish,1);
  game.handlers.fish(p,{x:'49',y:21});assert.equal(p.fishing,null);
});
test('potion consumption, camp healing, safe town and defeat preserve all items',()=>{
  const {p,game}=harness();game.handlers.use(p);assert.equal(p.inv.potion,2);p.hp=20;game.handlers.use(p);assert.equal(p.hp,65);assert.equal(p.inv.potion,1);
  p.x=37;p.y=32;game.handlers.rest(p);assert.equal(p.hp,maxHealth(p.xp));
  const e=game.enemies[0];p.x=e.x;p.y=e.y+1;p.hp=1;p.gold=50;game.tick();assert.ok(e.attack);assert.equal(p.hp,1);e.attack.impactAt=0;game.tick();assert.equal(p.x,SPAWN.x);assert.equal(p.y,SPAWN.y);assert.equal(p.gold,50);assert.equal(p.inv.potion,1);assert.equal(p.hp,maxHealth(p.xp));
});
test('discovery rewards only once, and all landmarks and stations are reachable',()=>{
  const {p,game}=harness();Object.assign(p,SPAWN);game.discover(p);game.discover(p);assert.equal(p.stats.explored,1);assert.equal(p.xp,20);
  const world=generateWorld(),occupied=new Set(world.resources.filter(r=>r.alive).map(r=>r.y*W+r.x));
  const blocked=(x,y)=>x<0||y<0||x>=W||y>=H||world.tiles[y][x]==='w'||decorAt(x,y)||occupied.has(y*W+x)||STATIONS.some(s=>s.x===x&&s.y===y)||CHESTS.some(c=>c.x===x&&c.y===y);
  const seen=new Set([SPAWN.y*W+SPAWN.x]),q=[SPAWN];
  for(let i=0;i<q.length;i++){const p=q[i];for(const[dx,dy]of[[0,1],[1,0],[0,-1],[-1,0]]){const x=p.x+dx,y=p.y+dy,k=y*W+x;if(!seen.has(k)&&!blocked(x,y)){seen.add(k);q.push({x,y});}}}
  for(const poi of[...POIS,...STATIONS,...CHESTS])assert.ok(q.some(p=>Math.max(Math.abs(p.x-poi.x),Math.abs(p.y-poi.y))<=1),`${poi.id} unreachable`);
});
test('sell handler does not accept inherited properties or invented items',()=>{
  const {p,game}=harness({inv:{log:1}});p.x=40;p.y=28;
  game.handlers.sell(p,{item:'__proto__'});game.handlers.sell(p,{item:'constructor'});assert.equal(p.gold,0);
  game.handlers.sell(p,{item:'log'});assert.equal(p.gold,2);assert.equal(p.inv.log,0);game.handlers.sell(p,{item:'log'});assert.equal(p.gold,2);
});
test('supplies charge game gold, check distance and never create an arbitrage',()=>{
  const {p,game}=harness({gold:20});p.x=40;p.y=28;
  game.handlers.supply(p,{id:'potion'});assert.equal(p.gold,8);assert.equal(p.inv.potion,3);
  game.handlers.supply(p,{id:'potion'});assert.equal(p.gold,8);assert.equal(p.inv.potion,3);
  game.handlers.supply(p,{id:'herbs'});assert.equal(p.gold,0);assert.equal(p.inv.herb,2);
  game.handlers.sell(p,{item:'herb'});game.handlers.sell(p,{item:'herb'});assert.equal(p.gold,6);
  p.gold=50;p.x=1;p.y=1;game.handlers.supply(p,{id:'ore'});assert.equal(p.gold,50);assert.equal(p.inv.ore,0);
});
