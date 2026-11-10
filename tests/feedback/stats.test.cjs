const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../../public/stats.js'),M=require('../../public/tasks.js'),A=require('../../public/achievements.js'),D=require('../../public/sync-data.js');
const {appFixture}=require('../helpers/dom.cjs');
test('lifetime counts survive undo, midnight, reload and sync materialization',()=>{
 const state=M.fresh('2026-10-19');M.toggle(state,'initial-0',0);A.claim(state);M.toggle(state,'initial-0',0);M.defer(state,'initial-1');A.claim(state);
 assert.equal(S.summary(state.stats,state.day).checked,1);assert.equal(S.summary(state.stats,state.day).deferred,1);assert.equal(S.summary(state.stats,state.day).trophies,2);
 const tomorrow=D.materialize(D.capture(state),'2026-10-20').state;assert(tomorrow.tasks.every(t=>!t.checked&&!t.deferred));assert.deepEqual(tomorrow.stats,state.stats);assert.equal(S.summary(tomorrow.stats,tomorrow.day).days,1);
 const reloaded=M.restore(JSON.parse(JSON.stringify(tomorrow)),tomorrow.day);assert.deepEqual(reloaded.stats,state.stats);
});
test('notes count first submission, note item checks and active deferrals only',()=>{
 const state=M.fresh('2026-10-19');M.toggle(state,'initial-1');M.submitWriting(state,'initial-2',['A','B','C']);M.submitWriting(state,'initial-2',['A','B','C']);
 const note=state.tasks[2];M.toggleWritingItem(state,note.id,note.writingItems[0].id);M.toggleWritingItem(state,note.id,note.writingItems[0].id);M.deferWritingItem(state,note.id,note.writingItems[1].id);M.defer(state,'initial-1');
 assert.equal(M.deferStatus(state,note.id),'passive');assert.equal(M.toggleWritingItem(state,note.id,note.writingItems[2].id),null);
 const stats=S.summary(state.stats,state.day);assert.equal(stats.notes,1);assert.equal(stats.checked,3);assert.equal(stats.deferred,2);assert.equal(stats.days,1);
 M.resetDay(state,'2026-10-20');M.submitWriting(state,note.id,['D','E','F']);assert.equal(S.summary(state.stats,state.day).notes,2);
});
test('streaks handle month and year boundaries, gaps and yesterday grace',()=>{
 const stats={};for(const day of ['2025-12-30','2025-12-31','2026-1-1','2026-1-3'])stats[day]={used:true};
 assert.equal(S.summary(stats,'2026-1-1').longest,3);assert.equal(S.summary(stats,'2026-1-4').current,1);assert.equal(S.summary(stats,'2026-1-5').current,0);assert.equal(S.summary(stats,'2026-1-3').days,4);
 assert.deepEqual(S.normalize({'2026-2-30':{used:true},bad:{checked:5}}),{});
 const merged=S.merge({'2026-1-1':{checked:4,deferred:1}},{'2026-01-01':{checked:2,deferred:3},'2026-1-2':{notes:1}});assert.equal(merged['2026-01-01'].checked,4);assert.equal(merged['2026-01-01'].deferred,3);assert.equal(S.summary(merged,'2026-1-2').current,2);
});
test('profile shows the seven stats and updates after task actions',()=>{
 const f=appFixture();assert.equal(f.get('#stat-checked').textContent,'0');
 f.get('#tasks-view').children[1].querySelector('.task').fire('click');f.flushRender();assert.equal(f.get('#stat-checked').textContent,'1');assert.equal(f.get('#stat-days').textContent,'1');assert.equal(f.get('#stat-trophies').textContent,'1');
 for(const key of ['checked','days','trophies','deferred','notes','longest','current'])assert(f.get('#stat-'+key));
});
