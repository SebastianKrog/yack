const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../../public/tasks.js'),A=require('../../public/achievements.js'),D=require('../../public/sync-data.js'),T=require('../../public/task-json.js');
const {appFixture}=require('../helpers/dom.cjs');
function state(){const s=M.fresh('2026-10-20');s.tasks=[];for(const id of ['a','b']){M.add(s,id,null,id);M.configureWriting(s,id,{mode:'list',count:2});}return s;}
function finish(s,id){M.submitWriting(s,id,['One','Two']);const t=s.tasks.find(t=>t.id===id);M.toggleWritingItem(s,id,t.writingItems[0].id);M.deferWritingItem(s,id,t.writingItems[1].id);return t;}
test('four daily trophies have the specified tiers and unlock at their respective milestones',()=>{
 const s=state();const ids=()=>A.claim(s).map(p=>p.id);assert(!ids().length);
 M.submitWriting(s,'a',['One','Two']);assert(ids().includes('daily-note-created'));assert(!A.progress(s).find(p=>p.id==='daily-note-completed').met);
 let t=s.tasks[0];M.toggleWritingItem(s,t.id,t.writingItems[0].id);M.deferWritingItem(s,t.id,t.writingItems[1].id);assert(ids().includes('daily-note-completed'));
 M.archiveNote(s,'a');assert.equal(A.progress(s).find(p=>p.id==='daily-cleanup').current,1);finish(s,'b');M.archiveNote(s,'b');assert(ids().includes('daily-cleanup'));assert(!ids().length);
 const tiers=Object.fromEntries(A.definitions.map(d=>[d.id,d.tier]));assert.equal(tiers['daily-note-created'],'bronze');assert.equal(tiers['daily-note-completed'],'silver');assert.equal(tiers['daily-overflow'],'silver');assert.equal(tiers['daily-cleanup'],'bronze');
 M.resetDay(s,'2026-10-21');assert(A.progress(s).filter(p=>p.scope==='day').every(p=>!p.earned&&p.current===0));assert(s.tasks.every(t=>!t.noteArchived));
});
test('archive requires a finished note, is one-way for today, preserves followups and survives reload, import and sync',()=>{
 const s=state();M.add(s,'Followup','a','child');assert.equal(M.archiveNote(s,'a'),null);M.submitWriting(s,'a',['One','Two']);assert.equal(M.archiveNote(s,'a'),null);
 const t=s.tasks[0];t.writingItems.forEach(item=>M.toggleWritingItem(s,'a',item.id));assert(M.archiveNote(s,'a'));assert.equal(M.archiveNote(s,'a'),null);
 assert(!M.visible(s).some(t=>t.id==='a'));assert(M.visible(s).some(t=>t.id==='child'));assert.equal(M.overflowTasks(s).length,0);
 assert.equal(M.submitWriting(s,'a',['Changed','Again']),null);assert.equal(M.toggleWritingItem(s,'a',t.writingItems[0].id),null);assert.equal(M.defer(s,'a'),null);
 for(const restored of [M.restore(JSON.parse(JSON.stringify(s)),s.day),D.materialize(D.capture(s),s.day).state,T.apply(T.parse(T.encode(s)),s,s.day)])assert(restored.tasks.find(t=>t.id==='a').noteArchived);
 assert(!T.encode(s).includes('noteArchived'));assert(D.materialize(D.capture(s),'2026-10-21').state.tasks.every(t=>!t.noteArchived));
});
test('overflow trophy only counts eligible closed tasks lost to the ten-task cap',()=>{
 const s=M.fresh('2026-10-20');s.tasks=[];for(let i=0;i<11;i++)M.add(s,'Task '+i,null,String(i));
 assert.equal(M.visible(s).length,11);assert(!A.claim(s).some(p=>p.id==='daily-overflow'));M.toggle(s,'0');assert.equal(M.visible(s).length,10);assert.deepEqual(M.overflowTasks(s).map(t=>t.id),['0']);assert(A.claim(s).some(p=>p.id==='daily-overflow'));
 assert(!A.claim(s).some(p=>p.id==='daily-overflow'));M.resetDay(s,'2026-10-21');assert.equal(A.progress(s).find(p=>p.id==='daily-overflow').current,0);
});
test('archive button appears after the last note item finishes and hides the note until tomorrow',t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-20T10:00:00Z')});
 const s=state();M.submitWriting(s,'a',['One','Two']);const f=appFixture(s),board=f.get('#notes-board');let card=board.querySelector('.saved-note');assert(card.querySelector('.note-archive').hidden);
 const checks=card.querySelectorAll('.note-task');checks.forEach(button=>{button.fire('click');f.flushRender();});assert(!card.querySelector('.note-archive').hidden);
 card.querySelector('.note-archive').fire('click');f.flushRender();assert(!board.querySelector('.saved-note'));assert(f.saved().tasks.find(t=>t.id==='a').noteArchived);
 assert(!f.get('.checklist').children.some(li=>li.dataset.taskId==='a'));const reload=appFixture(f.saved());assert(!reload.get('#notes-board').querySelector('.saved-note'));
});
test('non-task notes can be tidied away after submission without earning the completion trophy',()=>{
 const s=state();M.configureWriting(s,'a',{mode:'note',count:1,asTasks:false});M.submitWriting(s,'a',['A reminder']);assert(M.canArchiveNote(s.tasks[0]));assert(!M.noteComplete(s.tasks[0]));assert(M.archiveNote(s,'a'));
});
