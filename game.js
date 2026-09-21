/* =========================================================
   WORMLINE.IO — Cyberpunk Snake Arena
   ========================================================= */
(() => {
'use strict';

// ---------- SKINS ----------
const SKINS = [
  {id:'neon',   name:'NEON PULSE',   colors:['#00f0ff','#7b2fff'], glow:'#00f0ff', pattern:'gradient'},
  {id:'magma',  name:'CYBER MAGMA',  colors:['#ff00c8','#ff6a00'], glow:'#ff00c8', pattern:'gradient'},
  {id:'acid',   name:'ACID CODE',    colors:['#b6ff00','#00ff9d'], glow:'#aaff00', pattern:'stripe'},
  {id:'ghost',  name:'GHOST NET',    colors:['#e8faff','#6fd9ea'], glow:'#ffffff', pattern:'dash'},
  {id:'volt',   name:'VOLT RUNNER',  colors:['#f9f002','#ff2d00'], glow:'#f9f002', pattern:'stripe'},
  {id:'vapor',  name:'VAPOR WAVE',   colors:['#ff71ce','#01cdfe'], glow:'#ff71ce', pattern:'gradient'},
  {id:'toxic',  name:'TOXIC ICE',    colors:['#00ffc8','#0066ff'], glow:'#00ffc8', pattern:'dash'},
  {id:'blood',  name:'RED PROTOCOL', colors:['#ff003c','#8f00ff'], glow:'#ff003c', pattern:'stripe'},
  {id:'gold',   name:'GOLD CHROME',  colors:['#ffd700','#fff6c2'], glow:'#ffd700', pattern:'gradient'},
  {id:'void',   name:'VOID SHARD',   colors:['#8f00ff','#1b0246'], glow:'#a24bff', pattern:'dash'},
];

const BOT_NAMES = ['V','JOHNNY','REBECCA','PANAM','JUDY','ADAM.SM','ALT','SABURO','TAKEMURA','LUCY','DAVID','MAINE','KIWI','PILAR','FALCO','ROGUE','MEREDITH','PLACIDE','BRICK','ARASAKA','MILITECH','NETWATCH','GHOST_01','RIPPER','DELAMAIN','SOLO','NOMAD','CORPO'];

// ---------- WORLD ----------
const W = { r: 2600 };           // arena radius
const BOT_COUNT = 24;
const FOOD_COUNT = 900;
const TAU = Math.PI*2;

const rnd = (a,b)=>a+Math.random()*(b-a);
const pick = a=>a[(Math.random()*a.length)|0];
const lerp = (a,b,t)=>a+(b-a)*t;
function angLerp(a,b,t){let d=((b-a+Math.PI)%TAU+TAU)%TAU-Math.PI;return a+d*t;}

// ---------- STATE ----------
let canvas,ctx,mini,mctx,pv,pvctx;
let running=false, raf=0;
let snakes=[], foods=[], particles=[];
let player=null, selectedSkin=0;
let cam={x:0,y:0,z:1};
let mouse={x:0,y:0};
let keys={};
let lastT=0;

// ================= SNAKE =================
class Snake{
  constructor(opt){
    this.name=opt.name; this.isBot=!!opt.isBot; this.skin=opt.skin;
    this.x=opt.x; this.y=opt.y; this.ang=rnd(0,TAU);
    this.baseSpeed=170; this.speed=this.baseSpeed;
    this.score=opt.score||10;
    this.pts=[]; for(let i=0;i<10;i++) this.pts.push({x:this.x,y:this.y});
    this.boosting=false; this.energy=100; this.alive=true;
    this.boostAcc=0;
    this.aiTimer=0; this.aiTarget=null; this.aiFlee=0;
  }
  get radius(){ return 7 + Math.min(26, Math.sqrt(this.score)*0.62); }
  get length(){ return Math.floor(12 + this.score*0.55); }

  update(dt){
    if(!this.alive) return;
    // steering
    let desired=this.ang;
    if(this.isBot) desired=this.think();
    else desired=Math.atan2(mouse.y-canvas.height/2, mouse.x-canvas.width/2);
    const turn = 4.2*dt*(this.boosting?0.75:1);
    this.ang = angLerp(this.ang, desired, Math.min(1,turn));

    // boost
    const wantBoost=this.boosting;
    if(wantBoost && this.energy>0 && this.score>12){
      this.speed=this.baseSpeed*2.05;
      this.energy=Math.max(0,this.energy-38*dt);
      this.boostAcc+=dt;
      if(this.boostAcc>0.28){ this.boostAcc=0; this.score=Math.max(10,this.score-1); this.dropFood(1,0.5); }
      if(this.energy<=0) this.boosting=false;
      // speed trail particles
      for(let i=0;i<2;i++) particles.push(new P(this.x+rnd(-8,8),this.y+rnd(-8,8),this.skin.glow,rnd(.3,.6)));
    }else{
      this.boosting=false;
      this.speed=lerp(this.speed,this.baseSpeed,Math.min(1,6*dt));
      this.energy=Math.min(100,this.energy+22*dt);
    }

    this.x+=Math.cos(this.ang)*this.speed*dt;
    this.y+=Math.sin(this.ang)*this.speed*dt;

    // wall
    const d=Math.hypot(this.x,this.y);
    if(d>W.r-this.radius){ this.die(); return; }

    // body points
    this.pts.unshift({x:this.x,y:this.y});
    const maxPts=Math.ceil(this.length*3.2);
    while(this.pts.length>maxPts) this.pts.pop();

    // eat food
    const rr=(this.radius+16)**2;
    for(let i=foods.length-1;i>=0;i--){
      const f=foods[i];
      const dx=f.x-this.x, dy=f.y-this.y;
      if(dx*dx+dy*dy<rr){
        this.score+=f.v; foods.splice(i,1);
        for(let k=0;k<3;k++) particles.push(new P(f.x,f.y,f.c,.4));
        if(!this.isBot) shake=Math.min(4,shake+0.6);
      }
    }
  }

  think(){
    this.aiTimer-=1/60;
    const me=this;
    // avoid wall
    const d=Math.hypot(this.x,this.y);
    if(d>W.r-320) return Math.atan2(-this.y,-this.x);

    // avoid other snake bodies
    let danger=null,dbest=1e9;
    for(const s of snakes){
      if(s===me||!s.alive) continue;
      const step=Math.max(2,Math.floor(s.pts.length/26));
      for(let i=0;i<s.pts.length;i+=step){
        const p=s.pts[i];
        const dx=p.x-me.x,dy=p.y-me.y,dd=dx*dx+dy*dy;
        if(dd<dbest){dbest=dd;danger=p;}
      }
    }
    const avoidR=140+me.radius*3;
    if(danger && dbest<avoidR*avoidR){
      this.boosting=Math.random()<0.5 && this.energy>40;
      return Math.atan2(me.y-danger.y, me.x-danger.x);
    }

    // hunt food
    if(!this.aiTarget || this.aiTimer<=0 || !foods.includes(this.aiTarget)){
      this.aiTimer=rnd(.6,1.8);
      let best=null,bd=1e9;
      for(let i=0;i<foods.length;i+=3){
        const f=foods[i];
        const dd=(f.x-me.x)**2+(f.y-me.y)**2;
        if(dd<bd){bd=dd;best=f;}
      }
      this.aiTarget=best;
    }
    this.boosting = this.energy>70 && Math.random()<0.012;
    if(this.aiTarget) return Math.atan2(this.aiTarget.y-me.y,this.aiTarget.x-me.x);
    return this.ang;
  }

  dropFood(n,v){
    for(let i=0;i<n;i++){
      const p=this.pts[Math.min(this.pts.length-1,(Math.random()*this.pts.length)|0)];
      foods.push({x:p.x+rnd(-6,6),y:p.y+rnd(-6,6),v:v,c:this.skin.glow,r:3+v,ph:Math.random()*TAU});
    }
  }
  die(){
    if(!this.alive) return;
    this.alive=false;
    const step=Math.max(1,Math.floor(this.pts.length/Math.max(8,this.score/3)));
    for(let i=0;i<this.pts.length;i+=step){
      const p=this.pts[i];
      foods.push({x:p.x+rnd(-8,8),y:p.y+rnd(-8,8),v:rnd(1.5,4),c:this.skin.glow,r:5,ph:Math.random()*TAU});
      particles.push(new P(p.x,p.y,this.skin.glow,rnd(.5,1.1)));
    }
    if(this===player) onPlayerDeath();
    else setTimeout(()=>respawnBot(this),1500);
  }

  draw(g,camx,camy,z){
    const pts=this.pts, seg=Math.max(2,Math.floor(pts.length/this.length));
    const r=this.radius*z;
    const [c1,c2]=this.skin.colors;

    // glow pass
    g.lineCap='round'; g.lineJoin='round';
    g.save();
    g.shadowBlur=(this.boosting?38:18)*z; g.shadowColor=this.skin.glow;
    g.strokeStyle=c1; g.lineWidth=r*2;
    g.beginPath();
    for(let i=pts.length-1;i>=0;i-=2){
      const p=pts[i], sx=(p.x-camx)*z+canvas.width/2, sy=(p.y-camy)*z+canvas.height/2;
      i===pts.length-1?g.moveTo(sx,sy):g.lineTo(sx,sy);
    }
    const h=pts[0];
    g.lineTo((h.x-camx)*z+canvas.width/2,(h.y-camy)*z+canvas.height/2);
    g.stroke();
    g.restore();

    // segment ring pattern
    for(let i=pts.length-1;i>=0;i-=seg){
      const p=pts[i];
      const sx=(p.x-camx)*z+canvas.width/2, sy=(p.y-camy)*z+canvas.height/2;
      if(sx<-80||sy<-80||sx>canvas.width+80||sy>canvas.height+80) continue;
      const t=i/pts.length;
      let col=c2;
      if(this.skin.pattern==='stripe') col=(i/seg|0)%2?c1:c2;
      else if(this.skin.pattern==='dash') col=(i/seg|0)%3===0?'#ffffff':c2;
      else col=mixHex(c1,c2,t);
      g.fillStyle=col; g.globalAlpha=.85;
      g.beginPath(); g.arc(sx,sy,r*0.62,0,TAU); g.fill();
      g.globalAlpha=1;
    }

    // head
    const hx=(h.x-camx)*z+canvas.width/2, hy=(h.y-camy)*z+canvas.height/2;
    g.save();
    g.translate(hx,hy); g.rotate(this.ang);
    g.shadowBlur=26*z; g.shadowColor=this.skin.glow;
    g.fillStyle=c1; g.beginPath(); g.arc(0,0,r*1.06,0,TAU); g.fill();
    g.shadowBlur=0;
    g.fillStyle='#04000e';
    g.beginPath(); g.arc(r*.35,-r*.42,r*.30,0,TAU); g.fill();
    g.beginPath(); g.arc(r*.35, r*.42,r*.30,0,TAU); g.fill();
    g.fillStyle=this.boosting?'#fff':'#ff0060';
    g.beginPath(); g.arc(r*.45,-r*.42,r*.14,0,TAU); g.fill();
    g.beginPath(); g.arc(r*.45, r*.42,r*.14,0,TAU); g.fill();
    g.restore();

    // name
    g.font=`${Math.max(10,12*z)}px 'Share Tech Mono', monospace`;
    g.textAlign='center'; g.fillStyle='rgba(220,250,255,.75)';
    g.fillText(this.name, hx, hy-r*1.9);
  }
}

class P{
  constructor(x,y,c,life){this.x=x;this.y=y;this.c=c;this.life=life;this.max=life;
    const a=rnd(0,TAU),s=rnd(20,150);this.vx=Math.cos(a)*s;this.vy=Math.sin(a)*s;this.r=rnd(1.5,4);}
  update(dt){this.life-=dt;this.x+=this.vx*dt;this.y+=this.vy*dt;this.vx*=.94;this.vy*=.94;}
}

function mixHex(a,b,t){
  const pa=parseInt(a.slice(1),16), pb=parseInt(b.slice(1),16);
  const r=lerp((pa>>16)&255,(pb>>16)&255,t)|0, g=lerp((pa>>8)&255,(pb>>8)&255,t)|0, bl=lerp(pa&255,pb&255,t)|0;
  return `rgb(${r},${g},${bl})`;
}

// ================= SETUP =================
function spawnPos(){ const a=rnd(0,TAU),d=rnd(0,W.r*0.82); return {x:Math.cos(a)*d,y:Math.sin(a)*d}; }

function makeFood(){
  const p=spawnPos(); const s=pick(SKINS);
  return {x:p.x,y:p.y,v:rnd(.7,2.2),c:pick([s.colors[0],s.colors[1],'#f9f002','#ff00c8','#00f0ff']),r:rnd(3,6),ph:Math.random()*TAU};
}
function respawnBot(bot){
  const p=spawnPos();
  bot.x=p.x;bot.y=p.y;bot.alive=true;bot.score=rnd(15,60);bot.energy=100;
  bot.skin=pick(SKINS); bot.pts=[]; for(let i=0;i<10;i++)bot.pts.push({x:p.x,y:p.y});
}

function initGame(name,skin){
  snakes=[];foods=[];particles=[];
  for(let i=0;i<FOOD_COUNT;i++) foods.push(makeFood());
  const p=spawnPos();
  player=new Snake({name:name,skin:skin,x:p.x,y:p.y,score:18});
  snakes.push(player);
  const names=BOT_NAMES.slice().sort(()=>Math.random()-.5);
  for(let i=0;i<BOT_COUNT;i++){
    const q=spawnPos();
    const b=new Snake({name:names[i%names.length]+(i>=names.length?'_'+i:''),isBot:true,skin:pick(SKINS),x:q.x,y:q.y,score:rnd(15,140)});
    snakes.push(b);
  }
}

// ================= COLLISION =================
function collisions(){
  for(const s of snakes){
    if(!s.alive) continue;
    for(const o of snakes){
      if(o===s||!o.alive) continue;
      const hit=(s.radius+o.radius*0.7);
      const step=Math.max(2,Math.floor(o.pts.length/40));
      for(let i=6;i<o.pts.length;i+=step){
        const p=o.pts[i];
        const dx=p.x-s.x, dy=p.y-s.y;
        if(dx*dx+dy*dy<hit*hit){ s.die(); break; }
      }
      if(!s.alive) break;
    }
  }
}

// ================= RENDER =================
let shake=0, flashT=0;

function drawBG(z){
  const g=ctx;
  g.fillStyle='#03000b'; g.fillRect(0,0,canvas.width,canvas.height);
  // grid
  const gs=90*z;
  const ox=(-cam.x*z+canvas.width/2)%gs, oy=(-cam.y*z+canvas.height/2)%gs;
  g.lineWidth=1;
  g.strokeStyle='rgba(0,240,255,0.07)';
  g.beginPath();
  for(let x=ox;x<canvas.width;x+=gs){g.moveTo(x,0);g.lineTo(x,canvas.height);}
  for(let y=oy;y<canvas.height;y+=gs){g.moveTo(0,y);g.lineTo(canvas.width,y);}
  g.stroke();
  g.strokeStyle='rgba(255,0,200,0.05)';
  g.beginPath();
  for(let x=ox;x<canvas.width;x+=gs*4){g.moveTo(x,0);g.lineTo(x,canvas.height);}
  for(let y=oy;y<canvas.height;y+=gs*4){g.moveTo(0,y);g.lineTo(canvas.width,y);}
  g.stroke();
  // arena border
  g.save();
  g.shadowBlur=40;g.shadowColor='#ff00c8';
  g.strokeStyle='rgba(255,0,200,.85)';g.lineWidth=6*z;
  g.beginPath();g.arc((0-cam.x)*z+canvas.width/2,(0-cam.y)*z+canvas.height/2,W.r*z,0,TAU);g.stroke();
  g.strokeStyle='rgba(0,240,255,.35)';g.lineWidth=2*z;
  g.beginPath();g.arc((0-cam.x)*z+canvas.width/2,(0-cam.y)*z+canvas.height/2,(W.r-14)*z,0,TAU);g.stroke();
  g.restore();
}

function drawFood(z,t){
  const g=ctx;
  g.save(); g.shadowBlur=14;
  for(const f of foods){
    const sx=(f.x-cam.x)*z+canvas.width/2, sy=(f.y-cam.y)*z+canvas.height/2;
    if(sx<-20||sy<-20||sx>canvas.width+20||sy>canvas.height+20) continue;
    const pulse=0.75+Math.sin(t*3+f.ph)*0.25;
    g.shadowColor=f.c; g.fillStyle=f.c;
    g.beginPath(); g.arc(sx,sy,f.r*z*pulse,0,TAU); g.fill();
  }
  g.restore();
}

function drawSpeedLines(){
  if(!player||!player.boosting) return;
  const g=ctx, cx=canvas.width/2, cy=canvas.height/2;
  g.save(); g.globalCompositeOperation='lighter';
  for(let i=0;i<42;i++){
    const a=Math.random()*TAU, d=rnd(140,Math.max(canvas.width,canvas.height)*0.78);
    const len=rnd(60,220);
    g.strokeStyle=`rgba(${Math.random()<.5?'0,240,255':'255,238,0'},${rnd(.12,.5)})`;
    g.lineWidth=rnd(1,3);
    g.beginPath();
    g.moveTo(cx+Math.cos(a)*d, cy+Math.sin(a)*d);
    g.lineTo(cx+Math.cos(a)*(d+len), cy+Math.sin(a)*(d+len));
    g.stroke();
  }
  // lightning arcs near head
  for(let k=0;k<3;k++){
    g.strokeStyle=`rgba(255,255,${180+Math.random()*75|0},${rnd(.3,.8)})`;
    g.lineWidth=rnd(1,2.5); g.beginPath();
    let x=cx+rnd(-30,30), y=cy+rnd(-30,30); g.moveTo(x,y);
    for(let s=0;s<5;s++){x+=rnd(-26,26);y+=rnd(-26,26);g.lineTo(x,y);}
    g.stroke();
  }
  g.restore();
}

function drawMinimap(){
  const g=mctx, S=mini.width, sc=S/(W.r*2);
  g.clearRect(0,0,S,S);
  g.fillStyle='rgba(2,0,10,.9)';g.fillRect(0,0,S,S);
  g.strokeStyle='rgba(0,240,255,.25)';g.lineWidth=1;
  for(let i=1;i<4;i++){g.beginPath();g.moveTo(i*S/4,0);g.lineTo(i*S/4,S);g.moveTo(0,i*S/4);g.lineTo(S,i*S/4);g.stroke();}
  g.strokeStyle='rgba(255,0,200,.75)';g.lineWidth=1.5;
  g.beginPath();g.arc(S/2,S/2,W.r*sc,0,TAU);g.stroke();
  for(const s of snakes){
    if(!s.alive) continue;
    const x=S/2+s.x*sc, y=S/2+s.y*sc;
    if(s===player){
      g.fillStyle='#00f0ff'; g.shadowBlur=10; g.shadowColor='#00f0ff';
      g.beginPath();g.arc(x,y,4.2,0,TAU);g.fill(); g.shadowBlur=0;
      g.strokeStyle='rgba(0,240,255,.55)';g.beginPath();g.arc(x,y,8+Math.sin(Date.now()/200)*2.5,0,TAU);g.stroke();
    }else{
      g.fillStyle=s.skin.colors[0];
      g.beginPath();g.arc(x,y,2.1+Math.min(2.4,s.score/160),0,TAU);g.fill();
    }
  }
}

function drawLeaderboard(){
  const ol=document.getElementById('leaderboard');
  const sorted=snakes.filter(s=>s.alive).sort((a,b)=>b.score-a.score);
  const top=sorted.slice(0,10);
  let html='';
  top.forEach((s,i)=>{
    html+=`<li class="${s===player?'me':''}"><span class="nm">${i+1}. ${escapeHtml(s.name)}</span><span class="sc">${Math.floor(s.score)}</span></li>`;
  });
  ol.innerHTML=html;
  const rank=sorted.indexOf(player)+1;
  document.getElementById('rankVal').textContent = player.alive? `#${rank}/${sorted.length}` : '-';
  document.getElementById('scoreVal').textContent=Math.floor(player.score);
  document.getElementById('lenVal').textContent=player.length;
  document.getElementById('boostBar').style.width=player.energy+'%';
}
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// ================= LOOP =================
function loop(ts){
  raf=requestAnimationFrame(loop);
  if(!lastT) lastT=ts;
  let dt=Math.min(0.05,(ts-lastT)/1000); lastT=ts;
  const t=ts/1000;

  if(running){
    player.boosting = !!keys[' '] && player.energy>0 && player.score>12;
    for(const s of snakes) s.update(dt);
    collisions();
    while(foods.length<FOOD_COUNT) foods.push(makeFood());
    for(let i=particles.length-1;i>=0;i--){particles[i].update(dt); if(particles[i].life<=0) particles.splice(i,1);}
  }

  // camera
  const targetZ = 1.05 - Math.min(0.45, player.score/1400) - (player.boosting?0.05:0);
  cam.z=lerp(cam.z,targetZ,3*dt);
  cam.x=lerp(cam.x,player.x,Math.min(1,10*dt));
  cam.y=lerp(cam.y,player.y,Math.min(1,10*dt));
  shake=Math.max(0,shake-dt*6);

  ctx.setTransform(1,0,0,1,0,0);
  const sh=shake+(player.boosting?1.6:0);
  ctx.translate(rnd(-sh,sh),rnd(-sh,sh));

  drawBG(cam.z);
  drawFood(cam.z,t);
  for(const p of particles){
    const sx=(p.x-cam.x)*cam.z+canvas.width/2, sy=(p.y-cam.y)*cam.z+canvas.height/2;
    ctx.globalAlpha=Math.max(0,p.life/p.max); ctx.fillStyle=p.c;
    ctx.shadowBlur=10;ctx.shadowColor=p.c;
    ctx.beginPath();ctx.arc(sx,sy,p.r*cam.z,0,TAU);ctx.fill();
  }
  ctx.globalAlpha=1;ctx.shadowBlur=0;
  const order=snakes.filter(s=>s.alive).sort((a,b)=>a.score-b.score);
  for(const s of order) s.draw(ctx,cam.x,cam.y,cam.z);
  drawSpeedLines();

  document.getElementById('flashOverlay').style.opacity = player.boosting? '1':'0';

  drawMinimap();
  drawLeaderboard();
}

// ================= UI =================
function resize(){
  canvas.width=window.innerWidth; canvas.height=window.innerHeight;
}

function buildSkinList(){
  const el=document.getElementById('skinList');
  el.innerHTML=SKINS.map((s,i)=>`<div class="skin-item ${i===selectedSkin?'active':''}" data-i="${i}">
    <div class="swatch" style="background:linear-gradient(90deg,${s.colors[0]},${s.colors[1]});box-shadow:0 0 10px ${s.glow}"></div>${s.name}</div>`).join('');
  el.querySelectorAll('.skin-item').forEach(n=>n.onclick=()=>{
    selectedSkin=+n.dataset.i; buildSkinList();
  });
}

function drawPreview(t){
  if(!pvctx) return;
  const s=SKINS[selectedSkin], w=pv.width,h=pv.height;
  pvctx.clearRect(0,0,w,h);
  pvctx.save(); pvctx.lineCap='round';pvctx.lineJoin='round';
  pvctx.shadowBlur=22;pvctx.shadowColor=s.glow;
  pvctx.strokeStyle=s.colors[0];pvctx.lineWidth=26;
  pvctx.beginPath();
  for(let x=30;x<=w-40;x+=8){
    const y=h/2+Math.sin(x/52+t*2)*17;
    x===30?pvctx.moveTo(x,y):pvctx.lineTo(x,y);
  }
  pvctx.stroke(); pvctx.restore();
  // segments
  let idx=0;
  for(let x=30;x<=w-40;x+=17){
    const y=h/2+Math.sin(x/52+t*2)*17;
    let col = s.pattern==='stripe' ? (idx%2?s.colors[0]:s.colors[1])
            : s.pattern==='dash' ? (idx%3===0?'#fff':s.colors[1])
            : mixHex(s.colors[0],s.colors[1],(x-30)/(w-70));
    pvctx.fillStyle=col;pvctx.globalAlpha=.9;
    pvctx.beginPath();pvctx.arc(x,y,8,0,TAU);pvctx.fill();idx++;
  }
  pvctx.globalAlpha=1;
  // head
  const hx=w-40, hy=h/2+Math.sin(hx/52+t*2)*17;
  pvctx.save();pvctx.shadowBlur=20;pvctx.shadowColor=s.glow;pvctx.fillStyle=s.colors[0];
  pvctx.beginPath();pvctx.arc(hx,hy,15,0,TAU);pvctx.fill();pvctx.restore();
  pvctx.fillStyle='#04000e';
  pvctx.beginPath();pvctx.arc(hx+5,hy-6,4.4,0,TAU);pvctx.fill();
  pvctx.beginPath();pvctx.arc(hx+5,hy+6,4.4,0,TAU);pvctx.fill();
  pvctx.fillStyle='#ff0060';
  pvctx.beginPath();pvctx.arc(hx+7,hy-6,2,0,TAU);pvctx.fill();
  pvctx.beginPath();pvctx.arc(hx+7,hy+6,2,0,TAU);pvctx.fill();
}
function previewLoop(ts){ drawPreview(ts/1000); requestAnimationFrame(previewLoop); }

function startGame(){
  const nm=(document.getElementById('nickname').value||'NETRUNNER').toUpperCase().slice(0,14);
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
  document.getElementById('deathScreen').classList.add('hidden');
  resize();
  initGame(nm,SKINS[selectedSkin]);
  cam={x:player.x,y:player.y,z:1};
  mouse={x:canvas.width/2+40,y:canvas.height/2};
  running=true; lastT=0;
  cancelAnimationFrame(raf); raf=requestAnimationFrame(loop);
}
function onPlayerDeath(){
  running=false;
  const sorted=snakes.filter(s=>s.alive).sort((a,b)=>b.score-a.score);
  document.getElementById('deathStats').innerHTML=
    `SCORE AKHIR: <b style="color:#f9f002">${Math.floor(player.score)}</b><br>PANJANG: ${player.length}<br>KILLED BY: GRID COLLISION`;
  document.getElementById('deathScreen').classList.remove('hidden');
}

window.addEventListener('DOMContentLoaded',()=>{
  canvas=document.getElementById('canvas'); ctx=canvas.getContext('2d');
  mini=document.getElementById('minimap'); mctx=mini.getContext('2d');
  pv=document.getElementById('skinPreview'); pvctx=pv.getContext('2d');
  document.getElementById('botCountLabel').textContent=BOT_COUNT;
  selectedSkin=(Math.random()*SKINS.length)|0;
  buildSkinList(); requestAnimationFrame(previewLoop);
  resize();
  window.addEventListener('resize',resize);
  canvas.addEventListener('mousemove',e=>{mouse.x=e.clientX;mouse.y=e.clientY;});
  canvas.addEventListener('touchmove',e=>{const t=e.touches[0];mouse.x=t.clientX;mouse.y=t.clientY;e.preventDefault();},{passive:false});
  canvas.addEventListener('mousedown',()=>keys[' ']=true);
  window.addEventListener('mouseup',()=>keys[' ']=false);
  window.addEventListener('keydown',e=>{
    if(e.code==='Space'){keys[' ']=true;e.preventDefault();}
    if(e.code==='Escape'&&running){running=false;onPlayerDeath();}
  });
  window.addEventListener('keyup',e=>{if(e.code==='Space')keys[' ']=false;});
  document.getElementById('playBtn').onclick=startGame;
  document.getElementById('respawnBtn').onclick=startGame;
  document.getElementById('lobbyBtn').onclick=()=>{
    running=false;cancelAnimationFrame(raf);
    document.getElementById('game').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
  };
  document.getElementById('nickname').addEventListener('keydown',e=>{if(e.key==='Enter')startGame();});
});
})();
