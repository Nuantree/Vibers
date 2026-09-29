import test from 'node:test';
import assert from 'node:assert/strict';
import { createCozy } from '../cozy.js';
import { hydrate,progress } from '../gameplay.js';
import { GARDENS } from '../public/catalog.js';
function harness(old={}){let time=100000;const p={id:1,x:38,y:30},events=[];hydrate(p,old);const cozy=createCozy({send:(_,m)=>events.push(m),broadcast:m=>events.push(m),sys:(_,text)=>events.push({t:'sys',text}),update:()=>{},gain:(p,n)=>p.xp+=n,now:()=>time});return {p,events,handlers:cozy.handlers,advance:ms=>time+=ms};}
test('old saves receive one starter seed pack; pet and growing beds survive hydration without aliasing',()=>{
  const {p,handlers}=harness();assert.equal(p.seeds,3);assert.equal(p.companion.kind,null);assert.equal(p.inv.flower,0);
  handlers.garden(p,{action:'plant',id:'fern',crop:'starflower'});handlers.companion(p,{action:'adopt',kind:'fox'});const saved=progress(p),restored={};hydrate(restored,saved);assert.equal(restored.seeds,2);assert.equal(restored.companion.kind,'fox');assert.deepEqual(restored.garden,p.garden);
  restored.garden.fern.watered=true;assert.equal(saved.garden.fern.watered,false);assert.equal(p.garden.fern.watered,false);
});
test('gardening requires proximity, a valid empty bed and a seed',()=>{
  const {p,handlers}=harness();p.x=1;p.y=1;handlers.garden(p,{action:'plant',id:'fern',crop:'moonherb'});assert.equal(p.seeds,3);
  p.x=37;p.y=30;handlers.garden(p,{action:'plant',id:'__proto__',crop:'moonherb'});handlers.garden(p,{action:'plant',id:'fern',crop:'invented'});assert.equal(p.seeds,3);
  handlers.garden(p,{action:'plant',id:'fern',crop:'moonherb'});assert.equal(p.seeds,2);handlers.garden(p,{action:'plant',id:'fern',crop:'starflower'});assert.equal(p.seeds,2);assert.equal(p.garden.fern.crop,'moonherb');
  p.seeds=0;handlers.garden(p,{action:'plant',id:'dew',crop:'moonherb'});assert.equal(p.garden.dew,undefined);
});
test('watering halves only remaining time once; early and duplicate harvests pay nothing',()=>{
  const {p,handlers,advance}=harness();handlers.garden(p,{action:'plant',id:'fern',crop:'moonherb'});advance(10000);handlers.garden(p,{action:'water',id:'fern'});assert.equal(p.garden.fern.readyAt,135000);
  handlers.garden(p,{action:'water',id:'fern'});assert.equal(p.garden.fern.readyAt,135000);handlers.garden(p,{action:'harvest',id:'fern'});assert.equal(p.inv.herb,0);
  advance(25000);handlers.garden(p,{action:'harvest',id:'fern'});assert.equal(p.inv.herb,2);assert.equal(p.seeds,3);assert.equal(p.harvests,1);assert.equal(p.xp,8);
  handlers.garden(p,{action:'harvest',id:'fern'});assert.equal(p.inv.herb,2);assert.equal(p.seeds,3);assert.equal(p.xp,8);
});
test('a flower can grow offline, persists its deadline and becomes a companion gift',()=>{
  const {p,handlers,advance}=harness();handlers.companion(p,{action:'adopt',kind:'bunny'});handlers.garden(p,{action:'plant',id:'star',crop:'starflower'});const saved=progress(p);hydrate(p,saved);advance(90000);handlers.garden(p,{action:'harvest',id:'star'});assert.equal(p.inv.flower,1);
  handlers.companion(p,{action:'feed',item:'flower'});assert.equal(p.inv.flower,0);assert.equal(p.companion.bond,8);handlers.companion(p,{action:'feed',item:'flower'});assert.equal(p.companion.bond,8);
});
test('companion adoption checks camp; changing species preserves name and bond',()=>{
  const {p,handlers}=harness();p.x=1;p.y=1;handlers.companion(p,{action:'adopt',kind:'fox'});assert.equal(p.companion.kind,null);
  p.x=38;p.y=31;handlers.companion(p,{action:'adopt',kind:'wolf'});assert.equal(p.companion.kind,null);handlers.companion(p,{action:'adopt',kind:'fox'});assert.equal(p.companion.name,'团团');handlers.companion(p,{action:'rename',name:'  松果\n  '});assert.equal(p.companion.name,'松果');p.companion.bond=32;
  handlers.companion(p,{action:'adopt',kind:'bunny'});assert.equal(p.companion.kind,'bunny');assert.equal(p.companion.bond,32);assert.equal(p.companion.name,'松果');
});
test('petting is rate-limited across reconnects and gifts are atomic and capped',()=>{
  const {p,handlers,advance,events}=harness({inv:{flower:2}});handlers.companion(p,{action:'adopt',kind:'fox'});handlers.companion(p,{action:'pet'});assert.equal(p.companion.bond,1);handlers.companion(p,{action:'pet'});assert.equal(p.companion.bond,1);hydrate(p,progress(p));handlers.companion(p,{action:'pet'});assert.equal(p.companion.bond,1);
  advance(15000);handlers.companion(p,{action:'pet'});assert.equal(p.companion.bond,2);handlers.companion(p,{action:'feed',item:'constructor'});assert.equal(p.companion.bond,2);
  p.companion.bond=98;handlers.companion(p,{action:'feed',item:'flower'});assert.equal(p.companion.bond,100);assert.equal(p.inv.flower,1);assert.equal(events.filter(e=>e.kind==='heart').at(-1).text,'亲密 +2');handlers.companion(p,{action:'feed',item:'flower'});assert.equal(p.inv.flower,1);advance(15000);handlers.companion(p,{action:'pet'});assert.equal(p.companion.bond,100);assert.equal(events.filter(e=>e.kind==='heart').at(-1).text,'它开心地蹭了蹭你');
});
test('wardrobe and emotes only accept known values and appearance updates are shared',()=>{
  const {p,handlers,events}=harness();handlers.wardrobe(p,{color:'invented'});assert.equal(p.color,'sage');handlers.wardrobe(p,{color:'rose'});assert.equal(p.color,'rose');assert.ok(events.some(e=>e.t==='pu'&&e.player.color==='rose'));
  handlers.emote(p,{emote:'wave'});handlers.emote(p,{emote:'wave'});handlers.emote(p,{emote:'invented'});assert.equal(events.filter(e=>e.kind==='emote').length,1);assert.equal(events.find(e=>e.kind==='emote').emote,'wave');
});
