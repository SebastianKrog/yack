const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {appFixture}=require('../helpers/dom.cjs');
function fixture(){const f=appFixture();f.get('#edit').fire('click');return f;}
const row=(f,id)=>f.get('#editor-list').children.find(row=>row.dataset.taskId===id);
test('task settings are owned by their row and the schedule shortcut opens only the right inspector',()=>{
 const f=fixture(),first=row(f,'initial-0'),note=row(f,'initial-2');assert(!first.querySelector('.editor-inspector').open);assert(!note.querySelector('.editor-inspector').open);
 note.querySelector('.editor-schedule-summary').fire('click');assert(note.querySelector('.editor-inspector').open);assert(note.querySelector('.schedule-editor').open);assert(!first.querySelector('.editor-inspector').open);
 assert(note.querySelector('.editor-parent').textContent.includes('Åbn din dagsplan'));assert(note.querySelector('.note-title-input').closest('.editor-section'));assert.equal(first.querySelectorAll('.editor-choice').length,2);
});
test('changing a parent through settings updates the dependency, keeps the row expanded and excludes circular choices',()=>{
 const f=fixture(),note=row(f,'initial-2');note.querySelector('.editor-inspector').open=true;let parent=note.querySelector('.editor-parent-select');assert(!parent.children.some(option=>option.value==='initial-2'));
 parent.value='initial-4';parent.fire('change');assert.equal(f.saved().tasks.find(t=>t.id==='initial-2').parentId,'initial-4');assert(row(f,'initial-2').querySelector('.editor-inspector').open);assert(row(f,'initial-2').querySelector('.editor-parent').textContent.includes('Planlæg'));
 const root=row(f,'initial-4').querySelector('.editor-parent-select');assert(!root.children.some(option=>option.value==='initial-2'));
});
test('parent labels update when text is edited without rebuilding the current input',()=>{
 const f=fixture(),task=row(f,'initial-1'),input=task.querySelector('.edit-text');input.value='Ny dagsplan';input.fire('input');assert.equal(row(f,'initial-1').querySelector('.edit-text'),input);assert.equal(row(f,'initial-2').querySelector('.editor-parent').textContent,'Efter: Ny dagsplan');
});
test('switching OR schedule modes preserves expanded settings and task data',()=>{
 const f=fixture(),pair=row(f,'initial-0');pair.querySelector('.editor-inspector').open=true;const mode=pair.querySelector('.schedule-mode');mode.value='shared';mode.fire('change');const updated=row(f,'initial-0');assert(updated.querySelector('.editor-inspector').open);assert.equal(updated.querySelectorAll('.schedule-editor').length,1);assert.equal(f.saved().tasks[0].xor.otherText,'Åbn en Monster!');
});
test('verbose recurrence help is in focusable tooltip controls and editor fonts are scoped',()=>{
 const f=fixture(),note=row(f,'initial-2');const preset=note.querySelector('.schedule-editor').querySelector('select');preset.value='custom';preset.fire('change');assert(note.querySelector('.editor-tooltip'));
 assert(fs.readFileSync('public/editor.css','utf8').includes('system-ui'));assert(f.get('.editor-data'));assert(f.get('#editor-count').textContent.includes('5'));
});
test('dependency guides keep ancestor branches open across nested tasks and end at the final sibling',()=>{
 const saved=fixture().saved();saved.tasks.find(t=>t.id==='initial-3').parentId='initial-2';saved.tasks.find(t=>t.id==='initial-4').parentId='initial-1';
 const f=appFixture(saved);f.get('#edit').fire('click');
 assert(row(f,'initial-1').querySelector('.editor-tree-stem'));
 assert.equal(row(f,'initial-2').querySelectorAll('.editor-tree-end').length,0);
 const nested=row(f,'initial-3');assert.equal(nested.querySelectorAll('.editor-tree-line').length,2);assert.equal(nested.querySelectorAll('.editor-tree-end').length,1);assert.equal(nested.querySelector('.editor-tree-end').style['--tree-level'],1);
 assert(row(f,'initial-4').querySelector('.editor-tree-end'));assert.equal(row(f,'initial-0').querySelectorAll('.editor-tree-line').length,0);assert.equal(nested.querySelector('.editor-tree').getAttribute('aria-hidden'),'true');
 const parent=nested.querySelector('.editor-parent-select');parent.value='';parent.fire('change');assert(row(f,'initial-3').classList.contains('editor-root'));assert.equal(row(f,'initial-3').querySelectorAll('.editor-tree-line').length,0);
});

test('both back and close dismiss the editor overlay and preserve edits',()=>{
 const f=appFixture();for(const button of ['#back-editor','#close-editor']){
  f.get('#edit').fire('click');assert(f.get('#editor').open);
  const input=f.get('#editor-list').children[0].querySelector('.edit-text');input.value='Saved coffee';input.fire('input');
  f.get(button).fire('click');assert(!f.get('#editor').open);assert.equal(f.saved().tasks[0].text,'Saved coffee');
 }
});
