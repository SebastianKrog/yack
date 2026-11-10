const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const M=require('../../public/tasks.js');
const A=require('../../public/achievements.js');
function fixture({reduced=true,defs,random,sound,animate}={}){
 class El{
  constructor(){this.hidden=true;this.children=[];this.attrs={};this.handlers={};this.style={setProperty(name,value){this[name]=value;}};this.parts=new Map();this.classes=new Set();this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};}
  addEventListener(name,fn){this.handlers[name]=fn;}
  setAttribute(name,value){this.attrs[name]=value;}
  append(child){child.parent=this;this.children.push(child);}
  insertBefore(child,before){child.remove();const index=this.children.indexOf(before);child.parent=this;if(index<0)this.children.push(child);else this.children.splice(index,0,child);}
  querySelector(selector){if(!this.parts.has(selector))this.parts.set(selector,new El());return this.parts.get(selector);}
  querySelectorAll(selector){return [0,1,2,3].map(i=>this.querySelector(`${selector}-${i}`));}
  matches(){return this.keyboardFocus||false;}
  getContext(){return this.context||null;}
  getBoundingClientRect(){return {left:10,top:100,width:88,height:74};}
  focus(){doc.activeElement=this;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
 }
 const els=new Map(),get=selector=>{if(!els.has(selector))els.set(selector,new El());return els.get(selector)};
 const docHandlers={};
 const doc={querySelector:get,createElement:()=>new El(),addEventListener:(name,fn)=>docHandlers[name]=fn,activeElement:null,hidden:false};
 get('#tasks-view').hidden=false;
 const state=M.fresh('2026-10-13');
 const timers=new Map(),delays=new Map();let timerID=0;
 const window={YackI18n:require('../../public/i18n.js'),MorningSound:sound,addEventListener(){},MorningAchievements:defs?{progress:state=>A.progress(state,defs)}:A,innerWidth:800,innerHeight:600,devicePixelRatio:1};
 const frames=new Map();let frameID=0;
 const context={window,document:doc,setTimeout:(fn,ms)=>{timers.set(++timerID,fn);delays.set(timerID,ms);return timerID;},clearTimeout:id=>{timers.delete(id);delays.delete(id);},cancelAnimationFrame:id=>frames.delete(id),requestAnimationFrame:fn=>{frames.set(++frameID,fn);return frameID;},Date,Math:random?Object.assign(Object.create(Math),{random}):Math};
 vm.createContext(context);vm.runInContext(fs.readFileSync('public/tabs.js','utf8'),context);vm.runInContext(fs.readFileSync('public/confetti.js','utf8'),context);vm.runInContext(fs.readFileSync('public/achievement-ui.js','utf8'),context);
 const ui=window.MorningAchievementUI.create({getState:()=>state,animate:animate||(()=>null),reducedMotion:{matches:reduced},checkNewDay(){}});
 return {state,ui,get,timers,delays,frames,hideDocument(){doc.hidden=true;docHandlers.visibilitychange();},showDocument(){doc.hidden=false;docHandlers.visibilitychange();},runFrame(now=16){const [id,fn]=frames.entries().next().value;frames.delete(id);fn(now);},fire:(selector,event,arg={})=>get(selector).handlers[event](arg),tick:()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);delays.delete(id);fn();}};
}
test('progress strokes differ per achievement and remain stable through updates and reloads',()=>{
 const f=fixture(),g=fixture();
 const paths=fixture=>fixture.get('#achievement-list').children.map(row=>row.querySelector('.achievement-progress-fill').attrs.d);
 const before=paths(f);assert.equal(new Set(before).size,A.definitions.length);
 assert.deepEqual(paths(g),before);
 M.toggle(f.state,f.state.tasks[0].id);f.ui.update();assert.deepEqual(paths(f),before);
 f.get('#achievement-list').children.forEach(row=>assert.equal(row.querySelector('.achievement-progress-base').attrs.d,row.querySelector('.achievement-progress-fill').attrs.d));
});
test('click pins achievements and a second click restores tasks without simulated focus',()=>{
 const f=fixture();f.fire('#crown','pointerenter',{pointerType:'mouse'});f.fire('#crown','focus');f.fire('#crown','click');f.fire('#crown','pointerleave');
 assert.equal(f.get('#crown').attrs['aria-pressed'],'true');assert(f.get('#tasks-view').hidden);
 f.fire('#crown','click');f.fire('#crown','pointerleave');assert.equal(f.get('#crown').attrs['aria-pressed'],'false');assert(!f.get('#tasks-view').hidden);
});
test('touch clicks pin the achievement view without requiring hover',()=>{
 const f=fixture();f.fire('#crown','pointerenter',{pointerType:'touch'});assert(!f.get('#tasks-view').hidden);f.fire('#crown','click');assert(f.get('#tasks-view').hidden);
});
test('both awards are queued as separate lower-left notifications',()=>{
 const f=fixture();f.ui.celebrate([{id:'daily-five',title:'Five'},{id:'daily-all',title:'All'}]);
 f.tick();assert.equal(f.get('#achievement-toast-title').textContent,'Five');assert(!f.get('#achievement-toast').hidden);
 f.tick();assert(f.get('#achievement-toast').hidden);f.tick();assert.equal(f.get('#achievement-toast-title').textContent,'All');assert(!f.get('#achievement-toast').hidden);
});
test('midnight clears pending and visible daily notifications',()=>{
 const f=fixture();f.ui.celebrate([{id:'daily-five',title:'Five'}]);f.tick();assert(!f.get('#achievement-toast').hidden);
 M.resetDay(f.state,'2026-10-14');f.ui.clearDaily();assert(f.get('#achievement-toast').hidden);assert.equal(f.timers.size,0);
});
test('the matching trophy appears before the delayed megaphone shot',()=>{
 const f=fixture({reduced:false});let shots=0;
 f.get('#confetti').context={setTransform(){shots++;},clearRect(){}};
 f.ui.celebrate([{...A.definitions[1],tier:'bronze'}]);f.tick();
 assert.equal(f.get('#achievement-toast-trophy').querySelector('.trophy-plaque-text').textContent,'5');
 assert(f.get('#achievement-toast').classes.has('launching'));assert.equal(shots,0);
 assert.deepEqual([...f.delays.values()],[3800,6300]);
 f.tick();assert.equal(f.get('#confetti').children.length,84);assert(!f.get('#achievement-toast').hidden);
 f.tick();assert(f.get('#achievement-toast').hidden);assert(!f.get('#achievement-toast').classes.has('launching'));
});
test('closing or midnight cancels a shot before it fires',()=>{
 for(const action of ['close','midnight']){
  const f=fixture({reduced:false});f.ui.celebrate([A.definitions[0]]);f.tick();
  assert([...f.delays.values()].includes(3800));
  if(action==='close')f.fire('#close-toast','click');
  else{M.resetDay(f.state,'2026-10-14');f.ui.clearDaily();}
  assert.equal(f.timers.size,0);assert(f.get('#achievement-toast').hidden);
  assert(!f.get('#achievement-toast').classes.has('launching'));
 }
});

test('tiers choose one, two or four staggered cannons and color the popup',()=>{
 for(const [tier,count,duration] of [['bronze',1,6300],['silver',2,6900],['gold',4,8500]]){
  const f=fixture({reduced:false});f.ui.celebrate([{id:'custom',title:'Custom',tier}]);f.tick();
  assert.equal(f.get('#achievement-toast').attrs['data-tier'],tier);
  assert.equal(f.get('#achievement-toast-trophy').querySelector('.trophy-metal').style.mask,tier==='gold'?'url("#popup-trophy-mask")':'');
  assert.equal(f.get('#celebration-launchers').hidden,false);
  assert.equal([0,1,2,3].filter(i=>!f.get(`#launcher-${i}`).hidden).length,count);
  const delays=[...f.delays.values()];assert.equal(delays.length,count+1);assert.equal(delays[0],3800);assert.equal(delays.at(-1),duration);
  delays.slice(1,-1).forEach((delay,i)=>assert(delay>delays[i]));
  f.fire('#close-toast','click');assert.equal(f.timers.size,0);assert(f.get('#celebration-launchers').hidden);
 }
});
test('ballistic aim reaches the checklist target from all four corners and on mobile',()=>{
 const source=fs.readFileSync('public/achievement-ui.js','utf8'),window={YackI18n:require('../../public/i18n.js'),};
 vm.runInNewContext(source,{window});
 for(const width of [360,800])for(const origin of [{x:20,y:580},{x:width-20,y:580},{x:20,y:20},{x:width-20,y:20}]){
  const target={x:width/2,y:160},jitter={x:13,y:-7},arc=window.MorningAchievementUI.trajectory(origin,target,jitter);
  assert(Math.abs(origin.x+arc.vx*arc.flight-target.x-jitter.x)<1e-8);
  assert(Math.abs(origin.y+arc.vy*arc.flight+.5*.24*arc.flight**2-target.y-jitter.y)<1e-8);
 }
});
test('reduced motion hides every cannon while retaining tier and notification',()=>{
 const f=fixture();f.ui.celebrate([{id:'gold',title:'Gold',tier:'gold'}]);f.tick();
 assert.equal(f.get('#achievement-toast').attrs['data-tier'],'gold');assert(!f.get('#achievement-toast').hidden);
 assert(f.get('#celebration-launchers').hidden);assert.deepEqual([...f.delays.values()],[4500]);
});

test('staggered gold bursts accumulate 540 CSS particles and survive the popup closing',()=>{
 const f=fixture({reduced:false});
 f.ui.celebrate([{id:'gold',title:'Gold',tier:'gold'}]);f.tick();
 for(let i=0;i<4;i++)f.tick();
 assert.equal(f.get('#confetti').children.length,540);assert.equal(f.frames.size,0);
 const aims=[0,1,2,3].map(i=>f.get(`#launcher-${i}`).querySelector('.confetti-cannon').style.transform);
 assert(new Set(aims).size>1);
 f.fire('#close-toast','click');assert.equal(f.get('#confetti').children.length,540);assert.equal(f.timers.size,0);
 f.ui.clearDaily();assert.equal(f.get('#confetti').children.length,0);
});
test('hiding the page cancels every remaining silver or gold shot',()=>{
 for(const tier of ['silver','gold']){
  const f=fixture({reduced:false});f.ui.celebrate([{id:tier,title:tier,tier}]);f.tick();f.hideDocument();
  assert.equal(f.timers.size,1);assert.equal(f.frames.size,0);
  f.tick();assert(f.get('#achievement-toast').hidden);
 }
});

test('silver trophies glint one at a time, finish once, then wait a random interval',()=>{
 const defs=[0,1,2].map(i=>({id:`silver-${i}`,tier:'silver',title:'Silver',scope:'day',rule:{type:'completed-count',target:1}}));
 const f=fixture({reduced:false,defs,random:()=>.8});
 f.state.dailyAchievements={day:f.state.day,earned:Object.fromEntries(defs.map(d=>[d.id,1]))};f.ui.update();
 assert.equal(f.timers.size,0);f.fire('#crown','click');
 assert.deepEqual([...f.delays.values()],[12200]);
 f.tick();assert([...f.delays.values()][0]>=0&&[...f.delays.values()][0]<12000);f.tick();const rows=f.get('#achievement-list').children;
 assert.deepEqual(rows.map(row=>row.classes.has('silver-glint')),[false,false,true]);
 assert.deepEqual([...f.delays.values()],[450]);
 f.tick();assert(rows.every(row=>!row.classes.has('silver-glint')));
 assert.deepEqual([...f.delays.values()],[12200]);
 f.fire('#crown','click');assert.equal(f.timers.size,0);
});
test('leaving the trophy view or hiding the page stops silver glints and resuming waits again',()=>{
 const f=fixture({reduced:false,random:()=>.2});
 f.state.dailyAchievements={day:f.state.day,earned:{'daily-five':1}};f.ui.update();
 f.fire('#crown','pointerenter',{pointerType:'mouse'});f.tick();f.tick();f.tick();
 const row=f.get('#achievement-list').children.find(row=>row.attrs['data-tier']==='silver'&&row.classes.has('earned'));assert(row.classes.has('silver-glint'));
 f.fire('#crown','pointerleave');assert(!row.classes.has('silver-glint'));assert.equal(f.timers.size,0);
 f.fire('#crown','click');assert.equal(f.timers.size,1);f.hideDocument();assert.equal(f.timers.size,0);
 f.showDocument();assert.equal(f.timers.size,1);
 f.fire('#crown','click');assert.equal(f.timers.size,0);
});
test('reduced motion has no silver shine scheduler',()=>{
 const f=fixture();f.fire('#crown','click');assert.equal(f.timers.size,0);
});
test('reflection phase matches the white stripe for every trophy size and popup location',()=>{
 const window={YackI18n:require('../../public/i18n.js'),};vm.runInNewContext(fs.readFileSync('public/achievement-ui.js','utf8'),{window});
 const {shinePhase,whiteWait}=window.MorningAchievementUI;
 for(const [width,height] of [[64,84],[56,74],[94,124],[430,270]]){
  const point={x:width*.67,y:height*.18},phase=shinePhase(width,height,point);
  const radians=115*Math.PI/180,ux=Math.sin(radians),uy=-Math.cos(radians);
  const projection=(point.x-width/2)*ux+(point.y-height/2)*uy+(Math.abs(width*ux)+Math.abs(height*uy))/2;
  const stripe=((projection-phase*96)%32+32)%32;
  assert(Math.abs(stripe-16)<1e-8);
  for(const current of [0,.2,.7,.99]){
   const wait=whiteWait(current,phase);assert(wait>=0&&wait<4000);
   const arrival=(current+(wait+225)/12000)%(1/3);
   assert(Math.abs(arrival-phase)<1e-8);
  }
 }
});

test('achievement audio waits for entrance completion and keeps playing after popup dismissal',async()=>{
 let visible,resolveEntrance,started=0,stopped=0;
 const finished=new Promise(resolve=>resolveEntrance=resolve);
 const f=fixture({sound:{begin(){assert(!visible.hidden);started++;return {pop(){},stop(){stopped++;},finished:new Promise(()=>{})};}},animate:()=>({finished,cancel(){}})});
 visible=f.get('#achievement-toast');f.ui.celebrate([{id:'bronze',tier:'bronze',title:'Bronze'}]);f.tick();
 assert.equal(started,0);resolveEntrance();await Promise.resolve();assert.equal(started,1);
 f.fire('#close-toast','click');assert(visible.hidden);assert.equal(stopped,0);
 f.ui.clearDaily();assert.equal(stopped,1);
});
test('closing before the entrance finishes prevents late achievement audio',async()=>{
 let resolveEntrance,started=0;const finished=new Promise(resolve=>resolveEntrance=resolve);
 const f=fixture({sound:{begin(){started++;}},animate:()=>({finished,cancel(){}})});
 f.ui.celebrate([{id:'bronze',tier:'bronze',title:'Bronze'}]);f.tick();f.fire('#close-toast','click');resolveEntrance();await Promise.resolve();assert.equal(started,0);
});

test('silver right cannon receives a mobile position above the popup',()=>{
 const f=fixture({reduced:false});f.ui.celebrate([{id:'silver',title:'Silver',tier:'silver'}]);f.tick();
 assert.equal(f.get('#celebration-launchers').style['--mobile-right-cannon-bottom'],'482px');
});

test('unearned silver trophies never schedule a shine, even while previewing',()=>{
 const f=fixture({reduced:false});f.fire('#crown','click');assert.equal(f.timers.size,0);
 const silver=f.get('#achievement-list').children.find(row=>row.attrs['data-tier']==='silver');assert(!silver.classes.has('earned'));assert(!silver.classes.has('silver-glint'));
});

test('trophies group earned first descending in rank, then unearned ascending, with stable ties',()=>{
 const defs=[['g','gold'],['b1','bronze'],['s1','silver'],['b2','bronze'],['s2','silver']].map(([id,tier])=>({id,title:id,tier,scope:'day',rule:{type:'completed-count',target:1}}));
 const f=fixture({defs}),list=f.get('#achievement-list'),titles=()=>list.children.map(row=>row.querySelector('.achievement-title').textContent);
 assert.deepEqual(titles(),['b1','b2','s1','s2','g']);const original=new Set(list.children);
 f.state.dailyAchievements.earned={g:1,s2:1,b2:1};f.ui.update();assert.deepEqual(titles(),['g','s2','b2','b1','s1']);assert.equal(list.children.length,5);assert(list.children.every(row=>original.has(row)));
 f.state.dailyAchievements.earned={g:1,s1:1,s2:1,b1:1,b2:1};f.ui.update();assert.deepEqual(titles(),['g','s1','s2','b1','b2']);
 M.resetDay(f.state,'2026-10-21');f.ui.update();assert.deepEqual(titles(),['b1','b2','s1','s2','g']);
});

test('brief trophy hovers cancel; a deliberate hover fades for 600 ms and clicks remain immediate',()=>{
 const durations=[],f=fixture({animate:(node,frames,duration)=>{durations.push(duration);return null;}});
 f.fire('#crown','pointerenter',{pointerType:'mouse'});f.fire('#crown','pointerleave');assert.equal(f.timers.size,0);assert(!f.get('#tasks-view').hidden);assert.deepEqual(durations,[]);
 f.fire('#crown','pointerenter',{pointerType:'mouse'});f.tick();assert(f.get('#tasks-view').hidden);assert.deepEqual(durations,[600]);assert.equal(f.get('#view-title').textContent,'Trofæer');f.fire('#crown','pointerleave');assert.deepEqual(durations,[600,440]);assert(!f.get('#tasks-view').hidden);assert(f.get('#achievements-view').hidden);assert.equal(f.get('#view-title').textContent,'Godmorgen!');
 f.fire('#crown','pointerenter',{pointerType:'mouse'});f.fire('#crown','click');assert.equal(f.timers.size,0);assert(f.get('#tasks-view').hidden);assert.equal(durations.at(-1),440);
});

test('the gold popup has its own animated SVG mask without duplicating it in the trophy list',()=>{
 const {appFixture}=require('../helpers/dom.cjs');const f=appFixture(),mask=f.get('#popup-trophy-mask');assert(mask);
 assert(mask.querySelector('.trophy-mask-motion'));assert(mask.querySelector('.mask-cup'));
 assert(f.get('#achievement-toast-trophy').querySelector('.trophy-geometry'));
 assert(!f.get('#achievement-list').querySelector('#popup-trophy-mask'));
});
