import { POIS, STATIONS, CHESTS, GARDENS, DECOR, distance } from './catalog.js';
const TAU=Math.PI*2;
const hash=(x,y)=>((Math.imul(x+13,73856093)^Math.imul(y+7,19349663))>>>0);
export function createRenderer(canvas,S) {
  const ctx=canvas.getContext('2d'), mini=document.getElementById('minimap'), mc=mini.getContext('2d');
  let width=innerWidth,height=innerHeight,dpr=1,ground=null,terrainKey=null,hover=null,now=0,last=0;
  const tileSize=()=>innerWidth<480?39:48;
  const palette={sage:['#4b6a49','#779065'],amber:['#936b44','#bd9461'],iris:['#756287','#a18aab'],rose:['#975d68','#c68892'],sky:['#58798e','#8dadbd']};
  const ell=(x,y,rx,ry,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();};
  const poly=(points,color)=>{ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();};
  const line=(points,color,w=1)=>{ctx.strokeStyle=color;ctx.lineWidth=w;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();};
  const rect=(x,y,w,h,color,r=0)=>{ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();};
  function resize(){width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,2);canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ground=null;}
  addEventListener('resize',resize);resize();
  const me=()=>S.players.get(S.me)??{x:40,y:31,rx:40,ry:31};
  function camera(){const p=me(),T=tileSize();return {ox:(p.rx??p.x)*T+T/2-width/2,oy:(p.ry??p.y)*T+T/2-height*.54,T};}
  function screenToTile(x,y){const {ox,oy,T}=camera();return {x:Math.floor((x+ox)/T),y:Math.floor((y+oy)/T)};}
  const pt=(x,y)=>{const {ox,oy,T}=camera();return [(x+.5)*T-ox,(y+.5)*T-oy];};
  function makeGround(){
    if(!S.tiles.length)return;
    const T=tileSize();ground=document.createElement('canvas');ground.width=S.W*T;ground.height=S.H*T;
    const g=ground.getContext('2d');g.fillStyle='#87a777';g.fillRect(0,0,ground.width,ground.height);
    for(let y=0;y<S.H;y++)for(let x=0;x<S.W;x++){
      const t=S.tiles[y][x],h=hash(x,y),px=x*T,py=y*T;
      if(t==='g'){
        g.fillStyle=`rgba(${h%2?156:69},${h%2?176:110},${h%2?116:58},${.015+(h%6)/350})`;g.fillRect(px,py,T,T);
        for(let i=0;i<8;i++){
          const hx=hash(x*11+i,y*9+i),gx=px+hx%T,gy=py+(hx>>8)%T;
          g.strokeStyle=['#76976980','#9ab17d90','#a8bb8b60'][hx%3];g.lineWidth=.8;g.beginPath();g.moveTo(gx-2,gy-3);g.lineTo(gx,gy);g.lineTo(gx+2,gy-4);g.stroke();
          if(hx%19===0){g.fillStyle=hx%2?'#e5dba180':'#e8d8c580';g.fillRect(gx,gy-3,2,2);}
        }
      } else if(t==='w'){
        g.fillStyle='#669b9a';g.fillRect(px,py,T,T);
        for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])if(S.tiles[y+dy]?.[x+dx]&&S.tiles[y+dy][x+dx]!=='w'&&S.tiles[y+dy][x+dx]!=='p'){
          g.fillStyle='#a6b791';if(dx)g.fillRect(px+(dx>0?T-7:0),py,7,T);else g.fillRect(px,py+(dy>0?T-7:0),T,7);
          g.fillStyle='#bdd0ad66';if(dx)g.fillRect(px+(dx>0?T-13:7),py,6,T);else g.fillRect(px,py+(dy>0?T-13:7),T,6);
        }
      } else if(t==='p'){
        g.fillStyle='#776846';g.fillRect(px,py,T,T);
        for(let i=0;i<6;i++){g.fillStyle=i%2?'#ae9971':'#b8a37b';g.fillRect(px+2,py+i*T/6,T-4,T/6-1);}
        g.fillStyle='#72644b';for(let i=0;i<2;i++)g.fillRect(px+4+i*(T-10),py,2,T);
      } else if(t==='s'){
        g.fillStyle='#9fa88b';g.fillRect(px,py,T,T);
        for(let j=0;j<3;j++)for(let i=0;i<3;i++){
          const hh=hash(x*3+i,y*3+j),gw=T/3-2,gx=px+i*T/3+1,gy=py+j*T/3+1;
          g.fillStyle=['#b9b99a','#b3b598','#bebe9f','#aeb293'][hh%4];g.beginPath();g.roundRect(gx,gy,gw,gw,3);g.fill();
          g.strokeStyle='#d1ceb04d';g.lineWidth=.7;g.beginPath();g.moveTo(gx+3,gy+1);g.lineTo(gx+gw-3,gy+1);g.stroke();
        }
      } else if(t==='q'){
        g.fillStyle=['#a2a88b','#a5ac91','#a7ad92'][h%3];g.fillRect(px,py,T,T);
        for(let i=0;i<7;i++){const z=hash(x*7+i,y*2);g.fillStyle='#828f7950';g.fillRect(px+z%T,py+(z>>6)%T,2+(z%3),2);}
      } else {
        g.fillStyle='#b8b28b';g.fillRect(px,py,T,T);
        for(let i=0;i<8;i++){const z=hash(x*8+i,y*3);g.fillStyle=['#d0c7a170','#a9a27f66','#8c997455'][z%3];g.fillRect(px+z%T,py+(z>>6)%T,2+(z%3),1+(z%2));}
        for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])if(S.tiles[y+dy]?.[x+dx]==='g'){
          g.fillStyle='#92a777';for(let i=0;i<7;i++){const a=i*T/7;g.beginPath();const edge=h%4+2;if(dx)g.ellipse(px+(dx>0?T:0),py+a,edge,4,0,0,TAU);else g.ellipse(px+a,py+(dy>0?T:0),4,edge,0,0,TAU);g.fill();}
        }
      }
    }
    terrainKey=S.tiles;
  }
  function label(text,x,y,color='#f3efda',size=10,bg=true){
    ctx.font=`${size}px "PingFang SC",system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    const w=ctx.measureText(text).width;
    if(bg)rect(x-w/2-8,y-9,w+16,18,'#293e2cc7',4);
    ctx.fillStyle=color;ctx.fillText(text,x,y+.5);ctx.textBaseline='alphabetic';
  }
  function tree(r,x,y){
    const h=hash(r.x,r.y),scale=tileSize()/48*(.88+(h%5)*.065);
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
    ell(11,10,27,10,'#334d3233');
    if(!r.alive){ell(0,4,8,5,'#785d3d');ell(0,1,8,4,'#b69867');ell(0,0,5,2,'#8c704b');ctx.restore();return;}
    const p=me();if(Math.abs(p.rx-r.x)<.8&&p.ry<r.y&&p.ry>r.y-1.7)ctx.globalAlpha=.55;
    poly([[-5,7],[-4,-32],[3,-32],[6,8],[2,5],[-2,9]],'#6b6340');
    line([[0,-9],[-13,-28]],'#726844',4);line([[0,-17],[13,-34]],'#766c49',4);
    if(h%4===0){
      poly([[-30,-10],[0,-77],[30,-10]],'#3c6447');poly([[-27,-15],[0,-69],[26,-15]],'#507b51');
      poly([[-24,-31],[0,-80],[25,-31]],'#426e4b');poly([[-20,-36],[0,-77],[17,-37]],'#6c925c');
      poly([[-15,-51],[0,-86],[17,-51]],'#5b8856');poly([[-12,-54],[0,-83],[4,-54]],'#80a266');
      line([[-20,-21],[-8,-18]],'#88a767',1.4);
    }else{
      const sway=Math.sin(now/1900+h)*1.1;
      ctx.translate(sway,0);
      const lobes=[[-23,-25,18,16],[-5,-24,23,20],[20,-30,19,18],[-20,-43,20,20],[0,-52,25,22],[20,-50,18,18],[-5,-66,18,14]];
      for(const [lx,ly,rx,ry]of lobes)ell(lx+1,ly+4,rx+1,ry+2,'#456d48');
      const colors=h%3===0?['#75965e','#7f9f65','#6c925c','#89a46a','#96af76','#89a76b','#a0b57c']:['#668a54','#72965b','#60854f','#7d9c61','#8baa6d','#799b60','#96b376'];
      lobes.forEach(([lx,ly,rx,ry],i)=>ell(lx-2,ly-2,rx,ry,colors[i]));
      for(let i=0;i<22;i++){const z=hash(h%300+i,i);const lx=(z%55)-28,ly=-70+((z>>6)%41);ell(lx,ly,2.5,1.2,i%2?'#b4c88a42':'#476e433d');}
    }
    ctx.restore();
  }
  function rock(r,x,y){
    ctx.save();ctx.translate(x,y);ctx.scale(tileSize()/48,tileSize()/48);
    ell(7,8,20,7,'#3543332b');
    if(!r.alive){poly([[-12,6],[-7,-1],[1,0],[7,7]],'#8d9b91');poly([[9,7],[12,0],[17,5]],'#a6b1a0');ctx.restore();return;}
    poly([[-21,6],[-18,-13],[-5,-26],[12,-23],[23,-7],[20,7],[6,13]],'#737f79');
    poly([[-18,-13],[-5,-26],[12,-23],[7,-7],[-7,0]],'#b1bcb0');poly([[12,-23],[23,-7],[7,-7]],'#97a69a');
    poly([[-18,-13],[-7,0],[6,13],[-21,6]],'#92a092');poly([[7,-7],[23,-7],[20,7],[6,13]],'#88958b');
    line([[-2,-20],[4,-12],[0,-7]],'#d6d6b07a',2);line([[12,0],[13,5]],'#c9cdaa',2);
    if(hash(r.x,r.y)%4===0){poly([[-12,-8],[-9,-20],[-5,-10],[-8,-4]],'#b0c9c4');poly([[0,-15],[4,-29],[9,-18],[4,-10]],'#becdd1');}
    ctx.restore();
  }
  function herb(r,x,y){
    if(!r.alive){ell(x,y,5,2,'#688754');return;}
    ell(x+4,y+4,13,5,'#31543720');
    for(let i=0;i<5;i++){const a=i*1.6,dx=Math.sin(a)*10;line([[x,y+2],[x+dx,y-13-Math.cos(a)*4]],'#64825b',1.8);ctx.save();ctx.translate(x+dx,y-11-Math.cos(a)*4);ctx.rotate(a/3);ell(0,0,3.7,7,['#b8c8a0','#99b58f','#c2d0ac'][i%3]);ctx.restore();}
    ell(x,y-17,2,3,'#e1dab0');
  }
  function person(p,x,y,merchant=false){
    const own=p.id===S.me,c=palette[p.color??'sage']??palette.sage;
    const moving=Math.abs(p.rx-p.x)+Math.abs(p.ry-p.y)>.08,bob=moving?Math.sin(now/70)*1.6:Math.sin(now/650)*.6;
    ell(x+3,y+10,13,5,'#273e3638');
    if(own){ctx.strokeStyle='#f4e2a499';ctx.lineWidth=1.3;ctx.beginPath();ctx.ellipse(x,y+9,17,7,0,0,TAU);ctx.stroke();}
    ctx.save();ctx.translate(x,y+bob);ctx.scale(tileSize()/48,tileSize()/48);
    rect(-7,3,5,10,'#535448',2);rect(3,3,5,10,'#535448',2);rect(-9,10,8,4,'#574c3d',2);rect(3,10,8,4,'#574c3d',2);
    poly([[-8,-18],[8,-18],[15,5],[6,9],[-12,7]],merchant?'#967457':c[0]);
    poly([[-8,-17],[2,-15],[-2,8],[-13,6]],merchant?'#b29061':c[1]);
    rect(-11,-8,5,10,'#d1b28c',2);rect(8,-8,5,10,'#d1b28c',2);
    ell(0,-20,9,11,'#dab991');ell(-4,-22,4,6,'#e4c79f');
    poly([[-12,-21],[-9,-32],[0,-38],[11,-30],[13,-20],[6,-25],[-6,-24]],merchant?'#a79369':c[1]);
    poly([[-12,-21],[-8,-30],[1,-36],[-2,-26]],merchant?'#baa27b':c[0]);
    ell(-3,-19,1,1.3,'#4a5241');ell(4,-19,1,1.3,'#4a5241');line([[-2,-13],[3,-13]],'#b78d6a',1);
    line([[7,-12],[-3,7]],'#d2bd83',3);rect(-2,-3,7,5,'#8b6d40',1);rect(0,-2,2,2,'#d9c188',.5);
    if(p.tier==='lord'){poly([[-8,-31],[-9,-41],[-3,-37],[1,-44],[4,-37],[10,-41],[9,-31]],'#e1c779');}
    ctx.restore();
    if(p.name)label(p.name,x,y-51,own?'#fbf4d9':'#e4e9d3',9);
    const bubble=S.bubbles.get(p.id);if(bubble&&now-bubble.at<5000)label(bubble.text.slice(0,25),x,y-78,'#eff3dc',11);
  }
  function station(s,x,y){
    ctx.save();ctx.translate(x,y);ctx.scale(tileSize()/48,tileSize()/48);
    if(s.id==='merchant'){
      ell(9,10,45,14,'#3d49302c');
      rect(-37,-19,6,34,'#756a47',2);rect(31,-19,6,34,'#756a47',2);
      rect(-37,-66,5,53,'#797448');rect(31,-66,5,53,'#797448');
      person({color:'amber',rx:0,ry:0,x:0,y:0},0,-13,true);
      rect(-40,-8,80,24,'#9c855b',2);rect(-42,-12,84,7,'#c3ae78',2);
      for(let i=0;i<7;i++)line([[-34+i*11,-4],[-34+i*11,13]],'#796d4b88');
      rect(-28,-19,20,7,'#798654',2);ell(-24,-22,4,4,'#c4a771');ell(-16,-21,4,3,'#d8b76f');
      rect(16,-25,9,14,'#99875d',2);rect(18,-29,5,5,'#bfb784',1);
      poly([[-44,-45],[-35,-71],[35,-71],[46,-45]],'#6e8860');
      for(let i=0;i<7;i++){const xx=-35+i*10;poly([[xx,-71],[xx+5,-71],[xx+10,-45],[xx-2,-45]],i%2?'#aeb795':'#d6d4b1');}
      rect(-45,-46,91,7,'#b0bb92',2);for(let i=0;i<9;i++)ell(-40+i*10,-40,5,4,i%2?'#798f64':'#d8d3ad');
      rect(-12,-82,24,13,'#7a8156',3);line([[-7,-77],[7,-77]],'#d4d8ac',1);line([[0,-81],[0,-72]],'#d4d8ac',1);
    }else if(s.id==='workshop'){
      ell(8,7,32,10,'#3c513132');
      rect(-24,-26,47,29,'#8d7854',2);rect(-29,-32,58,8,'#c0a779',2);rect(-23,0,6,12,'#746747',1);rect(17,0,6,12,'#746747',1);
      rect(-21,-23,41,4,'#aa9368',1);rect(-21,-12,41,4,'#aa9368',1);
      poly([[-11,-33],[-16,-40],[-12,-47],[9,-46],[17,-42],[11,-36],[4,-35],[6,-31]],'#788780');line([[-10,-45],[9,-45]],'#b8c0a6',2);
      line([[19,-29],[26,-53]],'#806847',3);poly([[23,-56],[32,-51],[29,-43],[21,-47]],'#b0bba5');
      rect(-30,-72,4,40,'#818463');line([[-28,-72],[2,-67]],'#858662',2);rect(-22,-69,24,16,'#c5c2a0',2);line([[-16,-62],[-5,-57]],'#838f6f',2);
      rect(26,-6,14,15,'#a18d62',2);line([[29,-4],[29,7]],'#c3b081',1);line([[36,-4],[36,7]],'#c3b081',1);
    }else if(s.id==='camp'){
      ell(2,5,26,12,'#59694742');ell(0,0,20,10,'#7c775b');ell(0,0,16,8,'#605d47');
      for(let i=0;i<9;i++){const a=i/9*TAU;ell(Math.cos(a)*21,Math.sin(a)*10,5,4,['#9fa48b','#b3b397','#858f77'][i%3]);}
      line([[-12,3],[11,-4]],'#79633d',5);line([[-10,-5],[10,3]],'#9a7b4c',5);
      const f=Math.sin(now/95)*3;
      poly([[-11,0],[-10,-13],[-4,-24],[1,-19],[5,-34-f],[11,-16],[8,0]],'#d09b50');poly([[-7,0],[-4,-14],[0,-9],[4,-23-f],[7,-10],[4,1]],'#e7bf6b');poly([[-3,0],[0,-12],[3,-5],[2,2]],'#f5df96');
      for(let i=0;i<5;i++){const t=(now/800+i*.2)%1;ell(Math.sin(i+now/500)*10,-15-t*40,1,1,`rgba(242,208,129,${1-t})`);}
      rect(-39,12,23,8,'#8c7951',3);rect(22,9,23,8,'#8c7951',3);line([[-35,14],[-20,14]],'#b19a68',1);
    }else{
      ell(6,7,25,6,'#44543530');rect(-18,-43,5,52,'#857247',1);rect(14,-43,5,52,'#857247',1);
      rect(-26,-60,52,39,'#8b7e54',3);rect(-22,-56,44,31,'#baaf80',1);poly([[-30,-60],[0,-74],[30,-60]],'#5f7951');
      rect(-15,-50,17,19,'#e2d9b4',1);rect(5,-46,12,16,'#d5d0a2',1);for(let i=0;i<3;i++)line([[-12,-44+i*4],[-2,-44+i*4]],'#a7a17c');ell(-8,-52,1.5,1.5,'#77875f');
    }
    ctx.restore();
    const near=distance(me(),s)<3;
    label(s.name,x,y+(s.id==='camp'?29:31),near?'#f5e3a7':'#e4e9d0',9);
    if(near&&S.me)label('E',x,y-(s.id==='merchant'?102:s.id==='board'?89:68),'#f9edbb',10);
  }
  function chest(c,x,y){
    const open=S.you?.opened.includes(c.id);ell(x+3,y+6,20,7,'#33452e33');
    rect(x-16,y-12,32,21,'#8a7748',3);rect(x-16,y-15,32,9,open?'#665936':'#b69b5a',3);
    if(open){rect(x-16,y-25,32,10,'#a18b54',3);rect(x-13,y-20,26,9,'#615432',1);}
    rect(x-13,y-15,4,24,'#cfb77a',1);rect(x+9,y-15,4,24,'#cfb77a',1);rect(x-3,y-7,6,9,'#e0c785',1);
    if(!open){const a=.4+Math.sin(now/350)*.25;ell(x,y-25,2,2,`rgba(249,227,155,${a})`);if(distance(me(),c)<4)label('遗失的宝箱',x,y-40,'#f6e0a0',9);}
  }
  function enemy(e,x,y){
    e.rx??=e.x;e.ry??=e.y;e.rx+=(e.x-e.rx)*.15;e.ry+=(e.y-e.ry)*.15;
    [x,y]=pt(e.rx,e.ry);ell(x+3,y+9,e.type==='guardian'?23:17,7,'#28463138');
    if(e.type==='dummy'){rect(x-3,y-40,6,52,'#987447',2);rect(x-22,y-22,44,5,'#b5925c',2);rect(x-10,y-32,20,24,'#bea271',3);ell(x,y-44,10,10,'#e0c995');ell(x-3,y-45,1.5,1.5,'#63553c');ell(x+3,y-45,1.5,1.5,'#63553c');}else if(e.type==='guardian'){
      const sway=Math.sin(now/700)*2;rect(x-16,y-35+sway,33,38,'#89938c',7);rect(x-12,y-48+sway,25,21,'#a4afa1',5);
      poly([[x-15,y-35+sway],[x+15,y-35+sway],[x+10,y-20+sway],[x-6,y-24+sway]],'#a8b69b');
      rect(x-26,y-28+sway,11,27,'#7b8a7c',4);rect(x+16,y-28+sway,11,27,'#a1ac9b',4);rect(x-15,y+1,11,13,'#7f8c81',3);rect(x+6,y+1,11,13,'#78867c',3);
      rect(x-7,y-39+sway,5,3,'#d7bf77',1);rect(x+4,y-39+sway,5,3,'#d7bf77',1);poly([[x,y-24+sway],[x+5,y-16+sway],[x,y-9+sway],[x-5,y-16+sway]],'#b5c7a2');
      ell(x-8,y-47+sway,7,3,'#758954');
    }else{
      const bob=Math.sin(now/420+hash(e.homeX,e.homeY))*2;
      ell(x,y-1,18+Math.sin(now/400),15+bob,'#648652');ell(x-1,y-4,16,13+bob,'#8aab6a');ell(x-6,y-10,6,3,'#b3c78390');
      ell(x-5,y-1,1.6,2.2,'#3d5940');ell(x+5,y-1,1.6,2.2,'#3d5940');line([[x-2,y+4],[x+2,y+4]],'#536c45',1);ell(x-10,y+2,3,1.2,'#bdb37780');
      poly([[x-3,y-16-bob],[x-8,y-26-bob],[x,y-21-bob],[x+5,y-28-bob],[x+6,y-16-bob]],'#6c9555');
    }
    if(distance(me(),e)<5){label(e.name,x,y-(e.type==='guardian'?68:41),'#e5e9c8',8);rect(x-18,y-30,36,3,'#40553a',1);rect(x-18,y-30,36*e.hp/e.maxHp,3,'#c2a974',1);}
  }
  function house(h,x,y){
    const T=tileSize(),w=T*2.5;ctx.save();ctx.translate(x-T*.4,y);ctx.scale(w/120,w/120);
    ell(54,72,72,22,'#34452d30');rect(0,-8,107,83,h.decayingSince?'#8d8b73':'#c1ae7e',3);
    rect(5,0,97,69,'#b8a277',2);line([[10,26],[101,26]],'#988d69');line([[10,50],[101,50]],'#988d69');
    poly([[-13,0],[53,-72],[122,0]],h.roof==='moss'?'#607748':h.decayingSince?'#6f7861':'#8d7052');poly([[-6,-1],[53,-64],[115,-1]],h.roof==='moss'?'#849767':'#aa8462');
    for(let i=0;i<5;i++)line([[6+i*9,-10-i*10],[103-i*9,-10-i*10]],'#c2a47777',2);
    rect(43,34,24,41,'#716243',7);rect(9,12,21,23,'#6b7852',2);rect(78,12,21,23,'#6b7852',2);rect(12,15,15,17,'#dbce91',1);rect(81,15,15,17,'#dbce91',1);
    line([[19,15],[19,33]],'#927e50',2);line([[88,15],[88,33]],'#927e50',2);rect(37,73,37,7,'#a79c79',2);ctx.restore();
    if(h.ownerName)label(`${h.ownerName} 的家`,x+T*.7,y+T*2,'#efe1b5',9);
    if(h.name)label(h.name,x+T*.7,y+T*1.9,'#e5e5c5',8);
  }
  function ruins(x,y){
    for(const [dx,dy,h]of[[-63,-33,68],[62,-35,53],[-60,49,34],[61,43,46]]){
      ell(x+dx+12,y+dy+6,24,8,'#53614930');rect(x+dx-12,y+dy-h,24,h,'#97a18b',3);rect(x+dx-16,y+dy-h-4,32,9,'#b0b5a0',2);rect(x+dx-16,y+dy,32,8,'#8e9b81',2);
      line([[x+dx-5,y+dy-h+9],[x+dx-5,y+dy-8]],'#c2c6ad',2);line([[x+dx+4,y+dy-h+10],[x+dx+4,y+dy-10]],'#7f9178',2);ell(x+dx+8,y+dy-h,10,3,'#829866');
    }
  }
  function drawMap(target,large=false){
    if(!S.tiles.length)return;const c=target.getContext('2d'),w=target.width,h=target.height,sx=w/S.W,sy=h/S.H;
    c.fillStyle='#859c73';c.fillRect(0,0,w,h);
    for(let y=0;y<S.H;y++)for(let x=0;x<S.W;x++){
      const t=S.tiles[y][x];c.fillStyle=({w:'#6f9fa0',s:'#c4b997',d:'#b8b38c',q:'#a1aa92',p:'#b9a279'})[t]??'#8ea478';c.fillRect(x*sx,y*sy,sx+.3,sy+.3);
    }
    for(const r of S.resAt.values())if(r.alive){c.fillStyle=r.type==='tree'?'#547a51':r.type==='rock'?'#bfc3b1':'#a6b987';c.fillRect(r.x*sx,r.y*sy,Math.max(1,sx),Math.max(1,sy));}
    for(const poi of POIS){
      c.fillStyle='#e8d8a1';c.beginPath();c.arc((poi.x+.5)*sx,(poi.y+.5)*sy,large?5:2.4,0,TAU);c.fill();
      if(large){c.font='15px "PingFang SC",system-ui';c.textAlign='center';c.lineWidth=4;c.strokeStyle='#314b36b0';c.strokeText(poi.name,(poi.x+.5)*sx,(poi.y+.5)*sy-15);c.fillStyle='#fbf4d9';c.fillText(poi.name,(poi.x+.5)*sx,(poi.y+.5)*sy-15);}
    }
    if(S.target){c.strokeStyle='#f3da8d';c.lineWidth=large?2:1;c.beginPath();c.moveTo((me().x+.5)*sx,(me().y+.5)*sy);c.lineTo((S.target.x+.5)*sx,(S.target.y+.5)*sy);c.setLineDash([2,3]);c.stroke();c.setLineDash([]);}
    for(const p of S.players.values()){
      c.fillStyle=p.id===S.me?'#fff6ce':'#c2d1df';const px=(p.x+.5)*sx,py=(p.y+.5)*sy;
      c.beginPath();c.arc(px,py,large?5:3,0,TAU);c.fill();c.strokeStyle='#455d3b';c.lineWidth=1.3;c.stroke();
    }
    const {ox,oy,T}=camera();c.strokeStyle='#f4edcf77';c.lineWidth=.8;c.strokeRect(ox/T*sx,oy/T*sy,width/T*sx,height/T*sy);
  }
  function frame(t){
    now=t;requestAnimationFrame(frame);const dt=Math.min(50,t-last);last=t;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#64856a';ctx.fillRect(0,0,width,height);
    if(!S.tiles.length)return;if(!ground||terrainKey!==S.tiles)makeGround();
    for(const p of S.players.values()){p.rx??=p.x;p.ry??=p.y;if(Math.abs(p.rx-p.x)>8||Math.abs(p.ry-p.y)>8){p.rx=p.x;p.ry=p.y;}p.rx+=(p.x-p.rx)*(1-Math.exp(-dt/70));p.ry+=(p.y-p.ry)*(1-Math.exp(-dt/70));}
    const {ox,oy,T}=camera();ctx.drawImage(ground,-ox,-oy);
    const x0=Math.max(0,Math.floor(ox/T)-2),y0=Math.max(0,Math.floor(oy/T)-2),x1=Math.min(S.W-1,Math.ceil((ox+width)/T)+2),y1=Math.min(S.H-1,Math.ceil((oy+height)/T)+3);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(S.tiles[y][x]==='w'){
      const h=hash(x,y),wave=Math.sin(t/1100+x+y)*3;
      if(h%3===0)line([[x*T-ox+8+wave,y*T-oy+12],[x*T-ox+22+wave,y*T-oy+12]],'#d0ddd347',1);
      if(h%17===0){ell(x*T-ox+29,y*T-oy+33,8,3,'#779c78');ell(x*T-ox+31,y*T-oy+31,2,2,'#e0c1b0');}
    }
    // Warm village accents: planted beds, stepping stones and signposts.
    for(const [tx,ty]of[[35,28],[35,32],[45,27],[45,32]]){
      const [x,y]=pt(tx,ty);ell(x,y,18,9,'#70875a');
      for(let i=0;i<5;i++){const xx=x-14+i*7,yy=y-6+Math.sin(i)*4;line([[xx,y],[xx,yy-7]],'#657d49',1.5);ell(xx,yy-8,2.7,2.2,i%2?'#e5ce99':'#dcbda6');}
    }
    const [rx,ry]=pt(22,15);if(rx>-200&&rx<width+200&&ry>-200&&ry<height+200)ruins(rx,ry);
    if(S.path?.length){for(let i=0;i<Math.min(60,S.path.length);i+=2){const [x,y]=pt(S.path[i].x,S.path[i].y);ell(x,y+4,2.1,1.1,'#f3ebbc90');}}
    if(S.target){const [x,y]=pt(S.target.x,S.target.y);ctx.strokeStyle='#f7e9b4aa';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(x,y+5,14+Math.sin(t/200)*2,6,0,0,TAU);ctx.stroke();}
    if(hover){const [x,y]=pt(hover.x,hover.y);ctx.strokeStyle='#f7f3d655';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x-T/2+2,y-T/2+2,T-4,T-4,7);ctx.stroke();}
    for(const e of S.enemies.values())if(e.alive&&e.attack){const [x,y]=pt(e.attack.x,e.attack.y),r=(e.attack.radius+.35)*T;ctx.fillStyle='#d56b4d40';ctx.strokeStyle='#f8a16f';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.stroke();}
    for(const bed of GARDENS){const [bx,by]=pt(bed.x,bed.y),plot=S.you?.garden?.[bed.id],ready=plot&&Date.now()+(S.clockOffset??0)>=plot.readyAt;rect(bx-20,by-17,40,32,'#bca274',4);rect(bx-16,by-13,32,24,'#6f603f',2);if(plot){for(let i=0;i<3;i++){const px=bx-10+i*10;line([[px,by+3],[px,by-13]],'#7c9959',2);ell(px,by-13,4,5,plot.crop==='starflower'?'#d7acd3':'#aac17f');}}if(ready)label('可收获',bx,by-30,'#ffe0a1',9);}
    const objects=[];
    for(const r of S.resAt.values())if(r.x>=x0&&r.x<=x1&&r.y>=y0&&r.y<=y1)objects.push({y:r.y,draw:()=>{const [x,y]=pt(r.x,r.y);(r.type==='tree'?tree:r.type==='rock'?rock:herb)(r,x,y);}});
    for(const s of STATIONS)objects.push({y:s.y,draw:()=>station(s,...pt(s.x,s.y))});
    for(const c of CHESTS)if(c.x>=x0&&c.x<=x1&&c.y>=y0&&c.y<=y1)objects.push({y:c.y,draw:()=>chest(c,...pt(c.x,c.y))});
    for(const d of DECOR)objects.push({y:d.y+d.h-1,draw:()=>house(d,...pt(d.x,d.y))});
    for(const h of S.houses.values())objects.push({y:h.y+2,draw:()=>house(h,...pt(h.x,h.y))});
    for(const e of S.enemies.values())if(e.alive&&e.x>=x0&&e.x<=x1&&e.y>=y0&&e.y<=y1)objects.push({y:e.ry??e.y,draw:()=>enemy(e)});
    for(const p of S.players.values())objects.push({y:p.ry??p.y,draw:()=>{person(p,...pt(p.rx,p.ry));if(p.companion?.kind){const [px,py]=pt((p.rx??p.x)+.65,(p.ry??p.y)+.55),bunny=p.companion.kind==='bunny';ell(px,py,11,7,bunny?'#ede1c0':'#c89860');ell(px,py-9,10,10,bunny?'#ede1c0':'#c89860');ell(px-6,py-19,3,bunny?10:6,bunny?'#e7d7b6':'#bc8954');ell(px+6,py-19,3,bunny?10:6,bunny?'#e7d7b6':'#bc8954');ell(px-4,py-10,1,2,'#3f4435');ell(px+4,py-10,1,2,'#3f4435');}}});
    objects.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());
    if(S.fishing&&S.me){
      const [px,py]=pt(me().rx,me().ry),[fx,fy]=pt(S.fishing.x,S.fishing.y),bite=Date.now()>=S.fishing.biteAt;
      const side=fx>=px?1:-1;line([[px+8*side,py-6],[px+23*side,py-48]],'#85704b',2.5);
      ctx.strokeStyle='#e4dfbaba';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(px+23*side,py-48);ctx.quadraticCurveTo((px+fx)/2,Math.min(py,fy)-55,fx,fy-3);ctx.stroke();
      ctx.strokeStyle=bite?'#f5dc91':'#cee4c878';ctx.lineWidth=bite?1.5:.8;ctx.beginPath();ctx.ellipse(fx,fy+2,9+Math.sin(t/230)*2,4,0,0,TAU);ctx.stroke();
      ell(fx,fy-3+Math.sin(t/(bite?65:550))*2,3,5,bite?'#f1d57f':'#c17c63');ell(fx,fy-5,2,2,'#f2e1b4');if(bite)label('!',fx,fy-25,'#fce4a3',20,false);
    }
    // Leaves and drifting motes add life without distracting from interaction.
    for(let i=0;i<20;i++){
      const x=((i*151+t*(.009+i%3*.004))%(width+80))-40,y=(i*97+t*.008+Math.sin(t/2300+i)*12)%height;
      ctx.save();ctx.translate(x,y);ctx.rotate(t/2200+i);ell(0,0,2.6,1.1,'#e4dca466');ctx.restore();
    }
    const night=S.night??0;if(night>0){rect(0,0,width,height,`rgba(28,45,78,${night*.31})`);const [cx,cy]=pt(37,31);const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,120);glow.addColorStop(0,`rgba(247,201,118,${night*.21})`);glow.addColorStop(1,'#f0cc7900');ctx.fillStyle=glow;ctx.fillRect(cx-120,cy-120,240,240);}
    else {const sun=ctx.createLinearGradient(0,0,width,height);sun.addColorStop(0,'#f1e3a419');sun.addColorStop(.6,'#e9e5b500');ctx.fillStyle=sun;ctx.fillRect(0,0,width,height);}
    S.fx=S.fx.filter(f=>t-f.at<1600);
    for(const f of S.fx){const age=(t-f.at)/1600,[x,y]=pt(f.x,f.y);ctx.globalAlpha=1-age;if(f.text)label(f.text,x,y-30-age*38,({hurt:'#f3b2a1',hit:'#fbe1b7',level:'#f4e3a5',heal:'#d7edb5'})[f.kind]??'#f4f0c9',f.kind==='level'?16:12,false);
      if(f.kind==='hit'&&age<.2){ctx.strokeStyle='#f8edc9';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y-12,23,Math.PI*1.1,Math.PI*1.95);ctx.stroke();}
      if(age<.3){const colors={tree:'#d4c28c',rock:'#d3d7c5',herb:'#d4e1b4',hit:'#f1dca2',heal:'#c7e3b5'};for(let i=0;i<7;i++){const a=i/7*TAU;ell(x+Math.cos(a)*age*90,y+Math.sin(a)*age*60,2,2,colors[f.kind]??'#ede5b8');}}
      ctx.globalAlpha=1;
    }
    if(Math.floor(t/150)!==Math.floor((t-dt)/150)){drawMap(mini);const big=document.getElementById('worldMap');if(big)drawMap(big,true);}
  }
  requestAnimationFrame(frame);
  return { screenToTile, camera, drawMap, setHover:v=>hover=v };
}
