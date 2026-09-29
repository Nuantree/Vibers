import * as T from './vendor/three.module.js';
import { GARDENS, CROPS, gardenStage, distance } from './catalog.js';
import { companionModel, gardenModel, butterfly, hash } from './models3d.js';

export function createCozyRenderer({scene,S,selectable}){
  const pets=new Map(),beds=new Map(),butterflies=[];
  for(const b of GARDENS){const model=gardenModel();model.g.position.set(b.x+.5,0,b.y+.5);scene.add(model.g);selectable(model.g,{...b,action:'garden'});beds.set(b.id,model);}
  const wild=companionModel('fox');wild.g.position.set(38.6,0,32.1);wild.g.rotation.y=.4;scene.add(wild.g);selectable(wild.g,{x:38,y:32,action:'companion',name:'等你的小伙伴'});
  for(let i=0;i<8;i++){const m=butterfly();scene.add(m.g);butterflies.push(m);}
  function animate(model,t,moving,joy=false,reduced=false){
    const wave=Math.sin(t*.011),blink=(t%4700)<140?.1:1;
    model.root.position.y=moving&&!reduced?Math.abs(Math.sin(t*.018))*(model.kind==='bunny'?.12:.055):Math.sin(t*.002)*.008;
    model.head.rotation.z=Math.sin(t*.002)*.045;model.tail.rotation.y=Math.sin(t*(joy?.024:.007))*(joy?.60:.23);
    model.ears[0].rotation.x=Math.sin(t*.002)*.09;model.ears[1].rotation.x=Math.sin(t*.002+1)*.09;
    for(const eye of model.eyes)eye.scale.y=blink;
    if(joy&&!reduced)model.root.position.y=Math.abs(wave)*.13;
  }
  function frame(t,dt,reduced){
    const you=S.players.get(S.me),time=Date.now()+(S.clockOffset??0);
    wild.g.visible=!S.you?.companion?.kind;animate(wild,t,false,false,reduced);
    for(const [id,node]of pets)if(!S.players.has(id)||!S.players.get(id).companion?.kind){scene.remove(node.model.g);pets.delete(id);}
    for(const p of S.players.values()){
      const pet=p.companion;if(!pet?.kind)continue;
      const signature=pet.kind+(pet.bond>=60?2:pet.bond>=20?1:0);let n=pets.get(p.id);
      if(!n||n.signature!==signature){if(n)scene.remove(n.model.g);const model=companionModel(pet.kind,pet.bond);model.g.position.set((p.rx??p.x)+1.1,0,(p.ry??p.y)+.9);n={model,signature,trail:[{x:p.x+.7,y:p.y+.7}],lastX:p.x,lastY:p.y};pets.set(p.id,n);scene.add(model.g);}
      const g=n.model.g;if(n.lastX!==p.x||n.lastY!==p.y){n.trail.push({x:p.x,y:p.y});n.lastX=p.x;n.lastY=p.y;if(n.trail.length>4)n.trail.shift();}
      const dest=n.trail[Math.max(0,n.trail.length-2)],tx=dest.x+.5,tz=dest.y+.5,dist=Math.hypot(g.position.x-tx,g.position.z-tz);
      if(dist>6){g.position.set(p.x+.7,0,p.y+.8);n.trail=[{x:p.x+.7,y:p.y+.7}];}
      const moving=dist>.30;
      if(moving){const a=Math.atan2(tx-g.position.x,tz-g.position.z);g.rotation.y+=Math.atan2(Math.sin(a-g.rotation.y),Math.cos(a-g.rotation.y))*Math.min(1,dt*12);g.position.x+=(tx-g.position.x)*Math.min(1,dt*7);g.position.z+=(tz-g.position.z)*Math.min(1,dt*7);}
      else {const a=Math.atan2((p.rx??p.x)+.5-g.position.x,(p.ry??p.y)+.5-g.position.z);g.rotation.y+=Math.atan2(Math.sin(a-g.rotation.y),Math.cos(a-g.rotation.y))*dt*2;}
      const joy=S.fx.some(f=>f.kind==='heart'&&f.id===p.id&&t-f.at<1300);animate(n.model,t+p.id*151,moving,joy,reduced);
      g.visible=!you||distance(p,you)<22;
    }
    for(const b of GARDENS){const model=beds.get(b.id),plot=S.you?.garden?.[b.id],stage=gardenStage(plot,time),crop=CROPS.find(c=>c.id===plot?.crop);model.plants.visible=!!plot;
      if(plot){const growth=Math.min(1,(time-plot.plantedAt)/Math.max(1,plot.readyAt-plot.plantedAt));model.plants.scale.setScalar(.27+growth*.73);for(const f of model.buds){f.visible=crop?.id==='starflower'&&growth>.55;f.rotation.y=t*.00035;}}
      model.tag.material.color.set(stage==='ready'?'#f7d680':plot?.watered?'#b2cdd0':'#dcca9c');
    }
    butterflies.forEach((b,i)=>{const x=34+(i%4)*3,z=26+Math.floor(i/4)*8;b.g.visible=!reduced&&(S.night??0)<.7&&(!you||Math.hypot(you.x-x,you.y-z)<18);b.g.position.set(x+Math.sin(t*.0007+i)*.65,.65+Math.sin(t*.001+i)*.25,z+Math.cos(t*.0006+i)*.6);b.g.rotation.y=t*.0006+i;b.wings[0].rotation.z=Math.sin(t*.028+i)*.8;b.wings[1].rotation.z=-Math.sin(t*.028+i)*.8;});
  }
  function drawLabels(project,label,t){
    const p=S.players.get(S.me),time=Date.now()+(S.clockOffset??0);if(!p)return;
    if(wild.g.visible&&distance(p,{x:38,y:32})<5){const pos=project(38.6,1.2,32.1);label('等你一起出发',pos.x,pos.y,'#f8dfb2',11);}
    for(const b of GARDENS)if(distance(p,b)<6){const plot=S.you?.garden?.[b.id],stage=gardenStage(plot,time),pos=project(b.x+.5,.9,b.y+.5);const text=stage==='ready'?'✦ 可以收获':plot?`${Math.max(0,Math.ceil((plot.readyAt-time)/1000))}s${plot.watered?' · 已浇水':''}`:'播种';label(text,pos.x,pos.y,stage==='ready'?'#ffdf8e':'#f4ebc7',10);}
    const own=pets.get(S.me);if(own){const pos=project(own.model.g.position.x,1.1,own.model.g.position.z);label(S.you?.companion?.name??'小伙伴',pos.x,pos.y,'#fae5ba',10);}
    for(const f of S.fx)if(f.kind==='heart'||f.kind==='emote'&&f.emote==='heart'){const a=(t-f.at)/1400;if(a<1){const pet=pets.get(f.id),x=pet?.model.g.position.x??f.x+.5,z=pet?.model.g.position.z??f.y+.5,pos=project(x,1+a*.6,z);label('♥',pos.x+Math.sin(a*5)*12,pos.y,'#ecc0b9',23);}}
  }
  return {frame,drawLabels};
}
