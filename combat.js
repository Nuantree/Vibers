import { TRAINING, distance, levelFor, maxHealth } from './public/catalog.js';
import { SPAWN, inTown } from './world.js';

// All damage, cooldowns, invulnerability and rewards are server-authoritative.
export function createCombat({ players, send, broadcast, sys, update, walkable, gain, cancelFishing, now = Date.now, random = Math.random }) {
  const enemies = [[29,29,'slime'],[30,24,'slime'],[26,32,'slime'],[33,22,'slime'],[49,35,'slime'],[55,32,'slime'],[24,18,'slime'],[22,14,'guardian'],[TRAINING.x,TRAINING.y,'dummy']].map(([x,y,type],i)=>({
    id: type==='dummy'?'training':`mob-${i}`, x,y,homeX:x,homeY:y,type,
    name: type==='dummy'?'练习木桩':type==='guardian'?'遗迹守卫':'苔藓史莱姆',
    maxHp:type==='dummy'?999:type==='guardian'?240:48, hp:type==='dummy'?999:type==='guardian'?240:48,
    alive:true,respawnAt:0,lastAttack:0,nextMove:0,attack:null,
  }));
  const state=p=>send(p,{t:'combat',stamina:p.stamina??100,serverTime:now(),dashReady:p.dashReady??0,skillReady:p.skillReady??0,combo:p.combo??0});
  const fx=(kind,data)=>broadcast({t:'fx',kind,...data});
  function damage(p,e,amount,{heavy=false,crit=false}={}) {
    const time=now();e.hp=Math.max(0,e.hp-amount);
    fx('hit',{x:e.x,y:e.y,id:p.id,targetId:e.id,text:`${crit?'暴击 ':''}−${amount}`,crit,heavy});
    if(heavy){e.attack=null;e.staggerUntil=time+850;if(e.type!=='dummy'){
      const x=e.x+Math.sign(e.x-p.x),y=e.y+Math.sign(e.y-p.y);
      if(walkable(x,y,p)&&!inTown(x,y)&&distance({x,y},{x:e.homeX,y:e.homeY})<=7&&!enemies.some(other=>other!==e&&other.alive&&other.x===x&&other.y===y)) {e.x=x;e.y=y;}
    }}
    if(e.type==='dummy') {e.hp=e.maxHp;e.lastDamage=amount;}
    else if(!e.hp){
      e.alive=false;e.attack=null;e.respawnAt=time+(e.type==='guardian'?90000:35000);
      const boss=e.type==='guardian',gold=boss?55:8;
      if(!boss)p.stats.kills++;p.gold+=gold;if(boss)p.inv.crystal+=3;gain(p,boss?90:20);
      fx('death',{x:e.x,y:e.y,targetId:e.id,boss});
      send(p,{t:'fx',kind:'reward',x:p.x,y:p.y,text:`+${gold} 金币`});
      sys(p,`击败${e.name}，获得 ${gold} 金币${boss?'与 3 星辉碎片':''}。`,'good');
    }
    broadcast({t:'enemy',enemy:e});
  }
  function attack(p,{id}={}){
    const time=now();if(time<(p.attackReady??0))return;
    const e=enemies.find(e=>e.id===id&&e.alive&&distance(p,e)<=1);
    // Empty swings are useful for learning the combo, but never grant rewards.
    if(id&&!e)return;
    cancelFishing(p);p.combo=time-(p.lastAttack??0)<1250?(p.combo??0)%3+1:1;p.lastAttack=time;
    p.attackReady=time+(p.combo===3?600:320);
    if(e)p.facing={x:Math.sign(e.x-p.x),y:Math.sign(e.y-p.y)};
    const heavy=p.combo===3;
    fx('swing',{id:p.id,x:p.x,y:p.y,facing:p.facing,combo:p.combo,heavy});
    if(e){const crit=random()<.13,base=(p.equipment.sword?22:12)+(levelFor(p.xp)-1)*2;damage(p,e,Math.round(base*(heavy?1.7:1)*(crit?1.65:1)),{heavy,crit});update(p);}
    state(p);
  }
  function dash(p,{dx,dy}={}){
    const time=now();if(time<(p.dashReady??0)||(p.stamina??100)<25)return;
    dx=Number.isFinite(dx)?Math.sign(dx):p.facing?.x??0;dy=Number.isFinite(dy)?Math.sign(dy):p.facing?.y??1;
    if(!dx&&!dy){dx=p.facing?.x??0;dy=p.facing?.y??1;}
    const from={x:p.x,y:p.y};let steps=0;
    for(let i=0;i<2;i++){
      if(!walkable(p.x+dx,p.y+dy,p)||(dx&&dy&&(!walkable(p.x+dx,p.y,p)||!walkable(p.x,p.y+dy,p))))break;
      p.x+=dx;p.y+=dy;steps++;
    }
    if(!steps)return;
    cancelFishing(p);p.stamina=(p.stamina??100)-25;p.lastSpend=time;p.dashReady=time+1100;p.invulnerableUntil=time+420;p.lastMove=time;p.facing={x:dx,y:dy};
    broadcast({t:'pm',id:p.id,x:p.x,y:p.y,facing:p.facing});fx('dash',{id:p.id,x:p.x,y:p.y,from});state(p);
  }
  function skill(p){
    const time=now();if(time<(p.skillReady??0)||(p.stamina??100)<35)return;
    cancelFishing(p);p.stamina=(p.stamina??100)-35;p.lastSpend=time;p.skillReady=time+5500;p.attackReady=time+600;
    fx('skill',{id:p.id,x:p.x,y:p.y});
    for(const e of enemies)if(e.alive&&Math.hypot(p.x-e.x,p.y-e.y)<=2.25)damage(p,e,Math.round(((p.equipment.sword?22:12)+(levelFor(p.xp)-1)*2)*2),{heavy:true});
    update(p);state(p);
  }
  let lastTick=now();
  function tick(){
    const time=now(),dt=Math.min(.3,(time-lastTick)/1000);lastTick=time;
    for(const p of players.values()){
      p.stamina??=100;
      if(p.stamina<100&&time-(p.lastSpend??0)>650){p.stamina=Math.min(100,p.stamina+dt*17);if(p.stamina===100||time-(p.lastCombatState??0)>250){state(p);p.lastCombatState=time;}}
    }
    for(const e of enemies){
      if(e.type==='dummy')continue;
      if(!e.alive){if(time<e.respawnAt)continue;Object.assign(e,{alive:true,hp:e.maxHp,x:e.homeX,y:e.homeY,attack:null});}
      if(time<(e.staggerUntil??0))continue;
      if(e.attack){
        if(time<e.attack.impactAt)continue;
        const area=e.attack;e.attack=null;e.lastAttack=time;e.nextMove=time+650;
        fx('slam',{x:area.x,y:area.y,radius:area.radius,boss:e.type==='guardian'});
        for(const p of players.values())if(!inTown(p.x,p.y)&&Math.hypot(p.x-area.x,p.y-area.y)<=area.radius+.35&&time>(p.protectedUntil??0)){
          if(time<(p.invulnerableUntil??0)){send(p,{t:'fx',kind:'dodge',x:p.x,y:p.y,text:'完美闪避'});continue;}
          const amount=Math.round((e.type==='guardian'?(e.hp<e.maxHp/2?21:16):7)*(p.equipment.armor?.75:1));
          p.hp=Math.max(0,p.hp-amount);send(p,{t:'fx',kind:'hurt',id:p.id,x:p.x,y:p.y,text:`−${amount}`});
          if(!p.hp){p.hp=maxHealth(p.xp);p.x=SPAWN.x;p.y=SPAWN.y;p.protectedUntil=time+5000;cancelFishing(p);broadcast({t:'pm',id:p.id,x:p.x,y:p.y});send(p,{t:'rescued'});sys(p,'守林人把你带回了篝火旁。背包和金币都还在，整装后再出发。','bad');}
          update(p);
        }
        broadcast({t:'enemy',enemy:e});continue;
      }
      const target=[...players.values()].filter(p=>!inTown(p.x,p.y)&&distance(p,e)<6&&time>(p.protectedUntil??0)).sort((a,b)=>distance(a,e)-distance(b,e))[0];
      if(target&&distance(e,target)<=(e.type==='guardian'?2:1)&&time-e.lastAttack>1200){
        const enraged=e.type==='guardian'&&e.hp<e.maxHp/2;
        e.attack={x:target.x,y:target.y,startedAt:time,impactAt:time+(e.type==='guardian'?(enraged?750:1100):650),radius:e.type==='guardian'?2:1};
        broadcast({t:'enemy',enemy:e});continue;
      }
      if(time<e.nextMove)continue;e.nextMove=time+(e.type==='guardian'?750:650);
      const dest=target??{x:e.homeX,y:e.homeY},dx=Math.sign(dest.x-e.x),dy=Math.sign(dest.y-e.y);
      if(!target&&distance(e,dest)===0&&e.hp<e.maxHp){e.hp=Math.min(e.maxHp,e.hp+4);}
      for(const [a,b]of [[dx,0],[0,dy]].filter(([a,b])=>a||b)){
        const x=e.x+a,y=e.y+b;
        if(walkable(x,y,{wallet:null})&&!inTown(x,y)&&distance({x,y},{x:e.homeX,y:e.homeY})<=7&&!enemies.some(o=>o!==e&&o.alive&&o.x===x&&o.y===y)){e.x=x;e.y=y;break;}
      }
      broadcast({t:'enemy',enemy:e});
    }
  }
  return {enemies,attack,dash,skill,tick};
}
