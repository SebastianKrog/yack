const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../../public/scribbles.js');
const {appFixture}=require('../helpers/dom.cjs');
function queueFixture(maxAnimations=1){
 const vm=require('node:vm'),fs=require('node:fs');let now=0,id=0,animations=0;const timers=new Map(),events=[];
 const window={};const context={window,setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync('public/scribbles.js','utf8'),context);
 const sound={isAvailable:()=>true,scribble:(duration,kind,reverse)=>{events.push({type:'start',now,kind,duration,reverse});return ()=>events.push({type:'stop',now,kind});}};
 const ui=window.MorningScribbles.create({sound,reducedMotion:{matches:false}});
 const node=()=>{const classes=new Set();return {classes,classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)}};};
 const path=()=>({style:{},animate(){animations++;assert(animations<=maxAnimations,'Only one forward stroke or one simultaneous undo may animate');return {cancel(){animations--;}};}});
 function advance(ms){const end=now+ms;for(;;){const entry=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;timers.delete(entry[0]);now=entry[1].at;entry[1].fn();}now=end;}
 return {ui,node,path,events,timers,advance,animations:()=>animations};
}
test('rapidly queued tasks draw and sound one stroke at a time, checkmark last',()=>{
 const f=queueFixture(2),a=f.node(),b=f.node(),done=[];
 const steps=[{path:f.path(),kind:'red',duration:450},{path:f.path(),kind:'defer',duration:1000},{paths:[f.path(),f.path()],kind:'check',duration:260}];
 f.ui.enqueue(a,steps,()=>done.push('a'));f.ui.enqueue(b,[{path:f.path(),kind:'defer',duration:1000}],()=>done.push('b'));
 assert(a.classes.has('scribbling')&&b.classes.has('scribbling'));
 f.advance(0);assert.equal(f.events[0].kind,'red');f.advance(449);assert.equal(f.events.length,1);
 f.advance(1);assert.equal(f.events.at(-1).kind,'defer');f.advance(1000);assert.equal(f.events.at(-1).kind,'check');
 f.advance(260);assert.deepEqual(done,['a']);assert.equal(f.events.at(-1).kind,'defer');
 f.advance(1000);assert.deepEqual(done,['a','b']);assert.equal(f.animations(),0);
 assert.deepEqual(f.events.filter(e=>e.type==='start').map(e=>[e.kind,e.now]),[['red',0],['defer',450],['check',1450],['defer',1710]]);
});
test('cancel clears queued strokes and stops the current sound and animation',()=>{
 const f=queueFixture(),a=f.node(),b=f.node();let done=0;
 f.ui.enqueue(a,[{path:f.path(),kind:'defer',duration:1000}],()=>done++);f.ui.enqueue(b,[{path:f.path(),kind:'check',duration:240}],()=>done++);
 f.advance(100);f.ui.cancelAll();f.advance(5000);
 assert.equal(done,0);assert.equal(f.animations(),0);assert.equal(f.timers.size,0);assert(!a.classes.has('scribbling')&&!b.classes.has('scribbling'));
 assert.equal(f.events.filter(e=>e.type==='start').length,1);assert.equal(f.events.at(-1).type,'stop');
});
test('OR stage planning uses selected red ink, the other choice scratch, then the shared checkmark',()=>{
 const f=appFixture(),row=f.get('.checklist').children[0];row.querySelectorAll('.xor-option')[1].fire('click');
 const group=row.querySelector('.task'),stages=S.stages(group,{xorChoice:1});
 assert.deepEqual(stages.map(s=>s.kind),['red','defer','check']);assert.equal(stages[2].paths.length,2);assert.equal(stages[2].duration,260);
 assert(group.querySelectorAll('.xor-option')[1].querySelector('.strike').contains(stages[0].path));
 assert(group.querySelectorAll('.xor-option')[0].querySelector('.defer-strike').contains(stages[1].path));
 row.querySelector('.defer-button').fire('click');
 const deferral=S.stages(group,{defer:true});assert.deepEqual(deferral.map(s=>s.kind),['defer']);assert(group.querySelector('.xor-group-defer-strike').contains(deferral[0].path));
});

test('undo retracts every stroke together in 260ms with one reverse sound, then resumes the queue',()=>{
 const f=queueFixture(4),a=f.node(),b=f.node(),paths=Array.from({length:4},()=>f.path()),done=[];
 f.ui.enqueue(a,[{paths,kind:'reverse',duration:260,reverse:true}],()=>done.push('undo'));
 f.ui.enqueue(b,[{path:f.path(),kind:'red',duration:450}],()=>done.push('check'));
 assert(paths.every(path=>path.style.strokeDashoffset==='0'));
 f.advance(0);assert.equal(f.animations(),4);assert.equal(f.events.length,1);assert.equal(f.events[0].reverse,true);
 f.advance(259);assert.deepEqual(done,[]);f.advance(1);assert.deepEqual(done,['undo']);assert.equal(f.animations(),1);
 f.advance(450);assert.deepEqual(done,['undo','check']);assert.equal(f.animations(),0);
});
test('OR undo includes both choice strokes and checkmark paths in a single fast stage',()=>{
 const f=appFixture(),row=f.get('.checklist').children[0];row.querySelectorAll('.xor-option')[1].fire('click');
 const undo=S.stages(row.querySelector('.task'),{xorChoice:1,reverse:true});
 assert.equal(undo.length,1);assert.equal(undo[0].paths.length,4);assert.equal(undo[0].duration,260);assert(undo[0].reverse);
});
