const test=require('node:test'),assert=require('node:assert/strict');
const {appFixture}=require('../helpers/dom.cjs');
const I=require('../../public/i18n.js');
const M=require('../../public/tasks.js');

test('automatic language chooses the first supported browser preference and falls back to English',()=>{
 assert.equal(I.detect(['fr-FR','da-DK','en-US']),'da');
 assert.equal(I.detect(['en-US','da-DK']),'en');
 assert.equal(I.detect(['de-DE']),'en');
 assert.equal(I.detect([]),'en');
 const f=appFixture(undefined,{languages:['de-DE']});
 assert.equal(f.doc.documentElement.lang,'en');
 assert.equal(f.get('#view-title').textContent,'Good morning!');
 assert.equal(f.get('#new-note').getAttribute('aria-label'),'New note');
 assert.equal(f.get('#yack-language').value,'auto');
 assert.match(f.get('#tasks-view').textContent,/Get coffee/);
 f.get('#plan-task').fire('click');
 assert.equal(f.get('#task-planner-title').textContent,'Plan task');
 assert.equal(f.get('#plan-task-preset').querySelector('option').textContent,'Now');
});

test('explicit language switches override the browser and relocalize untouched starter tasks without changing progress or sync fields',()=>{
 const danish=appFixture(undefined,{languages:['da-DK'],path:'/profile'});
 assert.equal(danish.get('#view-title').textContent,'Godmorgen!');
 const settings=danish.get('#yack-language');
 settings.value='en';settings.fire('change');
 assert(danish.window.reloaded);
 assert.equal(danish.storage.get('yack-language'),'en');
 const day=danish.window.MorningReminders.today(),saved=M.fresh(day);
 M.toggle(saved,'initial-1');
 const note=M.createTemporaryNote(saved,'custom-note',{mode:'note',count:1,title:'Min egen note'});
 M.submitWriting(saved,note.id,['En dansk note']);
 const english=appFixture(saved,{languages:['da-DK'],stored:danish.storage});
 assert.equal(english.doc.documentElement.lang,'en');
 const localized=english.window.MorningTasks.restore(saved,day);
 assert.equal(localized.tasks[0].text,'Get coffee');
 assert.equal(localized.tasks[1].text,'Open your plan for today.');
 assert(localized.tasks[1].checked);
 assert.equal(localized.lists[0].name,'My list');
 assert.equal(localized.tasks.find(t=>t.id==='custom-note').writingAnswer[0],'En dansk note');
 assert.equal(JSON.stringify(english.window.MorningSyncData.capture(localized)),JSON.stringify(english.window.MorningSyncData.capture(saved)));
 const back=appFixture(localized,{languages:['en-US'],stored:[['yack-language','da']]});
 assert.equal(back.window.MorningTasks.restore(localized,day).tasks[0].text,'Hent kaffe');
});

test('a changed starter list and its labels survive language switches as written',()=>{
 const day='2026-11-10',saved=M.fresh(day);
 saved.tasks[0].text='Drik te';
 const english=appFixture(saved,{languages:['en-US']});
 const restored=english.window.MorningTasks.restore(saved,day);
 assert.equal(restored.tasks[0].text,'Drik te');
 assert.equal(restored.tasks[1].text,'Åbn din dagsplan.');
 assert.equal(restored.lists[0].name,'Min liste');
 assert.match(english.window.MorningRecurrence.label({frequency:'weekly',interval:2,anchor:day}),/^Every 2 weeks/);
});
