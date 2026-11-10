const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const D=require('../../public/deferral.js');
function fixture(){
 class El{
  constructor(){this.handlers=new Map();this.children=[];this.classes=new Set();this.attrs={};this.classList={add:n=>this.classes.add(n),remove:n=>this.classes.delete(n)};}
  addEventListener(name,fn,opts){const list=this.handlers.get(name)||[];list.push({fn,opts});this.handlers.set(name,list);}
  removeEventListener(name,fn){this.handlers.set(name,(this.handlers.get(name)||[]).filter(h=>h.fn!==fn));}
  setAttribute(name,value){this.attrs[name]=value;}
  contains(target){return this===target||this.children.some(c=>c.contains(target));}
  matches(){return this.keyboard||false;}
  focus(){this.focused=true;}
  fire(name,event={}){let prevented=false,stopped=false;const e={target:this,pointerType:'mouse',pointerId:1,clientX:0,clientY:0,...event,preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}};for(const {fn} of this.handlers.get(name)||[]){fn(e);if(stopped)break;}return {prevented,stopped};}
 }
 const doc=new El(),row=new El(),task=new El(),defer=new El();row.children=[task,defer];
 let now=0,id=0;const timers=new Map();const window={};
 const ctx={window,Math,Date:{now:()=>now},setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/deferral.js','utf8'),ctx);
 const controller=window.MorningDeferral.create(doc),control=controller.attach(row,task,defer);
 function advance(ms){const end=now+ms;while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const [id,t]=next;timers.delete(id);now=t.at;t.fn();}now=end;}
 return {doc,row,task,defer,control,controller,timers,advance,shown:()=>row.classes.has('show-defer')};
}
test('mouse hover is handled by CSS without JavaScript timers',()=>{
 const f=fixture();f.row.fire('pointerenter');f.advance(1500);assert.equal(f.timers.size,0);assert(!f.shown());assert.equal(f.defer.tabIndex,0);
});
test('a mobile hold reveals the control and suppresses accidental completion on release',()=>{
 const f=fixture();f.task.fire('pointerdown',{pointerType:'touch'});f.advance(1000);assert(f.shown());
 f.task.fire('pointerup',{pointerType:'touch'});assert(f.task.fire('click').stopped);
 f.task.fire('pointerdown',{pointerType:'touch'});f.advance(100);f.task.fire('pointerup',{pointerType:'touch'});
 assert(!f.task.fire('click').stopped);
});
test('ordinary taps and mobile scrolling do not reveal the defer control',()=>{
 const f=fixture();f.task.fire('pointerdown',{pointerType:'touch'});f.advance(200);f.task.fire('pointerup',{pointerType:'touch'});assert(!f.task.fire('click').prevented);
 f.advance(1000);assert(!f.shown());
 f.task.fire('pointerdown',{pointerType:'touch'});f.task.fire('pointermove',{pointerType:'touch',clientY:20});f.advance(1500);assert(!f.shown());
});
test('cancellation, outside taps and disposal clear pending reveals',()=>{
 const f=fixture();f.task.fire('pointerdown',{pointerType:'touch'});f.task.fire('pointercancel',{pointerType:'touch'});f.advance(1000);assert(!f.shown());
 f.row.fire('pointerenter');f.advance(1000);f.doc.fire('pointerdown');assert(!f.shown());
 f.row.fire('pointerenter');f.control.dispose();f.advance(1500);assert(!f.shown());assert.equal(f.timers.size,0);
});
test('keyboard users can reveal the same control without a mouse hold',()=>{
 const f=fixture();f.task.fire('keydown',{key:'F10',shiftKey:true});assert(f.shown());assert(f.defer.focused);
 f.row.fire('focusout',{relatedTarget:f.defer});assert(f.shown());f.row.fire('focusout',{relatedTarget:null});assert(!f.shown());
});
test('scratch patterns are seeded angled pen hatches advancing left to right',()=>{
 const rect={x:0,y:15,width:200,height:30},path=D.stroke(rect,123);
 assert.equal(path,D.stroke(rect,123));assert.notEqual(path,D.stroke(rect,124));assert(!/NaN|Infinity/.test(path));
 const curves=[...path.matchAll(/ Q([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)/g)].map(m=>({control:[Number(m[1]),Number(m[2])],end:[Number(m[3]),Number(m[4])]}));
 const peaks=curves.filter((_,i)=>i%2===0).map(c=>c.end),bases=curves.filter((_,i)=>i%2===1).map(c=>c.end);
 assert(peaks.length>10);assert.equal(peaks.length,bases.length+1);
 assert(curves.at(-1).end[1]<bases.at(-1)[1]);
 assert(curves.at(-1).end[0]>bases.at(-1)[0]);
 const spacings=bases.slice(2).map((point,i)=>point[0]-bases[i+1][0]);
 assert(Math.max(...spacings)-Math.min(...spacings)>3);
 bases.forEach(([x,y],i)=>{assert(i?x>bases[i-1][0]:x<rect.x);assert(y>rect.y);assert(peaks[i][1]<rect.y);assert(peaks[i][0]>(i?bases[i-1][0]:rect.x));});
 assert(new Set(peaks.map(p=>p[1])).size>5);
 const start=path.match(/^M([\d.-]+) ([\d.-]+)/).slice(1).map(Number);
 assert(Math.abs(start[1]-rect.y)<rect.height*.05);
 assert(curves[0].end[1]<start[1]);
 assert(curves[1].end[0]<start[0]);assert(curves[1].end[1]>rect.y+rect.height*.25);
 const angles=peaks.map((peak,i)=>{const from=i?bases[i-1]:start;return Math.atan2(peak[0]-from[0],from[1]-peak[1]);});
 assert(angles[0]>angles.at(-1)+.35);
 assert(angles[0]>.85);assert(angles.at(-1)>.35);
 angles.forEach((angle,i)=>{if(i)assert(Math.abs(angle-angles[i-1])<.16);});
 peaks.forEach((peak,i)=>{
  const from=i?bases[i-1]:start,control=curves[i*2].control;
  assert(control[0]<(from[0]+peak[0])/2);assert(control[1]<(from[1]+peak[1])/2);
 });
});
test('XOR passive scratch strokes run lengthwise back and forth instead of vertical zigzags',()=>{
 const rect={x:0,y:15,width:200,height:30},path=D.longStroke(rect,123);
 assert.equal(path,D.longStroke(rect,123));assert.notEqual(path,D.longStroke(rect,124));
 const points=path.split(' C').slice(1).map(segment=>segment.split(' ').map(Number).slice(-2));
 assert.equal(points.length,6);points.forEach(([x,y],i)=>{assert(i%2?Math.abs(x)<3:Math.abs(x-200)<3);assert(Math.abs(y-15)<6);});
});

test('Perlin variation is seeded, smooth and uses lattice gradients',()=>{
 const a=D.perlin(123),b=D.perlin(123),c=D.perlin(124);
 assert.equal(a(0),0);assert.equal(a(1),0);
 const samples=Array.from({length:400},(_,i)=>i*.017+.2);
 assert(samples.some(x=>a(x)!==c(x)));
 samples.forEach(x=>{assert.equal(a(x),b(x));assert(Math.abs(a(x))<=1);assert(Math.abs(a(x+.001)-a(x))<.005);});
 const epsilon=.0001;
 assert(Math.abs((a(1)-a(1-epsilon))/epsilon-(a(1+epsilon)-a(1))/epsilon)<.001);
});

test('scrolling or cancellation after a mobile hold hides the control and blocks a stray completion click',()=>{
 for(const kind of ['scroll','cancel']){
  const f=fixture();f.task.fire('pointerdown',{pointerType:'touch'});f.advance(1000);assert(f.shown());
  if(kind==='scroll')f.task.fire('pointermove',{pointerType:'touch',clientY:25});else f.task.fire('pointercancel',{pointerType:'touch'});
  assert(!f.shown());assert(f.task.fire('click').stopped);f.advance(700);assert(!f.task.fire('click').stopped);
 }
});
test('a second touch cancels pending deferral rather than triggering it during a pinch',()=>{
 const f=fixture();f.task.fire('pointerdown',{pointerType:'touch'});f.advance(600);f.doc.fire('pointerdown',{pointerType:'touch',pointerId:2,isPrimary:false});f.advance(1000);assert(!f.shown());
});
