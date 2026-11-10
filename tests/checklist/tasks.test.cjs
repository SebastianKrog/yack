const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../../public/tasks.js');
const day='2026-10-13';
function empty(){const s=M.fresh(day);s.tasks=[];s.lists[0].taskIds=[];return s;}
function add(s,id,parent=null){return M.add(s,id,parent,id);}
function ids(s){return M.visible(s).map(t=>t.id);}
test('dependent chains appear only when every prerequisite is completed',()=>{
 const s=empty();add(s,'a');add(s,'b','a');add(s,'c','b');
 assert.deepEqual(ids(s),['a']);M.toggle(s,'a');assert.deepEqual(ids(s),['a','b']);
 M.toggle(s,'b');assert.deepEqual(ids(s),['a','b','c']);M.toggle(s,'a');assert.deepEqual(ids(s),['a']);
 M.toggle(s,'a');assert.deepEqual(ids(s),['a','b','c']);
});
test('limit retains all active tasks and hides completed tasks by completion age',()=>{
 const s=empty();for(let i=0;i<12;i++)add(s,`${i}`);
 assert.equal(ids(s).length,12);
 M.toggle(s,'5');M.toggle(s,'1');M.toggle(s,'9');
 assert.equal(ids(s).length,10);assert(!ids(s).includes('5'));assert(!ids(s).includes('1'));assert(ids(s).includes('9'));
 M.toggle(s,'5');assert.equal(ids(s).length,10);assert(!ids(s).includes('9'));
});
test('hidden completed prerequisites still reveal active follow-ups',()=>{
 const s=empty();add(s,'parent');add(s,'child','parent');
 for(let i=0;i<9;i++)add(s,`other${i}`);
 M.toggle(s,'parent');assert.equal(ids(s).length,10);assert(!ids(s).includes('parent'));assert(ids(s).includes('child'));
});
test('removing a parent preserves children and the remaining dependency chain',()=>{
 const s=empty();add(s,'a');add(s,'b','a');add(s,'c','b');M.remove(s,'b');
 assert.equal(s.tasks.find(t=>t.id==='c').parentId,'a');assert.deepEqual(ids(s),['a']);M.toggle(s,'a');assert.deepEqual(ids(s),['a','c']);
 M.remove(s,'a');assert.equal(s.tasks[0].parentId,null);assert.deepEqual(ids(s),['c']);
});
test('reload preserves custom tasks, dependencies and completion order',()=>{
 const s=empty();add(s,'a');add(s,'b','a');M.toggle(s,'a');
 const restored=M.restore(JSON.parse(JSON.stringify(s)),day);
 assert.deepEqual(restored.tasks,s.tasks);assert.deepEqual(ids(restored),['a','b']);
});
test('midnight resets checkmarks but keeps custom task definitions and dependencies',()=>{
 const s=empty();add(s,'a');add(s,'b','a');M.toggle(s,'a');M.toggle(s,'b');
 const restored=M.restore(JSON.parse(JSON.stringify(s)),'2026-10-14');
 assert.equal(restored.tasks.length,2);assert.equal(restored.tasks[1].parentId,'a');assert(restored.tasks.every(t=>!t.checked));assert.deepEqual(ids(restored),['a']);
});
test('removing every task persists an empty list rather than restoring defaults',()=>{
 const s=empty();add(s,'a');M.remove(s,'a');assert.equal(M.restore(s,day).tasks.length,0);
});
test('damaged dependencies are repaired and cannot loop forever',()=>{
 const s=empty();add(s,'a');add(s,'b');s.tasks[0].parentId='b';s.tasks[1].parentId='a';
 const restored=M.restore(s,day);assert.equal(M.ordered(restored).length,2);
});
test('reordering siblings moves their complete dependent branches',()=>{
 const s=empty();add(s,'a');add(s,'b','a');add(s,'c');add(s,'d','c');
 M.shift(s,'c',-1);assert.deepEqual(M.ordered(s).map(t=>t.id),['c','d','a','b']);
 assert.equal(s.tasks.find(t=>t.id==='d').parentId,'c');
 const restored=M.restore(JSON.parse(JSON.stringify(s)),day);assert.deepEqual(M.ordered(restored).map(t=>t.id),['c','d','a','b']);
});
test('text and dependency edits persist without losing completion state',()=>{
 const s=empty();add(s,'a');add(s,'b');M.toggle(s,'a');const seed=s.tasks[0].markSeed;
 M.update(s,'a','Renamed',null);assert(s.tasks[0].checked);assert.equal(s.tasks[0].markSeed,seed);
 M.update(s,'b','Follow-up','a');assert.deepEqual(ids(s),['a','b']);
 const restored=M.restore(JSON.parse(JSON.stringify(s)),day);assert.equal(restored.tasks[1].parentId,'a');assert.equal(restored.tasks[1].text,'Follow-up');
});
test('editing a dependency changes eligibility immediately',()=>{
 const s=empty();add(s,'a');add(s,'b');M.update(s,'b','b','a');assert.deepEqual(ids(s),['a']);
 M.update(s,'b','b',null);assert.deepEqual(ids(s),['a','b']);
});
test('dependency edits reject both direct and indirect loops atomically',()=>{
 const s=empty();add(s,'a');add(s,'b','a');add(s,'c','b');
 assert.throws(()=>M.update(s,'a','Invalid','a'));assert.throws(()=>M.update(s,'a','Invalid','c'));
 assert.equal(s.tasks[0].text,'a');assert.equal(s.tasks[0].parentId,null);
});
test('restoring definitions keeps parents before their branches',()=>{
 const s=empty();add(s,'a');add(s,'c');add(s,'b');s.tasks[2].parentId='a';
 const restored=M.restore(s,day);assert.deepEqual(M.ordered(restored).map(t=>t.id),['a','b','c']);
});
test('indent creates a dependency on the previous sibling and carries children',()=>{
 const s=empty();add(s,'a');add(s,'b');add(s,'c','b');M.indent(s,'b');
 assert.equal(s.tasks.find(t=>t.id==='b').parentId,'a');assert.equal(s.tasks.find(t=>t.id==='c').parentId,'b');
 assert.equal(M.depth(s,'c'),2);assert.deepEqual(ids(s),['a']);M.toggle(s,'a');assert.deepEqual(ids(s),['a','b']);
});
test('outdent preserves the branch and moves it after its former parent branch',()=>{
 const s=empty();add(s,'a');add(s,'b','a');add(s,'c','b');add(s,'d','a');M.outdent(s,'b');
 assert.equal(s.tasks.find(t=>t.id==='b').parentId,null);assert.equal(s.tasks.find(t=>t.id==='c').parentId,'b');
 assert.deepEqual(M.ordered(s).map(t=>t.id),['a','d','b','c']);
});
test('drag projection derives the new parent from vertical position and indentation',()=>{
 const s=empty();add(s,'a');add(s,'b');add(s,'c');
 const projected=M.project(s,'c',1,1);assert.equal(projected.parentId,'a');M.place(s,'c',1,1);
 assert.deepEqual(M.ordered(s).map(t=>t.id),['a','c','b']);assert.deepEqual(ids(s),['a','b']);
 M.place(s,'c',1,0);assert.equal(s.tasks.find(t=>t.id==='c').parentId,null);assert.deepEqual(ids(s),['a','c','b']);
});
test('drag projection cannot nest a branch under one of its own descendants',()=>{
 const s=empty();add(s,'a');add(s,'b','a');add(s,'c','b');add(s,'d');
 M.place(s,'a',1,99);assert.equal(s.tasks.find(t=>t.id==='a').parentId,'d');
 assert.equal(s.tasks.find(t=>t.id==='b').parentId,'a');assert.equal(M.ordered(s).length,4);
});
test('deferring a parent hides the entire branch without marking descendants active',()=>{
 const s=empty();add(s,'a');add(s,'b','a');add(s,'c','b');M.toggle(s,'a');M.toggle(s,'b');
 M.defer(s,'a');assert.deepEqual(ids(s),['a']);assert.equal(M.deferStatus(s,'a'),'active');
 assert.equal(M.deferStatus(s,'b'),'passive');assert.equal(M.deferStatus(s,'c'),'passive');
 assert.equal(s.tasks.filter(t=>t.deferred).length,1);assert.equal(M.defer(s,'c'),null);assert.equal(M.toggle(s,'c'),null);
});
test('deferred tasks must be reopened before they can be completed',()=>{
 const s=empty();add(s,'a');add(s,'b','a');M.defer(s,'a');M.defer(s,'a');
 assert.equal(M.deferStatus(s,'b'),null);assert(!s.tasks[0].deferred);assert(!s.tasks[0].checked);
 M.defer(s,'a');assert.equal(M.toggle(s,'a'),null);assert(s.tasks[0].deferred);M.defer(s,'a');M.toggle(s,'a');assert(s.tasks[0].checked);assert(!s.tasks[0].deferred);assert.deepEqual(ids(s),['a','b']);
});
test('passive deferral follows the current tree and newly added descendants',()=>{
 const s=empty();add(s,'a');M.defer(s,'a');add(s,'b','a');assert.equal(M.deferStatus(s,'b'),'passive');
 M.update(s,'b','b',null);assert.equal(M.deferStatus(s,'b'),null);assert.deepEqual(ids(s),['a','b']);
});
test('deferred tasks share the ten-row limit with completed tasks',()=>{
 const s=empty();for(let i=0;i<12;i++)add(s,`${i}`);
 M.toggle(s,'0');M.defer(s,'1');M.defer(s,'2');assert.equal(ids(s).length,10);
 assert(!ids(s).includes('0'));assert(!ids(s).includes('1'));assert(ids(s).includes('2'));
});
test('reload preserves explicit deferrals, inherited status, scratch seeds and ordering',()=>{
 const s=empty();add(s,'a');add(s,'b','a');M.defer(s,'a');add(s,'c');M.toggle(s,'c');
 const restored=M.restore(JSON.parse(JSON.stringify(s)),day);assert.deepEqual(restored.tasks,s.tasks);
 assert.equal(M.deferStatus(restored,'b'),'passive');assert.deepEqual(ids(restored),['a','c']);
 add(restored,'d');M.defer(restored,'d');assert(restored.tasks.at(-1).deferredOrder>restored.tasks.find(t=>t.id==='c').completedOrder);
});
test('midnight resets explicit and inherited deferrals while retaining tasks',()=>{
 const s=empty();add(s,'a');add(s,'b','a');M.defer(s,'a');M.resetDay(s,'2026-10-14');
 assert(s.tasks.every(t=>!t.deferred&&!t.checked&&t.deferredOrder===null));assert.equal(M.deferStatus(s,'b'),null);
 assert.equal(s.tasks[1].parentId,'a');assert.deepEqual(ids(s),['a']);
});
test('restoring conflicting checked and deferred flags keeps states mutually exclusive',()=>{
 const s=empty();add(s,'a');M.defer(s,'a');s.tasks[0].checked=true;
 const restored=M.restore(s,day);assert(restored.tasks[0].deferred);assert(!restored.tasks[0].checked);
});
