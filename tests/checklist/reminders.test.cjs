const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../../public/reminders.js'),M=require('../../public/tasks.js'),D=require('../../public/sync-data.js'),T=require('../../public/task-json.js'),A=require('../../public/achievements.js');
const day='2026-10-20',id='reminder-test0001';
function state(){const s=M.fresh(day);s.tasks=[];return s;}
test('reminder calendar validates dates and uses Copenhagen midnight across DST',()=>{
 assert.equal(R.dateKey('2026-2-29'),null);assert.equal(R.dateKey('2028-2-29'),'2028-02-29');assert.equal(R.dateKey('2026-13-1'),null);
 assert.equal(R.today(new Date('2026-10-20T22:30:00Z')),'2026-10-21');assert.equal(R.today(new Date('2026-10-26T22:30:00Z')),'2026-10-26');
});
test('future reminders become tasks when due and remain overdue until handled',()=>{
 const s=state(),t=M.addReminder(s,'Husk brevet','2026-10-22',id);assert.equal(M.visible(s).length,0);assert.equal(M.achievementTasks(s).length,0);assert.equal(M.toggle(s,id),null);
 M.resetDay(s,'2026-10-22');assert.equal(M.visible(s)[0],t);assert.equal(A.rules['all-tasks'](s).target,1);
 M.resetDay(s,'2026-10-23');assert.equal(R.status(t,s.day),'overdue');assert.equal(M.visible(s).length,1);
 M.toggle(s,id);assert.equal(t.checkedDay,'2026-10-23');assert.equal(A.rules['completed-count'](s,{target:1}).current,1);
 M.resetDay(s,'2026-10-24');assert.equal(t.checked,true);assert.equal(M.visible(s).length,0);assert.equal(M.achievementTasks(s).length,0);assert.equal(A.rules['completed-count'](s,{target:1}).current,0);
});
test('deferral finishes a reminder once and does not count towards tomorrow’s trophy',()=>{
 const s=state(),t=M.addReminder(s,'Husk brevet',day,id);M.defer(s,id);assert.equal(t.deferredDay,day);assert.equal(M.toggle(s,id),null);assert.equal(A.rules['deferred-count'](s,{target:1}).current,1);
 M.resetDay(s,'2026-10-21');assert.equal(t.deferred,true);assert.equal(M.visible(s).length,0);assert.equal(A.rules['deferred-count'](s,{target:1}).current,0);
});
test('cancellation, editing and restoration preserve reminder identity and one-off semantics',()=>{
 const s=state();M.addReminder(s,'A',day,id);M.changeReminder(s,id,'2026-10-23','B');assert.equal(M.visible(s).length,0);M.cancelReminder(s,id);
 const restored=M.restore(JSON.parse(JSON.stringify(s)),'2026-10-24');assert.equal(restored.tasks[0].text,'B');assert(restored.tasks[0].reminder.cancelledAt);assert.equal(M.visible(restored).length,0);
 assert.throws(()=>M.changeReminder(s,id,day,'C'));assert.throws(()=>M.addReminder(s,'Bad','2026-02-30','reminder-test0002'));
});
test('reminder definition and completion round-trip through global cloud fields across midnight',()=>{
 const s=state(),t=M.addReminder(s,'A',day,id);t.reminder.requestHash='a'.repeat(64);M.toggle(s,id);const fields=D.capture(s);
 assert.deepEqual(fields.order,[]);assert(!fields['def/'+id]);assert(!fields[`day/${day}/status/${id}`]);assert(fields['reminder/status/'+id].checked);assert.equal(fields['reminder/definition/'+id].reminder.requestHash,'a'.repeat(64));
 const restored=D.materialize(fields,'2026-10-21').state;assert.equal(restored.tasks[0].checked,true);assert.equal(restored.tasks[0].checkedDay,day);assert.equal(M.visible(restored).length,0);
 assert(D.noteFields(s)['reminder/definition/'+id]);
});
test('recurring JSON imports and reordering preserve but do not export reminders',()=>{
 const s=M.fresh(day);M.addReminder(s,'One off',day,id);const json=T.encode(s);assert(!json.includes('One off'));
 const next=T.apply(T.parse(json),s,day);assert(next.tasks.some(t=>t.id===id&&t.reminder));M.place(next,'initial-3',0,0);assert(next.tasks.some(t=>t.id===id&&t.reminder));
 assert.throws(()=>M.add(next,'Child',id,'child'));assert.throws(()=>M.pair(next,id,'initial-3'));
});
test('malformed reminders are rejected rather than becoming daily recurring tasks',()=>{
 const s=state();s.tasks=[{id,text:'Bad',reminder:{date:'invalid'}}];assert.equal(M.restore(s,day).tasks.length,0);
});
test('profile controls add, edit and cancel reminders without adding to recurring exports',()=>{
 const {appFixture}=require('../helpers/dom.cjs'),f=appFixture();
 const date=R.today(),text=f.get('#reminder-add-text');text.value='Husk nøglerne';f.get('#reminder-add-date').value=date;f.get('#reminder-add').fire('submit');
 let saved=f.saved(),task=saved.tasks.find(t=>t.reminder);assert(task);assert.equal(task.text,'Husk nøglerne');assert(!T.encode(saved).includes('Husk nøglerne'));
 const row=f.get('#reminder-list').querySelector('form');row.querySelector('input').value='Husk telefonen';row.querySelector('input').fire('input');assert.equal(f.saved().tasks.find(t=>t.reminder).text,'Husk telefonen');
 const buttons=f.get('#reminder-list').querySelectorAll('button');buttons.find(b=>b.textContent==='Fjern').fire('click');assert(f.saved().tasks.find(t=>t.reminder).reminder.cancelledAt);assert.equal(f.get('#reminder-list').children.length,0);
});

test('reminder accordion summarizes title and date, preserves an expanded row, and autosaves dates',()=>{
 const {appFixture}=require('../helpers/dom.cjs'),f=appFixture(),today=R.today();f.get('#reminder-add-text').value='En længere påmindelse';f.get('#reminder-add-date').value=today;f.get('#reminder-add').fire('submit');const details=f.get('.reminder-accordion');assert.equal(details.open,false);assert.equal(details.getAttribute('name'),'profile-reminder');assert.equal(details.querySelector('summary').querySelector('.reminder-title').textContent,'En længere påmindelse');assert.equal(details.querySelector('time').getAttribute('datetime'),today);details.open=true;
 const row=details.querySelector('form'),date=row.querySelectorAll('input')[1],next=new Date(today+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+2);date.value=next.toISOString().slice(0,10);date.fire('change');assert.equal(f.saved().tasks.find(t=>t.reminder).reminder.date,date.value);assert.equal(details.querySelector('time').getAttribute('datetime'),date.value);assert(details.open);assert.equal(row.querySelectorAll('button').length,1);assert.equal(row.querySelector('button').textContent,'Fjern');assert.equal(row.querySelector('.reminder-saved').textContent,'Gemt');
});

test('overdue reminder wording can change without moving its due date',()=>{
 const s=state(),t=M.addReminder(s,'Original',day,id);M.resetDay(s,'2026-10-23');
 M.changeReminder(s,id,day,'Ny tekst');assert.equal(t.text,'Ny tekst');assert.equal(t.reminder.date,day);assert.equal(R.status(t,s.day),'overdue');
 assert.throws(()=>M.changeReminder(s,id,'2026-10-21','Wrong date'));assert.equal(t.text,'Ny tekst');
 M.changeReminder(s,id,'2026-10-24','Planlagt igen');assert.equal(R.status(t,s.day),'upcoming');
});
test('profile autosaves overdue reminder wording and preserves its date',()=>{
 const {appFixture}=require('../helpers/dom.cjs'),s=state();M.addReminder(s,'Original',day,id);const f=appFixture(s),row=f.get('#reminder-list').querySelector('form');
 const [text,date]=row.querySelectorAll('input');assert.equal(date.min,day);text.value='Rettet tekst';text.fire('input');
 const t=f.saved().tasks.find(t=>t.id===id);assert.equal(t.text,'Rettet tekst');assert.equal(t.reminder.date,day);assert.equal(row.querySelector('.reminder-saved').textContent,'Gemt');
});

test('planner presets use Copenhagen dates and choose a day in the current weekend',()=>{
 assert.equal(R.planDate('now','2026-11-10'),'2026-11-10');
 assert.equal(R.planDate('tomorrow','2026-12-31'),'2027-01-01');
 assert.equal(R.planDate('weekend','2026-11-10'),'2026-11-14');
 assert.equal(R.planDate('weekend','2026-11-14'),'2026-11-14');
 assert.equal(R.planDate('weekend','2026-11-15'),'2026-11-15');
});

test('planner creates a synced task that appears at its chosen time and expires at midnight',t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-10T09:00:00Z')});
 const {appFixture}=require('../helpers/dom.cjs'),f=appFixture();
 f.get('#plan-task').fire('click');
 assert(f.get('#task-planner').open);assert.equal(f.get('#plan-task-preset').value,'now');
 assert(f.get('#plan-task-custom').hidden);assert(!f.get('#plan-task-settings').open);
 assert.match(f.get('#plan-task-preview-date').textContent,/tirsdag/);
 assert.equal(f.get('#plan-task-calendar-day').textContent,'10');
 f.get('#plan-task-preset').value='specific';f.get('#plan-task-preset').fire('change');
 assert(!f.get('#plan-task-custom').hidden);
 f.get('#plan-task-date').value='2026-11-10';f.get('#plan-task-time').value='10:30';
 const effectSettings=f.get('#plan-task-effects');
 const effect=effectSettings.querySelector('select');
 effect.value='glow';effect.fire('change');
 assert.equal(effectSettings.querySelector('.emphasis-sample').textContent,'Animation');
 assert.equal(effectSettings.querySelector('.emphasis-sample').dataset.effect,'glow');
 const timing=effectSettings.querySelectorAll('select')[1];
 assert.equal(timing.value,'always');timing.value='after';timing.fire('change');
 const basis=effectSettings.querySelectorAll('select')[2];
 basis.value='visible';basis.fire('change');
 const minutes=effectSettings.querySelector('input');
 minutes.value='15';minutes.fire('change');
 f.get('#plan-task-text').value='Send dagsorden';f.get('#plan-task-form').fire('submit');
 assert(!f.get('#task-planner').open,f.get('#plan-task-message').textContent);
 const saved=f.saved(),task=saved.tasks.find(t=>t.text==='Send dagsorden');
 assert.equal(task.reminder.time,'10:30');assert.equal(task.reminder.dayOnly,true);
 const fields=D.capture(saved),synced=D.materialize(fields,saved.day).state,restored=synced.tasks.find(t=>t.id===task.id);
 assert.deepEqual(restored.emphasis,{effect:'glow',mode:'after',basis:'visible',minutes:15});
 assert(!M.scheduled(synced,restored));assert.equal(R.status(restored,synced.day),'upcoming');
 t.mock.timers.setTime(Date.parse('2026-11-10T09:30:00Z'));
 assert(M.scheduled(synced,restored));assert.equal(R.status(restored,synced.day),'due');
 M.resetDay(synced,'2026-11-11');
 assert(!M.scheduled(synced,restored));assert.equal(R.status(restored,synced.day),'expired');
});

test('a planned task can optionally carry over as overdue',()=>{
 const s=state(),task=M.addReminder(s,'Keep this task',day,id,{time:'14:00',dayOnly:false});
 M.resetDay(s,'2026-10-21');
 assert(M.scheduled(s,task));assert.equal(R.status(task,s.day),'overdue');
});
