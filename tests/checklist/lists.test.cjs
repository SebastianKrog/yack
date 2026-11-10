const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../../public/tasks.js'),L=require('../../public/lists.js'),T=require('../../public/task-json.js'),D=require('../../public/sync-data.js'),A=require('../../public/achievements.js'),V=require('../../public/task-versions.js');
const {appFixture}=require('../helpers/dom.cjs');
const day='2026-10-20',schedule=(from,to,extra={})=>({frequency:'daily',interval:1,anchor:'2026-01-01',from,to,...extra});
function state(){const s=M.fresh(day);s.tasks=[];s.lists=[];for(const id of ['a','b','c'])M.add(s,id.toUpperCase(),null,id);s.lists=[];return s;}
const list=(id,taskIds,more={})=>({id,name:id,taskIds,group:'',schedule:null,...more});
const ids=(s,h=12)=>M.visible(s,10,L.at(s.day,h*60)).map(t=>t.id);
test('overlapping additive lists deduplicate shared tasks and keep first active-list ordering',()=>{
 const s=state();s.lists=[list('one',['b','a']),list('two',['a','c'])];assert.deepEqual(ids(s),['b','a','c']);assert.equal(A.rules['all-tasks'](s).target,3);s.lists.reverse();assert.deepEqual(ids(s),['a','c','b']);
});
test('exclusive groups choose their first matching list while other groups and additive lists still contribute',()=>{
 const s=state();s.lists=[list('override',['c'],{group:'morgen',schedule:schedule('10:00','11:00')}),list('normal',['a'],{group:'morgen',schedule:schedule('08:00','14:00')}),list('other',['b'],{group:'andet'}),list('add',['a'])];assert.deepEqual(L.active(s,L.at(day,10*60)).map(l=>l.id),['override','other','add']);assert.deepEqual(ids(s,12),['a','b']);assert.deepEqual(ids(s,10),['c','b','a']);
});
test('list and task requirements intersect, including shared and separate XOR schedules',()=>{
 const s=state();s.lists=[list('morning',['a','b','c'],{schedule:schedule('08:00','14:00')})];M.setSchedule(s,'a',schedule('10:00','18:00'));assert.deepEqual(ids(s,9),['b','c']);assert.deepEqual(ids(s,12),['a','b','c']);assert.deepEqual(ids(s,15),[]);M.pair(s,'a','b');M.setSchedule(s,'a',schedule('08:00','09:00'),1);assert.deepEqual(M.scheduledChoices(s,s.tasks[0],L.at(day,8*60)),[1]);M.setScheduleMode(s,'a','shared');M.setSchedule(s,'a',schedule('11:00','13:00'),'shared');assert.deepEqual(M.scheduledChoices(s,s.tasks[0],L.at(day,12*60)),[0,1]);assert.deepEqual(M.scheduledChoices(s,s.tasks[0],L.at(day,14*60)),[]);
});
test('shared task progress and active deferral survive list switches, reload, and cloud materialization',()=>{
 const s=state();s.lists=[list('first',['a'],{schedule:schedule('06:00','14:00')}),list('second',['a'],{schedule:schedule('18:00','23:00')})];assert(M.toggle(s,'a'));assert.equal(M.visible(s,10,L.at(day,19*60))[0].checked,true);M.toggle(s,'a');assert(M.defer(s,'a'));assert.equal(M.visible(s,10,L.at(day,19*60))[0].deferred,true);assert.equal(A.rules['deferred-count'](s,{target:1}).current,1);for(const restored of [M.restore(structuredClone(s),day),D.materialize(D.capture(s),day).state]){assert(restored.tasks[0].deferred);assert.deepEqual(restored.lists,s.lists);}M.resetDay(s,'2026-10-21');assert(!s.tasks[0].deferred);
});
test('gold target includes later lists but excludes exclusive lists that never win or impossible task windows',()=>{
 const s=state();s.lists=[list('morning',['a'],{schedule:schedule('06:00','14:00')}),list('evening',['b'],{schedule:schedule('18:00','23:00')}),list('winner',[],{group:'x'}),list('loser',['c'],{group:'x'})];M.toggle(s,'a');assert.deepEqual(A.rules['all-tasks'](s),{current:1,target:2});M.setSchedule(s,'b',schedule('01:00','02:00'));assert.deepEqual(A.rules['all-tasks'](s),{current:1,target:1});
});
test('overnight lists use starting weekday and Copenhagen clock handles DST',()=>{
 const s=state();s.lists=[list('night',['a'],{schedule:schedule('22:00','02:00',{days:[0]})})];assert.deepEqual(ids(s,1),['a']);assert.deepEqual(ids(s,2),[]);assert.deepEqual(ids(s,23),[]);s.day='2026-10-19';assert.deepEqual(ids(s,23),['a']);assert.equal(L.clock(new Date('2026-10-24T23:30:00Z')).getHours(),1);assert.equal(L.clock(new Date('2026-10-26T23:30:00Z')).getDate(),27);
});
test('assigning dependencies includes ancestors; removing a membership removes its branch only in that list',()=>{
 const s=state();M.update(s,'b','B','a');s.lists=[list('one',[]),list('two',['a','b'])];L.assign(s,'one','b');assert.deepEqual(s.lists[0].taskIds,['a','b']);L.unassign(s,'one','a');assert.deepEqual(s.lists[0].taskIds,[]);assert.deepEqual(s.lists[1].taskIds,['a','b']);assert.equal(s.tasks.length,3);
});
test('JSON v2 and local/cloud history restore list schedules, membership and order together',()=>{
 let s=state();s.lists=[list('one',['a','b'],{schedule:schedule('08:00','14:00')})];const storage=new Map(),store={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};let history=V.create({getState:()=>s,storage:store});history.record('Før',true);s.lists[0].name='Efter';s.lists[0].taskIds.reverse();history.record('Efter',true);assert.equal(history.list().length,2);history=V.create({getState:()=>s,storage:store});const exported=T.read(T.encode(s,history.list()));assert.deepEqual(exported.tasks.lists,s.lists);assert.deepEqual(exported.versions[0].lists[0].taskIds,['a','b']);const cloud=D.materialize(D.capture(s,history.list()),day);assert.deepEqual(cloud.state.lists,s.lists);assert.deepEqual(cloud.versions[0].lists[0].taskIds,['a','b']);const version=history.get(1);s=T.apply(T.parse(JSON.stringify({format:'starting-work-tasks',version:2,lists:version.lists,tasks:version.tasks})),s,day);assert.equal(s.lists[0].name,'one');assert.deepEqual(s.lists[0].taskIds,['a','b']);
});
test('combined display cap applies across lists and never hides active tasks',()=>{
 const s=state();for(let i=0;i<12;i++)M.add(s,'Task '+i,null,'n'+i);s.lists=[list('one',s.tasks.slice(0,7).map(t=>t.id)),list('two',s.tasks.slice(7).map(t=>t.id))];assert.equal(M.visible(s).length,15);for(const t of s.tasks.slice(0,8))M.toggle(s,t.id);assert.equal(M.visible(s).length,10);assert.equal(M.overflowTasks(s).length,5);
});
test('list editor creates lists, adds existing tasks with ancestors, and removes membership without deleting definitions',()=>{
 const f=appFixture();f.get('#edit').fire('click');f.get('.list-manager-heading').querySelectorAll('button').at(-1).fire('click');assert.equal(f.saved().lists.length,2);const select=f.get('.list-selection').querySelectorAll('select').at(-1);select.value='initial-2';select.fire('change');const current=f.saved().lists[1];assert.deepEqual(current.taskIds,['initial-1','initial-2']);assert.equal(f.get('#editor-list').children.length,2);f.get('#editor-list').children[0].querySelector('.remove-button').fire('click');assert.equal(f.saved().tasks.length,5);assert.deepEqual(f.saved().lists[1].taskIds,[]);
});
test('next matching time combines task and list requirements and reports impossible windows',()=>{
 const s=state();s.lists=[list('one',['a'],{schedule:schedule('08:00','10:00')})];assert.deepEqual(L.next(s,s.tasks[0],M.scheduled,L.at(day,7*60)),{day,time:'08:00'});M.setSchedule(s,'a',schedule('11:00','12:00'));assert.equal(L.next(s,s.tasks[0],M.scheduled,L.at(day,7*60)),null);
});
test('submitted notes remain visible and actionable after their list turns off',()=>{
 const s=state();s.day=require('../../public/reminders.js').today();s.lists=[list('one',['a'])];M.configureWriting(s,'a',{mode:'list',count:1});M.draftWriting(s,'a',['Note item']);M.submitWriting(s,'a',['Note item']);s.lists[0].schedule=schedule('01:00','02:00');assert(!M.scheduled(s,s.tasks[0]));assert(M.toggleWritingItem(s,'a',s.tasks[0].writingItems[0].id));assert(M.archiveNote(s,'a'));const f=appFixture(s);assert(f.saved().tasks[0].noteArchived);
});

test('list controls edit the current state after sync replaces the state object',()=>{
 const f=appFixture();let s=M.fresh(day),changed=0;const editor=f.window.MorningListEditor.create({getState:()=>s,onChange:()=>changed++,onSelect:()=>{},message:m=>{throw Error(m);}});editor.render();const name=f.get('.list-name-input');s=M.restore(structuredClone(s),day);name.value='Nyeste liste';name.fire('change');assert.equal(s.lists[0].name,'Nyeste liste');assert.equal(changed,1);
});

test('list picker and desktop navigation select the same task scope without editing definitions',()=>{
 const s=state();s.lists=[list('one',['a']),list('two',['b','c'])];const f=appFixture(s);f.get('#edit').fire('click');const picker=f.get('.list-mobile-picker').querySelector('select');picker.value='two';picker.fire('change');assert.equal(f.get('#editor-list').children.length,2);assert.equal(f.get('#editor-task-title').textContent,'Opgaver i two');assert.equal(f.get('.list-mobile-picker').querySelector('select').value,'two');assert.equal(f.get('.list-navigation').querySelectorAll('button')[1].getAttribute('aria-current'),'true');f.get('.list-navigation').querySelectorAll('button')[0].fire('click');assert.equal(f.get('#editor-list').children.length,1);assert.equal(f.get('.list-mobile-picker').querySelector('select').value,'one');assert.deepEqual(f.saved().lists,s.lists);
});
test('list overlap mode, group and priority update definitions, with settings retained after edits',()=>{
 const s=state();s.lists=[list('one',['a']),list('two',['b'])];const f=appFixture(s);f.get('#edit').fire('click');const settings=f.get('.list-settings');settings.open=true;settings.fire('toggle');const mode=f.get('.list-mode-select');mode.value='exclusive';mode.fire('change');assert.equal(f.saved().lists[0].group,'Min gruppe');assert(f.get('.list-settings').open);const group=f.get('.list-group-input');group.value='Morgen';group.fire('change');assert.equal(f.saved().lists[0].group,'Morgen');const order=f.get('.list-order-select');order.value='1';order.fire('change');assert.deepEqual(f.saved().lists.map(l=>l.id),['two','one']);assert.equal(f.get('.list-mobile-picker').querySelector('select').value,'one');const nextMode=f.get('.list-mode-select');nextMode.value='add';nextMode.fire('change');assert.equal(f.saved().lists[1].group,'');assert.equal(f.get('.list-group-input'),null);
});
test('list deletion confirmation preserves tasks and cancellation preserves the list',()=>{
 const f=appFixture();f.get('#edit').fire('click');const before=f.saved();let prompt;f.window.confirm=text=>{prompt=text;return false;};f.get('.list-delete').fire('click');assert.deepEqual(f.saved().lists,before.lists);assert(prompt.includes('Opgaverne bevares'));f.window.confirm=()=>true;f.get('.list-delete').fire('click');assert.equal(f.saved().lists.length,0);assert.equal(f.saved().tasks.length,before.tasks.length);assert.equal(f.get('#editor-task-title').textContent,'Alle opgaver');
});

test('typing a list name saves immediately and updates both navigation variants',()=>{
 const f=appFixture();f.get('#edit').fire('click');const name=f.get('.list-name-input');name.value='Morgen';name.fire('input');assert.equal(f.saved().lists[0].name,'Morgen');assert.equal(f.get('.list-nav-title').textContent,'Morgen');assert.equal(f.get('.list-mobile-picker').querySelector('select').querySelector('option').textContent,'Morgen');assert.equal(f.get('#editor-task-title').textContent,'Opgaver i Morgen');
});
