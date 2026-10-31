'use strict';
const $=id=>document.getElementById(id),canvas=$('field'),ctx=canvas.getContext('2d');
const MM=720/3657.6;
const SPEC={width:390,length:400,intake:256,windup:1.5,recovery:.55};
const HW=SPEC.width*MM/2,HL=SPEC.length*MM/2,MOUTH=SPEC.intake*MM/2,TRACK=SPEC.width*MM-12;
const S=760,edge=20,flowers=[{x:260,y:35},{x:725,y:260},{x:500,y:725},{x:35,y:500}],hives=[{x:325,y:380,color:'#e76b75'},{x:435,y:380,color:'#699ce2'}];
// Start at (56, 7.874016) inches from the bottom-left, rear touching the bottom wall.
const START_POSE={x:edge+56*25.4*MM,y:S-edge-HL,a:-Math.PI/2};
let robot,balls,stacks,cells,side,shots,tipping,tips,bank,issued,autoPoints,parkPoints,phase,time,paused,selected,keys=new Set(),prevButtons=[],cooldown=0,events=[],last=performance.now(),padSeen=false;
const active=()=>!paused&&(phase===0||phase===2),unlocked=()=>phase===2&&time<=60,parked=()=>overlapsRect(robot.x,robot.y,robot.a,{x:20,y:140,w:55,h:120});
function note(s){events.unshift(s);events=events.slice(0,3);$('log').textContent=events.join(' · ');$('hint').textContent=s}
function tone(freq=550){if(!$('sound').checked)return;try{const a=tone.audio||(tone.audio=new(window.AudioContext||window.webkitAudioContext)());a.resume();const o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=freq;g.gain.setValueAtTime(.05,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.2);o.start();o.stop(a.currentTime+.2)}catch{}}
function reset(){window.Leaderboard?.reset();robot={x:START_POSE.x,y:START_POSE.y,a:START_POSE.a,vx:0,vy:0,left:0,right:0,leftTravel:0,rightTravel:0,intaking:false,catapult:null,cargo:['p','p','p','p']};balls=[];stacks=flowers.map(()=>['p','p','p','p']);cells=[['n','n','n'],['b','b','b']];side=[1,0];shots=[];tipping=[null,null];tips=0;bank=5;issued=0;autoPoints=0;parkPoints=0;phase=-1;time=30;paused=false;selected=0;cooldown=0;keys.clear();prevButtons=[];for(let i=0;i<4;i++){balls.push({x:35+i*20,y:724,k:'p'});balls.push({x:665+i*20,y:36,k:'p'})}for(let i=0;i<4;i++){balls.push({x:29+i*13,y:194,k:'p'});balls.push({x:730-i*13,y:550,k:'p'});balls.push({x:730-i*13,y:568,k:'p'})}events=[];note('Start a match. Four pollen are preloaded.');showOverlay('Ready to make a buzz?','4 pollen preloaded. Your first 30 seconds start here.','Start match ↗');$('pause').textContent='Pause';renderStats()}
function showOverlay(title,desc,button){$('overlay').hidden=false;$('overlayTitle').textContent=title;$('overlayText').textContent=desc;$('start').textContent=button;$('start').hidden=!button}
function start(){const fresh=phase===-1||phase===3;if(phase===-1){phase=0;time=30;note('AUTO practice: controls enabled for 30 seconds.')}else if(phase===3){reset();phase=0;time=30}else paused=false;if(fresh)window.Leaderboard?.begin();$('overlay').hidden=true;$('pause').textContent='Pause';canvas.focus();last=performance.now();tone()}
function pause(){if(phase<0||phase===3)return;paused=!paused;keys.clear();$('pause').textContent=paused?'Resume':'Pause';if(paused)showOverlay('Match paused','The clock and robot are stopped.','Resume match');else{$('overlay').hidden=true;canvas.focus();last=performance.now()}}
function transition(){if(phase===0){stopMechanisms();autoPoints=(robotCorners().every(p=>p.x>edge+.5&&p.x<740-.5&&p.y>edge+.5&&p.y<740-.5)?3:0)+(parked()?5:0);phase=1;time=8;note('Transition: robot disabled for 8 seconds.');tone(250)}else if(phase===1){phase=2;time=120;note('TELEOP started. Flowers unlock at 1:00.');tone(750)}else{stopMechanisms();phase=3;time=0;parkPoints=parked()?5:0;keys.clear();note('Match complete.');const n=scoreParts();showOverlay('Match complete',Object.values(n).reduce((a,b)=>a+b,0)+' points · '+tips+' hive tips. Ready for another run?','Play again ↗');window.Leaderboard?.finish(n,tips);tone(220)}}
function cellPos(i=0){return {x:hives[i].x,y:side[i]===0?330:430}}
function nearestFlower(){let best=-1,d=100;flowers.forEach((f,i)=>{let z=Math.hypot(f.x-robot.x,f.y-robot.y);if(z<d){best=i;d=z}});return best}
function intake(dt){
  if(!active()||robot.catapult||robot.cargo.length>=4)return;
  // The 256 mm mouth is only at the FRONT of the robot. Angled plates lead to its throat.
  const throat=HL-24;
  for(let i=0;i<balls.length;i++){
    const b=balls[i];if(b.k!=='p'||(b.z||0)>=12||(phase===0&&b.x>CENTER_X))continue;
    const q=toLocal(b.x,b.y),r=ballRadius(b.k);
    const depth=Math.max(0,Math.min(1,(q.x-throat)/24));
    const halfWidth=12+(MOUTH-12)*depth;
    if(q.x<throat-r||q.x>HL+16||Math.abs(q.y)>halfWidth-r+2)continue;
    const nextX=q.x-125*dt,nextY=q.y*Math.exp(-12*dt);
    const next=toWorld(nextX,nextY);
    b.x=next.x;b.y=next.y;b.vx=robot.vx;b.vy=robot.vy;
    if(nextX<=throat+3&&Math.abs(nextY)<9&&cooldown<=0){if(!admitPollen(b.k))continue;balls.splice(i,1);cooldown=.16;return}
  }
  // A flower can only feed pollen when its bottom opening is in front of the mouth.
  for(let i=0;i<flowers.length;i++){
    if(phase===0&&flowers[i].x>CENTER_X)continue;
    const q=toLocal(flowers[i].x,flowers[i].y);
    if(q.x>=HL-2&&q.x<=HL+FLOWER_RADIUS+12&&Math.abs(q.y)<=MOUTH-7&&stacks[i][0]==='p'&&cooldown<=0){
      if(!admitPollen(stacks[i][0]))continue;stacks[i].shift();cooldown=.22;note('Pollen collected through front intake.');return;
    }
  }
}
function cargo(){selected=Math.min(selected,robot.cargo.length-1);return robot.cargo.splice(Math.max(0,selected),1)[0]}
function admitPollen(kind){if(kind!=='p'||robot.cargo.length>=4)return false;robot.cargo.push('p');return true}
function shoot(){
  if(!active()||!robot.cargo.length)return;
  if(robot.catapult){note('Catapult cycling. Wait for READY.');return}
  robot.catapult={phase:'windup',remaining:SPEC.windup,count:robot.cargo.length};
  note('Winding up for 1.5 s — launching the whole load.');tone(280);
}
function updateCatapult(dt){
  const state=robot.catapult;if(!state)return;
  state.remaining-=dt;if(state.remaining>0)return;
  if(state.phase==='windup'){
    const aim=aimSolution(),load=robot.cargo.splice(0);
    selected=0;
    load.forEach((k,i)=>{
      const offset=(i-(load.length-1)/2)*5,angle=aim.angle+(i-(load.length-1)/2)*.006;
      shots.push({x:aim.x-Math.sin(aim.angle)*offset,y:aim.y+Math.cos(aim.angle)*offset,z:90,vx:Math.cos(angle)*aim.speed+robot.vx,vy:Math.sin(angle)*aim.speed+robot.vy,vz:aim.speed*Math.tan(Math.PI/3),k,age:0});
    });
    state.phase='recovery';state.remaining+=SPEC.recovery;tone(440);
    if(!aim.front)note('Whole load released at closed face. Move to the open side.');
    else if(!aim.range)note('Whole load released outside effective range.');
    else if(!aim.aligned)note('Whole load released off target. Steer the tank to aim.');
    else note('Launched '+load.length+' balls together. Catapult resetting.');
  }else robot.catapult=null;
}
function stopMechanisms(){robot.catapult=null;robot.left=robot.right=robot.vx=robot.vy=0;robot.intaking=false}

function place(){
  if(!active()||cooldown>0||!robot.cargo.length)return;
  if(robot.catapult){note('Wait for the catapult to finish before unloading.');return}
  const f=nearestFlower();
  if(f>=0){if(!unlocked()){note('Flower placement unlocks in the final 60 seconds.');return}stacks[f].push(cargo());note('Placed pollen into flower '+(f+1)+'.')}
  else{const p=toWorld(HL+12,0);balls.push({x:Math.max(27,Math.min(733,p.x)),y:Math.max(27,Math.min(733,p.y)),k:cargo()});note('Pollen unloaded from the front.')}
  cooldown=.3;
}
function load(){
  if(!active()||cooldown>0)return;
  if(!parked()){note('Move into red loading zone to request nectar.');return}
  if(bank<=0){note('Nectar reserve empty.');return}
  if(!unlocked()&&issued>=tips){note('Tip the hive to unlock nectar, or wait for 1:00.');return}
  // Human-player nectar is placed on the field, never injected into a pollen-only intake.
  balls.push({k:'n',x:35+Math.random()*25,y:155+Math.random()*90,z:70,vx:35+Math.random()*35,vy:(Math.random()-.5)*40,vz:0});
  bank--;issued++;cooldown=.3;note('Nectar supplied to field. This intake accepts pollen only.');
}
function scoreParts(){return {'Hive tips':tips*20,'AUTO leave / park':autoPoints,'Cell contents':cells[0].length*2,'Flowers':stacks.reduce((sum,s)=>sum+(s.includes('n')?5+s.length*2:0),0),'Garden':balls.filter(b=>(b.z||0)<10&&b.x-ballRadius(b.k)<=135&&b.y+ballRadius(b.k)>=730).length,'TELEOP park':parkPoints}}
function renderStats(){
  const n=scoreParts();$('score').textContent=Object.values(n).reduce((a,b)=>a+b,0);
  $('clock').textContent=Math.floor(Math.ceil(time)/60)+':'+String(Math.ceil(time)%60).padStart(2,'0');
  $('phase').textContent=['AUTO · RED HALF ONLY','TRANSITION','TELEOP','FINAL'][phase]||'READY';
  for(let i=0;i<3;i++)$('s'+i).classList.toggle('active',i===phase);
  $('capacity').textContent=robot.cargo.length+' / 4';$('tips').textContent=tips;
  $('position').textContent=((robot.x-edge)/5).toFixed(3)+', '+((S-edge-robot.y)/5).toFixed(6)+' in';
  const label={wall:'Field wall',hive:'Hive frame',auto:'AUTO centerline',blocked:'Blocked contact'};
  $('contactStatus').textContent=label[robot.contact]||robot.contact||(underHive()?'Free · under hive':'Free');
  $('reserve').textContent=bank+' ('+(unlocked()?bank:Math.min(bank,Math.max(0,tips-issued)))+' available)';
  $('unlock').textContent=unlocked()?'OPEN':'Final 60s';
  const state=robot.catapult;$('catapultStatus').textContent=state?(state.phase==='windup'?'WINDUP ':'RESET ')+state.remaining.toFixed(2)+' s':'READY';
  $('windupProgress').value=state?(state.phase==='windup'?1-state.remaining/SPEC.windup:1):0;
  $('wheelStatus').textContent=(robot.left/(MM*1000)).toFixed(2)+' / '+(robot.right/(MM*1000)).toFixed(2)+' m/s';
  $('inventory').innerHTML=Array.from({length:4},(_,i)=>'<div class="slot '+(robot.cargo[i]||'')+(i===Math.max(0,Math.min(selected,robot.cargo.length-1))?' selected':'')+'">'+(robot.cargo[i]==='p'?'P':robot.cargo[i]==='n'?'N':'')+'</div>').join('');
  $('breakdown').innerHTML=Object.entries(n).map(([k,v])=>'<div class="row"><span>'+k+'</span><b>'+v+'</b></div>').join('');
}
const DEFAULT_BINDS={forward:['KeyW','ArrowUp'],reverse:['KeyS','ArrowDown'],left:['KeyA','ArrowLeft','KeyQ'],right:['KeyD','ArrowRight','KeyE'],intake:['KeyF'],shoot:['Space'],place:['KeyG'],load:['KeyH'],select:['Tab'],slow:['ShiftLeft','ShiftRight'],pause:['KeyP']};
const BIND_LABELS={forward:'Forward',reverse:'Reverse',left:'Turn left',right:'Turn right',intake:'Intake',shoot:'Fire whole load',place:'Place / drop',load:'Supply field nectar',select:'Select cargo',slow:'Slow drive',pause:'Pause / resume'};
let binds=structuredClone(DEFAULT_BINDS),bindingAction=null;
try{const saved=JSON.parse(localStorage.getItem('bamboobuzz-keys-v1'));if(saved&&Object.keys(DEFAULT_BINDS).every(k=>Array.isArray(saved[k])&&saved[k].length&&saved[k].every(c=>typeof c==='string'&&c.length<40))){const all=Object.values(saved).flat();if(new Set(all).size===all.length)binds=saved}}catch{}
const held=action=>binds[action].some(code=>keys.has(code));
const keyName=code=>code==='Space'?'Space':code.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Arrow(Up|Down|Left|Right)$/,(_,d)=>({Up:'↑',Down:'↓',Left:'←',Right:'→'}[d])).replace('ShiftLeft','Left Shift').replace('ShiftRight','Right Shift');
const safe=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function saveBinds(){try{localStorage.setItem('bamboobuzz-keys-v1',JSON.stringify(binds));$('bindMessage').textContent='Keybinds saved on this browser.'}catch{$('bindMessage').textContent='Keybinds applied for this session.'}}
function renderBinds(){
  $('keybinds').innerHTML=Object.keys(BIND_LABELS).map(action=>'<div class="bind-row"><span>'+BIND_LABELS[action]+'</span><button type="button" data-bind="'+action+'" aria-label="Rebind '+BIND_LABELS[action]+'">'+(bindingAction===action?'Press a key…':safe(binds[action].map(keyName).join(' / ')))+'</button></div>').join('');
  document.querySelectorAll('[data-key-for]').forEach(el=>{el.textContent=binds[el.dataset.keyFor].map(keyName).join(' / ')});
}
function assignBind(action,code){
  const previous=binds[action][0],conflict=Object.keys(binds).find(k=>k!==action&&binds[k].includes(code));
  if(conflict)binds[conflict]=[previous];binds[action]=[code];bindingAction=null;keys.clear();saveBinds();renderBinds();
  if(conflict)$('bindMessage').textContent='Swapped with '+BIND_LABELS[conflict]+'.';
}
$('keybinds').addEventListener('click',e=>{const button=e.target.closest('button[data-bind]');if(!button)return;if(phase>=0&&phase<3&&!paused)pause();bindingAction=button.dataset.bind;keys.clear();$('bindMessage').textContent='Press a replacement key. Escape cancels. Conflicting keys swap actions.';renderBinds()});
$('resetBinds').onclick=()=>{binds=structuredClone(DEFAULT_BINDS);bindingAction=null;keys.clear();saveBinds();renderBinds()};
document.addEventListener('keydown',e=>{
  if(!bindingAction)return;e.preventDefault();e.stopImmediatePropagation();
  if(e.code==='Escape'){bindingAction=null;$('bindMessage').textContent='Rebinding cancelled.';renderBinds();return}
  if(e.repeat||!e.code||['ControlLeft','ControlRight','MetaLeft','MetaRight'].includes(e.code))return;
  assignBind(bindingAction,e.code);
},true);
canvas.addEventListener('keydown',e=>{
  if(bindingAction||!Object.values(binds).some(list=>list.includes(e.code)))return;
  e.preventDefault();keys.add(e.code);if(e.repeat)return;
  if(binds.pause.includes(e.code))pause();
  if(binds.shoot.includes(e.code))shoot();if(binds.place.includes(e.code))place();if(binds.load.includes(e.code))load();
  if(binds.select.includes(e.code)&&active())selected=(selected+1)%Math.max(1,robot.cargo.length);
});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();if(active())pause()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&phase>=0&&phase<3&&!paused)pause()});
canvas.addEventListener('pointerdown',()=>canvas.focus());$('start').onclick=start;$('pause').onclick=pause;$('reset').onclick=()=>{reset();canvas.focus()};
renderBinds();
function gamepad(){let pads=[];try{pads=navigator.getGamepads?navigator.getGamepads():[]}catch{}let p=Array.from(pads).find(p=>p&&p.mapping==='standard');if(!p){if(padSeen&&active())pause();padSeen=false;prevButtons=[];$('connection').textContent='○ Keyboard ready · Connect gamepad & press a button';return null}padSeen=true;$('connection').textContent='● Gamepad connected · '+p.id.slice(0,32);let b=p.buttons.map(v=>v.pressed);const rise=i=>b[i]&&!prevButtons[i];if(window.Leaderboard?.isOpen()){prevButtons=b;return null}if(rise(9)){if(phase===-1||phase===3)start();else pause()}if(rise(7))shoot();if(rise(0))place();if(rise(1))load();if(rise(3)&&active())selected=(selected+1)%Math.max(1,robot.cargo.length);prevButtons=b;return p}
function toLocal(x,y){const dx=x-robot.x,dy=y-robot.y,c=Math.cos(robot.a),s=Math.sin(robot.a);return {x:dx*c+dy*s,y:-dx*s+dy*c}}
function toWorld(x,y){const c=Math.cos(robot.a),s=Math.sin(robot.a);return {x:robot.x+x*c-y*s,y:robot.y+x*s+y*c}}
function robotCorners(x=robot.x,y=robot.y,a=robot.a){const c=Math.cos(a),s=Math.sin(a);return [[-HL,-HW],[HL,-HW],[HL,HW],[-HL,HW]].map(([u,v])=>({x:x+u*c-v*s,y:y+u*s+v*c}))}
function overlapsRect(x,y,a,rect){
  const corners=robotCorners(x,y,a),box=[{x:rect.x,y:rect.y},{x:rect.x+rect.w,y:rect.y},{x:rect.x+rect.w,y:rect.y+rect.h},{x:rect.x,y:rect.y+rect.h}];
  for(const axis of [{x:1,y:0},{x:0,y:1},{x:Math.cos(a),y:Math.sin(a)},{x:-Math.sin(a),y:Math.cos(a)}]){
    const p=corners.map(v=>v.x*axis.x+v.y*axis.y),q=box.map(v=>v.x*axis.x+v.y*axis.y);
    if(Math.max(...p)<Math.min(...q)||Math.max(...q)<Math.min(...p))return false;
  }
  return true;
}
// Contact projection resolves small overlaps instead of cancelling an entire drive step.
const CENTER_X=380,FLOWER_RADIUS=12,CONTACT_EPS=.001;
// Manual 9.6.1 / Figure 9-8: centered frame, 49.46in wide, 38.95in deep, pivot 43.95in high.
// The side ground rails are approximated as 1in wide. No solid floor fills this envelope.
const HIVE_FRAME={cx:380,cy:380,width:49.46*5,depth:38.95*5,pivotZ:43.95*5,railWidth:5};
const HIVE_ENVELOPE={x:HIVE_FRAME.cx-HIVE_FRAME.width/2,y:HIVE_FRAME.cy-HIVE_FRAME.depth/2,w:HIVE_FRAME.width,h:HIVE_FRAME.depth};
const HIVE_SUPPORTS=[
  {x:HIVE_ENVELOPE.x,y:HIVE_ENVELOPE.y,w:HIVE_FRAME.railWidth,h:HIVE_ENVELOPE.h,name:'Left hive base rail'},
  {x:HIVE_ENVELOPE.x+HIVE_ENVELOPE.w-HIVE_FRAME.railWidth,y:HIVE_ENVELOPE.y,w:HIVE_FRAME.railWidth,h:HIVE_ENVELOPE.h,name:'Right hive base rail'}
];
const underHive=()=>overlapsRect(robot.x,robot.y,robot.a,HIVE_ENVELOPE);
function rectContact(corners,a,rect){
  const box=[{x:rect.x,y:rect.y},{x:rect.x+rect.w,y:rect.y},{x:rect.x+rect.w,y:rect.y+rect.h},{x:rect.x,y:rect.y+rect.h}];
  let result=null;
  for(const axis of [{x:1,y:0},{x:0,y:1},{x:Math.cos(a),y:Math.sin(a)},{x:-Math.sin(a),y:Math.cos(a)}]){
    const p=corners.map(v=>v.x*axis.x+v.y*axis.y),q=box.map(v=>v.x*axis.x+v.y*axis.y);
    const lo=Math.min(...p),hi=Math.max(...p),blo=Math.min(...q),bhi=Math.max(...q);
    if(hi<=blo+CONTACT_EPS||bhi<=lo+CONTACT_EPS)return null;
    const negative=blo-hi,positive=bhi-lo,delta=Math.abs(negative)<Math.abs(positive)?negative:positive;
    if(!result||Math.abs(delta)<result.depth)result={x:axis.x*delta,y:axis.y*delta,depth:Math.abs(delta),kind:'hive'};
  }
  return result;
}
function flowerContact(x,y,a,f){
  const c=Math.cos(a),s=Math.sin(a),dx=f.x-x,dy=f.y-y;
  const u=dx*c+dy*s,v=-dx*s+dy*c;
  const qx=Math.max(-HL,Math.min(HL,u)),qy=Math.max(-HW,Math.min(HW,v));
  const ex=u-qx,ey=v-qy,d=Math.hypot(ex,ey);
  if(d>=FLOWER_RADIUS-CONTACT_EPS)return null;
  let nx,ny,depth;
  if(d>CONTACT_EPS){nx=-ex/d;ny=-ey/d;depth=FLOWER_RADIUS-d}
  else if(HL-Math.abs(u)<HW-Math.abs(v)){nx=u>=0?-1:1;ny=0;depth=HL-Math.abs(u)+FLOWER_RADIUS}
  else{nx=0;ny=v>=0?-1:1;depth=HW-Math.abs(v)+FLOWER_RADIUS}
  return {x:(nx*c-ny*s)*depth,y:(nx*s+ny*c)*depth,depth,kind:'flower'};
}
function contacts(x,y,a){
  const corners=robotCorners(x,y,a),list=[];
  const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x));
  const minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
  const right=phase===0?CENTER_X:740;
  if(minX<edge-CONTACT_EPS)list.push({x:edge-minX,y:0,depth:edge-minX,kind:'wall'});
  if(maxX>right+CONTACT_EPS)list.push({x:right-maxX,y:0,depth:maxX-right,kind:phase===0?'auto':'wall'});
  if(minY<edge-CONTACT_EPS)list.push({x:0,y:edge-minY,depth:edge-minY,kind:'wall'});
  if(maxY>740+CONTACT_EPS)list.push({x:0,y:740-maxY,depth:maxY-740,kind:'wall'});
  for(const rail of HIVE_SUPPORTS){const hit=rectContact(corners,a,rail);if(hit){hit.kind=rail.name;list.push(hit)}}
  for(const [i,f] of flowers.entries()){const contact=flowerContact(x,y,a,f);if(contact){contact.kind='flower F'+(i+1);list.push(contact)}}
  return list;
}
function blocked(x,y,a=robot.a){return contacts(x,y,a).length>0}
function resolvePose(x,y,a){
  let touched=false,kind='';
  for(let n=0;n<16;n++){
    const list=contacts(x,y,a);if(!list.length)return {x,y,a,touched,kind};
    const hit=list.reduce((best,v)=>v.depth>best.depth?v:best);
    // Reject deep invalid poses rather than jumping through the hive or a flower.
    if(hit.depth>8)return null;
    x+=hit.x;y+=hit.y;touched=true;kind=hit.kind;
  }
  return blocked(x,y,a)?null:{x,y,a,touched,kind};
}
function update(dt,p){
  if(paused||phase<0||phase===3)return;
  time-=dt;if(time<=0){transition();return}
  if(phase===1){stopMechanisms();updatePhysics(dt);return}
  cooldown=Math.max(0,cooldown-dt);
  const axis=v=>Math.abs(v||0)>.15?v:0,down=(a,b)=>keys.has(a)||keys.has(b);
  const throttle=(held('forward')?1:0)-(held('reverse')?1:0);
  const turn=(held('right')?1:0)-(held('left')?1:0);
  const keyboard=throttle!==0||turn!==0;
  let left=keyboard?throttle+turn*.55:-axis(p?.axes[1]);
  let right=keyboard?throttle-turn*.55:-axis(p?.axes[3]);
  const max=Math.max(1,Math.abs(left),Math.abs(right));left/=max;right/=max;
  const slow=held('slow')||p?.buttons[6]?.pressed;
  const speed=slow?65:180,acceleration=slow?260:480;
  const approach=(v,target,rate)=>v+Math.max(-rate*dt,Math.min(rate*dt,target-v));
  // Brake steering promptly when a turn key is released instead of coasting into a wall.
  const mean=approach((robot.left+robot.right)/2,(left+right)*speed/2,acceleration);
  const steer=approach((robot.left-robot.right)/2,(left-right)*speed/2,1800);
  robot.left=Math.max(-speed,Math.min(speed,mean+steer));
  robot.right=Math.max(-speed,Math.min(speed,mean-steer));
  const v=(robot.left+robot.right)/2,omega=(robot.left-robot.right)/TRACK;
  const oldX=robot.x,oldY=robot.y,angle=robot.a+omega*dt;
  const mid=robot.a+omega*dt/2;
  const distance=Math.abs(omega)<1e-6?v*dt:2*v*Math.sin(omega*dt/2)/omega;
  const x=robot.x+Math.cos(mid)*distance,y=robot.y+Math.sin(mid)*distance;
  const pose=resolvePose(x,y,angle);
  if(pose){robot.x=pose.x;robot.y=pose.y;robot.a=wrapAngle(pose.a)}
  // Wheel intent stays live against a contact, so reversing or steering can free the robot.
  // Only the contact-constrained pose feeds the measured chassis velocity.
  robot.contact=pose?.touched?pose.kind:pose?'':'blocked';
  robot.vx=(robot.x-oldX)/dt;robot.vy=(robot.y-oldY)/dt;
  robot.leftTravel+=robot.left*dt;robot.rightTravel+=robot.right*dt;
  robot.intaking=!!(held('intake')||p?.buttons[4]?.pressed);
  if(robot.intaking)intake(dt);
  updateCatapult(dt);updatePhysics(dt);
  if(phase===2&&time<=60&&time+dt>60){note('Final minute: flowers and all nectar unlocked!');tone(900)}
}

// Pixel units: 720 px = 144 inches. Gravity follows the same scale.
const GRAVITY=1931;
const tipReady=contents=>contents.reduce((n,k)=>n+(k==='p'?3:5),0)>=24;
const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
const ballRadius=k=>k==='p'?7:9;
const ballColor=k=>k==='p'?'#f3d45c':k==='n'?'#ee737e':'#6f9fe9';
function aimSolution(){
  const g=cellPos(),normal=side[0]===0?-1:1;
  // A fixed catapult launches along the chassis heading; range assist changes power only.
  const angle=robot.a,x=robot.x+Math.cos(angle)*20,y=robot.y+Math.sin(angle)*20;
  const d=Math.hypot(g.x-x,g.y-y),direction=Math.atan2(g.y-y,g.x-x);
  const aligned=Math.abs(wrapAngle(direction-angle))<Math.min(.21,Math.atan2(30,d));
  const denominator=2*(90+d*Math.tan(Math.PI/3)-215);
  const computed=Math.sqrt(GRAVITY*d*d/Math.max(1,denominator));
  const speed=$('assist').checked?Math.max(220,Math.min(570,computed)):430;
  const front=(robot.y-g.y)*normal>85&&Math.abs(robot.x-g.x)<Math.abs(robot.y-g.y)*1.15;
  return {x,y,angle,speed,aligned,front,range:d>=100&&d<=500&&!tipping[0]};
}
function triggerTip(i){
  if(tipping[i]||!tipReady(cells[i]))return;
  tipping[i]={elapsed:0,oldSide:side[i],contents:cells[i].splice(0)};
  if(i===0){tips++;note('Hive tipping! +20 points. Watch the spill.');tone(850)}
}
function spillCell(i,tip){
  const normal=tip.oldSide===0?-1:1;
  const origin={x:hives[i].x,y:tip.oldSide===0?305:455};
  tip.contents.forEach(k=>{
    const angle=normal*Math.PI/2+(Math.random()-.5)*1.8;
    const speed=130+Math.random()*220;
    balls.push({k,x:origin.x+(Math.random()-.5)*62,y:origin.y,z:165+Math.random()*50,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,vz:50+Math.random()*100});
  });
}
function deflect(s,nx,ny){
  const dot=s.vx*nx+s.vy*ny;
  balls.push({k:s.k,x:s.x+nx*12,y:s.y+ny*12,z:s.z,vx:(s.vx-2*dot*nx)*.4,vy:(s.vy-2*dot*ny)*.4,vz:Math.min(s.vz,90)});
  s.dead=true;note('Shot hit a closed face or rim.');
}
function updatePhysics(dt){
  for(let i=0;i<2;i++){
    const tip=tipping[i];if(!tip)continue;
    tip.elapsed+=dt;
    if(tip.elapsed>=.65){spillCell(i,tip);side[i]=1-tip.oldSide;tipping[i]=null}
  }
  for(const s of shots){
    const ox=s.x,oy=s.y,oz=s.z;
    s.age+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.z+=s.vz*dt-GRAVITY*dt*dt/2;s.vz-=GRAVITY*dt;
    // Test entry into each cell footprint. Only the outward mouth can accept a ball.
    for(let i=0;i<2&&!s.dead;i++)for(let j=0;j<2&&!s.dead;j++){
      const cx=hives[i].x,cy=j===0?330:430,normal=j===0?-1:1;
      const inside=s.x>=cx-44&&s.x<=cx+44&&s.y>=cy-28&&s.y<=cy+28;
      const wasInside=ox>=cx-44&&ox<=cx+44&&oy>=cy-28&&oy<=cy+28;
      if(!inside||wasInside||s.z<115||s.z>310)continue;
      const mouth=cy+normal*28;
      const t=(mouth-oy)/(s.y-oy);
      const crossX=ox+(s.x-ox)*t,crossZ=oz+(s.z-oz)*t;
      const throughFront=(oy-mouth)*normal>=0&&s.vy*normal<0&&t>=0&&t<=1;
      if(j===side[i]&&!tipping[i]&&throughFront&&Math.abs(crossX-cx)<35&&crossZ>=165&&crossZ<=285){
        cells[i].push(s.k);s.dead=true;triggerTip(i);
        if(!tipping[i])note(i===0?'Ball captured in the red cell.':'Ball scored in the blue cell.');
      }else{
        let nx=0,ny=0;if(ox<cx-44)nx=-1;else if(ox>cx+44)nx=1;else ny=oy<cy?-1:1;
        deflect(s,nx,ny);
      }
    }
    // Raised crossbar: only projectiles at the beam's height can strike it.
    if(!s.dead&&s.x>HIVE_ENVELOPE.x&&s.x<HIVE_ENVELOPE.x+HIVE_ENVELOPE.w&&Math.abs(s.y-HIVE_FRAME.cy)<5&&Math.abs(s.z-HIVE_FRAME.pivotZ)<7){deflect(s,0,oy<HIVE_FRAME.cy?-1:1)}
    // Sloping side legs are thin members, rather than solid triangular walls.
    for(const rail of HIVE_SUPPORTS){
      const legHeight=HIVE_FRAME.pivotZ*(1-Math.abs(s.y-HIVE_FRAME.cy)/(HIVE_FRAME.depth/2));
      if(!s.dead&&legHeight>=0&&s.x>rail.x-3&&s.x<rail.x+rail.w+3&&Math.abs(s.z-legHeight)<6)deflect(s,s.x<rail.x+rail.w/2?-1:1,0);
    }
    if(!s.dead&&(s.x<28||s.x>732||s.y<28||s.y>732||s.z<=0||s.age>3)){
      balls.push({k:s.k,x:Math.max(28,Math.min(732,s.x)),y:Math.max(28,Math.min(732,s.y)),z:Math.max(0,s.z),vx:s.vx*.55,vy:s.vy*.55,vz:s.z<=0?Math.abs(s.vz)*.28:s.vz});s.dead=true;
    }
  }
  shots=shots.filter(s=>!s.dead);
  for(const b of balls){
    b.z=b.z||0;b.vx=b.vx||0;b.vy=b.vy||0;b.vz=b.vz||0;
    const r=ballRadius(b.k);b.x+=b.vx*dt;b.y+=b.vy*dt;
    if(b.z>0||b.vz>0){b.z+=b.vz*dt-GRAVITY*dt*dt/2;b.vz-=GRAVITY*dt;if(b.z<=0){b.z=0;b.vz=Math.abs(b.vz)>100?-b.vz*.3:0;b.vx*=.76;b.vy*=.76}}
    const drag=Math.exp(-(b.z>0?.1:2.1)*dt);b.vx*=drag;b.vy*=drag;
    if(b.x<20+r){b.x=20+r;b.vx=Math.abs(b.vx)*.55}if(b.x>740-r){b.x=740-r;b.vx=-Math.abs(b.vx)*.55}
    if(b.y<20+r){b.y=20+r;b.vy=Math.abs(b.vy)*.55}if(b.y>740-r){b.y=740-r;b.vy=-Math.abs(b.vy)*.55}
    if(b.z<20){
      for(const f of flowers){
        const dx=b.x-f.x,dy=b.y-f.y,d=Math.hypot(dx,dy),min=FLOWER_RADIUS+r;
        if(d<min){
          const nx=d>.001?dx/d:(f.x<100?1:f.x>660?-1:0),ny=d>.001?dy/d:(f.y<100?1:-1);
          b.x=f.x+nx*min;b.y=f.y+ny*min;
          const incoming=b.vx*nx+b.vy*ny;if(incoming<0){b.vx-=incoming*1.5*nx;b.vy-=incoming*1.5*ny}
        }
      }
      // Ground balls roll through the open center and bounce only off the side base rails.
      for(const rail of HIVE_SUPPORTS){
        const loX=rail.x-r,hiX=rail.x+rail.w+r,loY=rail.y-r,hiY=rail.y+rail.h+r;
        if(b.x>loX&&b.x<hiX&&b.y>loY&&b.y<hiY){
          const distances=[b.x-loX,hiX-b.x,b.y-loY,hiY-b.y],n=distances.indexOf(Math.min(...distances));
          if(n===0){b.x=loX;b.vx=-Math.abs(b.vx)*.55}else if(n===1){b.x=hiX;b.vx=Math.abs(b.vx)*.55}else if(n===2){b.y=loY;b.vy=-Math.abs(b.vy)*.55}else{b.y=hiY;b.vy=Math.abs(b.vy)*.55}
        }
      }
      const q=toLocal(b.x,b.y);
      if(b.k!=='p'&&robot.intaking&&q.x>HL-5&&q.x<HL+r+12&&Math.abs(q.y)<MOUTH+r){
        const out=toWorld(HL+r+2,q.y<0?-MOUTH-r:MOUTH+r);
        b.x=out.x;b.y=out.y;b.vx=Math.cos(robot.a)*45-Math.sin(robot.a)*(q.y<0?-65:65);b.vy=Math.sin(robot.a)*45+Math.cos(robot.a)*(q.y<0?-65:65);
      }
      const intakeDepth=Math.max(0,Math.min(1,(q.x-(HL-24))/24));
      const inFunnel=b.k==='p'&&robot.intaking&&!robot.catapult&&robot.cargo.length<4&&q.x>=HL-26&&q.x<=HL+16&&Math.abs(q.y)<=12+(MOUTH-12)*intakeDepth-r+2;
      if(!inFunnel){
        let cx=Math.max(-HL,Math.min(HL,q.x)),cy=Math.max(-HW,Math.min(HW,q.y)),dx=q.x-cx,dy=q.y-cy,d=Math.hypot(dx,dy);
        if(d<r){
          let nx,ny;if(d>.001){nx=dx/d;ny=dy/d}else if(HL-Math.abs(q.x)<HW-Math.abs(q.y)){nx=q.x<0?-1:1;ny=0;cx=nx*HL;cy=q.y}else{nx=0;ny=q.y<0?-1:1;cx=q.x;cy=ny*HW}
          const out=toWorld(cx+nx*(r+.2),cy+ny*(r+.2)),c=Math.cos(robot.a),s=Math.sin(robot.a),wx=nx*c-ny*s,wy=nx*s+ny*c;
          b.x=out.x;b.y=out.y;const push=Math.max(0,robot.vx*wx+robot.vy*wy),inward=b.vx*wx+b.vy*wy;
          if(inward<0){b.vx-=inward*1.4*wx;b.vy-=inward*1.4*wy}b.vx+=wx*push*.35;b.vy+=wy*push*.35;
        }
      }
    }
  }
  for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){
    const a=balls[i],b=balls[j];if(a.z>12||b.z>12)continue;
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=ballRadius(a.k)+ballRadius(b.k);
    if(d>.001&&d<min){const nx=dx/d,ny=dy/d,overlap=(min-d)/2;a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;const v=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(v>0){a.vx-=v*.65*nx;a.vy-=v*.65*ny;b.vx+=v*.65*nx;b.vy+=v*.65*ny}}
  }
}
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h)}function circle(x,y,r,c){ctx.fillStyle=c;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}function text(s,x,y,c='#afc0b0',size=11){ctx.fillStyle=c;ctx.font='bold '+size+'px Arial';ctx.textAlign='center';ctx.fillText(s,x,y)}
function draw(){
  rect(0,0,S,S,'#111a15');rect(edge,edge,720,720,'#354039');
  for(let x=20;x<740;x+=120)for(let y=20;y<740;y+=120)rect(x+1,y+1,118,118,((x+y-40)/120)%2?'#354139':'#323e36');
  if(phase===0){
    rect(CENTER_X,20,360,720,'#18345935');
    ctx.setLineDash([10,7]);ctx.strokeStyle='#9db9e5';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(CENTER_X,20);ctx.lineTo(CENTER_X,740);ctx.stroke();ctx.setLineDash([]);
    text('RED AUTO AREA',200,88,'#eeb5b9',11);text('BLUE HALF · AUTO LOCKED',560,88,'#a9c7ee',11);
  }
  ctx.strokeStyle='#657263';ctx.lineWidth=4;ctx.strokeRect(20,20,720,720);
  rect(20,140,55,120,'#713c43');rect(685,500,55,120,'#334f77');
  rect(20,730,115,10,'#ba5562');rect(625,20,115,10,'#5285c4');
  text('LOAD',48,193,'#ffd0ce',9);text('RED',48,207,'#ffd0ce',9);text('LOAD',712,553,'#c5daff',9);text('BLUE',712,567,'#c5daff',9);
  text('RED GARDEN',78,716,'#ffc5c9',8);text('BLUE GARDEN',682,49,'#c5daff',8);text('AUDIENCE',380,754,'#8d9e8d',8);
  // Floor-level supports are solid; translucent overhead parts indicate clearance below.
  for(const rail of HIVE_SUPPORTS){rect(rail.x,rail.y,rail.w,rail.h,'#9ba593');ctx.strokeStyle='#d2dac6';ctx.lineWidth=1;ctx.strokeRect(rail.x,rail.y,rail.w,rail.h)}
  ctx.globalAlpha=underHive()?.35:.7;
  rect(HIVE_ENVELOPE.x,HIVE_FRAME.cy-5,HIVE_ENVELOPE.w,10,'#788374');text('OVERHEAD · PASS UNDER',380,394,'#c2d4b9',9);
  for(let i=0;i<2;i++){
    rect(hives[i].x-4,307,8,146,'#657466');
    for(let j=0;j<2;j++){
      const x=hives[i].x,y=j===0?330:430,up=j===side[i],normal=j===0?-1:1;
      const tip=tipping[i],fraction=tip?Math.min(1,tip.elapsed/.65):0;
      const squash=tip?.oldSide===j?1-.55*Math.sin(fraction*Math.PI):1;
      ctx.save();ctx.translate(x,y);ctx.scale(1,squash);
      rect(-44,-28,88,56,up?'#18251c':'#35433a');
      ctx.strokeStyle=up?hives[i].color:'#617168';ctx.lineWidth=4;ctx.strokeRect(-44,-28,88,56);
      if(up){
        // Open outward edge, solid back and side walls.
        rect(-35,normal<0?-30:26,70,4,'#18251c');
        const contents=tip&&tip.oldSide===j?tip.contents:cells[i];
        contents.forEach((k,n)=>{const bx=-28+(n%4)*19,by=(Math.floor(n/4)*19-10)*normal;drawBall(bx,by,k,0,false)});
        ctx.strokeStyle='#d0ee98';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-12,normal*36);ctx.lineTo(0,normal*43);ctx.lineTo(12,normal*36);ctx.stroke();
      }else{
        for(let n=0;n<4;n++){rect(-23+n*13,-8,10,16,'#18221b');rect(-20+n*13,-5,4,5,'#c4d1b7')}
      }
      ctx.restore();
    }
  }
  ctx.globalAlpha=1;
  flowers.forEach((f,i)=>{circle(f.x,f.y,22,'#17271c');for(let j=0;j<6;j++)circle(f.x+Math.cos(j*Math.PI/3)*16,f.y+Math.sin(j*Math.PI/3)*16,6,stacks[i].includes('n')?'#d77080':'#80966e');circle(f.x,f.y,FLOWER_RADIUS,'#101b13');ctx.strokeStyle='#9eaf87';ctx.lineWidth=1;ctx.beginPath();ctx.arc(f.x,f.y,FLOWER_RADIUS,0,Math.PI*2);ctx.stroke();if(stacks[i].length)drawBall(f.x,f.y,stacks[i].at(-1),0,false);const tx=f.x<70?f.x+42:f.x>690?f.x-42:f.x,ty=f.y<70?f.y+42:f.y>690?f.y-34:f.y+4;text('F'+(i+1),tx,ty,'#bccba8',10)});
  for(const b of balls)drawBall(b.x,b.y,b.k,b.z||0);
  const g=cellPos(),aim=aimSolution();
  if(active()){
    ctx.setLineDash([4,7]);ctx.strokeStyle=aim.front&&aim.aligned&&aim.range?'#c3f16b99':'#ef876b77';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(aim.x,aim.y);ctx.lineTo(aim.x+Math.cos(aim.angle)*110,aim.y+Math.sin(aim.angle)*110);ctx.stroke();ctx.setLineDash([]);
    const state=robot.catapult;
    text(state?(state.phase==='windup'?'WINDUP':'RESETTING'):aim.front?(aim.aligned?(aim.range?'CATAPULT READY':'OUT OF RANGE'):'STEER TO AIM'):'CLOSED FACE',robot.x,robot.y-64,aim.front&&aim.aligned&&aim.range?'#c3f16b':'#f4ac87',9);
  }
  drawRobot();
  if($('collisions').checked)drawCollisionOutlines();
  for(const s of shots)drawBall(s.x,s.y,s.k,s.z);
  if(phase===1){rect(0,320,760,110,'#101811dd');text('TRANSITION · '+Math.ceil(time),380,366,'#d1ef98',24);text('Robot stopped. TELEOP begins automatically.',380,396,'#aabca8',13)}
}
function drawCollisionOutlines(){
  ctx.save();ctx.lineWidth=1.5;ctx.setLineDash([4,3]);ctx.strokeStyle='#67e6e4';
  // Draw directly from the same dimensions and coordinates used by contacts().
  ctx.strokeRect(edge,edge,(phase===0?CENTER_X:740)-edge,720);
  for(const rail of HIVE_SUPPORTS)ctx.strokeRect(rail.x,rail.y,rail.w,rail.h);
  for(const [i,f] of flowers.entries()){
    ctx.beginPath();ctx.arc(f.x,f.y,FLOWER_RADIUS,0,Math.PI*2);ctx.stroke();
    text('F'+(i+1)+' BASE',f.x<100?f.x+58:f.x>660?f.x-58:f.x,f.y<100?f.y+45:f.y>660?f.y-35:f.y+5,'#67e6e4',9);
  }
  const corners=robotCorners();ctx.strokeStyle='#ffe79b';ctx.beginPath();ctx.moveTo(corners[0].x,corners[0].y);for(const p of corners.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();ctx.stroke();
  ctx.restore();
}
function drawRobot(){
  ctx.save();ctx.translate(robot.x,robot.y);ctx.rotate(robot.a);
  rect(-HL,-HW,HL*2,HW*2,'#121c16');
  rect(-HL+3,-HW+3,HL*2-6,HW*2-6,'#b95e6b');
  rect(-HL+7,-HW+8,HL*2-14,HW*2-16,'#263b30');
  // Two driven wheels at the midpoints of the left and right sides.
  for(const side of [-1,1]){
    const y=side*(HW-5),travel=side<0?robot.leftTravel:robot.rightTravel;
    rect(-13,y-5,26,10,'#080e0a');
    for(let n=0;n<5;n++){const x=((n*6+travel)%30+30)%30-15;if(x>=-12&&x<=10)rect(x,y-4,2,8,'#849887')}
    rect(-3,y-2,6,4,'#bdcdbb');
  }
  // Four unpowered corner dead wheels / casters.
  for(const x of [-HL+8,HL-8])for(const y of [-HW+8,HW-8]){
    circle(x,y,5,'#101911');ctx.strokeStyle='#859685';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.stroke();
    rect(x-4,y-2,8,4,'#6a7c6b');circle(x,y,1.5,'#d2ddc7');
  }
  // 256 mm intake opening and triangular guide plates, contained in the 400 mm length.
  const throat=HL-24;
  rect(throat,-MOUTH,24,MOUTH*2,'#15261b');
  for(const s of [-1,1]){
    ctx.fillStyle='#b8cf8e';ctx.beginPath();ctx.moveTo(HL,s*MOUTH);ctx.lineTo(throat,s*12);ctx.lineTo(throat,s*(MOUTH+5));ctx.closePath();ctx.fill();
  }
  rect(throat-3,-12,6,24,robot.intaking?'#d5f57c':'#8ca86b');
  for(let n=0;n<4;n++){const y=-10+n*6;rect(throat-3,y,6,2,'#344e2c')}
  if(robot.intaking&&!robot.catapult&&robot.cargo.length<4){ctx.strokeStyle='#d6f481';ctx.lineWidth=1.5;for(let n=0;n<2;n++){const x=HL-3-n*9;ctx.beginPath();ctx.moveTo(x,-5);ctx.lineTo(x-5,0);ctx.lineTo(x,5);ctx.stroke()}}
  // Rear hopper and single catapult arm. Windup holds the pollen until release.
  rect(-HL+10,-23,18,46,'#142018');
  robot.cargo.forEach((k,i)=>{if(robot.catapult?.phase==='windup')return;circle(-HL+19,-15+i*10,4,ballColor(k))});
  const state=robot.catapult;
  let cupX=-17;
  if(state?.phase==='windup'){
    const progress=1-state.remaining/SPEC.windup;cupX=-17-12*progress;
    ctx.strokeStyle='#c3f16b';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,15,-Math.PI/2,-Math.PI/2+progress*Math.PI*2);ctx.stroke();
    // The contracting spring and progress ring show the longer windup.
    ctx.strokeStyle='#cfdfaa';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(7,10);for(let n=0;n<8;n++)ctx.lineTo(7+(cupX-7)*n/7,10+(n%2?3:-3));ctx.stroke();
  }
  else if(state?.phase==='recovery'){const t=1-state.remaining/SPEC.recovery;cupX=t<.22?20:20-37*(t-.22)/.78}
  rect(-8,-9,17,18,'#465c44');ctx.strokeStyle='#d3deba';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(cupX,0);ctx.stroke();circle(0,0,5,'#97ad83');
  circle(cupX,0,8,'#6f8560');circle(cupX,0,5,'#1c2a1c');if(state?.phase==='windup')robot.cargo.forEach((k,i)=>circle(cupX-3+(i%2)*6,-3+Math.floor(i/2)*6,3.5,ballColor(k)));
  ctx.restore();
}
function drawBall(x,y,k,z=0,shadow=true){
  const r=ballRadius(k),lift=Math.max(0,z)*.12;
  if(shadow)circle(x+2,y+3,r,'#101a1280');
  circle(x,y-lift,r,ballColor(k));circle(x-2,y-lift-2,r*.32,'#fff5c477');
  circle(x+2,y-lift+2,1.4,'#24311a99');circle(x-3,y-lift+3,1.1,'#24311a99');
}

let ui=0;function frame(now){let elapsed=(now-last)/1000;last=now;let p=gamepad();if(elapsed>1&&phase>=0&&phase<3&&!paused){pause();note('Paused after a browser interruption.')}let dt=Math.min(.1,elapsed);while(dt>0){let step=Math.min(dt,1/120);update(step,p);dt-=step}draw();ui+=elapsed;if(ui>.1){renderStats();ui=0}requestAnimationFrame(frame)}reset();requestAnimationFrame(frame);
