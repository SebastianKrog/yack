const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../../public/tasks.js');
const {appFixture}=require('../helpers/dom.cjs');
function savedNote(t){
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-21T10:00:00Z')});
 const state=M.fresh('2026-10-21'),note=M.createTemporaryNote(state,'note',{mode:'list',count:3,asTasks:true});
 M.submitWriting(state,note.id,['One','Two','Three']);M.toggleWritingItem(state,note.id,note.writingItems[0].id);
 return appFixture(state);
}
test('unchanged notes close directly; changed notes require confirmation and discard text, options and list edits',t=>{
 const f=savedNote(t),before=f.saved().tasks.find(t=>t.id==='note');
 f.get('.note-edit').fire('click');f.get('.note-compose-close').fire('click');assert(!f.get('#note-composer').open);
 f.get('.note-edit').fire('click');let input=f.get('.writing-input');input.value='Edited';input.fire('input');
 f.get('.writing-remove').fire('click');const permanence=f.get('.note-permanence');permanence.value='permanent';permanence.fire('change');
 const color=f.get('.note-paper-color');color.value='rose';color.fire('change');
 f.get('#note-composer').fire('cancel');assert(f.get('#note-composer').open);assert(!f.get('.note-discard-confirm').hidden);
 f.get('.note-keep-editing').fire('click');assert(f.get('.note-discard-confirm').hidden);assert.equal(f.get('#writing-pad').querySelectorAll('.writing-input').length,2);
 f.get('.note-compose-close').fire('click');f.get('.note-discard').fire('click');assert(!f.get('#note-composer').open);
 assert.deepEqual(f.saved().tasks.find(t=>t.id==='note'),before);
 f.get('.note-edit').fire('click');assert.deepEqual(f.get('#writing-pad').querySelectorAll('.writing-input').map(i=>i.value),['One','Two','Three']);
 assert.equal(f.get('.note-permanence').value,'day');
});
test('Save commits staged note changes and keeps completed list entries',t=>{
 const f=savedNote(t);f.get('.note-edit').fire('click');
 const fields=f.get('#writing-pad').querySelectorAll('.writing-input');fields[1].value='Updated';fields[1].fire('input');
 const color=f.get('.note-paper-color');color.value='rose';color.fire('change');
 assert.equal(f.saved().tasks.find(t=>t.id==='note').writingAnswer[1],'Two');
 f.get('#writing-pad').querySelector('form').fire('submit');f.flushRender();const note=f.saved().tasks.find(t=>t.id==='note');
 assert(!f.get('#note-composer').open);assert.equal(note.writingAnswer[1],'Updated');assert.equal(note.writing.paperColor,'rose');assert(note.writingItems[0].checked);
});
test('closing a new unsaved note discards it without adding a note or trophy progress',()=>{
 const f=appFixture(),before=f.saved();f.get('#new-note').fire('click');const input=f.get('.writing-input');input.value='Unsaved';input.fire('input');
 f.get('.note-compose-close').fire('click');assert(!f.get('.note-discard-confirm').hidden);f.get('.note-discard').fire('click');
 assert(!f.get('#note-composer').open);assert.equal(f.saved().tasks.length,before.tasks.length);assert.deepEqual(f.saved().stats,before.stats);
});
test('delete confirmation can be canceled or escaped without losing edits, and temporarily blocks the editor',t=>{
 const f=savedNote(t);f.get('.note-edit').fire('click');const input=f.get('.writing-input');input.value='Keep this draft';input.fire('input');
 f.get('.note-delete').fire('click');const prompt=f.get('.note-discard-confirm');assert.equal(prompt.dataset.action,'delete');assert.equal(prompt.getAttribute('role'),'alertdialog');assert(input.closest('form').children.filter(c=>c!==prompt).every(c=>c.inert));
 f.get('.note-keep-editing').fire('click');assert(prompt.hidden);assert.equal(f.get('.writing-input').value,'Keep this draft');assert(input.closest('form').children.every(c=>!c.inert));
 f.get('.note-compose-close').fire('click');assert.equal(prompt.dataset.action,'discard');f.get('#note-composer').fire('cancel');assert(prompt.hidden);assert(f.get('#note-composer').open);assert.equal(f.get('.writing-input').value,'Keep this draft');assert(f.saved().tasks.some(t=>t.id==='note'));
});

test('confirmation has its own close X, returns to the unsaved editor and uses unique ink masks',t=>{
 const f=savedNote(t);f.get('.note-edit').fire('click');const input=f.get('.writing-input');input.value='Unsaved text';input.fire('input');f.get('.note-compose-close').fire('click');
 const prompt=f.get('.note-discard-confirm');assert(prompt.contains(f.get('.note-confirm-close')));assert.equal(f.get('.note-compose-close').style.visibility,'hidden');
 const ids=f.get('#writing-pad').querySelectorAll('mask').map(mask=>mask.getAttribute('id'));assert.equal(new Set(ids).size,ids.length);
 f.get('.note-confirm-close').fire('click');assert(prompt.hidden);assert(f.get('#note-composer').open);assert.equal(input.value,'Unsaved text');assert.equal(f.get('.note-compose-close').style.visibility,'');
});

test('recurring note entry keeps its configured layout and fixed list size, with a header rule and no design controls',()=>{
 const state=M.fresh('2026-10-21');state.tasks=[];M.add(state,'Skriv tre ting',null,'write');M.configureWriting(state,'write',{mode:'list',count:3,align:'right',paperType:'dots'});
 const f=appFixture(state);f.get('.writing-task').fire('click');const pad=f.get('#writing-pad');
 assert.equal(pad.querySelector('h2').textContent,'Skriv tre ting');assert(pad.querySelector('.note-title-field').querySelector('.note-rule'));assert.equal(pad.getAttribute('data-note-align'),'right');
 for(const selector of ['.note-options','.note-compose-alignment','.writing-add','.writing-remove'])assert.equal(pad.querySelector(selector),null);
 const inputs=pad.querySelectorAll('.writing-input');assert.equal(inputs.length,3);inputs[0].fire('keydown',{key:'Enter',shiftKey:true});assert.equal(pad.querySelectorAll('.writing-input').length,3);
});
