const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../../public/tasks.js'),T=require('../../public/task-json.js'),D=require('../../public/sync-data.js'),A=require('../../public/achievements.js');
const {appFixture}=require('../helpers/dom.cjs');
const day='2026-10-20',tomorrow='2026-10-21';
function permanent(s){const t=M.createTemporaryNote(s,'keep',{mode:'list',count:3,asTasks:true,pinColor:'terracotta',paperType:'lined'});M.setNotePermanence(s,t.id,true);M.submitWriting(s,t.id,['One','Two','Three']);return t;}
test('permanent notes retain answers, drafts, completion and deferral state across midnight and reopening',()=>{
 const s=M.fresh(day),t=permanent(s);M.toggleWritingItem(s,t.id,t.writingItems[0].id);M.deferWritingItem(s,t.id,t.writingItems[1].id);M.moveNote(s,t.id,{x:40,y:160,space:'list'});M.editWritingList(s,t.id,['One','Two','Three','New draft']);
 const restored=M.restore(JSON.parse(JSON.stringify(s)),tomorrow),note=restored.tasks.find(t=>t.id==='keep');assert(note.permanentNote);assert(!note.temporaryDay);assert(note.checked);assert(note.writingItems[0].checked);assert(note.writingItems[1].deferred);assert.equal(note.writingDraft[3],'New draft');assert.equal(M.writingCount(note),4);assert.deepEqual(note.notePosition,{x:40,y:160,space:'list'});assert(!M.visible(restored).some(t=>t.id==='keep'));
});
test('permanent note sync fields are independent of the date and keep separate item checks',()=>{
 const s=M.fresh(day),t=permanent(s);M.toggleWritingItem(s,t.id,t.writingItems[0].id);M.moveMobileNote(s,t.id,{x:.5,y:250,space:'page'});const fields=D.capture(s);
 assert(fields['note/definition/keep']);assert(fields['note/answer/keep']);assert(!fields['def/keep']);assert(!fields.order.includes('keep'));assert(Object.keys(fields).some(k=>k.startsWith('note/check/')));
 const next=D.materialize(fields,tomorrow).state,note=next.tasks.find(t=>t.id==='keep');assert(note.checked);assert(note.writingItems[0].checked);assert.deepEqual(note.noteMobilePosition,t.noteMobilePosition);assert.equal(note.writingItems[0].checkedDay,day);
 assert.equal(A.progress(next).find(p=>p.id==='daily-first').current,0);assert.equal(A.progress(next).find(p=>p.id==='daily-note-created').current,0);
});
test('permanent tasks count when completed today, but never change the clear-all target',()=>{
 const s=M.fresh(day),base=A.progress(s).find(p=>p.id==='daily-all').target,t=permanent(s);M.toggleWritingItem(s,t.id,t.writingItems[0].id);M.deferWritingItem(s,t.id,t.writingItems[1].id);M.toggleWritingItem(s,t.id,t.writingItems[2].id);
 assert.equal(A.progress(s).find(p=>p.id==='daily-first').current,2);assert.equal(A.progress(s).find(p=>p.id==='daily-all').target,base);assert.equal(A.progress(s).find(p=>p.id==='daily-note-completed').current,1);assert(M.archiveNote(s,t.id));
 const next=M.restore(s,tomorrow);assert(next.tasks.find(t=>t.id==='keep').noteArchived);for(const id of ['daily-first','daily-defer-first','daily-note-completed','daily-cleanup'])assert.equal(A.progress(next).find(p=>p.id===id).current,0,id);
});
test('list editing inserts and removes draft rows without discarding existing checked items',()=>{
 const s=M.fresh(day),t=permanent(s);M.toggleWritingItem(s,t.id,t.writingItems[0].id);const checked=t.writingItems[0].id;
 M.editWritingList(s,t.id,['One','Inserted','Two','Three']);const reopened=M.restore(s,day).tasks.find(t=>t.id==='keep');assert(reopened.checked);assert(reopened.writingItems[0].checked);assert.equal(reopened.writingItems.length,3);
 M.submitWriting(s,t.id,['One','Inserted','Two','Three']);assert.equal(t.writingItems[0].id,checked);assert(t.writingItems[0].checked);assert.equal(t.writingItems.length,4);
 assert.throws(()=>M.editWritingList(s,t.id,[]));assert.throws(()=>M.editWritingList(s,t.id,Array(101).fill('')));
});
test('ad-hoc permanent notes stay outside task exports and survive imports without entering the recurring editor',()=>{
 const s=M.fresh(day),t=permanent(s);assert(!T.encode(s).includes('keep'));assert.throws(()=>T.parse(JSON.stringify(s)));const applied=T.apply(T.parse(T.encode(s)),s,day);assert(applied.tasks.find(t=>t.id==='keep').permanentNote);
 const f=appFixture(s);f.get('#edit').fire('click');assert.equal(f.get('#editor-list').children.length,5);const card=f.get('.saved-note');assert.equal(card.querySelectorAll('.permanent-pin').length,2);assert(card.querySelector('.permanent-pin-left'));assert(card.querySelector('.permanent-pin-right'));
});
test('Shift+Enter adds a row after the current one, remove buttons keep the remaining values, and the last row cannot be removed',()=>{
 const f=appFixture();f.get('#new-note').fire('click');const kind=f.get('.note-kind');kind.value='list';kind.fire('change');let inputs=f.get('#writing-pad').querySelectorAll('.writing-input');
 ['A','B','C'].forEach((v,i)=>{inputs[i].value=v;inputs[i].fire('input');});inputs[0].fire('keydown',{key:'Enter',shiftKey:true});inputs=f.get('#writing-pad').querySelectorAll('.writing-input');assert.equal(inputs.length,4);assert.equal(inputs[1].value,'');assert.equal(inputs[2].value,'B');assert.equal(f.doc.activeElement,inputs[1]);
 f.get('#writing-pad').querySelectorAll('.writing-remove')[1].fire('click');inputs=f.get('#writing-pad').querySelectorAll('.writing-input');assert.deepEqual(inputs.map(input=>input.value),['A','B','C']);
 const permanent=f.get('.note-permanence');permanent.value='permanent';permanent.fire('change');assert(!f.saved().tasks.find(t=>t.permanentNote));assert.equal(f.get('#writing-pad').querySelectorAll('.writing-input').length,3);
 f.get('#writing-pad').querySelector('form').fire('submit');assert(f.saved().tasks.find(t=>t.permanentNote));assert.equal(f.get('.saved-note').querySelectorAll('.permanent-pin').length,2);
});
test('extra rows on a recurring note are today’s answers and do not alter its recurring definition',()=>{
 const s=M.fresh(day),t=s.tasks.find(t=>t.id==='initial-2');M.editWritingList(s,t.id,['A','B','C','D']);M.submitWriting(s,t.id,['A','B','C','D']);assert.equal(t.writingItems.length,4);assert.equal(T.parse(T.encode(s)).find(task=>task.id===t.id)?.writing.count,3);M.resetDay(s,tomorrow);assert.equal(M.writingCount(t),3);assert.equal(t.writingItems.length,0);
});
test('switching permanence back to today expires the note without changing its contents immediately',()=>{
 const s=M.fresh(day),t=permanent(s);M.setNotePermanence(s,t.id,false);assert.equal(t.temporaryDay,day);assert(!t.permanentNote);assert.equal(t.writingAnswer[1],'Two');assert(!M.restore(s,tomorrow).tasks.some(t=>t.id==='keep'));
});
test('standalone notes cannot become prerequisites or reorder recurring tasks through hidden editor rows',()=>{
 const s=M.fresh(day);permanent(s);assert.throws(()=>M.update(s,'initial-4','Break','keep'));M.shift(s,'initial-4',1);assert.equal(s.tasks.find(t=>t.id==='initial-4').parentId,null);M.indent(s,'initial-4');assert.notEqual(s.tasks.find(t=>t.id==='initial-4').parentId,'keep');assert.equal(s.tasks.find(t=>t.id==='keep').parentId,null);
});
test('invalid synced draft counts are bounded before allocating form fields',()=>{
 const s=M.fresh(day);permanent(s);const fields=D.capture(s);fields['note/status/keep'].noteItemCount=1e9;const restored=D.materialize(fields,day).state.tasks.find(t=>t.id==='keep');assert.equal(M.writingCount(restored),3);assert.equal(restored.writingDraft.length,3);
});
test('removing saved note rows keeps the modal, form and actions mounted through rerenders',t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-20T10:00:00Z')});
 for(const permanentNote of [false,true]){
  const s=M.fresh(day),t=permanent(s);if(!permanentNote)M.setNotePermanence(s,t.id,false);
  const f=appFixture(s);f.get('.note-edit').fire('click');
  const dialog=f.get('#note-composer'),form=f.get('#writing-pad').querySelector('form'),actions=f.get('.writing-actions');assert(dialog.open);
  f.get('#writing-pad').querySelectorAll('.writing-remove')[1].fire('click');f.flushRender();
  assert(dialog.open);assert(!f.get('#writing-pad').hidden);assert.equal(f.get('#writing-pad').querySelector('form'),form);assert.equal(f.get('.writing-actions'),actions);
  assert.deepEqual(f.get('#writing-pad').querySelectorAll('.writing-input').map(input=>input.value),['One','Three']);
  form.fire('submit');assert(!dialog.open);assert.deepEqual(f.saved().tasks.find(t=>t.id==='keep').writingAnswer,['One','Three']);
 }
});
test('saved standalone notes can be deleted from the composer and their sync records are removed',t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-20T10:00:00Z')});
 for(const permanentNote of [false,true]){
  const s=M.fresh(day),t=permanent(s);if(!permanentNote)M.setNotePermanence(s,t.id,false);
  const f=appFixture(s);f.get('.note-edit').fire('click');assert.equal(f.get('.note-delete').textContent,'Slet note');f.get('.note-delete').fire('click');assert(f.get('#note-composer').open);assert(!f.get('.note-discard-confirm').hidden);assert(f.saved().tasks.some(t=>t.id==='keep'));f.get('.note-discard').fire('click');
  assert(!f.get('#note-composer').open);assert(!f.get('.saved-note'));assert(!f.saved().tasks.some(t=>t.id==='keep'));assert(!Object.keys(D.capture(f.saved())).some(k=>k.includes('/keep')));
 }
 const f=appFixture();f.get('#new-note').fire('click');assert(!f.get('.note-delete'));f.get('#note-composer').fire('cancel');assert(!f.get('#note-composer').open);assert(f.get('#writing-pad').hidden);
});
