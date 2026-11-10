const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../../public/tasks.js'),P=require('../../public/note-paper.js'),D=require('../../public/sync-data.js');
const {appFixture}=require('../helpers/dom.cjs');
test('blank titles stay blank while recurring notes without an override use their task text',()=>{
 assert.equal(P.title({text:'Write plans',writing:{mode:'list',count:3}}),'Write plans');
 assert.equal(P.title({text:'Write plans',writing:{mode:'list',count:3,title:'  '}}),'');
 assert.equal(P.title({text:'Ny note',temporaryDay:'2026-10-20',writing:{mode:'note',count:1}}),'');
 assert.equal(P.title({text:'Ny note',permanentNote:true,writing:{mode:'note',count:1,title:'Ny note'}}),'Ny note');
});
test('new notes without a title have no saved heading, retain a grab strip, and survive sync',t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-20T10:00:00Z')});
 for(const mode of ['note','list'])for(const permanent of [false,true]){
  const state=M.fresh('2026-10-20'),t=M.createTemporaryNote(state,'untitled',{mode,count:mode==='list'?2:1});if(permanent)M.setNotePermanence(state,t.id,true);
  M.submitWriting(state,t.id,mode==='list'?['One','Two']:['Remember this']);
  const synced=D.materialize(D.capture(state),state.day).state,note=synced.tasks.find(t=>t.id==='untitled');assert.equal(note.writing.title,'');assert.equal(P.title(note),'');
  const f=appFixture(synced),card=f.get('.saved-note');assert(card.classList.contains('note-untitled'));assert(card.querySelector('.note-grip'));assert(!card.querySelector('h2'));
  const mini=f.get('.mobile-note-mini');assert(!mini.querySelector('strong'));assert.equal(mini.getAttribute('aria-label'),'Åbn note');
  card.querySelector('.note-edit').fire('click');assert.equal(f.get('.note-compose-title').value,'');
 }
});
test('clearing a saved note title removes its heading through save, reopening and cloud restore',()=>{
 const f=appFixture();f.get('#new-note').fire('click');const title=f.get('.note-compose-title');title.value='A title';title.fire('input');const content=f.get('.writing-input');content.value='Keep the contents';content.fire('input');f.get('#writing-pad').querySelector('form').fire('submit');assert.equal(f.get('.saved-note').querySelector('h2').textContent,'A title');
 f.get('.note-edit').fire('click');const edit=f.get('.note-compose-title');edit.value='';edit.fire('input');f.get('#writing-pad').querySelector('form').fire('submit');assert(!f.get('.saved-note').querySelector('h2'));
 const restored=appFixture(D.materialize(D.capture(f.saved()),f.saved().day).state);assert(!restored.get('.saved-note').querySelector('h2'));assert.equal(restored.get('.note-content').textContent.includes('Keep the contents'),true);
});
