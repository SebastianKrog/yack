const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../../public/tasks.js'),D=require('../../public/sync-data.js'),T=require('../../public/task-json.js'),Drag=require('../../public/note-drag.js');
const {appFixture}=require('../helpers/dom.cjs');
test('alignment and compact note dimensions survive local restore and cloud sync',()=>{
 for(const align of ['left','center','right']){
  const s=M.fresh('2026-10-21'),t=M.createTemporaryNote(s,'short-note',{mode:'note',count:1,asTasks:false,align});M.setNotePermanence(s,t.id,true);M.submitWriting(s,t.id,['Remember this']);assert(M.resizeNote(s,t.id,{width:400,height:96}));
  for(const next of [M.restore(JSON.parse(JSON.stringify(s)),s.day),D.materialize(D.capture(s),s.day).state]){const note=next.tasks.find(t=>t.id==='short-note');assert.equal(note.writing.align,align);assert.equal(note.noteSize.height,96);assert.deepEqual(note.writingAnswer,['Remember this']);}
 }
 assert.equal(M.validWriting({mode:'note',count:1,align:'justify'}),false);assert.equal(Drag.fitSize({width:240,height:-100},1000).height,0);
});
test('recurring note alignment is included in JSON export and import',()=>{
 const s=M.fresh('2026-10-21');M.configureWriting(s,'initial-2',{...s.tasks[2].writing,align:'right'});assert.equal(T.parse(T.encode(s)).find(t=>t.id==='initial-2').writing.align,'right');
});
test('alignment dropdown changes only formatting, keeps drafts, and applies on saving',()=>{
 const f=appFixture();f.get('#new-note').fire('click');const input=f.get('.writing-input');input.value='One short line';input.fire('input');
 const picker=f.get('.note-align-picker');assert(picker.closest('.note-pin-field'));picker.open=true;const right=picker.querySelectorAll('button').find(b=>b.dataset.align==='right');right.fire('click');assert.equal(picker.open,false);assert.equal(f.get('.writing-input').value,'One short line');assert.equal(f.get('#writing-pad').getAttribute('data-note-align'),'right');
 f.get('#writing-pad').querySelector('form').fire('submit');assert.equal(f.get('.saved-note').getAttribute('data-note-align'),'right');assert.equal(f.saved().tasks.find(t=>t.temporaryDay).writing.align,'right');
 f.get('.note-edit').fire('click');assert.equal(f.get('.note-align-current').getAttribute('aria-label'),'Tekstjustering: Højre');
});

test('recurring note paper appearance is configured in the task editor and persists',()=>{
 const f=appFixture();f.get('#edit').fire('click');let row=f.get('#editor-list').children.find(row=>row.dataset.taskId==='initial-1');const type=row.querySelector('.writing-type');type.value='note';type.fire('change');
 for(const [key,value] of [['paperColor','rose'],['paperType','dots']]){row=f.get('#editor-list').children.find(row=>row.dataset.taskId==='initial-1');const select=row.querySelector('.writing-'+key);select.value=value;select.fire('change');}
 const task=f.saved().tasks.find(task=>task.id==='initial-1');assert.equal(task.writing.paperColor,'rose');assert.equal(task.writing.paperType,'dots');
});

test('Enter saves a note while Shift+Enter and composition keep it open',()=>{
 const f=appFixture();f.get('#new-note').fire('click');const input=f.get('.writing-input');input.value='A line';input.fire('input');
 assert(!input.fire('keydown',{key:'Enter',shiftKey:true}).defaultPrevented);assert(f.get('#note-composer').open);
 input.fire('keydown',{key:'Enter',isComposing:true});assert(f.get('#note-composer').open);
 input.fire('keydown',{key:'Enter',repeat:true});assert(f.get('#note-composer').open);
 input.value='A line\nAnother line';input.fire('input');assert(input.fire('keydown',{key:'Enter'}).defaultPrevented);
 assert(!f.get('#note-composer').open);assert.equal(f.saved().tasks.find(t=>t.temporaryDay).writingAnswer[0],'A line\nAnother line');
});
test('Shift+Enter inserts a list item after the current item; Enter saves the list',()=>{
 const f=appFixture();f.get('#new-note').fire('click');const kind=f.get('.note-kind');kind.value='list';kind.fire('change');
 let inputs=f.get('#writing-pad').querySelectorAll('.writing-input');inputs.forEach((input,i)=>{input.value=String(i+1);input.fire('input');});
 assert(inputs[0].fire('keydown',{key:'Enter',shiftKey:true}).defaultPrevented);
 inputs=f.get('#writing-pad').querySelectorAll('.writing-input');assert.deepEqual(inputs.map(i=>i.value),['1','','2','3']);
 inputs[1].value='Inserted';inputs[1].fire('input');inputs[1].fire('keydown',{key:'Enter'});
 assert(!f.get('#note-composer').open);assert.deepEqual(f.saved().tasks.find(t=>t.temporaryDay).writingAnswer,['1','Inserted','2','3']);
});

test('copy uses only current note text or list lines, without saving the draft',async()=>{
 for(const mode of ['note','list']){
  const f=appFixture(),copied=[];f.window.navigator={clipboard:{writeText:async text=>copied.push(text)}};
  f.get('#new-note').fire('click');if(mode==='list'){const kind=f.get('.note-kind');kind.value=mode;kind.fire('change');}
  const title=f.get('.note-compose-title');title.value='Do not copy this title';title.fire('input');
  const values=mode==='list'?['First','Second','Third']:['First\nSecond'];
  f.get('#writing-pad').querySelectorAll('.writing-input').forEach((input,i)=>{input.value=values[i];input.fire('input');});
  const before=f.saved();f.get('.note-copy').fire('click');await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(copied,[values.join('\n')]);assert(f.get('#note-composer').open);assert.deepEqual(f.saved(),before);assert.equal(f.get('#writing-pad').querySelector('.form-message').textContent,'Teksten er kopieret.');
 }
});
test('clipboard failure keeps the editor open and reports failure',async()=>{
 const f=appFixture();f.window.navigator={clipboard:{writeText:async()=>{throw new Error('Permission denied');}}};f.get('#new-note').fire('click');
 f.get('.writing-input').value='Keep this draft';f.get('.note-copy').fire('click');await new Promise(resolve=>setImmediate(resolve));
 assert(f.get('#note-composer').open);assert.equal(f.get('.writing-input').value,'Keep this draft');assert.match(f.get('#writing-pad').querySelector('.form-message').textContent,/Kunne ikke kopiere/);assert(!f.get('#writing-pad').querySelector('.form-message').hidden);
});
