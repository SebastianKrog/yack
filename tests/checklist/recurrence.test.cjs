const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../../public/recurrence.js'),M=require('../../public/tasks.js'),T=require('../../public/task-json.js'),D=require('../../public/sync-data.js'),A=require('../../public/achievements.js');
const {appFixture}=require('../helpers/dom.cjs');
const schedule=(more={})=>({frequency:'daily',interval:1,anchor:'2026-10-19',...more});
const at=(date,h=12,m=0)=>new Date(...[...date.split('-').map(Number)].map((n,i)=>i===1?n-1:n),h,m);
const match=(s,date,h=12,m=0)=>R.matches(s,date,at(date,h,m));
test('weekday inclusion supports weekends and excluding Monday',()=>{
 const weekends=schedule({days:[5,6]}),noMonday=schedule({days:[1,2,3,4,5,6]});
 assert(!match(weekends,'2026-10-19'));assert(match(weekends,'2026-10-24'));assert(match(weekends,'2026-10-25'));assert(!match(noMonday,'2026-10-19'));assert(match(noMonday,'2026-10-20'));
 assert.throws(()=>R.normalize(schedule({days:[]})));assert.throws(()=>R.normalize(schedule({interval:0})));assert.throws(()=>R.normalize(schedule({until:'2026-10-18'})));
});
test('daily, weekly and date-limited repeats anchor to calendar dates and Monday weeks',()=>{
 const daily=schedule({interval:3,until:'2026-10-25'});assert(match(daily,'2026-10-19'));assert(!match(daily,'2026-10-20'));assert(match(daily,'2026-10-25'));assert(!match(daily,'2026-10-28'));
 const weekly=schedule({frequency:'weekly',interval:2,days:[0,2]});assert(match(weekly,'2026-10-21'));assert(!match(weekly,'2026-10-28'));assert(match(weekly,'2026-11-2'));assert(!match(weekly,'2026-11-3'));
 assert(match(schedule({frequency:'weekly'}),'2026-10-26'));assert(!match(schedule({frequency:'weekly'}),'2026-10-20'));
 const once=schedule({frequency:'once'});assert(match(once,'2026-10-19'));assert(!match(once,'2026-10-20'));
});
test('monthly dates clamp short months and ordinal and last-weekday rules work',()=>{
 const monthly=schedule({frequency:'monthly',anchor:'2026-1-31'});assert(match(monthly,'2026-2-28'));assert(match(monthly,'2026-3-31'));assert(!match(monthly,'2026-3-28'));
 const firstMonday=schedule({frequency:'monthly',anchor:'2026-10-5',monthMode:'weekday'});assert(match(firstMonday,'2026-11-2'));assert(!match(firstMonday,'2026-11-9'));
 const lastMonday=schedule({frequency:'monthly',monthMode:'last-weekday'});assert(match(lastMonday,'2026-10-26'));assert(!match(lastMonday,'2026-11-23'));assert(match(lastMonday,'2026-11-30'));
 assert(match(schedule({frequency:'yearly',anchor:'2024-2-29'}),'2026-2-28'));
});
test('time windows update at exact boundaries and overnight ranges belong to their starting day',()=>{
 const day=schedule({from:'08:00',to:'10:00'});assert(!match(day,'2026-10-20',7,59));assert(match(day,'2026-10-20',8));assert(!match(day,'2026-10-20',10));
 const night=schedule({days:[0],from:'22:00',to:'02:00'});assert(match(night,'2026-10-19',23));assert(match(night,'2026-10-20',1));assert(!match(night,'2026-10-20',2));assert(!match(night,'2026-10-20',23));
});
function state(){const s=M.fresh('2026-10-20');s.tasks=[];M.add(s,'A',null,'a');M.add(s,'B',null,'b');return s;}
test('schedules persist through pair, unpair, restore, JSON, versions and cloud fields',()=>{
 const s=state();M.setSchedule(s,'a',schedule({days:[1]}));M.setSchedule(s,'b',schedule({days:[5,6]}));M.pair(s,'a','b');
 for(const restored of [M.restore(JSON.parse(JSON.stringify(s)),s.day),T.apply(T.parse(T.encode(s)),s,s.day),D.materialize(D.capture(s),s.day).state]){assert.deepEqual(restored.tasks[0].schedule,s.tasks[0].schedule);assert.deepEqual(restored.tasks[0].xor.otherSchedule,s.tasks[0].xor.otherSchedule);}
 M.unpair(s,'a');assert.deepEqual(s.tasks.find(t=>t.id==='b').schedule.days,[5,6]);assert.deepEqual(s.tasks[0].schedule.days,[1]);assert.throws(()=>T.parse(JSON.stringify({format:'starting-work-tasks',version:2,lists:[],tasks:[{id:'bad',text:'Bad',schedule:{frequency:'bad'}}]})));
});
test('an OR with one eligible side acts like a standard task and keeps specific dependencies correct',()=>{
 const s=state();M.pair(s,'a','b');M.setSchedule(s,'a',schedule({days:[5,6]}),0);M.add(s,'Either','a','either');M.add(s,'Only A','a','only-a');M.setDependencyChoice(s,'only-a',0);M.add(s,'Only B','a','only-b');M.setDependencyChoice(s,'only-b',1);
 const task=s.tasks[0],view=M.displayTask(s,task);assert.equal(view.xor,undefined);assert.equal(view.text,'B');assert.equal(M.toggle(s,'a',0),null);assert(M.toggle(s,'a'));assert.equal(task.xor.choice,1);
 assert.deepEqual(M.visible(s).map(t=>t.id),['a','either','only-b']);assert.equal(M.achievementTasks(s).length,3);M.toggle(s,'a');assert(!task.checked);assert(M.defer(s,'a'));assert(M.displayTask(s,task).deferred);
 M.setSchedule(s,'a',schedule({days:[5,6]}),1);assert.deepEqual(M.visible(s),[]);assert.equal(M.achievementTasks(s).length,0);assert.equal(A.progress(s).find(p=>p.id==='daily-all').target,0);
});
test('editor presets create persistent requirements and a single OR option renders without ELLER',()=>{
 const s=state();M.pair(s,'a','b');const f=appFixture(s);f.get('#edit').fire('click');const row=f.get('#editor-list').children[0],schedules=row.querySelectorAll('.schedule-editor');assert.equal(schedules.length,2);
 const preset=schedules[0].querySelector('select');preset.value='weekend';preset.fire('change');assert.deepEqual(f.saved().tasks[0].schedule.days,[5,6]);f.get('#close-editor').fire('click');
 const main=f.get('#tasks-view');assert.equal(main.querySelector('.xor-task'),null);assert.equal(main.querySelector('.text').textContent,'B');main.querySelector('.task').fire('click');f.flushRender();assert.equal(f.saved().tasks[0].xor.choice,1);assert.equal(main.querySelector('.task').getAttribute('aria-checked'),'true');
});

test('explicit month dates allow the first, second and multiple dates and explicit ordinal weekdays',()=>{
 const dates=schedule({frequency:'monthly',anchor:'2026-10-1',monthDays:[1,2,15]});assert(match(dates,'2026-11-1'));assert(match(dates,'2026-11-2'));assert(match(dates,'2026-11-15'));assert(!match(dates,'2026-11-3'));
 const secondTuesday=schedule({frequency:'monthly',monthMode:'weekday',ordinals:[2],weekday:1});assert(match(secondTuesday,'2026-11-10'));assert(!match(secondTuesday,'2026-11-3'));
 const fifthMonday=schedule({frequency:'monthly',monthMode:'weekday',ordinals:[5],weekday:0});assert(!match(fifthMonday,'2026-10-26'));assert(match(fifthMonday,'2026-11-30'));assert.throws(()=>R.normalize(schedule({monthDays:[0]})));
});

test('first AND third Monday can be selected together and persist in JSON',()=>{
 const rule=schedule({frequency:'monthly',anchor:'2026-10-1',monthMode:'weekday',ordinals:[1,3],weekday:0});
 for(const date of ['2026-10-5','2026-10-19','2026-11-2','2026-11-16'])assert(match(rule,date),date);
 for(const date of ['2026-10-12','2026-10-26','2026-10-20','2026-11-9'])assert(!match(rule,date),date);
 const s=state();M.setSchedule(s,'a',rule);assert.deepEqual(T.parse(T.encode(s))[0].schedule.ordinals,[1,3]);assert(R.label(rule).includes('1. og 3. mandag'));
});

test('OR pairs switch between one shared schedule and independent schedules without losing either',()=>{
 const s=state();M.pair(s,'a','b');M.setSchedule(s,'a',schedule({days:[1]}),0);M.setSchedule(s,'a',schedule({days:[5,6]}),1);
 M.setScheduleMode(s,'a','shared');assert.deepEqual(M.scheduledChoices(s,s.tasks[0]),[0,1]);assert(M.displayTask(s,s.tasks[0]).xor);
 M.setSchedule(s,'a',schedule({days:[5,6]}),'shared');assert.deepEqual(M.visible(s),[]);
 M.setScheduleMode(s,'a','separate');assert.deepEqual(M.scheduledChoices(s,s.tasks[0]),[0]);assert.equal(M.displayTask(s,s.tasks[0]).text,'A');
 M.setScheduleMode(s,'a','shared');assert.deepEqual(M.visible(s),[]);M.setSchedule(s,'a',null,'shared');assert.deepEqual(M.scheduledChoices(s,s.tasks[0]),[0,1]);
 for(const restored of [M.restore(JSON.parse(JSON.stringify(s)),s.day),T.apply(T.parse(T.encode(s)),s,s.day),D.materialize(D.capture(s),s.day).state]){
  assert.equal(restored.tasks[0].xor.scheduleMode,'shared');assert.equal(restored.tasks[0].xor.sharedSchedule,null);assert.deepEqual(restored.tasks[0].schedule.days,[1]);assert.deepEqual(restored.tasks[0].xor.otherSchedule.days,[5,6]);assert.deepEqual(M.scheduledChoices(restored,restored.tasks[0]),[0,1]);
 }
 M.setSchedule(s,'a',schedule({days:[1]}),'shared');M.unpair(s,'a');assert(s.tasks.every(t=>t.schedule.days[0]===1));
});
test('the OR editor shows one shared control or two separate controls and remembers the mode',()=>{
 const s=state();M.pair(s,'a','b');const f=appFixture(s);f.get('#edit').fire('click');let row=f.get('#editor-list').children[0];assert.equal(row.querySelectorAll('.schedule-editor').length,2);
 let mode=row.querySelector('.schedule-mode');mode.value='shared';mode.fire('change');row=f.get('#editor-list').children[0];assert.equal(row.querySelectorAll('.schedule-editor').length,1);assert(row.querySelector('.schedule-editor').querySelector('summary').textContent.startsWith('Fælles'));
 const preset=row.querySelector('.schedule-editor').querySelector('select');preset.value='weekend';preset.fire('change');assert.deepEqual(f.saved().tasks[0].xor.sharedSchedule.days,[5,6]);
 mode=row.querySelector('.schedule-mode');mode.value='separate';mode.fire('change');row=f.get('#editor-list').children[0];assert.equal(row.querySelectorAll('.schedule-editor').length,2);assert.deepEqual(f.saved().tasks[0].xor.sharedSchedule.days,[5,6]);
});

test('schedule summaries show implicit weekdays and inclusive date bounds',()=>{
 const weekly=R.label({frequency:'weekly',anchor:'2026-10-29',until:'2026-11-30'});
 assert.match(weekly,/tor/);assert.match(weekly,/fra 29\.10\.2026/);assert.match(weekly,/til og med 30\.11\.2026/);
 const explicit=R.label({frequency:'weekly',anchor:'2026-10-29',days:[0,2]});assert.match(explicit,/man, ons/);assert(!explicit.includes('tor'));
 assert.match(R.label({frequency:'yearly',anchor:'2026-10-29'}),/den 29\.10\./);
 assert.equal(R.label({frequency:'once',anchor:'2026-10-29'}),'29.10.2026');
});
