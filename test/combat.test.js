import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../combat.js';
import { hydrate, progress } from '../gameplay.js';
import { SPAWN } from '../world.js';
function harness({random=()=>.9,walkable=(x,y)=>x>=0&&y>=0&&x<80&&y<60}={}){
  const p={id:1,x:29,y:30,facing:{x:0,y:-1}},messages=[];hydrate(p);let time=10000;
  const players=new Map([[1,p]]),combat=createCombat({players,send:(_,m)=>messages.push(m),broadcast:m=>messages.push(m),sys:()=>{},update:()=>{},walkable,gain:(p,n)=>p.xp+=n,cancelFishing:()=>{},now:()=>time,random});
  return {p,messages,players,combat,advance:ms=>time+=ms};
}
test('three hits build a combo, enforce cooldown, stagger and expire after a pause',()=>{
  const {p,combat,advance,messages}=harness();const e=combat.enemies.find(e=>e.type==='dummy');p.x=e.x-1;p.y=e.y;
  combat.attack(p,{id:e.id});assert.equal(e.lastDamage,12);assert.equal(p.combo,1);combat.attack(p,{id:e.id});assert.equal(p.combo,1);
  advance(321);combat.attack(p,{id:e.id});assert.equal(p.combo,2);advance(321);combat.attack(p,{id:e.id});assert.equal(p.combo,3);assert.equal(e.lastDamage,20);assert.ok(e.staggerUntil>10000);
  advance(1400);combat.attack(p,{id:e.id});assert.equal(p.combo,1);assert.ok(messages.some(m=>m.kind==='swing'&&m.combo===3));
});
test('critical hits are explicit and dummy practice cannot award loot or XP',()=>{
  const {p,combat,advance,messages}=harness({random:()=>0});const e=combat.enemies.find(e=>e.type==='dummy');p.x=e.x-1;p.y=e.y;const before=progress(p);
  for(let i=0;i<60;i++){combat.attack(p,{id:e.id});advance(700);}assert.equal(e.alive,true);assert.equal(e.hp,e.maxHp);assert.deepEqual(progress(p),before);assert.ok(messages.some(m=>m.kind==='hit'&&m.crit&&m.text==='暴击 −20'));
});
test('dash spends stamina once, blocks corner cutting and never passes obstacles',()=>{
  const {p,combat,advance}=harness({walkable:(x,y)=>!(x===31&&y===30)&&!(x===30&&y===31)});
  combat.dash(p,{dx:1,dy:1});assert.equal(p.x,29);assert.equal(p.stamina,undefined);
  combat.dash(p,{dx:1,dy:0});assert.equal(p.x,30);assert.equal(p.stamina,75);assert.equal(p.invulnerableUntil,10420);
  combat.dash(p,{dx:-1,dy:0});assert.equal(p.x,30);advance(1200);p.stamina=24;combat.dash(p,{dx:-1,dy:0});assert.equal(p.x,30);
});
test('stamina regenerates at a bounded rate, and cannot be made negative by skill spam',()=>{
  const {p,combat,advance}=harness();combat.skill(p);assert.equal(p.stamina,65);combat.skill(p);assert.equal(p.stamina,65);
  advance(300);combat.tick();assert.equal(p.stamina,65);advance(400);combat.tick();assert.ok(p.stamina>65&&p.stamina<71);
  for(let i=0;i<30;i++){advance(300);combat.tick();}assert.equal(p.stamina,100);
  p.stamina=34;combat.skill(p);assert.equal(p.stamina,34);
});
test('windup deals no immediate damage; leaving the marked area avoids the hit',()=>{
  const {p,combat,advance}=harness();const e=combat.enemies[0];combat.tick();assert.ok(e.attack);assert.equal(p.hp,100);
  const area={...e.attack};p.x+=3;advance(651);combat.tick();assert.equal(p.hp,100);assert.equal(e.attack,null);assert.equal(area.x,29);assert.equal(area.y,30);
});
test('timed dash grants invulnerability, armor reduces damage, safe town remains safe',()=>{
  const h=harness();const {p,combat,advance,messages}=h;const e=combat.enemies[0];combat.tick();advance(300);combat.dash(p,{dx:1,dy:0});p.x=29;p.y=30;advance(351);combat.tick();assert.equal(p.hp,100);assert.ok(messages.some(m=>m.kind==='dodge'));
  p.equipment.armor=true;advance(1500);e.x=29;e.y=29;combat.tick();assert.ok(e.attack);advance(651);combat.tick();assert.equal(p.hp,95);
  Object.assign(p,SPAWN);e.attack={...SPAWN,radius:4,startedAt:0,impactAt:0};combat.tick();assert.equal(p.hp,95);
});
test('area slash interrupts windup, knocks back, respects radius, and has a cooldown',()=>{
  const {p,combat,advance}=harness();const e=combat.enemies[0],far=combat.enemies[1];combat.tick();assert.ok(e.attack);const oldY=e.y;
  combat.skill(p);assert.equal(e.hp,24);assert.equal(e.attack,null);assert.equal(e.y,oldY-1);assert.equal(far.hp,48);assert.equal(p.stamina,65);
  combat.skill(p);assert.equal(e.hp,24);advance(5501);p.stamina=100;combat.skill(p);assert.equal(e.alive,false);assert.equal(p.stats.kills,1);assert.equal(p.gold,8);
});
test('guardian rage speeds up the telegraph and circular damage matches its warning',()=>{
  const {p,combat,advance}=harness();const e=combat.enemies.find(e=>e.type==='guardian');p.x=e.x;p.y=e.y+1;e.hp=100;combat.tick();assert.equal(e.attack.impactAt-e.attack.startedAt,750);
  const area={...e.attack};p.x=area.x+2;p.y=area.y+2;advance(751);combat.tick();assert.equal(p.hp,100,'diagonal points outside the circle must not take damage');
});
