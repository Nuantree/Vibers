import { GARDENS, CROPS, COMPANIONS, CLOAKS, STATIONS, distance } from './public/catalog.js';

// Cozy activities use the same server-owned inventory and persistent player save.
export function hydrateCozy(p,old={}){
  p.garden=structuredClone(old.garden??{});p.seeds=old.seeds??3;p.harvests=old.harvests??0;
  p.companion={kind:null,name:'团团',bond:0,lastPet:0,...old.companion};
}
export function createCozy({send,broadcast,sys,update,gain,now=Date.now}){
  const publicPet=p=>({kind:p.companion.kind,name:p.companion.name,bond:p.companion.bond});
  const sync=p=>{broadcast({t:'pu',player:{id:p.id,color:p.color,companion:publicPet(p)}});update(p);};
  const effect=(p,kind,text,at=p)=>broadcast({t:'fx',id:p.id,x:at.x,y:at.y,kind,text});
  function companion(p,m){
    const c=p.companion,time=now();
    if(m.action==='adopt'){
      const type=COMPANIONS.find(c=>c.id===m.kind);if(!type)return;
      if(distance(p,STATIONS.find(s=>s.id==='camp'))>2)return sys(p,'到篝火旁，和小伙伴见个面吧。');
      if(c.kind===m.kind)return;
      const first=!c.kind;c.kind=type.id;if(first)c.name=type.defaultName;
      effect(p,'heart',first?`${c.name}加入旅途`:'新的同行伙伴');sync(p);return;
    }
    if(!c.kind)return sys(p,'先在篝火旁结识一位小伙伴。');
    if(m.action==='rename'){
      const name=typeof m.name==='string'?m.name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,12):'';
      if(!name)return;c.name=name;sync(p);return;
    }
    if(m.action==='pet'){
      if(time-c.lastPet<15000)return sys(p,'小伙伴还在开心地摇尾巴，等一小会儿再摸摸。');
      c.lastPet=time;const full=c.bond>=100;c.bond=Math.min(100,c.bond+1);effect(p,'heart',full?'它开心地蹭了蹭你':'亲密 +1');sync(p);return;
    }
    if(m.action==='feed'){
      const choices={herb:2,fish:4,flower:8};if(!Object.hasOwn(choices,m.item))return;
      if(c.bond>=100)return sys(p,'小伙伴已经和你心意相通，留着礼物下次用吧。');
      if(!p.inv[m.item])return sys(p,'背包里还没有这份礼物。');
      const earned=Math.min(choices[m.item],100-c.bond);p.inv[m.item]--;c.bond+=earned;effect(p,'heart',`亲密 +${earned}`);sync(p);
    }
  }
  function garden(p,m){
    const bed=GARDENS.find(g=>g.id===m.id);if(!bed)return;
    if(distance(p,bed)>2)return sys(p,'请先走到篝火北边的花圃旁。');
    const plot=p.garden[bed.id],time=now();
    if(m.action==='plant'){
      const crop=CROPS.find(c=>c.id===m.crop);if(!crop||plot||p.seeds<1)return;
      p.seeds--;p.garden[bed.id]={crop:crop.id,plantedAt:time,readyAt:time+crop.growMs,watered:false};effect(p,'plant','种下一个小愿望',bed);update(p);
    }else if(m.action==='water'){
      if(!plot||plot.watered||time>=plot.readyAt)return;
      plot.watered=true;plot.readyAt=time+Math.ceil((plot.readyAt-time)/2);effect(p,'water','剩余时间减半',bed);update(p);
    }else if(m.action==='harvest'){
      if(!plot||time<plot.readyAt)return;
      const crop=CROPS.find(c=>c.id===plot.crop);if(!crop)return;
      // Remove before granting rewards: duplicate harvest messages cannot pay twice.
      delete p.garden[bed.id];p.inv[crop.item]=(p.inv[crop.item]??0)+crop.amount;p.seeds++;p.harvests++;gain(p,8);
      effect(p,'harvest',`+${crop.amount} ${crop.name} · 种子已返还`,bed);update(p);
    }
  }
  function wardrobe(p,{color}){if(!CLOAKS.some(c=>c.id===color)||color===p.color)return;p.color=color;sync(p);effect(p,'craft','换上新的心情');}
  function emote(p,{emote}){if(!['wave','heart','sit'].includes(emote)||now()-(p.lastEmote??0)<1500)return;p.lastEmote=now();broadcast({t:'fx',kind:'emote',emote,id:p.id,x:p.x,y:p.y});}
  return {handlers:{companion,garden,wardrobe,emote}};
}
