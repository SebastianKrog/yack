const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../../public/tasks.js');
const A=require('../../public/achievements.js');
const day='2026-10-13';
function fixture(){
 const s=M.fresh(day);s.tasks=[];M.add(s,'Kaffe',null,'a');M.add(s,'Monster',null,'b');
 M.add(s,'Efter kaffe','a','left');M.add(s,'Efter Monster','b','right');M.add(s,'Venstre barn','left','left-child');
 M.pair(s,'a','b');M.add(s,'Efter begge muligheder','a','either');return s;
}
const ids=s=>M.visible(s).map(t=>t.id);
test('either choice completes one group, defers the other choice passively and reveals correct dependants',()=>{
 const s=fixture();assert.deepEqual(ids(s),['a']);
 M.toggle(s,'a',0);assert.deepEqual(ids(s),['a','left','either']);
 assert.equal(M.choiceStatus(s,'a',0),'completed');assert.equal(M.choiceStatus(s,'a',1),'passive');
 assert.equal(M.deferStatus(s,'right'),'passive');assert.equal(s.tasks.filter(t=>t.checked).length,1);assert.equal(s.tasks.filter(t=>t.deferred).length,0);
 assert.equal(M.toggle(s,'a',1),null);M.toggle(s,'a',0);M.toggle(s,'a',1);assert.deepEqual(ids(s),['a','right','either']);assert.equal(M.choiceStatus(s,'a',0),'passive');assert.equal(M.choiceStatus(s,'a',1),'completed');
});
test('the shared checkbox has no model toggle and selecting a chosen choice again reopens both',()=>{
 const s=fixture();assert.equal(M.toggle(s,'a'),null);assert(!s.tasks[0].checked);
 M.toggle(s,'a',0);M.toggle(s,'a',0);assert(!s.tasks[0].checked);assert.equal(s.tasks[0].xor.choice,null);
 assert.equal(M.choiceStatus(s,'a',0),null);assert.equal(M.choiceStatus(s,'a',1),null);assert.deepEqual(ids(s),['a']);
});
test('deferring the shared control creates exactly one active and one passive choice deferral',()=>{
 const s=fixture();M.defer(s,'a');assert.equal(M.choiceStatus(s,'a',0),'active');assert.equal(M.choiceStatus(s,'a',1),'passive');
 assert.equal(A.progress(s).find(p=>p.id==='daily-defer-first').current,1);assert.deepEqual(A.claim(s).map(p=>p.id),['daily-defer-first']);assert.deepEqual(ids(s),['a']);
 for(const id of ['left','right','left-child','either'])assert.equal(M.deferStatus(s,id),'passive');
 M.defer(s,'a');assert.equal(M.choiceStatus(s,'a',0),null);M.defer(s,'a');assert.equal(M.toggle(s,'a',1),null);M.defer(s,'a');M.toggle(s,'a',1);assert(!s.tasks[0].deferred);assert(s.tasks[0].checked);
});
test('follow-up scope can switch between either choice and one specific choice',()=>{
 const s=fixture();M.setDependencyChoice(s,'either',1);M.toggle(s,'a',0);assert(!ids(s).includes('either'));
 M.setDependencyChoice(s,'either',null);assert(ids(s).includes('either'));M.setDependencyChoice(s,'either',0);assert(ids(s).includes('either'));
 M.toggle(s,'a',0);M.toggle(s,'a',1);assert(!ids(s).includes('either'));assert.throws(()=>M.setDependencyChoice(s,'a',0));
});
test('unselected branches do not block the all-tasks trophy or inflate completed-task progress',()=>{
 const s=fixture();M.toggle(s,'a',0);M.toggle(s,'left');M.toggle(s,'left-child');M.toggle(s,'either');
 const p=A.progress(s);assert.equal(p.find(p=>p.id==='daily-all').target,4);assert(p.find(p=>p.id==='daily-all').met);
 assert.equal(p.find(p=>p.id==='daily-five').current,4);assert(!p.find(p=>p.id==='daily-defer-first').met);
 M.toggle(s,'a',0);M.toggle(s,'a',1);assert.equal(A.progress(s).find(p=>p.id==='daily-five').current,2);assert(!A.progress(s).find(p=>p.id==='daily-all').met);
});
test('pairing retains existing choice-specific dependants and splitting retains their relationships',()=>{
 const s=fixture();assert.equal(s.tasks.find(t=>t.id==='left').parentChoice,0);assert.equal(s.tasks.find(t=>t.id==='right').parentChoice,1);
 M.toggle(s,'a',1);M.unpair(s,'a');assert.equal(s.tasks.find(t=>t.id==='right').parentId,'b');assert.equal(s.tasks.find(t=>t.id==='left').parentId,'a');
 assert.equal(s.tasks.find(t=>t.id==='either').parentId,'b');assert(s.tasks.find(t=>t.id==='b').checked);assert(!s.tasks[0].xor);
});
test('moving a group moves both choices and all dependency branches',()=>{
 const s=fixture();M.add(s,'Other',null,'other');M.place(s,'a',1,1);
 assert.equal(s.tasks.find(t=>t.id==='a').parentId,'other');assert.equal(M.depth(s,'left-child'),3);
 assert.equal(s.tasks.find(t=>t.id==='a').xor.otherId,'b');assert.equal(s.tasks.find(t=>t.id==='right').parentChoice,1);
 M.toggle(s,'other');M.toggle(s,'a',1);assert(ids(s).includes('right'));assert(!ids(s).includes('left'));
});
test('moving a follow-up within its group preserves its scope; moving it elsewhere clears scope',()=>{
 const s=fixture();const before=M.ordered(s).filter(t=>t.id!=='right'&&!M.dependsOn(s,t.id,'right'));
 M.place(s,'right',before.length,1);assert.equal(s.tasks.find(t=>t.id==='right').parentChoice,1);
 M.place(s,'right',0,0);assert.equal(s.tasks.find(t=>t.id==='right').parentId,null);assert.equal(s.tasks.find(t=>t.id==='right').parentChoice,null);
});
test('group and dependency definitions, selection and deferrals survive reloads',()=>{
 for(const action of ['select','defer']){
  const s=fixture();if(action==='select')M.toggle(s,'a',1);else M.defer(s,'a');
  const restored=M.restore(JSON.parse(JSON.stringify(s)),day);assert.deepEqual(restored.tasks,s.tasks);assert.deepEqual(ids(restored),ids(s));
  M.resetDay(restored,'2026-10-14');assert.equal(restored.tasks[0].xor.choice,null);assert(!restored.tasks[0].deferred);assert.equal(restored.tasks[0].xor.otherText,'Monster');
  assert.equal(restored.tasks.find(t=>t.id==='right').parentChoice,1);
 }
});
test('new defaults use coffee OR Monster and a plan prerequisite without replacing saved lists',()=>{
 const s=M.fresh(day);assert.equal(s.tasks[0].text,'Hent kaffe');assert.equal(s.tasks[0].xor.otherText,'Åbn en Monster!');
 assert.equal(s.tasks[2].parentId,'initial-1');assert(!ids(s).includes('initial-2'));M.toggle(s,'initial-1');assert(ids(s).includes('initial-2'));
 const old=M.fresh(day);old.tasks[0].text='My original coffee';delete old.tasks[0].xor;old.tasks[2].parentId=null;
 const restored=M.restore(old,day);assert.equal(restored.tasks[0].text,'My original coffee');assert(!restored.tasks[0].xor);assert.equal(restored.tasks[2].parentId,null);
});
test('both choice texts support editing and survive persistence',()=>{
 const s=fixture();M.updateChoice(s,'a',0,'**Kaffe**');M.updateChoice(s,'a',1,'_Monster_');
 const r=M.restore(s,day);assert.equal(r.tasks[0].text,'**Kaffe**');assert.equal(r.tasks[0].xor.otherText,'_Monster_');assert.throws(()=>M.updateChoice(s,'a',1,' '));
});
test('pairing rejects incompatible prerequisites, nesting, or already paired choices',()=>{
 const s=fixture();assert.throws(()=>M.pair(s,'a','either'));assert.throws(()=>M.pair(s,'left','right'));
 assert.throws(()=>M.pair(s,'left','left-child'));assert.equal(s.tasks[0].xor.otherId,'b');
});
test('removing a group promotes its dependants without losing them',()=>{
 const s=fixture();M.remove(s,'a');assert(s.tasks.find(t=>t.id==='left'));assert(s.tasks.find(t=>t.id==='right'));assert(s.tasks.find(t=>t.id==='either'));
 assert.equal(s.tasks.find(t=>t.id==='left').parentId,null);assert.equal(s.tasks.find(t=>t.id==='left').parentChoice,null);
 assert(!s.tasks.some(t=>t.id==='a'||t.id==='b'));
});
