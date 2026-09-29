import { createLifeUI } from './life-ui.js';
import { ITEMS, RECIPES, SUPPLIES, QUESTS, POIS, STATIONS, CHESTS, TRAINING, GARDENS, decorAt, levelFor, xpFor, distance } from './catalog.js';
import { icon, paintIcons } from './icons.js';
import { createRenderer } from './renderer.js';
import { createAudio } from './audio.js';
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store={get(k,f=null){try{return localStorage.getItem(k)??f;}catch{return f;}},set(k,v){try{localStorage.setItem(k,v);}catch{}}};
const S={me:null,you:null,W:0,H:0,tiles:[],merchant:STATIONS[0],resAt:new Map(),houses:new Map(),players:new Map(),enemies:new Map(),bubbles:new Map(),fx:[],cfg:null,keys:new Set(),target:null,path:[],night:0};
const renderer=await createRenderer($('c'),S);paintIcons();
$('hud').inert=true;document.querySelector('.topbar').inert=true;
const fmt=n=>Math.floor(n).toLocaleString('en-US'),TIER={wanderer:'自由冒险者',citizen:'大陆居民',lord:'风栖领主'};
let ws,name='',color=store.get('viber-color','sage'),reconnectTimer=null,connecting=false,hasJoined=false,menu=null,menuTab='active',tracked=store.get('viber-quest','wood'),lastFocus=null;
const audio=createAudio();
let comboAt=0,lastTrainingHit=0;
let soundOn=store.get('viber-sound','1')==='1',account=null,fishing=null,discoveryTimer=null;
const me=()=>S.players.get(S.me),send=m=>{if(ws?.readyState===WebSocket.OPEN){ws.send(JSON.stringify(m));return true;}return false;};
const life=createLifeUI({S,player:me,send,navigate,close:closeDialog,store});
const typing=()=>['INPUT','TEXTAREA'].includes(document.activeElement?.tagName);
const isDialog=()=>$('dialog').classList.contains('show')||$('join').classList.contains('show');
function log(text,kind='sys',html=false){const e=document.createElement('div');e.className=kind;if(html)e.innerHTML=text;else e.textContent=text;$('log').append(e);while($('log').children.length>70)$('log').firstChild.remove();$('log').scrollTop=$('log').scrollHeight;}
function toast(text,kind=''){const el=document.createElement('div');el.className=`toast ${kind}`;el.textContent=text;$('toasts').append(el);while($('toasts').children.length>3)$('toasts').firstChild.remove();setTimeout(()=>el.remove(),4500);}
function sound(kind='reward',heavy=false){if(soundOn)audio.play(kind,heavy);}
function updateSound(){ $('btnSound').innerHTML=icon(soundOn?'sound':'muted',19);$('btnSound').setAttribute('aria-label',soundOn?'关闭音效':'开启音效');$('btnSound').title=soundOn?'关闭音效':'开启音效'; }
function connection(text,ok=false){$('connectionText').textContent=text;$('connectionDot').classList.toggle('online',ok);}
function connect(){
  if(connecting||ws?.readyState===WebSocket.OPEN)return;connecting=true;connection('正在连接');
  ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}`);
  ws.onopen=()=>{connecting=false;send({t:'hello',name,color,session:store.get('viber-session')});};
  ws.onmessage=ev=>{try{onMsg(JSON.parse(ev.data));}catch(e){console.error('Message processing failed',e);}};
  ws.onerror=()=>connection('连接暂不可用');
  ws.onclose=ev=>{
    connecting=false;S.keys.clear();S.target=null;S.path=[];fishing=null;S.fishing=null;$('fishing').hidden=true;connection('已断线');
    $('btnJoin').disabled=false;$('btnJoin').innerHTML=`重新进入世界 ${icon('arrow',21)}`;
    if(ev.code===4001){toast('这份存档已在另一个页面打开。','bad');$('joinMessage').textContent='存档在其他页面使用，点击可重新接入。';$('join').classList.add('show');$('hud').inert=true;document.querySelector('.topbar').inert=true;$('nameInput').focus();return;}
    if(hasJoined){clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,2500);connection('正在重新连接');}
    else $('joinMessage').textContent='暂时连不上小镇，请点击重试。';
  };
}
function onMsg(m){
  switch(m.t){
    case 'session':store.set('viber-session',m.session);break;
    case 'init':
      S.me=m.you;S.W=m.W;S.H=m.H;S.tiles=m.tiles;S.merchant=m.merchant;
      S.resAt.clear();S.houses.clear();S.players.clear();S.enemies.clear();
      m.resources.forEach(r=>S.resAt.set(r.y*S.W+r.x,r));m.houses.forEach(h=>S.houses.set(h.id,h));m.players.forEach(addPlayer);(m.enemies??[]).forEach(e=>S.enemies.set(e.id,e));
      hasJoined=true;connecting=false;$('join').classList.remove('show');$('hud').inert=false;document.querySelector('.topbar').inert=false;$('btnJoin').disabled=false;connection('世界已连接',true);refreshLocation();break;
    case 'you':{
      const old=S.you;S.you=m;renderStatus();
      if(old&&m.level>old.level)toast(`升至 Lv.${m.level}！继续去探索更远的地方。`);
      const p=me();if(p){p.color=m.color;p.equipment=m.equipment;p.companion=m.companion;colourFromServer(m.color);}updateCombat(m);
      if(['inventory','craft','quests','wallet','life'].includes(menu))renderMenu();
      if(menu==='shop')updateShop();break;
    }
    case 'pj':if(!S.players.has(m.player.id))addPlayer(m.player);refreshLocation();break;
    case 'pu':Object.assign(S.players.get(m.player.id)??{},m.player);break;
    case 'pl':S.players.delete(m.id);refreshLocation();break;
    case 'pm':{const p=S.players.get(m.id);if(p){p.x=m.x;p.y=m.y;if(m.facing)p.facing=m.facing;}if(m.id===S.me)refreshLocation();break;}
    case 'res':S.resAt.set(m.r.y*S.W+m.r.x,m.r);break;
    case 'house':S.houses.set(m.house.id,m.house);break;
    case 'houseGone':S.houses.delete(m.id);break;
    case 'enemy':{const e=S.enemies.get(m.enemy.id);S.enemies.set(m.enemy.id,{rx:e?.rx??m.enemy.x,ry:e?.ry??m.enemy.y,...m.enemy});break;}
    case 'combat':updateCombat(m);break;
    case 'fx':{S.fx.push({...m,at:performance.now()});const local=!m.id||m.id===S.me;if(local||me()&&distance(me(),m)<6)sound(m.kind,m.heavy);if(m.kind==='swing'&&local){comboAt=performance.now();$('comboDisplay').hidden=false;$('comboNumber').textContent=String(m.combo);$('comboLabel').textContent=m.combo===3?'终结重击':'连击';$('comboDisplay').classList.toggle('finisher',m.combo===3);}if(m.targetId==='training'&&m.kind==='hit'&&local){lastTrainingHit=Number(m.text.replace(/[^0-9]/g,''));$('interactionHint').querySelector('span').textContent=`命中木桩 ${lastTrainingHit} · 连按空格三段击 / Shift 闪避 / F 回旋斩`;}break;}
    case 'chat':S.bubbles.set(m.id,{text:m.text,at:performance.now()});log(`<b>${esc(m.name)}</b>：${esc(m.text)}`,'',true);break;
    case 'sys':log(m.text,m.kind);if(m.kind==='bad'||m.kind==='good'&&!m.text.startsWith('欢迎'))toast(m.text,m.kind);break;
    case 'authMsg':signLogin(m.message);break;
    case 'discovery':{
      $('discovery').querySelector('h2').textContent=m.poi.name;$('discovery').querySelector('p').textContent=m.poi.sub;$('discovery').classList.add('show');
      clearTimeout(discoveryTimer);discoveryTimer=setTimeout(()=>$('discovery').classList.remove('show'),3800);log(`发现 ${m.poi.name} · +20 经验`,'good');sound('level');break;
    }
    case 'fishing':fishing=m.done?null:m;S.fishing=fishing;$('fishing').hidden=!fishing;if(fishing){S.target=null;S.path=[];}break;
    case 'rescued':S.target=null;S.path=[];closeDialog();break;
  }
}

function updateCombat(m){
  S.combat={...(S.combat??{}),...m};if(m.serverTime)S.clockOffset=m.serverTime-Date.now();
  const n=Math.ceil(S.combat.stamina??100);$('staminaText').textContent=`${n} / 100`;$('staminaBar').style.width=`${n}%`;
}
setInterval(()=>{
  const t=Date.now()+(S.clockOffset??0),c=S.combat??{};
  for(const [id,key,cost]of[['dashCooldown','dashReady',25],['skillCooldown','skillReady',35]]){const left=Math.max(0,(c[key]??0)-t),el=$(id);el.textContent=left>0?(left/1000).toFixed(1):'';el.parentElement.classList.toggle('cooling',left>0||(c.stamina??100)<cost);el.parentElement.setAttribute('aria-disabled',String(left>0||(c.stamina??100)<cost));}
  if(performance.now()-comboAt>1500)$('comboDisplay').hidden=true;
  const p=me(),boss=[...S.enemies.values()].find(e=>e.type==='guardian'&&e.alive&&p&&distance(p,e)<7);$('bossHud').hidden=!boss;
  if(boss){$('bossName').textContent=boss.hp<boss.maxHp/2?'遗迹守卫 · 狂暴':'遗迹守卫';$('bossBar').style.width=`${boss.hp/boss.maxHp*100}%`;$('bossText').textContent=`${boss.hp} / ${boss.maxHp} · ${boss.attack?'蓄力中，离开红圈！':'用终结重击或回旋斩打断蓄力'}`;}
},100);

function colourFromServer(value){if(!value)return;color=value;store.set('viber-color',value);}
function addPlayer(p){S.players.set(p.id,{...p,rx:p.x,ry:p.y});}
function renderStatus(){
  const y=S.you;if(!y)return;
  $('sName').textContent=y.name;$('sTier').textContent=TIER[y.tier];$('levelBadge').textContent=y.level;
  $('healthText').textContent=`${y.hp} / ${y.maxHp}`;$('healthBar').style.width=`${y.hp/y.maxHp*100}%`;
  const base=xpFor(y.level),next=xpFor(y.level+1);$('xpText').textContent=`${y.xp-base} / ${next-base}`;$('xpBar').style.width=`${(y.xp-base)/(next-base)*100}%`;
  $('levelText').textContent=`Lv. ${y.level} · ${['初入大陆','林间旅人','熟练冒险者','小镇守护者','远行者'][Math.min(y.level-1,4)]}`;
  $('goldCount').textContent=fmt(y.gold);$('invL').textContent=y.inv.log;$('invO').textContent=y.inv.ore;$('invH').textContent=y.inv.herb;$('potionCount').textContent=y.inv.potion;
  $('walletLabel').textContent=y.wallet?`${y.wallet.slice(0,5)}…${y.wallet.slice(-4)}`:'连接钱包';$('btnBuild').title=y.hasHouse?'你已经拥有一座房子':`需要领主身份 · ${S.cfg?.houseCost.log??10} 木 + ${S.cfg?.houseCost.ore??5} 矿`;
  const portraitColors={sage:'#d8e1c8',amber:'#e3d4b8',iris:'#dcd2e3',rose:'#edcdd1',sky:'#cddfe6'};$('portrait').style.background=portraitColors[y.color]??portraitColors.sage;
  const coat={sage:['#526b50','#829e68'],amber:['#9a673f','#cc9a59'],iris:['#755c86','#ab8baa'],rose:['#975d68','#c68892'],sky:['#58798e','#8dadbd']}[y.color]??['#526b50','#829e68'];
  const shapes=$('portrait').querySelectorAll('svg path');for(const i of[0,1])shapes[i]?.setAttribute('fill',coat[0]);shapes[3]?.setAttribute('fill',coat[1]);
  $('btnLifeIntro').textContent=y.companion?.kind?`${y.companion.name}的陪伴日记 →`:'找一位同行伙伴 →';
  renderTracked();
}
function currentQuest(){return QUESTS.find(q=>q.id===tracked&&!S.you?.claimed.includes(q.id))??QUESTS.find(q=>!S.you?.claimed.includes(q.id));}
function renderTracked(){
  if(!S.you)return;const q=currentQuest();$('questCount').textContent=`${S.you.claimed.length}/${QUESTS.length}`;
  if(!q){$('trackedQuest').innerHTML=`<div class="quest-kicker">这一章，已写满回忆</div><h3 class="quest-name">大陆仍有新的风景</h3><p class="quest-desc">全部委托已完成。继续制作、钓鱼，或挑战遗迹守卫。</p><button class="quest-action" id="trackAction">去守望者遗迹 ${icon('arrow',13)}</button>`;$('trackAction').onclick=()=>goPoi('ruins');return;}
  tracked=q.id;const n=Math.min(S.you.stats[q.stat],q.need),done=n>=q.need;
  $('trackedQuest').innerHTML=`<div class="quest-kicker">${done?'委托完成 · 领取你的奖励':'当前委托 · '+String(QUESTS.indexOf(q)+1).padStart(2,'0')}</div><h3 class="quest-name">${q.title}</h3><p class="quest-desc">${q.desc}</p><div class="quest-progress"><div class="meter"><i style="width:${n/q.need*100}%"></i></div><span>${n} / ${q.need}</span></div><div class="quest-reward"><span>${icon('coin',12)} ${q.gold} 金币</span><span>✧ ${q.xp} 经验</span></div><button id="trackAction" class="quest-action ${done?'claim':''}">${done?'领取奖励':'追踪目标'} ${icon(done?'check':'arrow',13)}</button>`;
  $('trackAction').onclick=()=>done?send({t:'claim',id:q.id}):goQuest(q);
}
function refreshLocation(){
  const p=me();if(!p)return;const inVillage=p.x>=35&&p.x<=45&&p.y>=26&&p.y<=33;
  const nearest=[...POIS].sort((a,b)=>distance(p,a)-distance(p,b))[0];
  $('combatIntro').hidden=!inVillage||store.get('viber-combat-intro')==='1';
  $('regionName').textContent=inVillage?'风栖小镇':distance(p,nearest)<9?nearest.name:'风栖原野';$('regionStatus').textContent=inVillage?'安全区':'探索中';
  $('coords').textContent=`${p.x}, ${p.y}`;$('onlineCount').textContent=`${S.players.size} 位旅人在线`;
  $('areaSubtitle').textContent=inVillage?'林间有风，旅途有你。':nearest.sub;
}
const houseAt=(x,y)=>[...S.houses.values()].find(h=>x>=h.x&&x<h.x+3&&y>=h.y&&y<h.y+3);
function walkable(x,y){
  if((x===TRAINING.x&&y===TRAINING.y)||GARDENS.some(g=>g.x===x&&g.y===y))return false;
  if(x<0||y<0||x>=S.W||y>=S.H||S.tiles[y]?.[x]==='w'||decorAt(x,y))return false;
  if(STATIONS.some(s=>s.x===x&&s.y===y)||CHESTS.some(c=>c.x===x&&c.y===y)||S.resAt.get(y*S.W+x)?.alive)return false;
  const h=houseAt(x,y);return !h||h.owner===S.you?.wallet;
}
function pathfind(start,target,near=0){
  const key=(x,y)=>y*S.W+x,queue=[start],visited=new Map([[key(start.x,start.y),null]]);let end=null,head=0;
  while(head<queue.length){const cur=queue[head++];if(distance(cur,target)<=near){end=cur;break;}
    const steps=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]].sort((a,b)=>Math.hypot(cur.x+a[0]-target.x,cur.y+a[1]-target.y)-Math.hypot(cur.x+b[0]-target.x,cur.y+b[1]-target.y));
    for(const[dx,dy]of steps){const x=cur.x+dx,y=cur.y+dy,k=key(x,y);if(visited.has(k)||!walkable(x,y)||(dx&&dy&&(!walkable(cur.x+dx,cur.y)||!walkable(cur.x,cur.y+dy))))continue;visited.set(k,cur);queue.push({x,y});}
  }
  if(!end)return null;const path=[];while(end.x!==start.x||end.y!==start.y){path.push(end);end=visited.get(key(end.x,end.y));}return path.reverse();
}
function navigate(target){
  const p=me();if(!p)return;closeDialog();const path=pathfind(p,target,target.action?1:0);
  if(!path){toast('这条路暂时走不通，试试附近的空地。','bad');return;}
  S.target=target;S.path=path;S.keys.clear();
}
function goPoi(id){const station=STATIONS.find(s=>s.id===id),poi=station??POIS.find(p=>p.id===id);if(!poi)return;navigate(station?{...station,action:station.id}:targetAt(poi));}
function goQuest(q){
  const p=me();if(!p)return;
  if(['log','ore','herb'].includes(q.stat)){
    const type={log:'tree',ore:'rock',herb:'herb'}[q.stat];const options=[...S.resAt.values()].filter(r=>r.alive&&r.type===type).sort((a,b)=>distance(p,a)-distance(p,b));
    for(const r of options)if(pathfind(p,r,1)){navigate({...r,action:'gather'});return;}
  }
  if(q.stat==='kills'){
    const e=[...S.enemies.values()].filter(e=>e.alive&&e.type==='slime').sort((a,b)=>distance(p,a)-distance(p,b))[0];if(e){navigate({...e,action:'attack'});return;}
  }
  if(q.stat==='chests'){
    const c=CHESTS.filter(c=>!S.you.opened.includes(c.id)).sort((a,b)=>distance(p,a)-distance(p,b))[0];if(c){navigate({...c,action:'chest'});return;}
  }
  goPoi(q.target);
}
function targetAt(pos){
  const bed=GARDENS.find(g=>g.x===pos.x&&g.y===pos.y);if(bed)return {...bed,action:'garden'};
  const station=STATIONS.find(s=>s.x===pos.x&&s.y===pos.y);if(station)return {...station,action:station.id};
  const c=CHESTS.find(c=>c.x===pos.x&&c.y===pos.y);if(c)return {...c,action:'chest'};
  const e=[...S.enemies.values()].find(e=>e.alive&&e.x===pos.x&&e.y===pos.y);if(e)return {...e,action:'attack'};
  const r=S.resAt.get(pos.y*S.W+pos.x);if(r?.alive)return {...r,action:'gather'};
  if(S.tiles[pos.y]?.[pos.x]==='w')return {...pos,action:'fish'};
  return pos;
}
function targetAtScreen(sx,sy){
  if(renderer.pick)return renderer.pick(sx,sy)??targetAt(renderer.screenToTile(sx,sy));
  const {ox,oy,T}=renderer.camera(),hits=[];
  const hit=(t,half,above,below)=>{
    const cx=(t.x+.5)*T-ox,cy=(t.y+.5)*T-oy;
    if(sx>=cx-half*T&&sx<=cx+half*T&&sy>=cy-above*T&&sy<=cy+below*T)hits.push(t);
  };
  for(const r of S.resAt.values())if(r.alive)hit({...r,action:'gather'},r.type==='tree'?.72:r.type==='rock'?.48:.32,r.type==='tree'?1.8:r.type==='rock'?.6:.48,.24);
  for(const t of STATIONS)hit({...t,action:t.id},t.id==='merchant'?.95:t.id==='camp'?.55:.62,t.id==='merchant'?1.8:t.id==='board'?1.55:t.id==='workshop'?1.5:.7,.65);
  for(const c of CHESTS)hit({...c,action:'chest'},.4,.55,.3);
  for(const e of S.enemies.values())if(e.alive)hit({...e,action:'attack'},e.type==='guardian'?.6:.4,e.type==='guardian'?1.1:.7,.3);
  return hits.sort((a,b)=>b.y-a.y)[0]??targetAt(renderer.screenToTile(sx,sy));
}
function nearestInteract(){
  const p=me();if(!p)return null;
  const options=[...GARDENS.map(g=>({...g,action:'garden'})),...STATIONS.map(s=>({...s,action:s.id})),...CHESTS.filter(c=>!S.you?.opened.includes(c.id)).map(c=>({...c,action:'chest'})),...[...S.resAt.values()].filter(r=>r.alive).map(r=>({...r,action:'gather'}))].filter(t=>distance(p,t)<=1).sort((a,b)=>distance(p,a)-distance(p,b));
  if(options.length)return options[0];
  if(S.you?.equipment.rod)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(S.tiles[p.y+dy]?.[p.x+dx]==='w')return{x:p.x+dx,y:p.y+dy,action:'fish'};
  return null;
}
function executeTarget(t){
  switch(t.action){
    case 'garden':life.setTab('garden');openDialog('life');break;
    case 'companion':life.setTab('companion');openDialog('life');break;
    case 'adopt':send({t:'companion',action:'adopt',kind:t.kind});life.setTab('companion');openDialog('life');break;
    case 'gather':send({t:'gather',x:t.x,y:t.y});break;
    case 'attack':send({t:'attack',id:t.id});break;
    case 'merchant':openDialog('shop');break;
    case 'workshop':openDialog('craft');break;
    case 'board':openDialog('quests');break;
    case 'camp':send({t:'rest'});break;
    case 'chest':send({t:'chest',id:t.id});break;
    case 'fish':send({t:'fish',x:t.x,y:t.y});break;
  }
}
function interact(){if(fishing){send({t:'reel'});return;}const t=nearestInteract();if(t){navigate(t);return;}toast('走近树木、矿石、草药或小镇建筑后，按 E 互动。');}
function attack(){
  const p=me();if(!p)return;const e=[...S.enemies.values()].filter(e=>e.alive&&distance(p,e)<=1).sort((a,b)=>distance(p,a)-distance(p,b))[0];send({t:'attack',id:e?.id});
}
function dash(){S.target=null;S.path=[];let dx=0,dy=0;for(const k of S.keys){dx+=KEYS[k]?.[0]??0;dy+=KEYS[k]?.[1]??0;}send({t:'dash',dx:Math.sign(dx),dy:Math.sign(dy)});}
const actionFns={interact,attack,dash,skill:()=>send({t:'skill'}),craft:()=>openDialog('craft'),potion:()=>send({t:'use'}),map:()=>openDialog('map'),recall:()=>{S.target=null;S.path=[];send({t:'recall'});}};
const KEYS={w:[0,-1],s:[0,1],a:[-1,0],d:[1,0],arrowup:[0,-1],arrowdown:[0,1],arrowleft:[-1,0],arrowright:[1,0]};
let lastAction=0,lastPath=0;
setInterval(()=>{
  const p=me();if(!p||isDialog()||ws?.readyState!==WebSocket.OPEN)return;let dx=0,dy=0;
  for(const k of S.keys){dx+=KEYS[k]?.[0]??0;dy+=KEYS[k]?.[1]??0;}
  if(S.keys.has(' ')&&performance.now()-lastAction>350){lastAction=performance.now();attack();}
  if(dx||dy){S.target=null;S.path=[];send({t:'move',dx:Math.sign(dx),dy:Math.sign(dy)});return;}
  const t=S.target;if(!t)return;
  if(t.action==='attack'){const enemy=S.enemies.get(t.id);if(!enemy?.alive){S.target=null;S.path=[];return;}if(enemy.x!==t.x||enemy.y!==t.y){t.x=enemy.x;t.y=enemy.y;S.path=pathfind(p,t,1)??[];}}
  if(t.action==='gather'&&!S.resAt.get(t.y*S.W+t.x)?.alive){S.target=null;S.path=[];return;}
  if(distance(p,t)<=(t.action?1:0)){
    S.path=[];
    if(t.action&&performance.now()-lastAction>(t.action==='attack'?350:950)){lastAction=performance.now();executeTarget(t);if(!['gather','attack'].includes(t.action))S.target=null;}
    else if(!t.action)S.target=null;return;
  }
  while(S.path.length&&S.path[0].x===p.x&&S.path[0].y===p.y)S.path.shift();
  if(!S.path.length||!walkable(S.path[0].x,S.path[0].y)||performance.now()-lastPath>2500){S.path=pathfind(p,t,t.action?1:0)??[];lastPath=performance.now();}
  const step=S.path[0];if(step)send({t:'move',dx:Math.sign(step.x-p.x),dy:Math.sign(step.y-p.y)});else{S.target=null;toast('前面的路被挡住了，换个位置再试。');}
},120);
setInterval(()=>{
  const totalMinutes=9*60+Math.floor(performance.now()/550),hour=Math.floor(totalMinutes/60)%24;S.night=hour>=19||hour<5?1:hour===18||hour===5?.45:0;
  $('dayText').textContent=`第 ${Math.floor(totalMinutes/1440)+1} 天 · ${hour<6?'星夜':hour<11?'清晨':hour<16?'午后':hour<19?'黄昏':'星夜'}`;$('dayIcon').innerHTML=icon(S.night>.5?'moon':'sun',19);
  if(fishing){const bite=Date.now()>=fishing.biteAt&&Date.now()<=fishing.endsAt;$('fishing').classList.toggle('bite',bite);$('fishTitle').textContent=bite?'鱼儿上钩了！快收竿':'等待鱼儿上钩…';$('fishDesc').textContent=bite?'现在按 E 或点击「收竿」。':'放慢呼吸，留意浮标。';}
  let text='靠近资源或建筑，开始互动';const t=nearestInteract();
  if(S.target)text=S.target.action==='attack'?(me()&&distance(me(),S.target)<=1?(S.target.id==='training'?`木桩伤害 ${lastTrainingHit||'—'} · Shift 闪避 / F 回旋斩`:'正在连击 · 留意红圈，Shift 闪避'):'正在接近目标 · 点击地面可取消'):S.target.action==='gather'&&me()&&distance(me(),S.target)<=1?'正在采集 · 移动即可停止':'跟随脚下的光点，去下一个目的地';
  else if(t)text=({garden:'照顾你的花圃',companion:'结识小伙伴',gather:t.type==='tree'?'采集橡木':t.type==='rock'?'采集铁矿':'采集月光草',merchant:'和补给商人交谈',workshop:'打开制作台',board:'查看冒险委托',camp:'在篝火旁休息，恢复生命',chest:'打开遗失的宝箱',fish:'向湖面抛竿'})[t.action]??text;
  $('interactionHint').querySelector('span').textContent=text;
},180);
$('c').addEventListener('click',e=>{if(!me()||isDialog())return;const p=renderer.screenToTile(e.clientX,e.clientY);if(p.x>=0&&p.y>=0&&p.x<S.W&&p.y<S.H)navigate(targetAtScreen(e.clientX,e.clientY));});
$('c').addEventListener('pointermove',e=>{
  const p=renderer.screenToTile(e.clientX,e.clientY);renderer.setHover(p);const t=targetAtScreen(e.clientX,e.clientY),tip=$('tooltip');
  const names={garden:'林间花圃',companion:'等你的小伙伴',gather:t.type==='tree'?'橡木树':t.type==='rock'?'铁矿脉':'月光草',attack:t.name,merchant:'旅人商店',workshop:'林间工坊',board:'冒险委托',camp:'温暖的篝火',chest:'遗失的宝箱',fish:'平静的水面'};
  if(t.action&&hasJoined&&!isDialog()&&e.pointerType!=='touch'){tip.hidden=false;tip.innerHTML=`${esc(names[t.action]??'探索')}<small>${t.action==='attack'?'点击靠近并攻击':t.action==='fish'?'制作钓竿后，点击抛竿':'点击自动前往并互动'}</small>`;tip.style.left=`${Math.min(innerWidth-180,e.clientX+17)}px`;tip.style.top=`${Math.min(innerHeight-70,e.clientY+16)}px`;}else tip.hidden=true;
});
$('c').addEventListener('pointerleave',()=>{renderer.setHover(null);$('tooltip').hidden=true;});
addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(k==='escape'){if(menu)closeDialog();else{S.target=null;S.path=[];$('chatInput').blur();$('chat').classList.remove('open');}return;}
  if(isDialog()){
    if(k==='tab'){const focusable=[...(menu?$('dialog'):$('join')).querySelectorAll('button:not(:disabled),input,select,a[href]')];const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    return;
  }
  if(k==='enter'&&!typing()){e.preventDefault();$('chat').classList.add('open');$('chat').classList.remove('collapsed');$('chatInput').focus();return;}
  if(typing())return;
  if(KEYS[k]){if(!S.keys.has(k)){S.target=null;S.path=[];send({t:'move',dx:KEYS[k][0],dy:KEYS[k][1]});}S.keys.add(k);e.preventDefault();return;}
  if(e.repeat)return;
  const fn={l:()=>openDialog('life'),g:()=>send({t:'emote',emote:'wave'}),p:()=>send({t:'companion',action:'pet'}),e:interact,' ':()=>{S.keys.add(' ');attack();},shift:dash,f:actionFns.skill,c:()=>openDialog('craft'),q:()=>send({t:'use'}),m:()=>openDialog('map'),r:actionFns.recall,i:()=>openDialog('inventory'),j:()=>openDialog('quests'),b:()=>send({t:'build'})}[k];if(fn){e.preventDefault();fn();}
});
addEventListener('keyup',e=>S.keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>S.keys.clear());document.addEventListener('visibilitychange',()=>S.keys.clear());
for(const b of document.querySelectorAll('[data-move]')){b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);S.keys.add(b.dataset.move);const [dx,dy]=KEYS[b.dataset.move];send({t:'move',dx,dy});});for(const ev of['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>S.keys.delete(b.dataset.move));}
for(const b of document.querySelectorAll('[data-action]'))b.onclick=()=>{if(hasJoined)actionFns[b.dataset.action]?.();};
function closeDialog(){if(!menu)return;menu=null;$('dialog').classList.remove('show');$('hud').inert=$('join').classList.contains('show');document.querySelector('.topbar').inert=$('hud').inert;lastFocus?.focus?.();}
function openDialog(which){if(!hasJoined&&which!=='help')return;lastFocus=document.activeElement;menu=which;menuTab='active';S.keys.clear();S.target=null;S.path=[];$('tooltip').hidden=true;renderMenu();$('dialog').classList.add('show');$('hud').inert=true;document.querySelector('.topbar').inert=true;$('dialogClose').focus();}
function renderMenu(){
  if(!menu)return;const title={inventory:'把旅途装进背包',craft:'林间工坊',quests:'写下你的冒险',map:'风栖大陆',shop:'旅人商店',wallet:'大陆身份',help:'初来乍到，慢慢来',settings:'找到适合你的手感',life:'把小日子过成冒险'};
  $('dialogTitle').textContent=title[menu];$('dialogEyebrow').textContent={inventory:'YOUR LITTLE COLLECTION',craft:'MADE WITH YOUR OWN HANDS',quests:'ONE SMALL ADVENTURE AT A TIME',map:'THERE IS ALWAYS MORE TO EXPLORE',shop:'THE TRAVELER’S EXCHANGE',wallet:'ROBINHOOD CHAIN · TESTNET',help:'A FIELD GUIDE TO WINDHAVEN',settings:'MAKE YOURSELF AT HOME',life:'LITTLE THINGS, LOVELY DAYS'}[menu];
  const root=$('dialogContent'),y=S.you;
  if(['wallet','shop'].includes(menu)&&!S.cfg){root.innerHTML='<p class="dialog-copy">配置暂未读取成功，点击重试。</p><button id="retryConfig" class="small-button">重新读取</button>';$('retryConfig').onclick=async()=>{await loadConfig();renderMenu();};return;}
  if(menu==='life'){life.render(root);
  }else if(menu==='inventory'){
    root.innerHTML=`<p class="dialog-copy">每一件小东西，都有一段来时的故事。<br/>金币仅用于游戏，不是链上代币。</p><div class="inventory-grid">${Object.entries(ITEMS).map(([id,i])=>`<div class="item-card" style="color:${i.color}">${icon(i.icon,30)}<b>${y.inv[id]??0}</b><span>${i.name}</span></div>`).join('')}</div><h3 class="dialog-section-title">随身装备 · 制作后自动装备</h3><div class="equipment-row">${RECIPES.filter(r=>r.equipment).map(r=>`<span class="${y.equipment[r.equipment]?'equipped':''}">${icon(r.icon,23)}${r.name}<br/>${y.equipment[r.equipment]?'已装备':'尚未制作'}</span>`).join('')}</div><h3 class="dialog-section-title">熟能生巧 · 技能</h3>${Object.entries({lumberjacking:'伐木',mining:'采矿',herbalism:'草药学',fishing:'钓鱼'}).map(([k,n])=>`<div class="skill-row"><span>${n}</span><div class="meter"><i style="width:${y.skills[k]}%"></i></div><span>${y.skills[k].toFixed(1)}</span></div>`).join('')}<div class="stat-line"><span>本次旅途的收获</span><b>${fmt(y.gold)} 金币 · ${y.xp} 经验</b></div>`;
  }else if(menu==='craft'){
    const near=distance(me(),STATIONS[1])<=2;
    root.innerHTML=`<p class="dialog-copy">${near?'木头、石头和一点心思，足够让旅程变得不同。':'工坊在小镇东侧。先备齐材料，再去制作属于你的装备。'}</p>${!near?'<button class="small-button" data-go="workshop">前往林间工坊 →</button>':''}${RECIPES.map(r=>{const equipped=r.equipment&&y.equipment[r.equipment],enough=Object.entries(r.cost).every(([k,v])=>y.inv[k]>=v);return `<article class="recipe-card"><span class="recipe-icon">${icon(r.icon,27)}</span><div class="recipe-info"><h3>${r.name}</h3><p>${r.desc}</p><div class="materials">${Object.entries(r.cost).map(([k,v])=>`<span class="${y.inv[k]<v?'missing':''}">${ITEMS[k].name} ${y.inv[k]}/${v}</span>`).join('')}</div></div><button class="small-button" data-craft="${r.id}" ${equipped||!enough||!near?'disabled':''}>${equipped?'已装备':!enough?'缺少材料':!near?'需在工坊':'制作'}</button></article>`;}).join('')}`;
  }else if(menu==='quests'){
    root.innerHTML=`<p class="dialog-copy">在小小的目标里，找到继续出发的理由。奖励需要手动领取。</p><div class="dialog-tabs"><button class="${menuTab==='active'?'selected':''}" data-tab="active">进行中 ${QUESTS.length-y.claimed.length}</button><button class="${menuTab==='done'?'selected':''}" data-tab="done">已完成 ${y.claimed.length}</button></div>${QUESTS.filter(q=>menuTab==='done'?y.claimed.includes(q.id):!y.claimed.includes(q.id)).map(q=>{const n=Math.min(y.stats[q.stat],q.need),done=n>=q.need,claimed=y.claimed.includes(q.id);return `<article class="journal-card ${claimed?'done':''}"><div class="journal-icon">${icon(q.icon,25)}</div><div class="journal-info"><h3>${q.title}</h3><p>${q.desc}</p><div class="quest-progress"><div class="meter"><i style="width:${n/q.need*100}%"></i></div><span>${n}/${q.need}</span></div><p>${q.gold} 金币 · ${q.xp} 经验</p></div><button class="small-button" ${claimed?'disabled':`data-${done?'claim':'track'}="${q.id}"`}>${claimed?'已领取':done?'领取奖励':tracked===q.id?'追踪中':'追踪'}</button></article>`;}).join('')||'<p class="dialog-copy">这里还没有新的记录。去写下第一段故事吧。</p>'}`;
  }else if(menu==='map'){
    root.innerHTML=`<p class="dialog-copy">点击地图或地标自动前往。浅色圆点是你，虚线指向目的地。</p><div class="map-large-wrap"><canvas id="worldMap" width="960" height="720" aria-label="世界地图，点击选择目的地"></canvas></div><div class="map-pois">${POIS.map(p=>`<button data-go="${p.id}">${icon(p.icon,24)}<span>${p.name}<small>${y.discovered.includes(p.id)?'已发现 · '+p.sub:'未发现 · 出发看看'}</small></span></button>`).join('')}</div>`;
    renderer.drawMap($('worldMap'),true);$('worldMap').onclick=e=>{const box=e.currentTarget.getBoundingClientRect();navigate(targetAt({x:Math.min(S.W-1,Math.floor((e.clientX-box.left)/box.width*S.W)),y:Math.min(S.H-1,Math.floor((e.clientY-box.top)/box.height*S.H))}));};
  }else if(menu==='shop'){
    const near=distance(me(),STATIONS[0])<=2;root.innerHTML=`<p class="dialog-copy">“带上你的收获吧，旅人。森林的礼物，总有用得上的人。”</p><div class="stat-line"><span>你的金币</span><b id="shopGold">${fmt(y.gold)}</b></div><h3 class="dialog-section-title">旅途补给 · 使用游戏金币</h3>${SUPPLIES.map(s=>`<div class="shop-row">${icon(ITEMS[s.item].icon,22)}<span>${s.name} × ${s.amount}</span><b>${s.price} 金币</b><button class="small-button" data-supply="${s.id}" ${!near||y.gold<s.price?'disabled':''}>兑换</button></div>`).join('')}<h3 class="dialog-section-title">出售收获</h3>${Object.entries({log:2,ore:3,herb:3,fish:8,crystal:20}).map(([id,price])=>`<div class="shop-row">${icon(ITEMS[id].icon,22)}<span>${ITEMS[id].name} <small id="shopInv-${id}">× ${y.inv[id]}</small></span><b>+${price} 金币</b><button class="small-button" data-sell="${id}" ${!near||!y.inv[id]?'disabled':''}>出售 1 个</button></div>`).join('')}<h3 class="dialog-section-title">链上身份 · 可选体验</h3><div class="chain-info">持有测试网代币可解锁领主身份、建房与技能成长加成。<br/>冒险、制作和任务无需钱包。<br/><a href="${esc(S.cfg.vibeUrl)}" target="_blank" rel="noopener">在 vibe/vibe 查看代币 ↗</a> · <a href="${esc(S.cfg.chain.faucet)}" target="_blank" rel="noopener">测试网水龙头 ↗</a></div><div class="buy-options" id="shopOpts"></div><p id="shopMsg" class="shop-msg"></p>`;renderBuyOptions();
  }else if(menu==='wallet'){
    root.innerHTML=`<p class="dialog-copy">自由冒险无需钱包。连接后可使用链上身份，并将进度保存至钱包。</p><div class="chain-info"><div class="stat-line"><span>网络</span><b>Robinhood Testnet</b></div><div class="stat-line"><span>钱包</span><b>${y.wallet?`${y.wallet.slice(0,8)}…${y.wallet.slice(-6)}`:'尚未连接'}</b></div><div class="stat-line"><span>持仓</span><b>${y.wallet?(y.balanceStatus==='fresh'?fmt(y.balance)+' '+esc(S.cfg.token.symbol):'暂不可用'):'未读取'}</b></div><div class="stat-line"><span>领主门槛</span><b>${fmt(S.cfg.lordMin)} ${esc(S.cfg.token.symbol)}</b></div></div><h3 class="dialog-section-title">领主的生活</h3><p class="dialog-copy">在镇外空草地按 B 建房（${S.cfg.houseCost.log} 橡木 + ${S.cfg.houseCost.ore} 铁矿），技能成长 +50%。<br/>持仓低于门槛后房子会荒废，持续 5 分钟后倒塌。</p><button id="connectWallet" class="primary-button">${y.wallet?'重新读取链上持仓':'连接钱包 · 签名登录'}</button><p class="dialog-copy" style="font-size:10px">登录签名不花费资产。购买测试代币时，交易由你在钱包内确认。<br/>已有钱包存档会替换当前游客进度。</p>`;$('connectWallet').onclick=connectWallet;
  }else if(menu==='settings'){
    const options=renderer.settings?.()??{};
    root.innerHTML=`<p class="dialog-copy">画面：${$('c').dataset.renderer} · 当前约 ${$('c').dataset.fps??'—'} FPS<br/>滚轮或右侧 ＋ / − 调整视角，设置会保存在这台设备。</p>${renderer.configure?`<div class="setting-row"><label for="quality">画质 <small>精致含实时柔和阴影，流畅适合较旧设备。</small></label><select id="quality"><option value="high" ${options.quality==='high'?'selected':''}>精致</option><option value="balanced" ${options.quality==='balanced'?'selected':''}>流畅</option></select></div>${[['shake','命中震屏','随重击、受伤反馈轻微震动。'],['numbers','伤害与收获数字','显示伤害、暴击、治疗和奖励。'],['reduced','减少动态效果','关闭震屏与受击停顿，减少装饰粒子。']].map(([id,name,desc])=>`<div class="setting-row"><label for="opt-${id}">${name}<small>${desc}</small></label><input id="opt-${id}" type="checkbox" data-setting="${id}" ${options[id]?'checked':''}/></div>`).join('')}`:'<p class="dialog-copy">当前设备使用兼容画面，仍可体验全部玩法。</p>'}<div class="setting-row"><label for="opt-audio">游戏音效<small>挥剑、命中、闪避、采集与升级反馈。</small></label><input id="opt-audio" type="checkbox" ${soundOn?'checked':''}/></div>`;
    root.querySelector('#quality')?.addEventListener('change',e=>renderer.configure({quality:e.target.value}));root.querySelectorAll('[data-setting]').forEach(el=>el.onchange=()=>renderer.configure({[el.dataset.setting]:el.checked}));$('opt-audio').onchange=e=>{soundOn=e.target.checked;store.set('viber-sound',soundOn?'1':'0');updateSound();sound();};
  }else if(menu==='help'){
    root.innerHTML=`<p class="dialog-copy">从小镇出发，第一棵树就在西侧路口。<br/>地图不是清单，慢慢走也很好。</p><div class="help-grid">${[['小镇生活','L / P / G','L 打开伙伴、花圃和衣橱。P 摸摸伙伴，G 挥手。伙伴、种植进度和披风都自动保存。'],['移动','W A S D','方向键，或点击地面自动寻路。触屏可用左下方向键。'],['采集 / 互动','E','点击树木、矿石、草药自动走近并持续采集。移动可取消。'],['三段连击','SPACE','连续按或按住空格：轻斩、反手斩、终结重击。第三段可打断敌人蓄力。点击怪物可自动接近攻击。'],['闪避 / 回旋斩','SHIFT / F','Shift 沿移动或面朝方向翻滚，短暂无敌，消耗 25 体力。F 范围斩击、击退打断，消耗 35 体力。'],['敌人蓄力','红色圆环','走出红圈或翻滚避开攻击。遗迹守卫半血后进入狂暴。小镇木桩可免费练习连击。'],['制作','C','用材料打造斧镐、长剑、钓竿和药水。需要在工坊旁。'],['钓鱼','E','装备钓竿后点击水面。浮标变亮时按 E 或点击收竿。'],['背包 / 委托','I / J','检查收获、追踪目标。完成委托后记得领取奖励。'],['地图 / 回城','M / R','用地图导航，回城石可随时带你回到小镇。'],['恢复 / 聊天','Q / ENTER','Q 喝药水，篝火可免费恢复。回车和在线旅人聊天。']].map(([a,b,c])=>`<div class="help-item"><strong>${a}</strong><kbd>${b}</kbd><p>${c}</p></div>`).join('')}</div><p class="dialog-copy" style="font-size:10px">游客进度自动保存在本服务器，浏览器保留存档凭据。清除浏览器数据会失去游客入口；钱包玩家可重新签名恢复。倒下会回到小镇，物品和金币不会丢失。</p>`;
  }
  root.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>goPoi(b.dataset.go));
  root.querySelectorAll('[data-craft]').forEach(b=>b.onclick=()=>send({t:'craft',id:b.dataset.craft}));
  root.querySelectorAll('[data-claim]').forEach(b=>b.onclick=()=>send({t:'claim',id:b.dataset.claim}));
  root.querySelectorAll('[data-track]').forEach(b=>b.onclick=()=>{tracked=b.dataset.track;store.set('viber-quest',tracked);renderTracked();closeDialog();goQuest(QUESTS.find(q=>q.id===tracked));});
  root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{menuTab=b.dataset.tab;renderMenu();});
  root.querySelectorAll('[data-sell]').forEach(b=>b.onclick=()=>send({t:'sell',item:b.dataset.sell}));
  root.querySelectorAll('[data-supply]').forEach(b=>b.onclick=()=>send({t:'supply',id:b.dataset.supply}));
}
function updateShop(){
  if(!$('shopGold')||!S.you)return;const y=S.you,near=distance(me(),STATIONS[0])<=2;$('shopGold').textContent=fmt(y.gold);
  for(const b of document.querySelectorAll('[data-sell]')){$(`shopInv-${b.dataset.sell}`).textContent=`× ${y.inv[b.dataset.sell]}`;b.disabled=!near||!y.inv[b.dataset.sell];}
  for(const b of document.querySelectorAll('[data-supply]'))b.disabled=!near||y.gold<SUPPLIES.find(s=>s.id===b.dataset.supply).price;
}
const eth=()=>window.ethereum;
async function connectWallet(){
  if(S.you?.wallet){send({t:'recheck'});toast('正在读取测试网持仓…');return;}
  if(!eth())return toast('当前浏览器没有钱包插件。可在装有钱包的浏览器打开本页。','bad');
  try{[account]=await eth().request({method:'eth_requestAccounts'});send({t:'authStart',address:account});}catch(e){toast(`钱包连接未完成：${e.message??e}`,'bad');}
}
async function signLogin(message){
  const hex='0x'+[...new TextEncoder().encode(message)].map(b=>b.toString(16).padStart(2,'0')).join('');
  try{const signature=await eth().request({method:'personal_sign',params:[hex,account]});send({t:'auth',signature});}catch(e){toast(`签名未完成：${e.message??e}`,'bad');}
}
async function ensureChain(){
  const c=S.cfg.chain,id='0x'+c.id.toString(16);if((await eth().request({method:'eth_chainId'})).toLowerCase()===id)return;
  try{await eth().request({method:'wallet_switchEthereumChain',params:[{chainId:id}]});}catch(e){if(e.code!==4902&&e?.data?.originalError?.code!==4902)throw e;await eth().request({method:'wallet_addEthereumChain',params:[{chainId:id,chainName:c.name,rpcUrls:[c.rpcUrl],blockExplorerUrls:[c.explorer],nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18}}]});}
}
let buying=false;
function renderBuyOptions(){
  const t=S.cfg.token,box=$('shopOpts');if(!box)return;
  if(!t.buyable){box.innerHTML=`<span class="dialog-copy">${({OFFLINE:'当前为离线冒险模式。',RPC_UNAVAILABLE:'测试网暂不可用。',LOADING:'正在读取测试网信息。',GRADUATED:'该代币已毕业，请前往 vibe/vibe。',NOT_V6:'该代币暂不支持游戏内购买。',NOT_ETH_PAIRED:'该代币不是 ETH 配对。'})[t.reason]??'暂时无法在游戏内购买。'}</span>`;return;}
  box.innerHTML=S.cfg.buyOptionsEth.map(a=>`<button data-buy="${a}" ${buying?'disabled':''}>${a} 测试 ETH</button>`).join('');box.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>buy(b.dataset.buy));
}
async function buy(amount){
  if(buying)return;const message=$('shopMsg');if(!S.you?.wallet){message.textContent='请先通过顶部的钱包按钮签名登录。';return;}
  buying=true;renderBuyOptions();
  try{
    const accounts=await eth().request({method:'eth_accounts'});if(accounts[0]?.toLowerCase()!==S.you.wallet.toLowerCase())throw new Error('钱包账户已变化，请重新登录后购买。');
    message.textContent='正在读取链上报价…';const r=await fetch(`/api/buy?eth=${encodeURIComponent(amount)}&to=${S.you.wallet}`),tx=await r.json();if(!r.ok)throw new Error(tx.error);
    message.textContent=`预计获得 ${fmt(tx.expectedTokens)} ${S.cfg.token.symbol}，请在钱包中确认。`;await ensureChain();
    const hash=await eth().request({method:'eth_sendTransaction',params:[{from:S.you.wallet,to:tx.to,data:tx.data,value:tx.value}]});
    message.innerHTML=`交易已提交，等待链上确认。<a href="${S.cfg.chain.explorer}/tx/${encodeURIComponent(hash)}" target="_blank" rel="noopener">查看交易 ↗</a>`;log(`已提交 ${amount} 测试 ETH 的购买交易，尚待确认。`);
    for(const sec of[4,10,20,40])setTimeout(()=>send({t:'recheck'}),sec*1000);
  }catch(e){message.textContent=`未完成：${e.shortMessage??e.message??e}`;}finally{buying=false;renderBuyOptions();}
}
$('dialogClose').onclick=closeDialog;$('dialog').onclick=e=>{if(e.target===$('dialog'))closeDialog();};
$('btnLife').onclick=()=>openDialog('life');$('btnLifeIntro').onclick=()=>openDialog('life');
setInterval(()=>life.tick(),250);
$('btnSettings').onclick=()=>openDialog('settings');$('btnTraining').onclick=()=>{const e=S.enemies.get('training');if(e)navigate({...e,action:'attack'});};$('closeIntro').onclick=()=>{$('combatIntro').hidden=true;store.set('viber-combat-intro','1');};$('combatIntro').hidden=store.get('viber-combat-intro')==='1';$('zoomIn').onclick=()=>renderer.zoom?.(.15);$('zoomOut').onclick=()=>renderer.zoom?.(-.15);
$('btnInventory').onclick=()=>openDialog('inventory');$('btnQuests').onclick=()=>openDialog('quests');$('btnMap').onclick=()=>openDialog('map');$('btnHelp').onclick=()=>openDialog('help');$('btnWallet').onclick=()=>openDialog('wallet');$('btnBuild').onclick=()=>send({t:'build'});
$('btnSound').onclick=()=>{soundOn=!soundOn;store.set('viber-sound',soundOn?'1':'0');updateSound();sound();};updateSound();
$('btnChat').onclick=()=>{if(innerWidth<=800)$('chat').classList.toggle('open');else $('chat').classList.toggle('collapsed');};
$('chatForm').onsubmit=e=>{e.preventDefault();const text=$('chatInput').value.trim();if(text)send({t:'chat',text});$('chatInput').value='';$('chatInput').blur();};$('btnReel').onclick=()=>send({t:'reel'});
$('nameInput').value=store.get('viber-name','');
for(const b of document.querySelectorAll('[data-color]')){b.classList.toggle('selected',b.dataset.color===color);b.setAttribute('aria-pressed',String(b.dataset.color===color));b.onclick=()=>{color=b.dataset.color;store.set('viber-color',color);for(const x of document.querySelectorAll('[data-color]')){x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));}};}
function join(){audio.unlock();name=$('nameInput').value.trim()||'林间旅人';store.set('viber-name',name);$('btnJoin').disabled=true;$('btnJoin').innerHTML='正在走进风栖小镇…';connect();}
$('btnJoin').onclick=join;$('nameInput').addEventListener('keydown',e=>{if(e.key==='Enter')join();});
eth()?.on?.('accountsChanged',()=>{if(S.you?.wallet)toast('钱包账户已切换，请刷新后重新签名登录。');});
async function loadConfig(){try{const r=await fetch('/api/config');if(!r.ok)throw new Error('config unavailable');S.cfg=await r.json();if(menu==='shop')renderBuyOptions();if(S.cfg.token.reason==='LOADING')setTimeout(loadConfig,3000);}catch{log('链上配置暂不可用，冒险仍可继续。','bad');}}
await loadConfig();
try{const r=await fetch('/api/preview');if(r.ok){const m=await r.json();if(!hasJoined){S.W=m.W;S.H=m.H;S.tiles=m.tiles;m.resources.forEach(r=>S.resAt.set(r.y*S.W+r.x,r));}}}catch{}
