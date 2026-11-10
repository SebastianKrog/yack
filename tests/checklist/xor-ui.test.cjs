const test=require('node:test');
const assert=require('node:assert/strict');
const {appFixture}=require('../helpers/dom.cjs');
const M=require('../../public/tasks.js');
function row(f,id){return f.get('.checklist').children.find(r=>r.dataset.taskId===id);}
test('new page boots with inline options and one disabled shared checkbox and defer button',()=>{
 const f=appFixture(),r=row(f,'initial-0');assert(r);assert.equal(r.querySelectorAll('.xor-option').length,2);assert.equal(r.querySelectorAll('.defer-button').length,1);assert.equal(r.querySelector('.xor-or').textContent,'ELLER');
 const box=r.querySelector('.xor-checkbox');assert.equal(box.getAttribute('aria-disabled'),'true');box.fire('click');assert(!f.saved().tasks[0].checked);
 r.querySelectorAll('.xor-option')[1].fire('click');assert(f.saved().tasks[0].checked);assert.equal(f.saved().tasks[0].xor.choice,1);assert.equal(box.getAttribute('aria-checked'),'true');
 assert(r.querySelectorAll('.xor-option')[0].classList.contains('deferred'));assert(r.querySelectorAll('.xor-option')[1].classList.contains('completed'));
});
test('shared defer button defers both choices but stores and counts one active deferral',()=>{
 const f=appFixture(),r=row(f,'initial-0');r.querySelector('.defer-button').fire('click');
 assert(r.querySelectorAll('.xor-option').every(o=>o.classList.contains('deferred')));assert.equal(f.saved().tasks.filter(t=>t.deferred).length,1);
 assert('daily-defer-first' in f.saved().dailyAchievements.earned);
 r.querySelector('.defer-button').fire('click');assert(!f.saved().tasks[0].deferred);assert(r.querySelectorAll('.xor-option').every(o=>!o.classList.contains('deferred')));
});
test('editor pairs, edits both texts, offers scoped dependency buttons and splits again',()=>{
 const f=appFixture();f.get('#edit').fire('click');
 const editorRow=id=>f.get('#editor-list').children.find(r=>r.dataset.taskId===id);
 const pair=editorRow('initial-1').querySelector('.xor-editor-action');assert.equal(pair.textContent,'Kombinér med næste');pair.fire('click');
 const plan=f.saved().tasks.find(t=>t.id==='initial-1');assert.equal(plan.xor.otherId,'initial-3');assert.equal(plan.xor.otherText,'Tjek ikke dine mails');
 const inputs=editorRow('initial-1').querySelectorAll('.edit-text');assert.equal(inputs.length,2);inputs[1].value='**Ingen mails!**';inputs[1].fire('input');assert.equal(f.saved().tasks.find(t=>t.id==='initial-1').xor.otherText,'**Ingen mails!**');
 assert.equal(editorRow('initial-2').querySelectorAll('.dependency-choice')[2].textContent,'Ingen mails!');
 let choices=editorRow('initial-2').querySelectorAll('.dependency-choice');assert.equal(choices.length,3);assert.equal(choices[1].getAttribute('aria-pressed'),'true');choices[0].fire('click');assert.equal(f.saved().tasks.find(t=>t.id==='initial-2').parentChoice,null);
 choices=editorRow('initial-2').querySelectorAll('.dependency-choice');choices[2].fire('click');assert.equal(f.saved().tasks.find(t=>t.id==='initial-2').parentChoice,1);
 row(f,'initial-1').querySelectorAll('.xor-option')[0].fire('click');f.flushRender();assert(!row(f,'initial-2'));
 row(f,'initial-1').querySelectorAll('.xor-option')[0].fire('click');f.flushRender();row(f,'initial-1').querySelectorAll('.xor-option')[1].fire('click');f.flushRender();assert(row(f,'initial-2'));
 editorRow('initial-1').querySelector('.xor-editor-action').fire('click');assert(!f.saved().tasks.find(t=>t.id==='initial-1').xor);assert.equal(f.saved().tasks.find(t=>t.id==='initial-3').text,'**Ingen mails!**');assert.equal(f.saved().tasks.find(t=>t.id==='initial-2').parentId,'initial-3');
});
test('booting an existing local list leaves its task definitions and dependencies intact',()=>{
 const old=M.fresh('2026-10-13');old.tasks[0].text='My custom coffee task';delete old.tasks[0].xor;old.tasks[2].parentId=null;
 const f=appFixture(old),saved=f.saved();assert.equal(saved.tasks[0].text,'My custom coffee task');assert(!saved.tasks[0].xor);assert.equal(saved.tasks[2].parentId,null);assert(!row(f,'initial-0').querySelector('.xor-options'));
});

test('active OR deferral scratches across both choices and ELLER with the main hatching pattern',()=>{
 const f=appFixture(),r=row(f,'initial-0');r.querySelector('.defer-button').fire('click');
 const group=r.querySelector('.xor-options'),overlay=group.querySelector('.xor-group-defer-strike');
 assert(overlay);assert.equal(overlay.children.length,1);
 const path=overlay.querySelector('path').getAttribute('d');assert(path.includes(' Q'));assert(!path.includes(' C'));
 // The mock group measures 500px across; the scratch spans that full area.
 const endpoints=[...path.matchAll(/ Q[\d.-]+ [\d.-]+ ([\d.-]+) [\d.-]+/g)].map(match=>Number(match[1]));
 assert(Math.max(...endpoints)>490);
 assert(r.querySelectorAll('.xor-option').every(option=>option.querySelector('.defer-strike').children.length===0));
 r.querySelectorAll('.xor-option')[0].fire('click');
 assert(f.saved().tasks[0].deferred);assert.equal(overlay.children.length,1);
 r.querySelector('.defer-button').fire('click');f.flushRender();r.querySelectorAll('.xor-option')[0].fire('click');
 assert.equal(overlay.children.length,0);
 const passive=r.querySelectorAll('.xor-option')[1].querySelector('.defer-strike').querySelector('path').getAttribute('d');
 assert(passive.includes(' C'));assert(!passive.includes(' Q'));
});
