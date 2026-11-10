const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../../public/tasks.js'),D=require('../../public/sync-data.js');
const {appFixture}=require('../helpers/dom.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
function backend(){
 const users=new Map(),accounts=new Map();let offline=false,user='alice';
 async function fetcher(url,options={}){
  if(offline)throw new Error('Offline');const records=users.get(user)||new Map();users.set(user,records);
  const account=accounts.get(user)||{generation:1,deleted:false};accounts.set(user,account);
  if(!options.method)return {ok:true,json:async()=>({user:{id:user,name:user},generation:account.generation,deleted:account.deleted,records:[...records.values()].map(clone)})};
  const body=JSON.parse(options.body);if((body.generation||1)!==account.generation)return {ok:false,status:409,json:async()=>({reset:true})};
  if(body.action){
   if(body.action==='delete'&&body.confirmation!=='DELETE')return {ok:false,status:400,json:async()=>({error:'DELETE required'})};
   account.generation++;account.deleted=body.action==='delete';
   if(body.action==='clear'){
    const now=Date.now(),fields=D.overlay([...records.values()],{}),state=D.materialize(fields,'2026-10-19').state;
    records.set(`history/${now}-clear-cloud`,{key:`history/${now}-clear-cloud`,value:{createdAt:now,label:'Før rydning (onlineprofil)',...JSON.parse(require('../../public/task-json.js').encode(state)),snapshot:{day:'2026-10-19',fields:Object.fromEntries(Object.entries(fields).filter(([key])=>!key.startsWith('history/')))}},revision:1,op:'clear-backup',updatedAt:now});
    if(body.backup)records.set(`history/${now+1}-clear-local`,{key:`history/${now+1}-clear-local`,value:{...body.backup,createdAt:now+1,label:'Før rydning (denne enhed)'},revision:1,op:'clear-local-backup',updatedAt:now+1});
    for(const key of [...records.keys()])if(!key.startsWith('history/'))records.delete(key);
   }else records.clear();
   return {ok:true,json:async()=>({...account,records:[...records.values()].map(clone)})};
  }
  if(account.deleted)return {ok:false,status:409,json:async()=>({reset:true})};
  const accepted=[],conflicts=[];
  for(const op of body.ops){const old=records.get(op.key);
   if(old?.op===op.id)accepted.push(old);
   else if((old?.revision||0)!==op.base)conflicts.push(old);
   else{const next={key:op.key,value:clone(op.value),revision:(old?.revision||0)+1,op:op.id,updatedAt:Date.now()};records.set(op.key,next);accepted.push(next);}
  }return {ok:true,json:async()=>clone({accepted,conflicts})};
 }
 return {fetcher,users,setOffline:value=>offline=value,setUser:value=>user=value};
}
function client(server,{storage=new Map(),initial=M.fresh('2026-10-19')}={}){
 const f=appFixture(),data={state:clone(initial),versions:[]};
 const store={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 const ui=f.window.MorningSync.create({getState:()=>data.state,getVersions:()=>data.versions,apply:(state,versions)=>{data.applies=(data.applies||0)+1;data.state=state;data.versions=versions;},storage:store,fetcher:server.fetcher});
 return {ui,data,storage,f};
}
test('phone and PC merge checks with edits to a different task',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();assert(!pc.ui.inspect().setup);await pc.ui.choose('local');
 const phone=client(server);await phone.ui.start();assert(!phone.ui.inspect().setup);await phone.ui.choose('cloud');
 M.toggle(pc.data.state,'initial-0',0);pc.ui.capture();phone.data.state.tasks.find(t=>t.id==='initial-1').text='Edited on phone';phone.ui.capture();
 await pc.ui.sync();await phone.ui.sync();await pc.ui.sync();
 assert.equal(pc.data.state.tasks[0].checked,true);assert.equal(phone.data.state.tasks[0].checked,true);
 assert.equal(pc.data.state.tasks.find(t=>t.id==='initial-1').text,'Edited on phone');assert.equal(Object.keys(phone.ui.inspect().conflicts).length,0);
});
test('offline mutations survive a reload and upload on reconnection',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.choose('local');server.setOffline(true);
 M.toggle(pc.data.state,'initial-1');pc.ui.capture();await pc.ui.sync();assert(Object.keys(pc.ui.inspect().pending).length);
 const reloaded=client(server,{storage:pc.storage,initial:pc.data.state});await reloaded.ui.start();assert(Object.keys(reloaded.ui.inspect().pending).length);
 server.setOffline(false);await reloaded.ui.sync();assert.equal(Object.keys(reloaded.ui.inspect().pending).length,0);
 const phone=client(server);await phone.ui.start();await phone.ui.choose('cloud');assert(phone.data.state.tasks.find(t=>t.id==='initial-1').checked);
});
test('conflicting edits are preserved for an explicit choice instead of silently overwriting',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.choose('local');const phone=client(server);await phone.ui.start();await phone.ui.choose('cloud');
 pc.data.state.tasks[0].text='PC version';pc.ui.capture();phone.data.state.tasks[0].text='Phone version';phone.ui.capture();
 await pc.ui.sync();await phone.ui.sync();assert(Object.keys(phone.ui.inspect().conflicts).includes('def/initial-0'));assert.equal(phone.data.state.tasks[0].text,'Phone version');
 await phone.ui.resolve('local');await pc.ui.sync();assert.equal(pc.data.state.tasks[0].text,'Phone version');assert.equal(Object.keys(phone.ui.inspect().conflicts).length,0);
});
test('changing accounts never uploads the previous account’s cloud edits automatically',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.choose('local');pc.data.state.tasks[0].text='Alice private cloud edit';pc.ui.capture();await pc.ui.sync();
 server.setUser('bob');await pc.ui.sync();assert(!pc.ui.inspect().setup);assert.equal(pc.ui.inspect().owner,'bob');assert.equal(server.users.get('bob').size,0);assert.notEqual(pc.data.state.tasks[0].text,'Alice private cloud edit');
});
test('sync format preserves drafts, note checks, positions, trophy awards and history',()=>{
 const state=M.fresh('2026-10-19');M.toggle(state,'initial-1');M.submitWriting(state,'initial-2',['One','Two','Three']);const task=state.tasks.find(t=>t.id==='initial-2');M.toggleWritingItem(state,task.id,task.writingItems[1].id);M.draftWriting(state,task.id,['New draft','Two','Three']);M.moveNote(state,task.id,{x:50,y:700,space:'list'});M.resizeNote(state,task.id,{width:360,height:420});state.dailyAchievements.earned['daily-first']=123;
 const versions=[{createdAt:12,label:'Edited',lists:state.lists,tasks:JSON.parse(require('../../public/task-json.js').encode(state)).tasks}];
 const fields=D.capture(state,versions),restored=D.materialize(fields,state.day),note=restored.state.tasks.find(t=>t.id===task.id);
 assert(note.writingItems[1].checked);assert.deepEqual(note.writingDraft,['New draft','Two','Three']);assert.deepEqual(note.notePosition,{x:50,y:700,space:'list'});assert.deepEqual(note.noteSize,{width:360,height:420});assert.equal(restored.state.dailyAchievements.earned['daily-first'],123);assert.deepEqual(restored.versions.map(({syncKey,...version})=>version),versions);
 const tomorrow=D.materialize(fields,'2026-10-20');assert(tomorrow.state.tasks.every(t=>!t.checked&&!t.deferred));assert.equal(Object.keys(tomorrow.state.dailyAchievements.earned).length,0);
});

test('two devices can check different note entries without conflicting on the note itself',async()=>{
 const initial=M.fresh('2026-10-19');M.toggle(initial,'initial-1');M.submitWriting(initial,'initial-2',['One','Two','Three']);
 const server=backend(),pc=client(server,{initial});await pc.ui.start();await pc.ui.choose('local');const phone=client(server);await phone.ui.start();await phone.ui.choose('cloud');
 const p=pc.data.state.tasks.find(t=>t.id==='initial-2'),m=phone.data.state.tasks.find(t=>t.id===p.id);
 M.toggleWritingItem(pc.data.state,p.id,p.writingItems[0].id);pc.ui.capture();M.toggleWritingItem(phone.data.state,m.id,m.writingItems[1].id);phone.ui.capture();
 await pc.ui.sync();await phone.ui.sync();await pc.ui.sync();
 assert.equal(Object.keys(phone.ui.inspect().conflicts).length,0);assert(pc.data.state.tasks.find(t=>t.id===p.id).writingItems.slice(0,2).every(item=>item.checked));
});
test('earning the same trophy on two devices merges its award rather than asking about timestamp conflicts',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.choose('local');const phone=client(server);await phone.ui.start();await phone.ui.choose('cloud');
 pc.data.state.dailyAchievements.earned['daily-first']=100;pc.ui.capture();phone.data.state.dailyAchievements.earned['daily-first']=200;phone.ui.capture();
 await pc.ui.sync();await phone.ui.sync();assert.equal(Object.keys(phone.ui.inspect().conflicts).length,0);assert.equal(phone.data.state.dailyAchievements.earned['daily-first'],100);
});

test('checking the same task on both devices merges the shared intent despite different stroke seeds',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.choose('local');const phone=client(server);await phone.ui.start();await phone.ui.choose('cloud');
 M.toggle(pc.data.state,'initial-1');pc.ui.capture();M.toggle(phone.data.state,'initial-1');phone.ui.capture();await pc.ui.sync();await phone.ui.sync();
 assert.equal(Object.keys(phone.ui.inspect().conflicts).length,0);assert(phone.data.state.tasks.find(task=>task.id==='initial-1').checked);
});

test('profile clearing empties all shared data and discards stale offline uploads on the other device',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.choose('local');const phone=client(server);await phone.ui.start();await phone.ui.choose('cloud');
 M.toggle(phone.data.state,'initial-1');phone.ui.capture();assert(Object.keys(phone.ui.inspect().pending).length);
 assert(await pc.ui.manage('clear'));assert.equal(pc.data.state.tasks.length,0);await phone.ui.sync();assert.equal(phone.data.state.tasks.length,0);assert.equal(Object.keys(phone.ui.inspect().pending).length,0);assert([...server.users.get('alice').keys()].every(k=>k.startsWith('history/')));assert(pc.data.versions.some(v=>v.snapshot));
});
test('deleting a profile leaves sync disabled until it is explicitly recreated',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.choose('local');assert(await pc.ui.manage('delete','DELETE'));assert.equal(pc.data.state.tasks.length,0);await pc.ui.sync();assert(pc.ui.inspect().setup);assert.equal(server.users.get('alice').size,0);
 M.add(pc.data.state,'New beginning',null,'new');pc.ui.capture();await pc.ui.sync();assert.equal(server.users.get('alice').size,0);
 await pc.ui.choose('local');assert.equal(pc.data.state.tasks[0].text,'New beginning');assert(server.users.get('alice').size>0);
});
test('profile deletion requires a separate confirmation and the menu is anchored after the pencil',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.choose('local');
 pc.f.get('#profile-delete').fire('click');assert(!pc.f.get('#profile-confirm').hidden);assert(pc.f.get('#profile-confirm-message').textContent.includes('ChatGPT-konto'));assert(server.users.get('alice').size>0);
 pc.f.get('#profile-cancel').fire('click');assert(pc.f.get('#profile-confirm').hidden);
 const fs=require('node:fs'),html=fs.readFileSync('site/index.html','utf8');assert(html.indexOf('id="sync-toggle"')>html.indexOf('id="edit"'));assert(html.indexOf('id="sync-panel"')<html.indexOf('<main'));assert.equal(pc.f.get('#profile-label').textContent,'Profil');
});

test('profile hover is compact and click opens a separate profile page',async()=>{
 const pc=client(backend());await pc.ui.start();assert(pc.f.get('#sync-panel').hidden);
 pc.f.get('#sync-toggle').fire('pointerenter',{pointerType:'mouse'});assert(!pc.f.get('#profile-quick').hidden);assert(pc.f.get('#sync-panel').hidden);
 pc.f.get('#sync-toggle').fire('click');assert(!pc.f.get('#sync-panel').hidden);assert.equal(pc.f.get('#sync-toggle').getAttribute('aria-expanded'),'true');assert(pc.f.doc.body.classList.contains('profile-page-open'));
 pc.f.get('#sync-close').fire('click');assert(pc.f.get('#sync-panel').hidden);assert(!pc.f.doc.body.classList.contains('profile-page-open'));
 pc.f.get('#sync-toggle').fire('click');pc.f.get('#edit').fire('click');assert(pc.f.get('#sync-panel').hidden);assert(pc.f.get('#editor').open);
});
test('anonymous login bubble dismisses on hover, click or close and stays dismissed',async()=>{
 const anonymous={fetcher:async()=>({ok:true,json:async()=>({user:null})})};
 for(const action of ['hover','click','close']){
  const pc=client(anonymous);await pc.ui.start();assert(!pc.f.get('#profile-hint').hidden);
  if(action==='close')pc.f.get('#profile-hint-close').fire('click');else pc.f.get('#sync-toggle').fire(action==='hover'?'pointerenter':'click',{pointerType:'mouse'});
  assert(pc.f.get('#profile-hint').hidden);await pc.ui.sync();assert(pc.f.get('#profile-hint').hidden);
  const reopened=client(anonymous,{storage:pc.storage});await reopened.ui.start();assert(reopened.f.get('#profile-hint').hidden);
 }
});

test('profile uses only the first name with a separate logout link in its hover menu',async()=>{
 const server=backend();server.setUser('Sebastian M. Krog');const pc=client(server);await pc.ui.start();
 assert.equal(pc.f.get('#profile-label').textContent,'Profil');assert.equal(pc.f.get('#profile-quick-name').textContent,'Sebastian');assert(!pc.f.get('#profile-quick-signout').hidden);assert(pc.f.get('#profile-quick-signin').hidden);
 assert.equal(pc.f.get('#profile-quick-signout').getAttribute('href'),'/signout-with-chatgpt?return_to=%2F');
 pc.f.get('#profile-open').fire('click');assert(!pc.f.get('#sync-panel').hidden);
});

test('untouched defaults connect automatically to cloud, or become the first shared list',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();assert(!pc.ui.inspect().setup);assert(pc.f.get('#sync-choice-hint').hidden);await pc.ui.sync();assert(server.users.get('alice').has('order'));
 pc.data.state.tasks[0].text='A custom cloud task';pc.ui.capture();await pc.ui.sync();
 const phone=client(server);await phone.ui.start();assert(!phone.ui.inspect().setup);assert.equal(phone.data.state.tasks[0].text,'A custom cloud task');assert(phone.f.get('#sync-choice-hint').hidden);
});
test('custom lists prompt according to their saved dates and keep the choice on the profile',async()=>{
 for(const newer of [false,true]){
  const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.sync();pc.data.state.tasks[0].text='Cloud custom';pc.ui.capture();await pc.ui.sync();
  const initial=M.fresh('2026-10-19');initial.tasks[0].text='Local custom';
  const storage=new Map([['starting-work-list-modified-at',JSON.stringify(Date.now()+(newer?100000:-100000))]]),phone=client(server,{initial,storage});await phone.ui.start();
  assert(phone.ui.inspect().setup);assert(!phone.f.get('#sync-choice-hint').hidden);assert(phone.f.get('#profile-hint').hidden);
  assert(phone.f.get('#sync-choice-message').textContent.includes(newer?'lokale liste er nyere':'profilen er nyere'));
  assert.notEqual(phone.f.get('#sync-local-date').textContent,'Tidspunkt ukendt');assert.notEqual(phone.f.get('#sync-cloud-date').textContent,'Tidspunkt ukendt');
  phone.f.get('#sync-toggle').fire('pointerenter',{pointerType:'mouse'});assert(phone.f.get('#sync-choice-hint').hidden);await phone.ui.sync();assert(phone.f.get('#sync-choice-hint').hidden);
  phone.f.get('#sync-toggle').fire('click');assert(!phone.f.get('#sync-panel').hidden);assert(!phone.f.get('#sync-initial').hidden);assert(phone.f.get('#sync-comparison').textContent.includes('nyere'));
  phone.f.get(newer?'#sync-use-local':'#sync-use-cloud').fire('click');assert(phone.f.get('#sync-choice-confirm').open);phone.f.get('#sync-choice-confirm-ok').fire('click');await new Promise(resolve=>setImmediate(resolve));await phone.ui.sync();await pc.ui.sync();
  assert.equal(phone.data.state.tasks[0].text,newer?'Local custom':'Cloud custom');assert.equal(pc.data.state.tasks[0].text,phone.data.state.tasks[0].text);
 }
});
test('list-choice bubble also dismisses on close or profile click without losing choices',async()=>{
 for(const selector of ['#sync-choice-close','#sync-toggle']){
  const server=backend(),initial=M.fresh('2026-10-19');initial.tasks[0].text='Unsynced custom';const pc=client(server,{initial});await pc.ui.start();assert(!pc.f.get('#sync-choice-hint').hidden);
  pc.f.get(selector).fire('click');assert(pc.f.get('#sync-choice-hint').hidden);await pc.ui.sync();assert(pc.f.get('#sync-choice-hint').hidden);assert(pc.ui.inspect().setup);assert(server.users.get('alice').size===0);
 }
});

test('deferred note items sync between devices independently of their answers',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.sync();M.toggle(pc.data.state,'initial-1');M.submitWriting(pc.data.state,'initial-2',['A','B','C']);pc.ui.capture();await pc.ui.sync();
 const phone=client(server);await phone.ui.start();const item=pc.data.state.tasks.find(t=>t.id==='initial-2').writingItems[0];M.deferWritingItem(pc.data.state,'initial-2',item.id);pc.ui.capture();await pc.ui.sync();await phone.ui.sync();
 const remote=phone.data.state.tasks.find(t=>t.id==='initial-2').writingItems[0];assert(remote.deferred);assert.equal(remote.deferSeed,item.deferSeed);assert.equal(M.toggleWritingItem(phone.data.state,'initial-2',item.id),null);
 M.deferWritingItem(phone.data.state,'initial-2',item.id);phone.ui.capture();await phone.ui.sync();await pc.ui.sync();assert(!pc.data.state.tasks.find(t=>t.id==='initial-2').writingItems[0].deferred);
});

test('manual list replacement requires confirmation from both the bubble and profile actions',async()=>{
 for(const source of ['cloud','local']){
  const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.sync();pc.data.state.tasks[0].text='Cloud custom';pc.ui.capture();await pc.ui.sync();
  const initial=M.fresh('2026-10-19');initial.tasks[0].text='Local custom';const phone=client(server,{initial});await phone.ui.start();
  assert.equal(phone.f.get('#sync-choice-local-date').textContent,phone.f.get('#sync-local-date').textContent);assert.equal(phone.f.get('#sync-choice-cloud-date').textContent,phone.f.get('#sync-cloud-date').textContent);
  phone.f.get(source==='cloud'?'#sync-choice-cloud':'#sync-choice-local').fire('click');assert(phone.f.get('#sync-choice-confirm').open);assert(phone.f.get('#sync-choice-confirm-message').textContent.includes(source==='cloud'?'lokale opgaveliste':'onlineprofil'));
  assert.match(phone.f.get('#sync-choice-confirm-message').textContent,/Noter og påmindelser fra begge versioner bevares/);assert(!phone.f.get('#sync-choice-confirm-message').textContent.includes('slettet'));phone.f.get('#sync-choice-confirm-cancel').fire('click');assert(!phone.f.get('#sync-choice-confirm').open);await phone.ui.sync();await pc.ui.sync();assert.equal(pc.data.state.tasks[0].text,'Cloud custom');assert.equal(phone.data.state.tasks[0].text,'Local custom');
  phone.f.get(source==='cloud'?'#sync-use-cloud':'#sync-use-local').fire('click');phone.f.get('#sync-choice-confirm-ok').fire('click');await new Promise(resolve=>setImmediate(resolve));await pc.ui.sync();
  assert.equal(phone.data.state.tasks[0].text,source==='cloud'?'Cloud custom':'Local custom');assert.equal(pc.data.state.tasks[0].text,phone.data.state.tasks[0].text);assert(phone.storage.has('starting-work-before-first-sync'));assert(phone.storage.has('starting-work-before-sync-cloud'));
 }
});
test('explicitly configured default lists retrieve the online list automatically',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.sync();pc.data.state.tasks[0].text='My online list';pc.ui.capture();await pc.ui.sync();
 {
  const initial=M.fresh('2026-10-19');initial.tasks[2].writing={mode:'list',count:3,asTasks:true,title:initial.tasks[2].text,listStyle:'disc'};initial.tasks.forEach((t,i)=>t.boxSeed=i+99);
  const phone=client(server,{initial});await phone.ui.start();assert(!phone.ui.inspect().setup);assert.equal(phone.data.state.tasks[0].text,'My online list');assert(phone.f.get('#sync-choice-hint').hidden);assert(!phone.f.get('#sync-choice-confirm').open);
 }
 const custom=M.fresh('2026-10-19');custom.tasks[2].writing.title='My custom title';const other=client(server,{initial:custom});await other.ui.start();assert(other.ui.inspect().setup);
});

test('DELETE must be typed exactly before the profile confirmation can delete data and its backups',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.sync();assert(await pc.ui.manage('clear'));assert(pc.data.versions.some(v=>v.snapshot));
 assert.equal(await pc.ui.manage('delete'),false);pc.f.get('#profile-delete').fire('click');const input=pc.f.get('#profile-delete-text'),button=pc.f.get('#profile-confirm-action');assert(button.disabled);
 for(const value of ['delete','DELETE ']){input.value=value;input.fire('input');assert(button.disabled);button.fire('click');assert(server.users.get('alice').size>0);}
 input.value='DELETE';input.fire('input');assert(!button.disabled);button.fire('click');await new Promise(resolve=>setImmediate(resolve));assert.equal(server.users.get('alice').size,0);assert.equal(pc.data.versions.length,0);assert.equal(pc.data.state.tasks.length,0);
});
test('clearing locally retains a full history snapshot and task export excludes its private note content',async()=>{
 const anonymous={fetcher:async()=>({ok:true,json:async()=>({user:null})})},pc=client(anonymous);await pc.ui.start();M.toggle(pc.data.state,'initial-1');M.submitWriting(pc.data.state,'initial-2',['Private A','Private B','Private C']);pc.ui.capture();
 assert(await pc.ui.manage('clear'));assert.equal(pc.data.state.tasks.length,0);const backup=pc.data.versions.find(v=>v.snapshot);assert(backup);
 const restored=D.materialize(backup.snapshot.fields,'2026-10-19').state;assert.deepEqual(restored.tasks.find(t=>t.id==='initial-2').writingAnswer,['Private A','Private B','Private C']);assert(!require('../../public/task-json.js').encode(pc.data.state,pc.data.versions).includes('Private A'));
});

test('clear backups survive history reload and retain one shared history key',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.sync();pc.data.state.tasks[0].text='Before clearing';pc.ui.capture();assert(await pc.ui.manage('clear'));
 const history=pc.data.versions.map((entry,i)=>({...entry,revision:i+1})),values=new Map([['starting-work-task-versions',JSON.stringify({version:1,entries:history})]]),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 const V=require('../../public/task-versions.js'),reloaded=V.create({getState:()=>pc.data.state,storage}),backup=reloaded.list().find(v=>v.label.includes('denne enhed'));
 assert(backup?.snapshot);const restored=D.materialize(backup.snapshot.fields,'2026-10-19').state;assert.equal(restored.tasks[0].text,'Before clearing');
 const fields=D.capture(pc.data.state,reloaded.list());assert(fields[backup.syncKey]);assert.equal(Object.keys(fields).filter(key=>key.startsWith('history/')).length,history.length);
});


test('unchanged sync does not replace the current UI state',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.sync();
 const state=pc.data.state,applies=pc.data.applies||0;await pc.ui.sync();await pc.ui.sync();
 assert.equal(pc.data.state,state);assert.equal(pc.data.applies||0,applies);
 const phone=client(server);await phone.ui.start();phone.data.state.tasks[0].text='Changed remotely';phone.ui.capture();await phone.ui.sync();await pc.ui.sync();assert.equal(pc.data.state.tasks[0].text,'Changed remotely');assert((pc.data.applies||0)>applies);
});

test('background sync waits five minutes, skips hidden pages and keeps prompt edit uploads',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.now()});
 const server=backend();let requests=0;const fetcher=server.fetcher;server.fetcher=(...args)=>{requests++;return fetcher(...args);};
 const pc=client(server),events={};pc.f.window.addEventListener=(type,fn)=>events[type]=fn;await pc.ui.start();await pc.ui.sync();
 const poll=pc.f.intervals.find(i=>i.ms===300000);assert(poll);assert(!pc.f.intervals.some(i=>i.ms===8000));
 pc.f.doc.hidden=true;const count=requests;await poll.fn();assert.equal(requests,count);
 pc.f.doc.hidden=false;await events.focus();pc.f.doc.body.fire('visibilitychange');assert.equal(requests,count); // Initial request was less than a second ago.
 t.mock.timers.tick(300000);await poll.fn();assert.equal(requests,count+1);
 t.mock.timers.tick(2000);await events.focus();pc.f.doc.body.fire('visibilitychange');assert.equal(requests,count+2);
 pc.data.state.tasks[0].text='Save promptly';pc.ui.capture();const timer=[...pc.f.timers.values()].find(t=>t.ms===650);assert(timer);await timer.fn();assert.equal(server.users.get('alice').get('def/initial-0').value.text,'Save promptly');
});


test('all three top tabs toggle off on a second click and close other selected tabs',async()=>{
 const pc=client(backend());await pc.ui.start();const f=pc.f;
 for(const id of ['#sync-toggle','#edit','#crown']){
  f.get(id).fire('click');
  assert.equal(!f.get('#sync-panel').hidden,id==='#sync-toggle');assert.equal(!!f.get('#editor').open,id==='#edit');assert.equal(f.get('#crown').getAttribute('aria-pressed'),String(id==='#crown'));
  f.get(id).fire('click');assert(f.get('#sync-panel').hidden);assert(!f.get('#editor').open);assert.equal(f.get('#crown').getAttribute('aria-pressed'),'false');
 }
 f.get('#edit').fire('click');f.get('#sync-toggle').fire('click');assert(!f.get('#editor').open);assert(!f.get('#sync-panel').hidden);
 f.get('#crown').fire('click');assert(f.get('#sync-panel').hidden);assert.equal(f.get('#crown').getAttribute('aria-pressed'),'true');
 f.get('#sync-toggle').fire('click');assert.equal(f.get('#crown').getAttribute('aria-pressed'),'false');assert(!f.get('#sync-panel').hidden);
});

test('statistics silently retain daily maxima and union usage dates on both devices',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.choose('local');const phone=client(server);await phone.ui.start();await phone.ui.choose('cloud');
 pc.data.state.stats={'2026-10-19':{used:true,checked:8,deferred:1,notes:2,trophies:3},'2026-10-18':{used:true,checked:2}};pc.ui.capture();
 phone.data.state.stats={'2026-10-19':{used:true,checked:4,deferred:5,notes:1,trophies:4},'2026-10-17':{used:true,checked:1}};phone.ui.capture();
 await pc.ui.sync();await phone.ui.sync();await phone.ui.sync();await pc.ui.sync();
 const S=require('../../public/stats.js');assert.deepEqual(clone(pc.data.state.stats),clone(phone.data.state.stats));const stats=S.summary(pc.data.state.stats,'2026-10-19');assert.equal(stats.checked,11);assert.equal(stats.deferred,5);assert.equal(stats.notes,2);assert.equal(stats.trophies,4);assert.equal(stats.current,3);assert.equal(Object.keys(phone.ui.inspect().conflicts).length,0);
});
test('choosing either task list preserves the higher statistics from each side',async()=>{
 for(const source of ['local','cloud']){
  const server=backend(),pc=client(server);await pc.ui.start();pc.data.state.stats={'2026-10-19':{checked:10}};pc.ui.capture();await pc.ui.sync();
  const initial=M.fresh('2026-10-19');initial.tasks[0].text='Custom phone list';initial.stats={'2026-10-19':{deferred:7}};
  const phone=client(server,{initial});await phone.ui.start();await phone.ui.choose(source);await phone.ui.sync();await pc.ui.sync();
  const stats=require('../../public/stats.js').summary(phone.data.state.stats,phone.data.state.day);assert.equal(stats.checked,10);assert.equal(stats.deferred,7);
 }
});

test('archived notes sync across devices and stale archive flags cannot bring them back',async()=>{
 const initial=M.fresh('2026-10-20');M.submitWriting(initial,'initial-2',['One','Two','Three']);const task=initial.tasks.find(t=>t.id==='initial-2');task.writingItems.forEach(item=>M.toggleWritingItem(initial,task.id,item.id));
 const server=backend(),pc=client(server,{initial});await pc.ui.start();await pc.ui.choose('local');const phone=client(server,{initial});await phone.ui.start();await phone.ui.choose('cloud');
 assert(M.archiveNote(pc.data.state,task.id));pc.ui.capture();await pc.ui.sync();
 // Simulate a stale local record attempting to clear the flag at the same time.
 const key='day/2026-10-20/archive/initial-2',meta=phone.ui.inspect();meta.pending[key]={key,value:false,base:meta.records[key]?.revision||0,id:'stale-archive-false'};
 await phone.ui.sync();assert(phone.data.state.tasks.find(t=>t.id===task.id).noteArchived);assert.equal(Object.keys(phone.ui.inspect().conflicts).length,0);
 const fresh=client(server,{initial});await fresh.ui.start();await fresh.ui.choose('cloud');assert(fresh.data.state.tasks.find(t=>t.id===task.id).noteArchived);
});

test('visits union across phone and PC and a weekly trophy survives cloud reload without replay',async()=>{
 const S=require('../../public/stats.js'),A=require('../../public/achievements.js'),server=backend(),initial=M.fresh('2026-10-20');initial.stats={'2026-10-19':{visited:true}};
 const pc=client(server,{initial});await pc.ui.start();await pc.ui.choose('local');const phone=client(server,{initial:M.fresh('2026-10-20')});await phone.ui.start();await phone.ui.choose('cloud');
 S.visit(phone.data.state);phone.ui.capture();await phone.ui.sync();assert.equal(S.weekDays(phone.data.state),2);assert(A.claim(phone.data.state).some(p=>p.id==='weekly-return'));phone.ui.capture();await phone.ui.sync();await pc.ui.sync();
 assert.equal(S.weekDays(pc.data.state),2);assert(A.progress(pc.data.state).find(p=>p.id==='weekly-return').earned);assert(!A.claim(pc.data.state).some(p=>p.scope==='week'));
});
test('choosing either recurring list retains temporary notes from both devices without making a custom list',async()=>{
 const server=backend(),pc=client(server);pc.data.state.tasks[1].text='Custom cloud plan';await pc.ui.start();await pc.ui.choose('local');await pc.ui.sync();
 const cloud=M.createTemporaryNote(pc.data.state,'pc-note',{mode:'note',count:1});M.submitWriting(pc.data.state,cloud.id,['From PC']);pc.ui.capture();await pc.ui.sync();
 const phone=client(server),local=M.createTemporaryNote(phone.data.state,'phone-note',{mode:'note',count:1});M.submitWriting(phone.data.state,local.id,['From phone']);
 await phone.ui.start();assert.equal(phone.ui.inspect().setup,false);assert.equal(phone.data.state.tasks.find(t=>t.id==='initial-1').text,'Custom cloud plan');assert(phone.data.state.tasks.some(t=>t.id==='phone-note'));assert(phone.data.state.tasks.some(t=>t.id==='pc-note'));
 await phone.ui.sync();await pc.ui.sync();assert(pc.data.state.tasks.some(t=>t.id==='phone-note'));assert(!server.users.get('alice').has('def/phone-note'));
});
test('permanent notes sync across devices and keep progress after midnight without replacing recurring tasks',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.choose('local');await pc.ui.sync();const task=M.createTemporaryNote(pc.data.state,'keep-cross-device',{mode:'list',count:2});M.setNotePermanence(pc.data.state,task.id,true);M.submitWriting(pc.data.state,task.id,['A','B']);M.toggleWritingItem(pc.data.state,task.id,task.writingItems[0].id);pc.ui.capture();await pc.ui.sync();
 const phone=client(server);await phone.ui.start();await phone.ui.sync();let note=phone.data.state.tasks.find(t=>t.id===task.id);assert(note.permanentNote);assert(note.writingItems[0].checked);M.resetDay(phone.data.state,'2026-10-20');phone.ui.capture();await phone.ui.sync();note=phone.data.state.tasks.find(t=>t.id===task.id);assert(note.permanentNote);assert(note.writingItems[0].checked);assert(!server.users.get('alice').has('def/'+task.id));
 M.setNotePermanence(phone.data.state,task.id,false);phone.ui.capture();await phone.ui.sync();assert.equal(server.users.get('alice').get('note/definition/'+task.id).value,null);assert(phone.data.state.tasks.find(t=>t.id===task.id).temporaryDay);M.resetDay(phone.data.state,'2026-10-21');phone.ui.capture();await phone.ui.sync();assert(!phone.data.state.tasks.some(t=>t.id===task.id));
});
test('selecting the cloud recurring list preserves permanent notes made locally before login',async()=>{
 const server=backend(),pc=client(server);pc.data.state.tasks[1].text='Cloud plan';await pc.ui.start();await pc.ui.choose('local');await pc.ui.sync();
 const phone=client(server),task=M.createTemporaryNote(phone.data.state,'keep-before-login',{mode:'note',count:1});M.setNotePermanence(phone.data.state,task.id,true);M.submitWriting(phone.data.state,task.id,['Remember']);await phone.ui.start();await phone.ui.sync();assert.equal(phone.ui.inspect().setup,false);assert.equal(phone.data.state.tasks.find(t=>t.id==='initial-1').text,'Cloud plan');assert(phone.data.state.tasks.find(t=>t.id===task.id).permanentNote);await pc.ui.sync();assert(pc.data.state.tasks.find(t=>t.id===task.id).permanentNote);
});

test('a plugin-created reminder is retained when first login automatically keeps the default local list',async()=>{
 const server=backend(),state=M.fresh('2026-10-19');state.tasks=[];M.addReminder(state,'From ChatGPT','2026-10-22','reminder-fromchat01');
 server.users.set('alice',new Map(Object.entries(D.noteFields(state)).map(([key,value])=>[key,{key,value,revision:1,op:'mcp-first-reminder',updatedAt:1}])));
 const pc=client(server);await pc.ui.start();await pc.ui.sync();assert.equal(pc.ui.inspect().setup,false);assert(pc.data.state.tasks.some(t=>t.id==='reminder-fromchat01'));assert(pc.data.state.tasks.some(t=>t.id==='initial-0'));assert.equal(server.users.get('alice').get('reminder/definition/reminder-fromchat01').value.text,'From ChatGPT');
});
test('plugin definition changes merge with a device check without losing either change',async()=>{
 const server=backend(),initial=M.fresh('2026-10-19');M.addReminder(initial,'Original','2026-10-19','reminder-fromchat02');const pc=client(server,{initial});await pc.ui.start();await pc.ui.choose('local');
 M.toggle(pc.data.state,'reminder-fromchat02');pc.ui.capture();const records=server.users.get('alice'),key='reminder/definition/reminder-fromchat02',old=records.get(key);records.set(key,{...old,value:{...old.value,text:'Updated by ChatGPT'},revision:old.revision+1,op:'mcp-update'});
 await pc.ui.sync();const task=pc.data.state.tasks.find(t=>t.id==='reminder-fromchat02');assert(task.checked);assert.equal(task.text,'Updated by ChatGPT');assert.equal(Object.keys(pc.ui.inspect().conflicts).length,0);
});

test('list schedules and memberships sync while another device checks a shared task',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.choose('local');const phone=client(server);await phone.ui.start();await phone.ui.choose('cloud');
 pc.data.state.lists.push({id:'weekend',name:'Weekend',group:'',schedule:{frequency:'daily',interval:1,anchor:'2026-01-01',days:[5,6]},taskIds:['initial-0']});pc.ui.capture();M.toggle(phone.data.state,'initial-0',0);phone.ui.capture();await pc.ui.sync();await phone.ui.sync();await pc.ui.sync();assert.equal(phone.data.state.lists[1].name,'Weekend');assert(pc.data.state.tasks[0].checked);assert.equal(Object.keys(phone.ui.inspect().conflicts).length,0);
});

test('relative emphasis merges the earliest first-seen time across devices without a conflict',async()=>{
 const server=backend(),pc=client(server);await pc.ui.start();await pc.ui.choose('local');const phone=client(server);await phone.ui.start();await phone.ui.choose('cloud');pc.data.state.firstSeen={'initial-1':100000};pc.ui.capture();phone.data.state.firstSeen={'initial-1':200000};phone.ui.capture();await pc.ui.sync();await phone.ui.sync();await pc.ui.sync();assert.equal(phone.data.state.firstSeen['initial-1'],100000);assert.equal(pc.data.state.firstSeen['initial-1'],100000);assert.equal(Object.keys(phone.ui.inspect().conflicts).length,0);
});

test('stalled sync fetches and response bodies time out and allow a later retry',async()=>{
 const server=backend();let mode='fetch',signal;
 const pc=client({fetcher:(url,options)=>{signal=options.signal;if(mode==='fetch')return new Promise(()=>{});if(mode==='body')return Promise.resolve({ok:true,json:()=>new Promise(()=>{})});return server.fetcher(url,options);}});
 async function expire(promise){await new Promise(resolve=>setImmediate(resolve));const entry=[...pc.f.timers].find(([,timer])=>timer.ms===20000);assert(entry);pc.f.timers.delete(entry[0]);entry[1].fn();await promise;assert(signal.aborted);assert.match(pc.f.get('#sync-status').textContent,/Offline/);}
 await expire(pc.ui.start());mode='live';await pc.ui.sync();assert(pc.ui.inspect().owner);
 mode='body';await expire(pc.ui.sync());mode='live';await pc.ui.sync();assert.match(pc.f.get('#sync-status').textContent,/Synkroniseret/);
 M.toggle(pc.data.state,'initial-1');pc.ui.capture();await pc.ui.sync();assert.equal(Object.keys(pc.ui.inspect().pending).length,0);
});
test('Escape leaves the profile underneath a modal open',async()=>{
 const pc=client(backend());await pc.ui.start();pc.f.window.MorningTabs.show('profile');
 const viewer=pc.f.doc.createElement('dialog');pc.f.doc.body.append(viewer);viewer.showModal();pc.f.doc.root.fire('keydown',{key:'Escape'});
 assert(!pc.f.get('#sync-panel').hidden);viewer.close();pc.f.doc.root.fire('keydown',{key:'Escape'});assert(pc.f.get('#sync-panel').hidden);
});

test('a server-list loading error cannot hide a successful sign-in or upload local defaults',async()=>{
 let posts=0;const remote={user:{id:'alice',name:'Alice'},generation:1,records:[{key:'order',value:['a'],revision:1},{key:'def/a',value:{id:'a',text:'Server task'},revision:1}]};
 const pc=client({fetcher:async(url,options)=>{if(options.method){posts++;return {ok:true,json:async()=>({accepted:JSON.parse(options.body).ops.map(op=>({key:op.key,value:op.value,revision:op.base+1,op:op.id})),conflicts:[]})};}return {ok:true,json:async()=>remote};}});await pc.ui.start();
 assert(pc.f.get('#sync-signin').hidden);assert(!pc.f.get('#sync-signout').hidden);assert.equal(pc.f.get('#sync-account').textContent,'Alice');assert.match(pc.f.get('#sync-status').textContent,/logget ind/);assert(!pc.f.get('#sync-retry').hidden);assert.equal(posts,0);
 remote.records.push({key:'list-order',value:['default'],revision:1},{key:'list/default',value:{id:'default',name:'Min liste',group:'',schedule:null,taskIds:['a']},revision:1});await pc.ui.sync();await pc.ui.sync();assert.equal(pc.data.state.tasks[0].text,'Server task');assert.match(pc.f.get('#sync-status').textContent,/Synkroniseret/);
});
