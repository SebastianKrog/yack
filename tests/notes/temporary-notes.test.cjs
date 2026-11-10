const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../../public/tasks.js'),T=require('../../public/task-json.js'),D=require('../../public/sync-data.js'),A=require('../../public/achievements.js'),S=require('../../public/stats.js');
const {appFixture}=require('../helpers/dom.cjs');
const day='2026-10-20';
function note(state,id='scratch',config={mode:'list',count:2,asTasks:true}){return M.createTemporaryNote(state,id,config);}
test('daily note drafts survive reopening and disappear at midnight without changing the recurring list',()=>{
 const s=M.fresh(day),before=T.encode(s),t=note(s);M.draftWriting(s,t.id,['A draft']);assert(!M.visible(s).some(task=>task.id===t.id));assert.equal(T.encode(s),before);
 const restored=M.restore(JSON.parse(JSON.stringify(s)),day);assert.equal(restored.tasks.find(t=>t.id==='scratch').writingDraft[0],'A draft');
 assert.equal(M.restore(restored,'2026-10-21').tasks.length,5);M.resetDay(restored,'2026-10-21');assert.equal(restored.tasks.length,5);assert.equal(T.encode(restored),before);
});
test('only the contents of temporary task notes count toward task goals and lifetime checks',()=>{
 const s=M.fresh(day),t=note(s),before=M.achievementTasks(s).length;M.submitWriting(s,t.id,['One','Two']);
 assert.equal(M.achievementTasks(s).length,before+2);assert.equal(A.progress(s).find(p=>p.id==='daily-first').current,0);assert.equal((S.normalize(s.stats)[day]?.checked||0),0);
 M.toggleWritingItem(s,t.id,t.writingItems[0].id);assert.equal(A.progress(s).find(p=>p.id==='daily-first').current,1);assert.equal((S.normalize(s.stats)[day]?.checked||0),1);
 M.deferWritingItem(s,t.id,t.writingItems[1].id);assert.equal(A.progress(s).find(p=>p.id==='daily-defer-first').current,1);assert(M.noteComplete(t));assert(M.archiveNote(s,t.id));assert.equal(M.achievementTasks(s).length,before+2);
});
test('plain notes and numbered lists do not add task goals or count their creation as a check',()=>{
 const s=M.fresh(day),before=M.achievementTasks(s).length,t=note(s,'plain',{mode:'list',count:2,asTasks:false,listStyle:'upper-roman'});M.submitWriting(s,t.id,['One','Two']);assert.equal(M.achievementTasks(s).length,before);assert.equal(M.toggleWritingItem(s,t.id,t.writingItems[0].id),null);assert(M.canArchiveNote(t));assert.equal(A.progress(s).find(p=>p.id==='daily-note-created').current,1);
});
test('daily notes sync as dated records, including appearance, geometry, answers and item state',()=>{
 const s=M.fresh(day),t=note(s,'daily',{mode:'list',count:2,asTasks:true,pinColor:'navy',paperType:'grid',paperColor:'blue'});M.submitWriting(s,t.id,['A','B']);M.toggleWritingItem(s,t.id,t.writingItems[0].id);M.moveNote(s,t.id,{x:20,y:130,space:'list'});M.moveMobileNote(s,t.id,{x:.2,y:350,space:'page'});M.resizeNote(s,t.id,{width:260,height:200});
 const fields=D.capture(s);assert(!fields['def/daily']);assert(!fields.order.includes('daily'));assert(fields[`day/${day}/temporary/daily`]);assert(!fields['position/daily']);
 const synced=D.materialize(fields,day).state.tasks.find(t=>t.id==='daily');assert.deepEqual(synced.writing,t.writing);assert(synced.writingItems[0].checked);assert.deepEqual(synced.noteMobilePosition,t.noteMobilePosition);assert.deepEqual(synced.notePosition,t.notePosition);assert.deepEqual(synced.noteSize,t.noteSize);
 assert(!D.materialize(fields,'2026-10-21').state.tasks.some(t=>t.id==='daily'));
});
test('imports and task versions preserve today’s temporary notes without making them recurring',()=>{
 const s=M.fresh(day),t=note(s);M.submitWriting(s,t.id,['A','B']);const defs=T.parse(T.encode(s));defs[1].text='Changed';const restored=T.apply(defs,s,day);assert(restored.tasks.some(task=>task.temporaryDay===day));assert(!T.encode(restored).includes('scratch'));assert.throws(()=>T.parse(JSON.stringify(s)));
});
test('new note controls create a task list with selected pin, paper and a title outside the editor',()=>{
 const f=appFixture(),visibleCount=f.get('#tasks-view').children.length;f.get('#new-note').fire('click');assert(!f.get('#writing-pad').hidden);
 let kind=f.get('.note-kind');kind.value='list';kind.fire('change');const title=f.get('.note-compose-title');title.value='Husk i dag';title.fire('input');
 for(const [cls,value] of [['.note-paper-color','blue'],['.note-paper-type','grid']]){const input=f.get(cls);input.value=value;input.fire('change');}
 const pin=f.get('.note-options').querySelectorAll('.pin-choice').find(button=>button.getAttribute('aria-label')==='Marineblå');pin.fire('click');
 for(const [i,input] of f.get('#writing-pad').querySelectorAll('.writing-input').entries()){input.value=`Punkt ${i+1}`;input.fire('input');}
 f.get('#writing-pad').querySelector('form').fire('submit');const saved=f.saved(),t=saved.tasks.find(t=>t.temporaryDay);assert.equal(t.text,'Husk i dag');assert.equal(t.writingItems.length,3);assert.equal(t.writing.paperColor,'blue');assert.equal(t.writing.pinColor,'navy');assert(f.get('.saved-note'));assert.equal(f.get('.saved-note').getAttribute('data-paper-type'),'grid');assert.equal(f.get('#tasks-view').children.length,visibleCount);
 f.get('#edit').fire('click');assert.equal(f.get('#editor-list').children.length,5);
});
test('canceling the discard confirmation keeps a new note draft without creating duplicates',()=>{
 const f=appFixture();f.get('#new-note').fire('click');const input=f.get('.writing-input');input.value='Remember this';input.fire('input');f.get('.note-compose-close').fire('click');f.get('.note-keep-editing').fire('click');assert.equal(f.get('.writing-input').value,'Remember this');f.get('#writing-pad').querySelector('form').fire('submit');assert.equal(f.saved().tasks.filter(t=>t.temporaryDay).length,1);
});
