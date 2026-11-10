const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../../public/stats.js'),M=require('../../public/tasks.js'),A=require('../../public/achievements.js'),D=require('../../public/sync-data.js');
const {appFixture}=require('../helpers/dom.cjs');
const weekly=s=>A.progress(s).filter(p=>p.scope==='week');
test('week begins Monday, including across years and the daylight-saving weekend',()=>{
 assert.equal(S.weekStart('2026-10-19'),'2026-10-19');assert.equal(S.weekStart('2026-10-25'),'2026-10-19');assert.equal(S.weekStart('2026-10-26'),'2026-10-26');assert.equal(S.weekStart('2027-1-1'),'2026-12-28');
});
test('opening alone counts distinct days and unlocks bronze, silver and gold once in a Monday–Sunday week',()=>{
 const state=M.fresh('2026-10-19');
 for(let i=0;i<7;i++){
  M.resetDay(state,`2026-10-${19+i}`);assert(S.visit(state));assert(!S.visit(state));assert.equal(S.weekDays(state),i+1);assert(state.tasks.every(t=>!t.checked));
  const ids=A.claim(state).map(p=>p.id);assert.deepEqual(ids,i===1?['weekly-return']:i===4?['weekly-five']:i===6?['weekly-seven']:[]);assert.deepEqual(A.claim(state),[]);
 }
 assert(weekly(state).every(p=>p.earned));assert.equal(S.summary(state.stats,state.day).trophies,3);
 const reload=M.restore(JSON.parse(JSON.stringify(state)),state.day);assert(weekly(reload).every(p=>p.earned));assert.deepEqual(A.claim(reload),[]);
 M.resetDay(reload,'2026-10-26');S.visit(reload);assert(weekly(reload).every(p=>!p.earned&&p.current===1));assert.equal(S.summary(reload.stats,reload.day).days,8);
});
test('weekly awards survive daily resets, are isolated from previous weeks, and round-trip through sync',()=>{
 const state=M.fresh('2026-10-19');S.visit(state);M.resetDay(state,'2026-10-20');S.visit(state);A.claim(state);
 const fields=D.capture(state);assert(fields['week/2026-10-19/achievement/weekly-return']);
 const next=D.materialize(fields,'2026-10-21').state;assert(weekly(next).find(p=>p.id==='weekly-return').earned);assert.equal(S.weekDays(next),2);S.visit(next);assert.deepEqual(A.claim(next),[]);
 const monday=D.materialize(fields,'2026-10-26').state;assert(weekly(monday).every(p=>!p.earned&&p.current===0));
});
test('old known activity days count, but dates outside the current week or after today do not',()=>{
 const s=M.fresh('2026-10-21');s.stats={'2026-10-18':{visited:true},'2026-10-19':{used:true},'2026-10-20':{visited:true},'2026-10-22':{visited:true}};assert.equal(S.weekDays(s),2);assert(A.claim(s).some(p=>p.id==='weekly-return'));
});
test('the app records a visit on opening, preserves it on reload, and labels weekly progress in days',()=>{
 const f=appFixture(),state=f.saved(),date=S.dateKey(state.day);assert(state.stats[date].visited);assert.equal(S.summary(state.stats,state.day).days,1);assert.equal(S.summary(state.stats,state.day).checked,0);
 const reload=appFixture(state);assert.equal(S.summary(reload.saved().stats,state.day).days,1);
 const row=f.get('#achievement-list').children.find(row=>row.querySelector('.achievement-title').textContent==='Velkommen tilbage!');assert.equal(row.querySelector('.achievement-count').textContent,'1 / 2 dage');assert(row.querySelector('.achievement-tier').textContent.includes('Denne uge'));
});

test('the same weekly award claimed offline on different dates counts once in lifetime statistics',()=>{
 const a=M.fresh('2026-10-20');a.stats={'2026-10-19':{visited:true}};S.visit(a);A.claim(a);
 const b=M.fresh('2026-10-21');b.stats={'2026-10-19':{visited:true}};S.visit(b);A.claim(b);
 const merged=S.merge(a.stats,b.stats);assert.equal(S.summary(merged,'2026-10-21').trophies,1);assert.equal(S.summary(merged,'2026-10-21').days,3);
});
