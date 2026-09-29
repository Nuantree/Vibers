import * as T from './vendor/three.module.js';
const materials=new Map();
export function material(color,extra={}){const key=color+JSON.stringify(extra);if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,roughness:.88,...extra}));return materials.get(key);}
const geo={box:new T.BoxGeometry(1,1,1),sphere:new T.IcosahedronGeometry(1,1),round:new T.SphereGeometry(1,16,12),cylinder:new T.CylinderGeometry(1,1,1,8),cone:new T.ConeGeometry(1,1,7)};
export function part(parent,shape,color,x,y,z,sx,sy,sz,extra){const m=new T.Mesh(geo[shape],material(color,extra));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export function group(parent,x=0,y=0,z=0){const g=new T.Group();g.position.set(x,y,z);parent?.add(g);return g;}
export const hash=(x,y=0)=>{const a=Math.sin(x*127.1+y*311.7)*43758.5453;return a-Math.floor(a);};
let shadowTexture, shadowMaterial;
const shadowGeometry=new T.PlaneGeometry(1,1);
export function contact(parent,scale=1){
  if(!shadowTexture){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,2,32,32,31);g.addColorStop(0,'rgba(16,31,26,.48)');g.addColorStop(1,'rgba(16,31,26,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);shadowTexture=new T.CanvasTexture(c);}
  shadowMaterial??=new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false});const m=new T.Mesh(shadowGeometry,shadowMaterial);m.scale.setScalar(scale);m.rotation.x=-Math.PI/2;m.position.y=.026;parent.add(m);return m;
}
export function adventurer(color='sage',equipment={}){
  const g=new T.Group(),root=group(g),tones={sage:['#526b50','#829e68'],amber:['#9a673f','#cc9a59'],iris:['#755c86','#ab8baa'],rose:['#975d68','#c68892'],sky:['#58798e','#8dadbd']},[dark,light]=tones[color]??tones.sage;
  contact(g,1.3);
  // Oversized hood, inset face and small jointed limbs give the hero a clear silhouette.
  const body=group(root,0,.69,0);
  part(body,'cylinder',dark,0,0,0,.29,.48,.22);
  part(body,'box','#776043',0,-.14,0,.61,.075,.48);part(body,'box','#e1b967',0,-.14,.255,.12,.12,.055,{metalness:.4});
  const cape=part(body,'cone',dark,0,-.06,-.20,.38,.7,.13);cape.rotation.x=-.18;
  part(body,'box','#94744e',0,.035,-.30,.38,.38,.18);part(body,'box','#d1b182',0,.17,-.32,.42,.09,.20);
  const head=group(root,0,1.15,.025);
  part(head,'round',dark,0,0,0,.40,.39,.34);
  part(head,'round','#e5b78d',0,-.025,.17,.295,.27,.23);
  // Brow brim catches sun; hair and eyes sit forward of the hood opening.
  const brim=part(head,'sphere',light,0,.18,.19,.40,.18,.31);
  part(head,'box','#674632',0,.085,.36,.42,.075,.055);
  const eyes=[];
  for(const x of[-.105,.105]){const eye=group(head,x,-.04,.379);part(eye,'round','#302d29',0,0,0,.032,.046,.018);part(eye,'round','#fff4ce',-.009,.015,.016,.009,.011,.009);eyes.push(eye);part(head,'round','#cb8c75',x*1.4,-.105,.352,.055,.022,.012);}
  part(head,'sphere','#edc19a',0,-.098,.40,.045,.045,.045);
  const scarf=part(body,'sphere','#d9be7f',0,.21,.18,.31,.12,.16);
  const arms=[],legs=[];
  for(const side of[-1,1]){
    const a=group(body,side*.34,.1,0);part(a,'cylinder',light,0,-.13,0,.105,.29,.105);part(a,'round','#e3b38a',0,-.31,0,.11,.12,.11);arms.push(a);
    const l=group(root,side*.15,.43,0);part(l,'box','#4b5043',0,-.14,0,.18,.29,.2);part(l,'box','#604c39',0,-.33,.07,.23,.19,.34);legs.push(l);
  }
  const sword=group(arms[1],0,-.31,.035);sword.rotation.x=-.45;
  part(sword,'box','#655239',0,0,.08,.075,.09,.23);part(sword,'box','#d3b16b',0,0,.21,.3,.075,.065,{metalness:.5});
  part(sword,'box',equipment.sword?'#d7e7e4':'#b39a71',0,0,.55,.105,.055,.64,{metalness:equipment.sword?.65:0,roughness:.35});
  const tip=part(sword,'cone',equipment.sword?'#edf6ee':'#c8ae7e',0,0,.93,.072,.19,.05);tip.rotation.x=Math.PI/2;
  if(equipment.armor){part(body,'sphere','#91b6bc',0,.02,.09,.31,.27,.25,{metalness:.5});for(const x of[-.35,.35])part(body,'sphere','#b9d2cf',x,.12,0,.18,.13,.19,{metalness:.6});part(body,'sphere','#91e0dd',0,.07,.34,.08,.1,.025,{emissive:'#4fadb5',emissiveIntensity:.6});}
  if(equipment.axe){const axe=part(body,'box','#9baaad',-.29,.15,-.29,.28,.19,.09);axe.rotation.z=.3;}
  return {g,root,body,head,arms,legs,sword,cape,brim,scarf,eyes};
}
export function resource(r){
  const g=new T.Group(),h=hash(r.x,r.y);
  if(r.type==='tree'){
    const pine=h>.64;contact(g,2.2);part(g,'cylinder','#72583b',0,.64,0,.14,1.28,.15);
    if(pine){for(let i=0;i<3;i++)part(g,'cone',['#476d51','#587e59','#71935f'][i],0,1.25+i*.58,0,.93-i*.19,1.5-i*.19,.89-i*.18);}
    else{
      const branch=part(g,'cylinder','#806142',.23,1.06,0,.07,.65,.07);branch.rotation.z=-.6;
      for(const [x,y,z,s,c]of[[-.35,1.55,0,.72,'#658557'],[.35,1.75,.12,.79,'#78935e'],[0,2.15,-.04,.73,'#92a86d'],[-.35,2,.25,.53,'#849f62']])part(g,'sphere',c,x,y,z,s,s*.84,s*.85);
    }
    g.rotation.y=h*6.28;g.scale.setScalar(.88+h*.22);
  }else if(r.type==='rock'){
    contact(g,1.25);const rock=part(g,'sphere','#929f98',0,.32,0,.51,.44,.42);rock.rotation.set(.2,h*3,.3);
    part(g,'sphere','#b0b9ab',-.25,.18,.22,.25,.24,.25);
    for(let i=0;i<3;i++){const m=part(g,'cone','#b4d8d4',-.19+i*.18,.56,-.04,.07,.32,.08,{metalness:.4});m.rotation.z=-.3+i*.3;}
  }else{
    contact(g,.8);for(let i=0;i<6;i++){const a=i/6*Math.PI*2,m=part(g,'sphere','#6c9d62',Math.cos(a)*.16,.14,Math.sin(a)*.16,.07,.24,.045);m.rotation.z=-Math.cos(a)*.7;m.rotation.x=Math.sin(a)*.7;}
    part(g,'round','#d8e7b4',0,.4,0,.10,.11,.10,{emissive:'#c8d795',emissiveIntensity:.3});
  }return g;
}
export function cottage(roof='#788867',w=2.8,d=1.8){
  const g=new T.Group();contact(g,4);part(g,'box','#a49677',0,.12,0,w+.15,.24,d+.15);part(g,'box','#e2cf9e',0,1.02,0,w,1.7,d);
  for(const x of[-w/2+.08,w/2-.08])part(g,'box','#745c3d',x,1.02,d/2+.02,.13,1.7,.13);
  part(g,'box','#92744c',0,.48,d/2+.055,.55,.88,.10);part(g,'box','#ceaa5f',.18,.5,d/2+.13,.05,.06,.07);
  part(g,'box','#b5a88a',0,.09,d/2+.27,.85,.18,.46);
  for(const x of[-w*.31,w*.31]){part(g,'box','#685d45',x,1.13,d/2+.04,.56,.62,.1);part(g,'box','#f2d191',x,1.13,d/2+.10,.42,.47,.035,{emissive:'#e8af57',emissiveIntensity:.25});part(g,'box','#90794e',x,1.13,d/2+.13,.055,.5,.03);part(g,'box','#90794e',x,1.13,d/2+.13,.46,.055,.03);}
  const shape=new T.Shape();shape.moveTo(-w/2-.24,0);shape.lineTo(0,1.05);shape.lineTo(w/2+.24,0);shape.closePath();
  const mesh=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:d+.4,bevelEnabled:false}),material(roof));mesh.position.set(0,1.86,-d/2-.2);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);
  for(let i=1;i<5;i++){const y=i*.19,width=(w+.48)*(1-y/1.05);part(g,'box',roof,0,1.86+y,d/2+.21,width,.055,.06);}
  part(g,'box','#ab9c7f',w*.3,2.28,-d*.2,.34,1.2,.35);part(g,'box','#c8bb9d',w*.3,2.9,-d*.2,.44,.14,.44);return g;
}
export function station(s){
  const g=new T.Group();contact(g,1.8);
  if(s.id==='camp'){
    for(let i=0;i<9;i++){const a=i/9*6.28;part(g,'sphere','#929789',Math.cos(a)*.42,.10,Math.sin(a)*.42,.14,.12,.13);}
    for(let i=0;i<3;i++){const m=part(g,'cylinder','#6e4a32',0,.14,0,.1,.72,.1);m.rotation.set(Math.PI/2,i*2.09,0);}
    g.userData.flame=group(g,0,.28,0);part(g.userData.flame,'sphere','#ff922b',0,.2,0,.21,.45,.19,{emissive:'#ff7722',emissiveIntensity:2});part(g.userData.flame,'cone','#ffe9a5',0,.2,.035,.11,.55,.11,{emissive:'#ffc25d',emissiveIntensity:2});
  }else if(s.id==='merchant'){
    for(const x of[-.68,.68])part(g,'cylinder','#876444',x,.85,0,.055,1.7,.055);
    part(g,'box','#a48153',0,.52,.12,1.5,.62,.72);part(g,'box','#dbbc83',0,.88,.1,1.68,.10,.85);
    for(let i=0;i<6;i++){const m=part(g,'box',i%2?'#cfba82':'#64836a',-.66+i*.265,1.65,0,.27,.12,1.15);m.rotation.x=.17;part(g,'box',i%2?'#cfba82':'#64836a',-.66+i*.265,1.52,.55,.27,.25,.04);}
    for(let i=0;i<4;i++)part(g,'round',['#e9b369','#b87855','#a1b47a','#dfbc77'][i],-.5+i*.3,.98,.23,.10,.13,.11);
    const npc=adventurer('amber');npc.g.scale.setScalar(.75);npc.g.position.set(0,0,-.55);g.add(npc.g);
  }else if(s.id==='workshop'){
    part(g,'box','#957347',0,.65,0,1.28,.15,.75);for(const x of[-.48,.48])part(g,'box','#755f41',x,.3,0,.13,.6,.6);
    part(g,'box','#677879',.08,.94,0,.45,.42,.34);part(g,'box','#9faeaa',.08,1.15,0,.7,.12,.43);
    const hammer=part(g,'box','#b49a6c',-.4,.79,.19,.30,.055,.06);hammer.rotation.y=.4;
    part(g,'box','#5b6868',-.5,.84,.16,.12,.19,.13);
  }else{
    for(const x of[-.34,.34])part(g,'cylinder','#8a714b',x,.66,0,.07,1.32,.07);
    part(g,'box','#6f563c',0,1.15,0,.95,.73,.10);part(g,'box','#c7a36b',0,1.54,0,1.1,.13,.28);
    for(const [x,z]of[[-.22,.02],[.19,-.04]])part(g,'box','#f1dfb5',x,1.18+z,.065,.3,.42,.02);
  }return g;
}
export function chest(){const g=new T.Group();contact(g,1);part(g,'box','#97673e',0,.26,0,.66,.45,.46);g.userData.lid=part(g,'cylinder','#b9854b',0,.5,0,.33,.46,.19);g.userData.lid.rotation.x=Math.PI/2;for(const x of[-.22,.22])part(g,'box','#d4ac62',x,.28,.247,.055,.5,.025,{metalness:.5});part(g,'box','#ecd28b',0,.33,.26,.14,.14,.055,{metalness:.6});return g;}
export function monster(e){
  const g=new T.Group(),root=group(g);contact(g,e.type==='guardian'?2:1.35);
  if(e.type==='dummy'){
    part(root,'cylinder','#947452',0,.69,0,.10,1.38,.10);part(root,'cylinder','#ba9967',0,.91,0,.09,1.12,.09).rotation.z=Math.PI/2;
    part(root,'box','#bca574',0,.91,0,.53,.55,.28);part(root,'round','#e2cc97',0,1.37,0,.26,.26,.22);
    for(const x of[-.08,.08])part(root,'box','#645236',x,1.39,.215,.045,.055,.02);
    const target=new T.Mesh(new T.TorusGeometry(.15,.027,6,24),material('#a86246'));target.position.set(0,.93,.15);root.add(target);
  }else if(e.type==='guardian'){
    for(const side of[-1,1]){part(root,'box','#818f84',side*.3,.3,0,.43,.58,.46);part(root,'sphere','#9dab98',side*.65,1.14,0,.35,.41,.4);part(root,'box','#79897e',side*.68,.66,.04,.36,.6,.39);}
    part(root,'sphere','#9ba691',0,.94,0,.65,.7,.43);part(root,'box','#aab59e',0,1.66,0,.68,.53,.57);
    part(root,'box','#44554e',0,1.65,.292,.49,.09,.025);part(root,'box','#b7ffe0',0,1.65,.31,.3,.045,.025,{emissive:'#80ffc2',emissiveIntensity:2});
    part(root,'sphere','#8edec2',0,1.06,.41,.14,.22,.08,{emissive:'#74efc0',emissiveIntensity:1.3});
    part(root,'sphere','#74865a',-.15,1.99,0,.39,.13,.31);
  }else{
    part(root,'round','#8eb967',0,.36,0,.47,.4,.43,{roughness:.22,metalness:.08});
    part(root,'round','#c1d98f',-.13,.56,.29,.14,.07,.05,{roughness:.3});
    for(const x of[-.13,.13])part(root,'round','#304435',x,.36,.399,.042,.058,.022);
    part(root,'box','#52744b',0,.23,.42,.09,.025,.014);
    for(const x of[-.12,.1]){const leaf=part(root,'sphere','#608752',x,.83,0,.09,.22,.055);leaf.rotation.z=x*4;}
  }return {g,root};
}

export function companionModel(kind='fox',bond=0){
  const g=new T.Group(),root=group(g),bunny=kind==='bunny',fur=bunny?'#e8dfc5':'#c99054',cream='#fff0ce',dark='#5c493b';
  contact(g,1.0);const body=part(root,'round',fur,0,.30,0,.24,.26,.37);
  const head=group(root,0,.54,.23);part(head,'round',fur,0,0,0,.30,.28,.26);
  part(head,'round',cream,0,-.1,.16,.22,.135,.14);
  const ears=[],eyes=[];
  for(const side of[-1,1]){
    const ear=group(head,side*.19,.22,-.03);ear.rotation.z=-side*(bunny?.14:.25);
    part(ear,bunny?'round':'cone',fur,0,bunny?.20:.07,0,bunny?.085:.135,bunny?.32:.29,.075);
    part(ear,bunny?'round':'cone','#d4a390',0,bunny?.22:.08,.063,bunny?.040:.060,bunny?.22:.18,.014);ears.push(ear);
    const eye=group(head,side*.117,.004,.238);part(eye,'round','#322f2b',0,0,0,.039,.057,.021);part(eye,'round','#fff9e5',-.01,.02,.018,.011,.014,.008);eyes.push(eye);
    part(head,'round','#cf9b84',side*.20,-.073,.189,.043,.02,.012);
    for(const z of[-.21,.22])part(root,'round',bunny?cream:dark,side*.16,.10,z,.085,.12,.115);
  }
  part(head,'round',bunny?'#d09291':dark,0,-.10,.287,.034,.025,.023);
  const tail=group(root,0,.32,-.3);
  if(bunny)part(tail,'round',cream,0,0,-.10,.16,.16,.17);
  else{tail.rotation.x=.7;part(tail,'round',fur,0,.17,-.23,.21,.26,.46);part(tail,'round',cream,0,.29,-.55,.16,.18,.19);}
  part(root,'round',bond>=20?'#c9a250':'#81976b',0,.48,.15,.235,.075,.20);
  if(bond>=20)part(root,'sphere','#f7da8d',0,.40,.35,.065,.08,.028,{metalness:.5});
  if(bond>=60){const f=group(head,.20,.18,.13);for(let i=0;i<5;i++)part(f,'round','#d0a9d1',Math.cos(i*6.28/5)*.065,Math.sin(i*6.28/5)*.065,0,.045,.05,.022);part(f,'round','#f4d487',0,0,.027,.029,.03,.018);}
  return {g,root,body,head,tail,ears,eyes,kind};
}
export function gardenModel(){
  const g=new T.Group();contact(g,1.3);part(g,'box','#745c42',0,.10,0,.86,.18,.84);part(g,'box','#6e573d',0,.20,0,.76,.025,.73);
  for(const x of[-.46,.46])part(g,'box','#b29b6b',x,.17,0,.09,.31,1.0);
  for(const z of[-.46,.46])part(g,'box','#c2ac7b',0,.17,z,1,.31,.09);
  const plants=group(g,0,.2,0),buds=[];
  for(const [x,z]of[[-.20,-.19],[.20,-.19],[-.20,.2],[.2,.2]]){
    const plant=group(plants,x,0,z);part(plant,'cylinder','#759155',0,.19,0,.022,.38,.022);
    for(const side of[-1,1]){const leaf=part(plant,'round','#8caf6a',side*.06,.15,0,.045,.13,.03);leaf.rotation.z=-side*.7;}
    const flower=group(plant,0,.40,0);for(let i=0;i<5;i++)part(flower,'round','#d8b8d5',Math.cos(i*6.28/5)*.07,Math.sin(i*6.28/5)*.07,0,.055,.07,.04);part(flower,'round','#f4da99',0,0,.05,.045,.045,.03);buds.push(flower);
  }
  const tag=part(g,'box','#dcca9c',.32,.46,-.32,.20,.19,.025);tag.material=tag.material.clone();part(g,'box','#a39069',.32,.28,-.32,.04,.34,.04);
  return {g,plants,buds,tag};
}
export function butterfly(){
  const g=new T.Group(),wings=[];part(g,'round','#6b644e',0,0,0,.012,.02,.09);
  for(const side of[-1,1]){const wing=group(g);part(wing,'round',side<0?'#efcd95':'#edbf9f',side*.09,0,0,.11,.012,.12);wings.push(wing);}return {g,wings};
}
