const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../../public/tasks.js'),T=require('../../public/task-json.js');
const {appFixture}=require('../helpers/dom.cjs');
function state(){const s=M.fresh('2026-10-16');s.tasks=[];M.add(s,'Skriv tre ting',null,'write');M.configureWriting(s,'write',{mode:'list',count:3});M.add(s,'Gå i gang','write','next');return s;}
test('writing requires submission of all fields and unlocks dependencies exactly once',()=>{
 const s=state();assert.equal(M.toggle(s,'write'),null);assert.deepEqual(M.visible(s).map(t=>t.id),['write']);
 assert.throws(()=>M.submitWriting(s,'write',['One','','Three']));assert(!s.tasks[0].checked);
 M.draftWriting(s,'write',['First draft']);assert(!s.tasks[0].checked);
 M.submitWriting(s,'write',['One','Two',' Three ']);assert(s.tasks[0].checked);assert.deepEqual(s.tasks[0].writingAnswer,['One','Two','Three']);assert.deepEqual(M.visible(s).map(t=>t.id),['write','next']);
 const order=s.tasks[0].completedOrder;M.submitWriting(s,'write',['Four','Five','Six']);assert.equal(s.tasks[0].completedOrder,order);
});
test('drafts and submitted notes persist locally and reset at midnight while definitions remain',()=>{
 const s=state();M.draftWriting(s,'write',['Draft']);let r=M.restore(JSON.parse(JSON.stringify(s)),s.day);assert.deepEqual(r.tasks[0].writingDraft,['Draft']);
 M.submitWriting(r,'write',['A','B','C']);r=M.restore(JSON.parse(JSON.stringify(r)),s.day);assert.deepEqual(r.tasks[0].writingAnswer,['A','B','C']);assert(r.tasks[0].checked);
 M.resetDay(r,'2026-10-17');assert.deepEqual(r.tasks[0].writingDraft,[]);assert.deepEqual(r.tasks[0].writingAnswer,[]);assert(!r.tasks[0].checked);assert.deepEqual(r.tasks[0].writing,s.tasks[0].writing);
});
test('deferred writing tasks cannot submit; writing tasks cannot form OR pairs',()=>{
 const s=state();M.defer(s,'write');assert.equal(M.submitWriting(s,'write',['A','B','C']),null);assert(!s.tasks[0].checked);
 M.defer(s,'write');M.submitWriting(s,'write',['A','B','C']);M.add(s,'Another',null,'other');assert.throws(()=>M.pair(s,'write','other'));
});
test('JSON and versions preserve writing settings but exclude personal answers and drafts',()=>{
 const s=state();M.submitWriting(s,'write',['Secret A','Secret B','Secret C']);const json=T.encode(s),tasks=T.parse(json);
 assert(!json.includes('Secret'));assert.deepEqual(tasks[0].writing,s.tasks[0].writing);
 const applied=T.apply(tasks,s,s.day);assert(applied.tasks[0].checked);assert.deepEqual(applied.tasks[0].writingAnswer,['Secret A','Secret B','Secret C']);
 for(const writing of [{mode:'list',count:0},{mode:'list',count:11},{mode:'html',count:1}])assert.throws(()=>T.parse(JSON.stringify({format:'starting-work-tasks',version:2,lists:[],tasks:[{id:'x',text:'X',writing}]})));
});
test('editor stages a note until submission and reopens the saved post-it',()=>{
 const f=appFixture();f.get('#edit').fire('click');
 const editor=f.get('#editor-list').children.find(row=>row.dataset.taskId==='initial-1');const type=editor.querySelector('.writing-type');type.value='note';type.fire('change');f.get('#close-editor').fire('click');
 const row=f.get('.checklist').children.find(row=>row.dataset.taskId==='initial-1'),button=row.querySelector('.task');button.fire('click');
 let pad=f.get('#writing-pad');assert(!pad.hidden);assert.equal(button.getAttribute('role'),'button');assert.equal(button.getAttribute('aria-checked'),undefined);
 let input=pad.querySelector('.writing-input');input.value='<script>plain text</script>\nA useful note';input.fire('input');assert.equal(f.saved().tasks.find(t=>t.id==='initial-1').writingDraft[0],undefined);
 const restored=appFixture(f.saved());restored.get('.checklist').children.find(row=>row.dataset.taskId==='initial-1').querySelector('.task').fire('click');assert.equal(restored.get('#writing-pad').querySelector('.writing-input').value,'');
 pad.querySelector('form').fire('submit');f.flushRender();assert(pad.hidden);assert(f.saved().tasks.find(t=>t.id==='initial-1').checked);
 const board=f.get('#notes-board');assert(!board.hidden);assert.equal(board.querySelector('.note-content').textContent,input.value);assert.equal(board.querySelector('script'),null);
 board.querySelector('.note-edit').fire('click');assert(!pad.hidden);assert.equal(pad.querySelector('.writing-input').value,input.value);
});

test('submitted list items join trophy progress, preserve checks across edits/reload, and reset daily',()=>{
 const A=require('../../public/achievements.js'),s=state();s.tasks=s.tasks.filter(t=>t.id==='write');
 M.submitWriting(s,'write',['First','Second','Third']);const task=s.tasks[0];
 assert.equal(M.achievementTasks(s).length,4);assert.equal(A.progress(s).find(p=>p.id==='daily-all').met,false);
 const first=task.writingItems[0];M.toggleWritingItem(s,'write',first.id);
 assert.equal(A.progress(s).find(p=>p.id==='daily-five').current,2);
 M.submitWriting(s,'write',['Second','First','New']);assert.equal(task.writingItems[1].id,first.id);assert(task.writingItems[1].checked);assert(!task.writingItems[2].checked);
 M.configureWriting(s,'write',{mode:'list',count:3,title:'Dagens vigtigste:'});assert(task.checked);assert(task.writingItems[1].checked);
 const restored=M.restore(JSON.parse(JSON.stringify(s)),s.day);assert(restored.tasks[0].writingItems[1].checked);
 for(const item of restored.tasks[0].writingItems)if(!item.checked)M.toggleWritingItem(restored,'write',item.id);
 assert(A.progress(restored).find(p=>p.id==='daily-all').met);
 const imported=T.apply(T.parse(T.encode(restored)),restored,restored.day);assert(imported.tasks[0].writingItems.every(item=>item.checked));
 const json=T.encode(imported);assert(!json.includes('writingItems'));assert(!json.includes('New'));assert(json.includes('Dagens vigtigste:'));
 M.resetDay(imported,'2026-10-17');assert.deepEqual(imported.tasks[0].writingItems,[]);assert.equal(M.achievementTasks(imported).length,1);
});
test('note movement persists locally without entering settings exports',()=>{
 const s=state();M.submitWriting(s,'write',['A','B','C']);M.moveNote(s,'write',{x:43,y:700,space:'list'});M.resizeNote(s,'write',{width:360,height:420});
 const restored=M.restore(JSON.parse(JSON.stringify(s)),s.day);assert.deepEqual(restored.tasks[0].notePosition,{x:43,y:700,space:'list'});assert.deepEqual(restored.tasks[0].noteSize,{width:360,height:420});assert.equal(M.resizeNote(s,'write',{width:-20,height:100}),null);
 assert.equal(M.moveNote(s,'write',{x:NaN,y:-5,space:'list'}),null);assert(!T.encode(s).includes('notePosition'));
});
test('saved list checkboxes use the common animations and update daily progress in the UI',()=>{
 const f=appFixture();f.get('#edit').fire('click');const editor=f.get('#editor-list').children.find(row=>row.dataset.taskId==='initial-1');
 const type=editor.querySelector('.writing-type');type.value='list';type.fire('change');f.get('#close-editor').fire('click');
 const row=f.get('.checklist').children.find(row=>row.dataset.taskId==='initial-1');row.querySelector('.task').fire('click');
 f.get('#writing-pad').querySelectorAll('.writing-input').forEach((input,i)=>{input.value=['Review data','Write methods','Go for a walk'][i];input.fire('input');});
 f.get('#writing-pad').querySelector('form').fire('submit');f.flushRender();
 const board=f.get('#notes-board');assert.equal(board.querySelector('h2').textContent,f.saved().tasks.find(t=>t.id==='initial-1').text);assert(board.querySelector('.note-pin'));
 const buttons=board.querySelectorAll('.note-task');assert.equal(buttons.length,3);buttons[0].fire('click');f.flushRender();
 assert.equal(buttons[0].getAttribute('aria-checked'),'true');assert(f.saved().tasks.find(t=>t.id==='initial-1').writingItems[0].checked);
 assert(row.querySelector('.small-note'));assert.equal(row.querySelectorAll('.small-note-squiggle').length,3);
 assert.equal(row.querySelector('.task').classList.contains('writing-completed'),true);
 buttons[0].fire('click');f.flushRender();assert.equal(buttons[0].getAttribute('aria-checked'),'false');
});

test('editing stays isolated from saved data and discarding preserves externally changed fields',()=>{
 const f=appFixture(),M=f.window.MorningTasks,state=M.fresh('2026-10-19');state.tasks=[];M.add(state,'Write',null,'write');M.configureWriting(state,'write',{mode:'list',count:3});
 const ui=f.window.MorningWriting.create({model:M,getState:()=>state,format:f.window.MorningFormatting,save(){},onSubmit(){},checkNewDay(){},animate(){},drawBox(){},drawMarks(){},onToggle(){}});
 ui.open('write');const inputs=f.get('#writing-pad').querySelectorAll('.writing-input');
 state.tasks[0].writingDraft=['Remote text','',''];inputs[1].value='Local text';inputs[1].fire('input');assert.deepEqual([...state.tasks[0].writingDraft],['Remote text','','']);
 ui.sync();assert.equal(inputs[0].value,'');assert.equal(inputs[1].value,'Local text');f.get('.note-compose-close').fire('click');assert(!f.get('.note-discard-confirm').hidden);f.get('.note-discard').fire('click');assert.deepEqual([...state.tasks[0].writingDraft],['Remote text','','']);
});

test('opening and submitting a note play paper sounds and the full header is its grip',()=>{
 const f=appFixture(state());let pickup=0,setdown=0;f.window.MorningSound.notePickup=()=>pickup++;f.window.MorningSound.noteSetdown=()=>setdown++;
 const row=f.get('.checklist').children.find(row=>row.dataset.taskId==='write');row.querySelector('.task').fire('click');assert.equal(pickup,1);assert.equal(setdown,0);
 f.get('#writing-pad').querySelectorAll('.writing-input').forEach((input,i)=>{input.value=['A','B','C'][i];input.fire('input');});f.get('#writing-pad').querySelector('form').fire('submit');f.flushRender();
 assert.equal(setdown,1);assert(f.get('#notes-board').querySelector('.note-grip').querySelector('h2'));assert(f.get('#notes-board').querySelector('.pin-cap'));assert(f.get('#notes-board').querySelector('.pin-hole'));
});

test('note items can be deferred, cannot then be completed, and preserve their state through edits and reloads',()=>{
 const s=state();M.submitWriting(s,'write',['A','B','C']);const item=s.tasks[0].writingItems[0];M.toggleWritingItem(s,'write',item.id);assert(item.checked);
 M.deferWritingItem(s,'write',item.id);assert(item.deferred);assert(!item.checked);assert.equal(M.toggleWritingItem(s,'write',item.id),null);
 const A=require('../../public/achievements.js');assert(A.claim(s).some(a=>a.id==='daily-defer-first'));
 M.submitWriting(s,'write',['B','A','C']);const restored=M.restore(JSON.parse(JSON.stringify(s)),s.day),retained=restored.tasks[0].writingItems.find(i=>i.id===item.id);
 assert(retained.deferred);assert.equal(retained.deferSeed,item.deferSeed);assert.equal(retained.deferredOrder,item.deferredOrder);
 M.deferWritingItem(restored,'write',item.id);assert(!retained.deferred);assert(M.toggleWritingItem(restored,'write',item.id).checked);
});
test('note list deferral uses scratch controls and supports undo in the UI',()=>{
 const f=appFixture(state());f.get('.checklist').children.find(r=>r.dataset.taskId==='write').querySelector('.task').fire('click');
 f.get('#writing-pad').querySelectorAll('.writing-input').forEach((input,i)=>{input.value=['A','B','C'][i];input.fire('input');});f.get('#writing-pad').querySelector('form').fire('submit');f.flushRender();
 const row=f.get('#notes-board').querySelector('.note-content').children[0],button=row.querySelector('.note-task'),defer=row.querySelector('.defer-button');
 defer.fire('click');f.flushRender();assert(button.classList.contains('deferred'));assert.equal(button.getAttribute('aria-disabled'),'true');assert(button.querySelector('.defer-strike').children.length);
 button.fire('click');assert(!f.saved().tasks[0].writingItems[0].checked);
 defer.fire('click');f.flushRender();assert(!button.classList.contains('deferred'));assert.equal(button.getAttribute('aria-disabled'),'false');
 const card=f.get('#notes-board').querySelector('.saved-note');card.fire('pointerdown',{pointerType:'touch'});assert(!card.classList.contains('note-controls-visible'));card.fire('pointerup',{pointerType:'touch'});assert(card.classList.contains('note-controls-visible'));
 f.doc.body.fire('pointerdown',{pointerType:'touch'});assert(!card.classList.contains('note-controls-visible'));assert(card.querySelector('.note-edit').querySelector('svg'));assert.equal(card.querySelector('.note-edit').getAttribute('aria-label'),'Rediger note');
});

test('a written note becomes one deferrable task by default and can be made plain without losing its answer',()=>{
 const s=state();M.configureWriting(s,'write',{mode:'note',count:1});M.submitWriting(s,'write',['Call the team']);const task=s.tasks[0],item=task.writingItems[0];assert.equal(task.writingItems.length,1);assert(M.achievementTasks(s).some(t=>t.id===item.id));
 M.deferWritingItem(s,'write',item.id);assert(item.deferred);M.deferWritingItem(s,'write',item.id);assert(M.toggleWritingItem(s,'write',item.id).checked);
 M.configureWriting(s,'write',{mode:'note',count:1,asTasks:false});assert.deepEqual(task.writingAnswer,['Call the team']);assert(!M.achievementTasks(s).some(t=>t.id===item.id));assert.equal(M.toggleWritingItem(s,'write',item.id),null);assert.equal(M.deferWritingItem(s,'write',item.id),null);
 const settings=T.parse(T.encode(s))[0].writing;assert.equal(settings.asTasks,false);assert.equal(settings.mode,'note');
});
test('plain list styles persist and validate without adding their items to the task pool',()=>{
 for(const listStyle of ['disc','decimal','upper-roman','upper-alpha','lower-alpha','lower-roman']){
  const s=state();M.configureWriting(s,'write',{mode:'list',count:3,asTasks:false,listStyle});M.submitWriting(s,'write',['A','B','C']);assert.equal(M.achievementTasks(s).length,2);
  assert.equal(M.restore(JSON.parse(JSON.stringify(s)),s.day).tasks[0].writing.listStyle,listStyle);assert.equal(T.parse(T.encode(s))[0].writing.listStyle,listStyle);
 }
 assert(!M.validWriting({mode:'list',count:3,asTasks:'yes'}));assert(!M.validWriting({mode:'list',count:3,listStyle:'unknown'}));
});
test('the editor selects a plain ordered list and the resulting note uses markers instead of checkboxes',()=>{
 const f=appFixture(state());f.get('#edit').fire('click');const row=f.get('#editor-list').children.find(r=>r.dataset.taskId==='write'),style=row.querySelector('.writing-content-style');assert.equal(style.value,'tasks');assert.equal(style.children.length,7);
 style.value='upper-roman';style.fire('change');f.get('#close-editor').fire('click');
 f.get('.checklist').children.find(r=>r.dataset.taskId==='write').querySelector('.task').fire('click');f.get('#writing-pad').querySelectorAll('.writing-input').forEach((input,i)=>{input.value=['A','B','C'][i];input.fire('input');});f.get('#writing-pad').querySelector('form').fire('submit');f.flushRender();
 const note=f.get('#notes-board').querySelector('.saved-note');assert(!note.querySelector('.note-task'));const list=note.querySelector('.note-plain-list');assert.equal(list.tag,'ol');assert.equal(list.getAttribute('data-list-style'),'upper-roman');assert.equal(list.children.length,3);
});
test('a single written task renders a large checkbox with deferral',()=>{
 const f=appFixture(state());f.get('#edit').fire('click');const row=f.get('#editor-list').children.find(r=>r.dataset.taskId==='write'),type=row.querySelector('.writing-type');type.value='note';type.fire('change');f.get('#close-editor').fire('click');
 f.get('.checklist').children.find(r=>r.dataset.taskId==='write').querySelector('.task').fire('click');const input=f.get('#writing-pad').querySelector('.writing-input');input.value='Call the team';input.fire('input');f.get('#writing-pad').querySelector('form').fire('submit');f.flushRender();
 const button=f.get('#notes-board').querySelector('.note-single-task');assert(button);assert.equal(button.getAttribute('aria-checked'),'false');const defer=button.closest('li').querySelector('.defer-button');defer.fire('click');assert(button.classList.contains('deferred'));
});

test('mobile note controls wait for a short paper tap and ignore scrolling, cancellation and task taps',()=>{
 const f=appFixture(state());f.get('.checklist').children.find(r=>r.dataset.taskId==='write').querySelector('.task').fire('click');
 f.get('#writing-pad').querySelectorAll('.writing-input').forEach((input,i)=>{input.value=['A','B','C'][i];input.fire('input');});f.get('#writing-pad').querySelector('form').fire('submit');f.flushRender();
 const card=f.get('#notes-board').querySelector('.saved-note'),task=card.querySelector('.note-task');
 card.fire('pointerdown',{pointerType:'touch'});assert(!card.classList.contains('note-controls-visible'));card.fire('pointermove',{pointerType:'touch',clientY:30});card.fire('pointerup',{pointerType:'touch',clientY:30});assert(!card.classList.contains('note-controls-visible'));
 card.fire('pointerdown',{pointerType:'touch'});card.fire('pointercancel',{pointerType:'touch'});card.fire('pointerup',{pointerType:'touch'});assert(!card.classList.contains('note-controls-visible'));
 task.fire('pointerdown',{pointerType:'touch'});task.fire('pointerup',{pointerType:'touch'});task.fire('click');assert(!card.classList.contains('note-controls-visible'));assert.equal(task.getAttribute('aria-checked'),'true');
 card.fire('pointerdown',{pointerType:'touch'});card.fire('pointerup',{pointerType:'touch'});assert(card.classList.contains('note-controls-visible'));
});


test('mouse input clears tapped note controls and takes over from keyboard focus',()=>{
 const f=appFixture(state());f.get('.checklist').children.find(r=>r.dataset.taskId==='write').querySelector('.task').fire('click');
 f.get('#writing-pad').querySelectorAll('.writing-input').forEach((input,i)=>{input.value=['A','B','C'][i];input.fire('input');});f.get('#writing-pad').querySelector('form').fire('submit');f.flushRender();
 const board=f.get('#notes-board'),card=board.querySelector('.saved-note');
 card.fire('pointerdown',{pointerType:'touch'});card.fire('pointerup',{pointerType:'touch'});assert(card.classList.contains('note-controls-visible'));assert.equal(board.getAttribute('data-note-input'),'touch');
 f.doc.body.fire('pointermove',{pointerType:'mouse'});assert(!card.classList.contains('note-controls-visible'));assert.equal(board.getAttribute('data-note-input'),'mouse');
 f.doc.body.fire('keydown',{key:'Tab'});assert.equal(board.getAttribute('data-note-input'),'keyboard');
 f.doc.body.fire('pointermove',{pointerType:'mouse'});assert.equal(board.getAttribute('data-note-input'),'mouse');
});


test('pin colour is assigned once, configurable, portable and does not reset note progress',()=>{
 const s=state(),task=s.tasks[0],color=task.writing.pinColor;assert(M.pinColors.includes(color));
 M.submitWriting(s,'write',['A','B','C']);M.toggleWritingItem(s,'write',task.writingItems[0].id);
 M.configureWriting(s,'write',{...task.writing,title:'Plans'});assert.equal(task.writing.pinColor,color);
 M.configureWriting(s,'write',{...task.writing,pinColor:'teal'});assert(task.checked);assert(task.writingItems[0].checked);assert.equal(task.writing.pinColor,'teal');
 assert.equal(T.parse(T.encode(s))[0].writing.pinColor,'teal');assert.equal(M.restore(s,s.day).tasks[0].writing.pinColor,'teal');
 assert(!M.validWriting({mode:'note',count:1,pinColor:'invalid'}));
});

test('editor offers ten pin colours and saves the selection',()=>{
 const f=appFixture(state());f.get('#edit').fire('click');let row=f.get('#editor-list').children.find(r=>r.dataset.taskId==='write');
 const picker=row.querySelector('.pin-picker');assert.equal(picker.tag,'details');assert(!picker.open);assert(row.querySelector('.pin-current').querySelector('svg'));picker.open=true;
 const choices=row.querySelector('.pin-color');assert.equal(choices.children.length,10);assert(choices.children.every(c=>c.querySelector('svg')));assert.equal(choices.children.filter(c=>c.getAttribute('aria-pressed')==='true').length,1);row.querySelector('.pin-choice-navy').fire('click');
 assert.equal(f.saved().tasks.find(t=>t.id==='write').writing.pinColor,'navy');row=f.get('#editor-list').children.find(r=>r.dataset.taskId==='write');assert.equal(row.querySelector('.pin-choice-navy').getAttribute('aria-pressed'),'true');assert(!row.querySelector('.pin-picker').open);assert(row.querySelector('.pin-current').getAttribute('aria-label').includes('Marineblå'));
 const heads=row.querySelectorAll('.pin-head').map(p=>p.getAttribute('d'));assert.equal(new Set(heads).size,10);
});

test('saved list content remains editable when row-count metadata is missing or stale',t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-02T12:00:00Z')});
 const D=require('../../public/sync-data.js'),values=['One','Two','Three','Four','Five','Six'];
 for(const count of [undefined,3]){
  const state=M.fresh('2026-11-02'),note=M.createTemporaryNote(state,'expanded',{mode:'list',count:3});M.editWritingList(state,note.id,values);M.submitWriting(state,note.id,values);
  note.noteItemCount=count;note.writingDraft=values.slice(0,3);
  for(const restored of [M.restore(JSON.parse(JSON.stringify(state)),state.day),D.materialize(D.capture(state),state.day).state]){
   const f=appFixture(restored);f.get('.note-edit').fire('click');let inputs=f.get('#writing-pad').querySelectorAll('.writing-input');assert.deepEqual(inputs.map(input=>input.value),values);
   f.get('#writing-pad').querySelector('form').fire('submit');assert.deepEqual(f.saved().tasks.find(t=>t.id==='expanded').writingAnswer,values);
   f.get('.note-edit').fire('click');f.get('.writing-remove').fire('click');f.get('#writing-pad').querySelector('form').fire('submit');
   const reloaded=appFixture(f.saved());reloaded.get('.note-edit').fire('click');assert.deepEqual(reloaded.get('#writing-pad').querySelectorAll('.writing-input').map(input=>input.value),values.slice(1));
  }
 }
});
