import { createCozy, hydrateCozy } from './cozy.js';
import { createCombat } from './combat.js';
import { RECIPES, SUPPLIES, QUESTS, POIS, STATIONS, CHESTS, distance, maxHealth, levelFor } from './public/catalog.js';
import { SPAWN, inTown } from './world.js';

export function hydrate(p, old = {}) {
  hydrateCozy(p,old);
  p.skills = { lumberjacking: 10, mining: 10, herbalism: 10, fishing: 10, ...old.skills };
  p.inv = { flower:0, log: 0, ore: 0, herb: 0, fish: 0, crystal: 0, potion: 2, ...old.inv };
  p.stats = { log: 0, ore: 0, herb: 0, kills: 0, fish: 0, crafted: 0, chests: 0, explored: 0, ...old.stats };
  p.equipment = { ...old.equipment };
  p.claimed = [...(old.claimed ?? [])]; p.discovered = [...(old.discovered ?? [])]; p.opened = [...(old.opened ?? [])];
  p.xp = old.xp ?? 0; p.gold = old.gold ?? 0;
  p.hp = Math.min(old.hp ?? 100, maxHealth(p.xp)); p.color = old.color ?? p.color ?? 'sage';
}
export function progress(p) {
  return structuredClone({ garden:p.garden,seeds:p.seeds,harvests:p.harvests,companion:p.companion,name: p.name, skills: p.skills, inv: p.inv, stats: p.stats, equipment: p.equipment, claimed: p.claimed,
    discovered: p.discovered, opened: p.opened, xp: p.xp, gold: p.gold, hp: p.hp, color: p.color });
}
export function createGameplay({ world, players, send, broadcast, sys, sendYou, persist, walkable }) {
  const update = p => { persist(p); sendYou(p); };
  const fx = (p, text, kind = 'reward') => send(p,{ t:'fx', x:p.x,y:p.y,kind,text });
  const gain = (p, xp) => {
    const before = levelFor(p.xp); p.xp += xp;
    if (levelFor(p.xp) > before) { p.hp = maxHealth(p.xp); fx(p, `Lv.${levelFor(p.xp)} 升级`, 'level'); sys(p, `升至 Lv.${levelFor(p.xp)}！生命上限提升并恢复全部生命。`, 'good'); }
  };
  const discover = p => {
    let changed = false;
    for (const poi of POIS) if (distance(p,poi) <= 4 && !p.discovered.includes(poi.id)) {
      p.discovered.push(poi.id); p.stats.explored = p.discovered.length; gain(p,20); changed = true;
      send(p,{t:'discovery',poi});
    }
    if (changed) update(p);
  };
  function craft(p, { id }) {
    const recipe = RECIPES.find(r=>r.id===id); if (!recipe) return;
    if (distance(p,STATIONS.find(s=>s.id==='workshop'))>2) return sys(p,'请先走到小镇东侧的林间工坊。','bad');
    if (recipe.equipment && p.equipment[recipe.equipment]) return sys(p,'这件装备已经制作并装备了。');
    if (Object.entries(recipe.cost).some(([k,v])=>p.inv[k]<v)) return sys(p,'材料还不够，去森林或矿场收集一些吧。','bad');
    for (const [k,v] of Object.entries(recipe.cost)) p.inv[k]-=v;
    if (recipe.equipment) {p.equipment[recipe.equipment]=true;broadcast({t:'pu',player:{id:p.id,equipment:p.equipment}});}
    if (recipe.output) for (const [k,v] of Object.entries(recipe.output)) p.inv[k]+=v;
    if (recipe.heal) p.hp=maxHealth(p.xp);
    p.stats.crafted++; gain(p,15); sys(p,`制作完成：${recipe.name}。`,'good'); fx(p,recipe.name,'craft'); update(p);
  }
  function claim(p,{id}) {
    const quest=QUESTS.find(q=>q.id===id); if(!quest || p.claimed.includes(id)) return;
    if(p.stats[quest.stat]<quest.need) return sys(p,'委托还没有完成。','bad');
    p.claimed.push(id); p.gold+=quest.gold; gain(p,quest.xp); fx(p,`+${quest.gold} 金币`,'quest');
    sys(p,`完成「${quest.title}」：+${quest.gold} 金币 · +${quest.xp} 经验。`,'good'); update(p);
  }
  function chest(p,{id}) {
    const c=CHESTS.find(c=>c.id===id); if(!c || distance(p,c)>1) return;
    if(p.opened.includes(id)) return sys(p,'这个宝箱的故事，你已经收下了。');
    p.opened.push(id); p.stats.chests++; p.gold+=25; p.inv.crystal++; p.inv.potion++; gain(p,30);
    fx(p,'+25 金币 · 星辉碎片','chest'); sys(p,'打开宝箱：25 金币、1 星辉碎片、1 生命药水。','good'); update(p);
  }
  function use(p) {
    if(p.hp>=maxHealth(p.xp)) return sys(p,'你的生命已经全满。');
    if(!p.inv.potion) return sys(p,'没有药水了。采集月光草，去工坊制作吧。','bad');
    p.inv.potion--; p.hp=Math.min(maxHealth(p.xp),p.hp+45); fx(p,'+45 生命','heal'); update(p);
  }
  function rest(p) {
    if(distance(p,STATIONS.find(s=>s.id==='camp'))>2) return sys(p,'靠近小镇的篝火，就能休息恢复生命。');
    p.hp=maxHealth(p.xp); fx(p,'生命已恢复','heal'); update(p);
  }
  function fish(p,{x,y}) {
    if(!Number.isInteger(x)||!Number.isInteger(y)||world.tiles[y]?.[x]!=='w'||distance(p,{x,y})>1) return sys(p,'走近水边，再点击水面抛竿。');
    if(!p.equipment.rod) return sys(p,'先在工坊制作柳木钓竿（4 橡木 + 2 月光草）。','bad');
    if(p.fishing) return;
    const biteAt=Date.now()+2000+Math.floor(Math.random()*2200);
    p.fishing={x,y,biteAt,endsAt:biteAt+2200}; send(p,{t:'fishing',...p.fishing});
  }
  function reel(p) {
    const f=p.fishing; if(!f) return; p.fishing=null; send(p,{t:'fishing',done:true});
    if(Date.now()<f.biteAt||Date.now()>f.endsAt) return sys(p,'鱼儿溜走了。等浮标亮起时按 E 收竿。');
    p.inv.fish++; p.stats.fish++; p.skills.fishing=Math.min(100,p.skills.fishing+.3);
    if(Math.random()<.2) { p.inv.crystal++; sys(p,'幸运的收获：鱼钩上还挂着一枚星辉碎片！','good'); }
    gain(p,12); fx(p,'+1 银鳞鱼','fish'); update(p);
  }
  function cancelFishing(p) { if(p.fishing){p.fishing=null;send(p,{t:'fishing',done:true});} }
  function recall(p) {
    if(Date.now()-(p.lastRecall??0)<10000) return sys(p,'回城石正在恢复，稍等片刻。');
    p.lastRecall=Date.now(); cancelFishing(p); p.x=SPAWN.x;p.y=SPAWN.y;p.protectedUntil=Date.now()+4000;
    broadcast({t:'pm',id:p.id,x:p.x,y:p.y}); fx(p,'回到风栖小镇','recall');
  }
  function sell(p,{item}) {
    const prices={log:2,ore:3,herb:3,fish:8,crystal:20};
    if(!Object.hasOwn(prices,item)||distance(p,STATIONS[0])>2||!p.inv[item]) return;
    p.inv[item]--;p.gold+=prices[item];fx(p,`+${prices[item]} 金币`);update(p);
  }
  function supply(p,{id}) {
    const item=SUPPLIES.find(s=>s.id===id);
    if(!item || distance(p,STATIONS[0])>2) return;
    if(p.gold<item.price) return sys(p,'金币还不够，完成委托或出售采集物都能赚取金币。','bad');
    p.gold-=item.price; p.inv[item.item]+=item.amount;
    sys(p,`获得 ${item.amount} 份${item.name}，花费 ${item.price} 游戏金币。`,'good');update(p);
  }
  function tick() {
    const now=Date.now();
    for(const p of players.values()) if(p.fishing&&now>p.fishing.endsAt){cancelFishing(p);sys(p,'鱼已游走，再抛一竿试试。');}
    combat.tick();
  }
  const cozy=createCozy({send,broadcast,sys,update,gain});
  const combat = createCombat({ players, send, broadcast, sys, update, walkable, gain, cancelFishing });
  const { enemies, attack, dash, skill } = combat;
  // Clear an enemy spawn if generation placed a resource on it.
  for(const e of enemies)for(const r of world.resources)if(r.x===e.x&&r.y===e.y){r.alive=false;r.respawnAt=Number.MAX_SAFE_INTEGER;}
  return { enemies, gain, discover, tick, cancelFishing, handlers:{...cozy.handlers,attack,dash,skill,craft,claim,chest,use,rest,fish,reel,recall,sell,supply} };
}
