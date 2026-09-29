import { createCozyRenderer } from './cozy-renderer.js';
import * as T from './vendor/three.module.js';
import { STATIONS, CHESTS, DECOR, POIS, distance } from './catalog.js';
import { part, group, material, hash, resource, cottage, station, chest, adventurer, monster } from './models3d.js';
const TAU=Math.PI*2;
export function createRenderer(canvas,S){
  const gpu=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  gpu.outputColorSpace=T.SRGBColorSpace;gpu.toneMapping=T.ACESFilmicToneMapping;gpu.toneMappingExposure=1.18;gpu.shadowMap.enabled=true;gpu.shadowMap.type=T.PCFShadowMap;
  const scene=new T.Scene();scene.background=new T.Color('#bdc9ae');scene.fog=new T.Fog('#bdc9ae',30,64);
  const camera=new T.OrthographicCamera(-12,12,8,-8,.1,120),look=new T.Vector3(40.5,0,31.5);
  const ambient=new T.HemisphereLight('#ffefc6','#728b8d',2.4);scene.add(ambient);
  const sun=new T.DirectionalLight('#fff0cc',3.3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;sun.shadow.camera.near=1;sun.shadow.camera.far=70;sun.shadow.radius=3;sun.shadow.normalBias=.035;sun.shadow.bias=-.0001;scene.add(sun,sun.target);
  const fireLight=new T.PointLight('#ffc069',5,5,1.4);fireLight.position.set(37.5,1,31.5);scene.add(fireLight);
  const world=new T.Group();scene.add(world);const resourceNodes=new Map(),stationNodes=new Map(),chestNodes=new Map(),actors=new Map(),enemyNodes=new Map(),houseNodes=new Map();
  const overlay=document.createElement('canvas');overlay.id='worldOverlay';overlay.setAttribute('aria-hidden','true');canvas.after(overlay);const ctx=overlay.getContext('2d');
  const ray=new T.Raycaster(),pointer=new T.Vector2(),plane=new T.Plane(new T.Vector3(0,1,0),0),point=new T.Vector3(),projected=new T.Vector3();
  let width=innerWidth,height=innerHeight,zoom=1.10,hover=null,built=false,last=performance.now(),shake=0,freezeUntil=0,night=0,lastMap=0,lastFoot=0,frameCount=0,fpsStart=last,water=null;
  const resourceInstances=new Map();
  const particles=[],effects=[],pickables=[],flashMaterial=new T.MeshStandardMaterial({color:'#fff5ce',emissive:'#fbd68b',emissiveIntensity:.65});
  const settings={quality:'high',shake:true,numbers:true,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches};
  try{Object.assign(settings,JSON.parse(localStorage.getItem('viber-graphics')||'{}'));}catch{}
  const arcGeo=new T.RingGeometry(.74,1,36,1,0,Math.PI*1.12);
  const ringGeo=new T.RingGeometry(.82,1,48),particleGeo=new T.IcosahedronGeometry(1,0),particleMats=['#ffe5a6','#e3bd6a','#bcdca3','#f49d72','#9edfda'].map(c=>new T.MeshBasicMaterial({color:c}));
  function resize(){width=innerWidth;height=innerHeight;gpu.setPixelRatio(Math.min(devicePixelRatio||1,settings.quality==='high'?1.75:1));gpu.setSize(width,height,false);overlay.width=width*(devicePixelRatio||1);overlay.height=height*(devicePixelRatio||1);overlay.style.width=width+'px';overlay.style.height=height+'px';const h=(width<700?8:9.3)/zoom;camera.left=-h*width/height;camera.right=h*width/height;camera.top=h;camera.bottom=-h;camera.updateProjectionMatrix();}
  function configure(next){Object.assign(settings,next);gpu.shadowMap.enabled=settings.quality==='high';sun.shadow.needsUpdate=true;resize();try{localStorage.setItem('viber-graphics',JSON.stringify(settings));}catch{}return {...settings};}
  configure({});addEventListener('resize',resize);canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.7,Math.min(1.65,zoom-e.deltaY*.0007));resize();},{passive:false});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();document.getElementById('connectionText').textContent='画面已暂停，请刷新恢复';});
  function locate(g,x,y){g.position.set(x+.5,0,y+.5);world.add(g);return g;}
  function selectable(g,data){g.userData.target=data;pickables.push(g);}
  const cozy=createCozyRenderer({scene,S,selectable});
  function terrain(){
    const c=document.createElement('canvas');c.width=S.W*32;c.height=S.H*32;const a=c.getContext('2d');
    for(let y=0;y<S.H;y++)for(let x=0;x<S.W;x++){
      const tile=S.tiles[y][x],h=hash(x,y),colors={g:['#879b61','#8b9e65','#8e9f66','#83965e'],w:['#588e91'],s:['#c6ba8a'],d:['#c2b38a'],q:['#a6b096'],p:['#a48b60']};
      const arr=colors[tile]??colors.g;a.fillStyle=arr[Math.floor(h*arr.length)];a.fillRect(x*32,y*32,32,32);
      if(tile==='w')continue;
      if(tile==='d'||tile==='q'){
        for(let i=0;i<6;i++){const xx=x*32+(i%3)*11+hash(i+x,y)*2,yy=y*32+Math.floor(i/3)*16;a.fillStyle=i%2?'#d2c49e':'#b4aa88';a.beginPath();a.roundRect(xx+1,yy+2,9,13,2);a.fill();}
      }else if(tile==='p'){a.strokeStyle='#7a684855';for(let i=0;i<4;i++){a.strokeRect(x*32,y*32+i*8,32,7);}}
      else for(let i=0;i<8;i++){a.fillStyle=i%2?'#eadca91a':'#304a3020';a.fillRect(x*32+hash(x+i,y)*30,y*32+hash(x,y+i)*30,1+(i%2),1);}
    }
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=gpu.capabilities.getMaxAnisotropy();
    const ground=new T.Mesh(new T.PlaneGeometry(S.W,S.H),new T.MeshStandardMaterial({map:tex,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(S.W/2,0,S.H/2);ground.receiveShadow=true;world.add(ground);
    const waterGeo=new T.PlaneGeometry(1,1),tiles=[];
    for(let y=0;y<S.H;y++)for(let x=0;x<S.W;x++)if(S.tiles[y][x]==='w')tiles.push([x,y]);
    water=new T.InstancedMesh(waterGeo,new T.MeshStandardMaterial({color:'#78bab7',transparent:true,opacity:.45,roughness:.22,metalness:.3}),tiles.length);const dummy=new T.Object3D();
    tiles.forEach(([x,y],i)=>{dummy.position.set(x+.5,.018,y+.5);dummy.rotation.set(-Math.PI/2,0,0);dummy.updateMatrix();water.setMatrixAt(i,dummy.matrix);});world.add(water);
    const blades=[],flowers=[],occupied=new Set([...S.resAt.values()].map(r=>r.y*S.W+r.x));
    for(let y=0;y<S.H;y++)for(let x=0;x<S.W;x++)if(S.tiles[y][x]==='g'&&!occupied.has(y*S.W+x)&&!(x>=34&&x<=46&&y>=25&&y<=34)){
      for(let i=0;i<3;i++)blades.push([x+hash(x+i,y),y+hash(y+i,x),hash(x+i,y+i)]);
      if(hash(x+100,y)>.95)flowers.push([x+.5,y+.5,hash(x,y)]);
    }
    const grass=new T.InstancedMesh(new T.ConeGeometry(.035,.22,3),material('#738653'),blades.length);
    blades.forEach(([x,z,h],i)=>{dummy.position.set(x,.1,z);dummy.rotation.set(.15,h*TAU,.15);dummy.scale.setScalar(.6+h*.9);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);});grass.receiveShadow=true;world.add(grass);
    const flower=new T.InstancedMesh(new T.IcosahedronGeometry(.07,0),material('#e4d5a5'),flowers.length);
    flowers.forEach(([x,z,h],i)=>{dummy.position.set(x,.16,z);dummy.rotation.set(0,0,0);dummy.scale.set(1,.55,1);dummy.updateMatrix();flower.setMatrixAt(i,dummy.matrix);flower.setColorAt(i,new T.Color(h>.5?'#ebca9b':'#c3b2cf'));});world.add(flower);
    // Batch the repeated foliage and mineral meshes by geometry/material. Keep the
    // original groups only as invisible-to-renderer raycast proxies for interaction.
    const batches=new Map();
    for(const r of S.resAt.values()){
      const g=resource(r);g.position.set(r.x+.5,0,r.y+.5);g.updateMatrixWorld(true);selectable(g,{...r,action:'gather'});resourceNodes.set(r.id,g);
      g.traverse(m=>{if(!m.isMesh)return;const key=m.geometry.uuid+':'+m.material.uuid;if(!batches.has(key))batches.set(key,{geometry:m.geometry,material:m.material,entries:[]});batches.get(key).entries.push({id:r.id,matrix:m.matrixWorld.clone()});});
    }
    for(const b of batches.values()){
      const mesh=new T.InstancedMesh(b.geometry,b.material,b.entries.length);mesh.castShadow=!b.material.transparent;mesh.receiveShadow=!b.material.transparent;
      b.entries.forEach((entry,i)=>{mesh.setMatrixAt(i,entry.matrix);if(!resourceInstances.has(entry.id))resourceInstances.set(entry.id,[]);resourceInstances.get(entry.id).push({mesh,index:i,matrix:entry.matrix});});mesh.computeBoundingSphere();world.add(mesh);
    }
    for(const s of STATIONS){const g=locate(station(s),s.x,s.y);selectable(g,{...s,action:s.id});stationNodes.set(s.id,g);}
    for(const d of DECOR){const g=locate(cottage(d.roof==='moss'?'#788967':'#af7954'),d.x+1,d.y+.5);g.userData.decor=d;}
    for(const c of CHESTS){const g=locate(chest(),c.x,c.y);selectable(g,{...c,action:'chest'});chestNodes.set(c.id,g);}
    for(const [x,z,h]of[[20,13,2.7],[24,13,2],[20,17,1.2],[24,17,1.7]]){const g=group(world,x+.5,0,z+.5);part(g,'box','#a6b09a',0,h/2,0,.55,h,.55);part(g,'box','#c6cbb6',0,h,0,.78,.2,.78);part(g,'box','#8c9b83',0,.1,0,.85,.2,.85);part(g,'sphere','#7c925f',.14,h+.13,0,.3,.12,.28);}
    // Small fenced flower beds frame the square without introducing invisible obstacles.
    for(const [x,z]of[[35,28],[35,32],[45,27],[45,32]]){const g=group(world,x+.5,0,z+.5);part(g,'box','#7f7953',0,.06,0,.9,.12,.5);for(let i=0;i<5;i++){part(g,'cylinder','#6a8450',-.34+i*.17,.21,0,.018,.32,.018);part(g,'sphere',i%2?'#e5c088':'#c89ba1',-.34+i*.17,.39,0,.085,.06,.08);}}
    built=true;
  }
  function ring(x,z,r,color,opacity=.7){const mat=new T.MeshBasicMaterial({color,transparent:true,opacity,side:T.DoubleSide,depthWrite:false}),m=new T.Mesh(ringGeo,mat);m.rotation.x=-Math.PI/2;m.position.set(x+.5,.04,z+.5);m.scale.setScalar(r);scene.add(m);return m;}
  const hoverRing=ring(0,0,.47,'#fff1c0',.45),targetRing=ring(0,0,.5,'#ffe0a0',.8),heroRing=ring(0,0,.43,'#f4e6b2',.65);
  const pathDots=new T.InstancedMesh(new T.SphereGeometry(.043,6,4),new T.MeshBasicMaterial({color:'#f7e3a8'}),60);scene.add(pathDots);const transform=new T.Object3D();
  function burst(x,z,count=15,palette=0){for(let i=0;i<count;i++){if(particles.length>180)break;const a=hash(i+performance.now(),z)*TAU,s=.8+hash(x,i)*2.6,m=new T.Mesh(particleGeo,particleMats[palette]);m.position.set(x+.5,.6,z+.5);m.scale.setScalar(.03+hash(i,x)*.055);scene.add(m);particles.push({m,v:new T.Vector3(Math.cos(a)*s,1.7+hash(z,i)*2.2,Math.sin(a)*s),life:.45+hash(i,z)*.4});}}
  function flash(node,t){if(!node)return;node.flashUntil=t+95;node.model.g.traverse(m=>{if(m.isMesh&&!m.material.transparent&&!m.userData.original){m.userData.original=m.material;m.material=flashMaterial;}});}
  function fx(f,t){
    const actor=actors.get(f.id);if(actor&&f.kind==='emote')actor.emote={kind:f.emote,at:t};if(actor&&['swing','skill','dash','tree','rock','herb'].includes(f.kind)){actor.action={...f,at:t};if(f.facing)actor.data.facing=f.facing;}
    if(f.kind==='hit'){
      flash(enemyNodes.get(f.targetId),t);burst(f.x,f.y,f.heavy?23:12,f.crit?1:0);
      if(f.id===S.me){freezeUntil=t+(settings.reduced?0:f.heavy?65:38);shake=Math.max(shake,f.heavy?.15:.075);}
    }else if(f.kind==='hurt'){flash(actors.get(f.id??S.me),t);shake=.20;document.body.classList.remove('damage-flash');void document.body.offsetWidth;document.body.classList.add('damage-flash');}
    else if(f.kind==='death'){burst(f.x,f.y,f.boss?40:22,2);}
    else if(f.kind==='swing'||f.kind==='skill'){
      const heavy=f.kind==='skill',m=ring(f.x,f.y,heavy?2:.9,heavy?'#a9e3df':'#ffe9bb',.95);m.position.y=heavy?.32:.72;if(!heavy){m.geometry=arcGeo;m.rotation.z=-(Math.atan2(f.facing?.x??0,f.facing?.y??1))+t*.001;}effects.push({m,start:t,duration:heavy?480:210,type:'slash',heavy});
    }else if(f.kind==='dash'){burst(f.from.x,f.from.y,12,0);}
    else if(f.kind==='slam'){const m=ring(f.x,f.y,f.radius,'#e8a174',.95);effects.push({m,start:t,duration:380,type:'slam'});burst(f.x,f.y,18,3);}
    else if(['heal','level','quest','craft','chest','recall','plant','water','harvest'].includes(f.kind)){burst(f.x,f.y,20,f.kind==='heal'?2:1);const m=ring(f.x,f.y,.65,f.kind==='heal'?'#b3e7a2':'#efda93');effects.push({m,start:t,duration:650,type:'heal'});}
    else if(['tree','rock','herb'].includes(f.kind))burst(f.x,f.y,10,f.kind==='rock'?4:2);
  }
  function project(x,y,z){projected.set(x,y,z).project(camera);return{x:(projected.x*.5+.5)*width,y:(-.5*projected.y+.5)*height};}
  function label(text,x,y,color='#fff3d3',size=12){ctx.font=`600 ${size}px "PingFang SC",system-ui`;ctx.textAlign='center';ctx.lineJoin='round';ctx.strokeStyle='rgba(35,51,41,.65)';ctx.lineWidth=3;ctx.strokeText(text,x,y);ctx.fillStyle=color;ctx.fillText(text,x,y);}
  function drawMap(target,large=false){
    if(!target||!S.tiles.length)return;const c=target.getContext('2d'),w=target.width,h=target.height,sx=w/S.W,sy=h/S.H;
    for(let y=0;y<S.H;y++)for(let x=0;x<S.W;x++){c.fillStyle=({w:'#6f9fa0',s:'#c4b997',d:'#b8b38c',q:'#a1aa92',p:'#b9a279'})[S.tiles[y][x]]??'#8ea478';c.fillRect(x*sx,y*sy,sx+.3,sy+.3);}
    for(const r of S.resAt.values())if(r.alive){c.fillStyle=r.type==='tree'?'#547a51':'#bfc3b1';c.fillRect(r.x*sx,r.y*sy,Math.max(1,sx),Math.max(1,sy));}
    for(const p of POIS){c.fillStyle='#f4e3b6';c.beginPath();c.arc((p.x+.5)*sx,(p.y+.5)*sy,large?5:2.4,0,TAU);c.fill();if(large){c.font='15px system-ui';c.textAlign='center';c.lineWidth=4;c.strokeStyle='#314b36';c.strokeText(p.name,p.x*sx,p.y*sy-15);c.fillText(p.name,p.x*sx,p.y*sy-15);}}
    for(const p of S.players.values()){c.fillStyle=p.id===S.me?'#fff6ce':'#bdd9df';c.beginPath();c.arc((p.x+.5)*sx,(p.y+.5)*sy,large?5:3,0,TAU);c.fill();}
    if(S.target&&S.players.get(S.me)){const p=S.players.get(S.me);c.strokeStyle='#ffe6a2';c.setLineDash([3,4]);c.beginPath();c.moveTo((p.x+.5)*sx,(p.y+.5)*sy);c.lineTo((S.target.x+.5)*sx,(S.target.y+.5)*sy);c.stroke();c.setLineDash([]);}
    c.strokeStyle='#f7ecc466';c.strokeRect((look.x+camera.left)*sx,(look.z-6)*sy,(camera.right-camera.left)*sx,14*sy);
  }
  function actorFrame(node,p,t,dt,isEnemy=false){
    const {model}=node;const g=model.g;
    p.rx??=p.x;p.ry??=p.y;if(Math.abs(p.x-p.rx)>5||Math.abs(p.y-p.ry)>5){p.rx=p.x;p.ry=p.y;}
    const moving=Math.abs(p.rx-p.x)+Math.abs(p.ry-p.y)>.03;
    const dx=p.x-p.rx,dy=p.y-p.ry,smooth=1-Math.exp(-dt/(node.action?.kind==='dash'?.04:.065));p.rx+=(p.x-p.rx)*smooth;p.ry+=(p.y-p.ry)*smooth;g.position.set(p.rx+.5,0,p.ry+.5);
    if(p.facing||moving){const f=p.facing??{x:dx,y:dy},angle=Math.atan2(f.x,f.y),delta=Math.atan2(Math.sin(angle-g.rotation.y),Math.cos(angle-g.rotation.y));g.rotation.y+=delta*Math.min(1,dt*18);}
    const action=node.action,age=action?(t-action.at)/1000:10;
    if(!isEnemy){
      const walk=moving?Math.sin(t*.018):Math.sin(t*.002)*.04;model.legs[0].rotation.x=walk*.65;model.legs[1].rotation.x=-walk*.65;model.arms[0].rotation.x=-walk*.45;model.arms[1].rotation.x=walk*.45;
      model.root.position.y=moving?Math.abs(Math.sin(t*.018))*.065:Math.sin(t*.002)*.012;model.root.rotation.set(0,0,0);model.arms[0].rotation.z=0;model.arms[1].rotation.z=0;model.arms[1].rotation.y=0;
      for(const eye of model.eyes)eye.scale.y=(t+p.id*173)%4400<130?.08:1;model.head.rotation.y=moving?0:Math.sin(t*.0017+p.id)*.07;model.head.rotation.z=moving?0:Math.sin(t*.002+p.id)*.025;
      if(moving||age<.6)node.emote=null;
      const emoting=node.emote&&t-node.emote.at<(node.emote.kind==='sit'?600000:2700);
      if(emoting){if(node.emote.kind==='wave'){model.arms[0].rotation.z=2.4+Math.sin(t*.018)*.3;model.arms[0].rotation.x=-.25;}if(node.emote.kind==='heart'){model.arms[0].rotation.z=.8;model.arms[0].rotation.x=-1.1;model.head.rotation.z=.12;}if(node.emote.kind==='sit'){model.root.position.y=-.30;model.legs[0].rotation.x=-1.2;model.legs[1].rotation.x=-1.2;}}
      model.cape.rotation.x=-.18+(moving?Math.sin(t*.014)*.1:.015*Math.sin(t*.003));
      if(age<.34&&['swing','tree','rock','herb'].includes(action?.kind)){
        const a=Math.sin(Math.min(1,age/.30)*Math.PI);model.arms[1].rotation.x=-.7-a*.7;model.arms[1].rotation.y=(action.combo===2?1:-1)*(-1.3+age*8);model.root.rotation.y=a*(action.combo===2?-.55:.55);model.root.position.z=a*.12;
      }else{model.root.position.z=0;}
      if(action?.kind==='skill'&&age<.5){model.root.rotation.y=age/.5*TAU;model.arms[1].rotation.z=-1.3;model.root.position.y=Math.sin(age/.5*Math.PI)*.22;}
      if(action?.kind==='dash'&&age<.32){model.root.rotation.x=age/.32*TAU;model.root.position.y=.18+Math.sin(age/.32*Math.PI)*.2;}
      if(p.id===S.me&&moving&&t-lastFoot>190&&!settings.reduced){lastFoot=t;burst(p.rx,p.ry,1,0);}
    }else if(p.type==='slime'){
      const bounce=Math.sin(t*(moving?.015:.004)+p.homeX);model.root.scale.set(1+bounce*.08,1-bounce*.12,1+bounce*.07);model.root.position.y=moving?Math.max(0,bounce)*.18:0;
      if(p.attack)model.root.scale.set(1.17,.73,1.17);
    }else if(p.type==='guardian'){model.root.rotation.z=moving?Math.sin(t*.01)*.04:0;model.root.position.y=moving?Math.abs(Math.sin(t*.01))*.045:0;if(p.attack)model.root.rotation.x=-.10;else model.root.rotation.x=0;}
    if(node.flashUntil&&t>node.flashUntil){g.traverse(m=>{if(m.userData.original){m.material=m.userData.original;delete m.userData.original;}});node.flashUntil=0;}
  }
  function frame(t){
    requestAnimationFrame(frame);if(document.hidden){last=t;return;}const dt=Math.min(.05,(t-last)/1000);last=t;
    if(!S.tiles.length)return;if(!built)terrain();
    const p=S.players.get(S.me)??{x:40,y:31,rx:40,ry:31};night+=( (S.night??0)-night)*dt*.4;
    ambient.intensity=2.4-night*1.1;sun.intensity=3.3-night*2.6;gpu.toneMappingExposure=1.18-night*.1;fireLight.intensity=(3+night*7)*(1+Math.sin(t*.017)*.13);
    scene.background.set('#bdc9ae').lerp(new T.Color('#3c5362'),night);scene.fog.color.copy(scene.background);
    for(const f of S.fx)if(!f.rendered3d){f.rendered3d=true;fx(f,t);}
    for(const [id,node]of actors)if(!S.players.has(id)){scene.remove(node.model.g);actors.delete(id);}
    for(const data of S.players.values()){
      const signature=data.color+JSON.stringify(data.equipment??{});let node=actors.get(data.id);
      if(!node||node.signature!==signature){if(node)scene.remove(node.model.g);node={model:adventurer(data.color,data.equipment),signature,data};actors.set(data.id,node);scene.add(node.model.g);}
      node.data=data;if(t>freezeUntil||settings.reduced)actorFrame(node,data,t,dt);
    }
    cozy.frame(t,dt,settings.reduced);
    for(const e of S.enemies.values()){
      let node=enemyNodes.get(e.id);if(!node){node={model:monster(e),data:e};enemyNodes.set(e.id,node);scene.add(node.model.g);selectable(node.model.g,{...e,action:'attack'});}
      node.data=e;node.model.g.userData.target={...e,action:'attack'};node.model.g.visible=e.alive&&distance(p,e)<23;
      if(e.alive&&(t>freezeUntil||settings.reduced))actorFrame(node,e,t,dt,true);
      if(e.attack&&e.alive){if(!node.warning)node.warning=ring(e.attack.x,e.attack.y,e.attack.radius+.48,'#e76045',.65);const progress=Math.min(1,(Date.now()+(S.clockOffset??0)-e.attack.startedAt)/(e.attack.impactAt-e.attack.startedAt));node.warning.position.set(e.attack.x+.5,.045,e.attack.y+.5);node.warning.material.opacity=.3+progress*.55;node.warning.scale.setScalar((e.attack.radius+.48)*(.88+progress*.12));}
      else if(node.warning){scene.remove(node.warning);node.warning.material.dispose();node.warning=null;}
    }
    for(const r of S.resAt.values()){const g=resourceNodes.get(r.id);if(g){g.visible=r.alive&&distance(p,r)<23;if(g.userData.alive!==r.alive){g.userData.alive=r.alive;for(const ref of resourceInstances.get(r.id)??[]){ref.mesh.setMatrixAt(ref.index,r.alive?ref.matrix:new T.Matrix4().makeScale(0,0,0));ref.mesh.instanceMatrix.needsUpdate=true;}}}}
    for(const c of CHESTS){const g=chestNodes.get(c.id),open=S.you?.opened.includes(c.id),lid=g.userData.lid;lid.rotation.x=Math.PI/2-(open?.9:0);lid.position.set(0,open?.73:.5,open?-.18:0);}
    for(const [id,g]of houseNodes)if(!S.houses.has(id)){world.remove(g);houseNodes.delete(id);}
    for(const h of S.houses.values())if(!houseNodes.has(h.id))houseNodes.set(h.id,locate(cottage('#ab7858',2.8,2.8),h.x+1,h.y+1));
    const flame=stationNodes.get('camp')?.userData.flame;if(flame){flame.scale.set(1+Math.sin(t*.019)*.10,1+Math.sin(t*.014)*.16,1);flame.rotation.y=t*.001;}
    if(water){water.material.opacity=.42+Math.sin(t*.0008)*.055;water.position.y=Math.sin(t*.001)*.009;}
    const cx=(p.rx??p.x)+.5,cz=(p.ry??p.y)+.5;look.x+=(cx-look.x)*(1-Math.exp(-dt*7));look.z+=(cz-look.z)*(1-Math.exp(-dt*7));
    shake*=Math.exp(-dt*15);const strength=settings.shake&&!settings.reduced?shake:0;
    camera.position.set(look.x+Math.sin(t*.18)*strength,22,look.z+21+Math.cos(t*.21)*strength);camera.lookAt(look.x,0,look.z);camera.updateMatrixWorld();
    sun.position.set(look.x-10,22,look.z-8);sun.target.position.set(look.x,0,look.z);sun.target.updateMatrixWorld();
    heroRing.visible=!!S.me;heroRing.position.set(cx,.045,cz);heroRing.material.opacity=.4+Math.sin(t*.003)*.1;
    hoverRing.visible=!!hover&&!!S.me;if(hover)hoverRing.position.set(hover.x+.5,.035,hover.y+.5);
    targetRing.visible=!!S.target;if(S.target){targetRing.position.set(S.target.x+.5,.046,S.target.y+.5);targetRing.scale.setScalar(.52+Math.sin(t*.006)*.035);}
    pathDots.count=Math.min(60,S.path.length);for(let i=0;i<pathDots.count;i++){transform.position.set(S.path[i].x+.5,.07,S.path[i].y+.5);transform.updateMatrix();pathDots.setMatrixAt(i,transform.matrix);}pathDots.instanceMatrix.needsUpdate=true;
    for(let i=particles.length-1;i>=0;i--){const a=particles[i];a.life-=dt;a.v.y-=dt*7;a.m.position.addScaledVector(a.v,dt);a.m.scale.multiplyScalar(1-dt*1.6);if(a.life<=0||a.m.position.y<0){scene.remove(a.m);particles.splice(i,1);}}
    for(let i=effects.length-1;i>=0;i--){const e=effects[i],a=(t-e.start)/e.duration;e.m.material.opacity=1-a;e.m.scale.multiplyScalar(1+dt*(e.type==='slash'?1.3:2));if(e.type==='heal')e.m.position.y+=dt*.8;if(a>=1){scene.remove(e.m);e.m.material.dispose();effects.splice(i,1);}}
    gpu.render(scene,camera);
    ctx.setTransform(devicePixelRatio||1,0,0,devicePixelRatio||1,0,0);ctx.clearRect(0,0,width,height);
    cozy.drawLabels(project,label,t);
    for(const s of STATIONS)if(distance(p,s)<10){const pos=project(s.x+.5,s.id==='merchant'?2.05:s.id==='camp'?.95:1.7,s.y+.5);label(s.name,pos.x,pos.y,'#ffefc9',11);}
    for(const d of DECOR)if(distance(p,d)<11){const pos=project(d.x+1.5,3.2,d.y+1);label(d.name,pos.x,pos.y,'#f8edcb',11);}
    for(const data of S.players.values()){const pos=project((data.rx??data.x)+.5,1.83,(data.ry??data.y)+.5);label(data.name,pos.x,pos.y,data.id===S.me?'#fff0bf':'#e4f1e7',12);const bubble=S.bubbles.get(data.id);if(bubble&&t-bubble.at<6000){const text=bubble.text.length>23?bubble.text.slice(0,23)+'…':bubble.text;label(text,pos.x,pos.y-25,'#fff7dd',13);}}
    for(const e of S.enemies.values())if(e.alive&&distance(p,e)<7){const pos=project((e.rx??e.x)+.5,e.type==='guardian'?2.4:e.type==='dummy'?1.85:1.1,(e.ry??e.y)+.5);label(e.type==='dummy'?'练习木桩 · 无消耗':e.name,pos.x,pos.y,e.attack?'#ffd3b4':'#ecedc9',11);if(e.type!=='dummy'){ctx.fillStyle='#314735b3';ctx.fillRect(pos.x-23,pos.y+7,46,4);ctx.fillStyle=e.type==='guardian'&&e.hp<e.maxHp/2?'#e9956f':'#dbbf77';ctx.fillRect(pos.x-23,pos.y+7,46*e.hp/e.maxHp,4);}if(e.attack)label('!',pos.x,pos.y-22,'#ffc08a',22);}
    S.fx=S.fx.filter(f=>t-f.at<1400);
    for(const f of S.fx)if(f.text&&settings.numbers){const age=(t-f.at)/1400,pos=project(f.x+.5+(f.kind==='hit'?Math.sin(f.at)*.4:0),1.7+age*1.2,f.y+.5);ctx.globalAlpha=Math.min(1,(1-age)*2);label(f.text,pos.x+(f.crit?10:0),pos.y,({hit:f.crit?'#ffe78c':'#fff1d0',hurt:'#ffb098',heal:'#c8f2b1',dodge:'#b6efed'})[f.kind]??'#fff0bc',f.crit?21:f.kind==='hit'?17:13);ctx.globalAlpha=1;}
    if(S.fishing){const f=S.fishing,bite=Date.now()>=f.biteAt,pos=project(f.x+.5,.15,f.y+.5),from=project(cx,1,cz);ctx.strokeStyle='#f8ecc799';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.quadraticCurveTo((from.x+pos.x)/2,Math.min(from.y,pos.y)-40,pos.x,pos.y);ctx.stroke();ctx.fillStyle=bite?'#ffdc75':'#de8f68';ctx.beginPath();ctx.ellipse(pos.x,pos.y+Math.sin(t*.005)*2,bite?5:3,5,0,0,TAU);ctx.fill();if(bite)label('!',pos.x,pos.y-17,'#ffe091',24);}
    if(!settings.reduced)for(let i=0;i<18;i++){ctx.fillStyle=night>.5?'#edda8c99':'#ffffdf66';const x=(i*173+t*.012)%width,y=(i*107+t*.005+Math.sin(t*.001+i)*18)%height;ctx.beginPath();ctx.ellipse(x,y,1.6,.85,t*.001+i,0,TAU);ctx.fill();}
    if(t-lastMap>300){drawMap(document.getElementById('minimap'));drawMap(document.getElementById('worldMap'),true);lastMap=t;}
    frameCount++;if(t-fpsStart>1000){canvas.dataset.fps=String(Math.round(frameCount*1000/(t-fpsStart)));canvas.dataset.drawCalls=String(gpu.info.render.calls);frameCount=0;fpsStart=t;}
  }
  function screenToTile(x,y){pointer.set(x/width*2-1,1-y/height*2);ray.setFromCamera(pointer,camera);ray.ray.intersectPlane(plane,point);return{x:Math.floor(point.x),y:Math.floor(point.z)};}
  function pick(x,y){pointer.set(x/width*2-1,1-y/height*2);ray.setFromCamera(pointer,camera);const hits=ray.intersectObjects(pickables.filter(g=>g.visible),true);for(const hit of hits){let n=hit.object;while(n&&!n.userData.target)n=n.parent;if(n){const data=n.userData.target;if(data.action==='attack'&&!S.enemies.get(data.id)?.alive)continue;return data;}}return null;}
  canvas.dataset.renderer='WebGL 3D';requestAnimationFrame(frame);
  return {screenToTile,pick,drawMap,setHover:v=>hover=v,configure,settings:()=>({...settings}),zoom:delta=>{zoom=Math.max(.7,Math.min(1.65,zoom+delta));resize();}};
}
