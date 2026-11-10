const test=require('node:test'),assert=require('node:assert/strict');
const {database}=require('../helpers/database.cjs');
const D=require('../../public/sync-data.js'),T=require('../../public/task-json.js'),M=require('../../public/tasks.js');
const user={userId:'alice',email:'alice@example.com'},bob={userId:'bob',email:'bob@example.com'},now=Date.parse('2026-10-22T10:00:00Z');
const call=async(db,name,args={},who=user)=>(await import('../../server/task-list-mcp.mjs')).callTaskTool(name,args,db,who,{now});
const read=db=>call(db,'get_task_list');
function saving(list,modify=()=>{},request_id=crypto.randomUUID()){const document=structuredClone(list.document);modify(document.tasks);return {revision:list.revision,document,request_id,label:'Opdateret arbejdsstart'};}
async function seed(db){const list=await read(db);await call(db,'save_task_list',saving(list));return await read(db);}
async function put(db,key,value,owner=user.userId){await db.prepare('INSERT INTO sync_records(owner,record_key,payload,revision,last_op,updated_at) VALUES(?,?,?,1,?,?) ON CONFLICT(owner,record_key) DO UPDATE SET payload=excluded.payload,revision=sync_records.revision+1,last_op=excluded.last_op,updated_at=excluded.updated_at').bind(owner,key,JSON.stringify(value),crypto.randomUUID(),now).run();}
const rows=async db=>(await db.prepare('SELECT record_key,payload,revision FROM sync_records WHERE owner=? ORDER BY record_key').bind(user.userId).all()).results;
test('list reads are authenticated, isolated, read-only and supply stable editable defaults',async()=>{
 const db=database();await assert.rejects(call(db,'get_task_list',{},null),/Log ind/);
 const a=await read(db),b=await read(db);assert.equal(a.source,'standard');assert.equal(a.timezone,'Europe/Copenhagen');assert.equal(a.today,'2026-10-22');assert.deepEqual(a.document,b.document);assert.equal(a.revision,b.revision);assert.equal((await rows(db)).length,0);
 await call(db,'save_task_list',saving(a,tasks=>tasks[1].text='Min egen plan'));assert.equal((await read(db)).document.tasks[1].text,'Min egen plan');assert.equal((await call(db,'get_task_list',{},bob)).source,'standard');
 await assert.rejects(call(db,'get_task_list',{owner:'bob'}),/Ukendt felt/);
});
test('one save edits text/order, adds scheduled dependent notes and ELLER choices, and creates restorable versions',async()=>{
 const db=database(),list=await seed(db),args=saving(list,tasks=>{
  tasks[1].text='Åbn din **dagsplan**';tasks.unshift(tasks.splice(4,1)[0]);
  tasks.push({id:'monthly-note',text:'Skriv månedens prioriteter',parentId:'initial-1',writing:{mode:'list',count:3,title:'Månedens prioriteter:',asTasks:true,paperType:'dots',pinColor:'teal',align:'left'},schedule:{frequency:'monthly',anchor:'2026-10-22',monthMode:'weekday',weekday:0,ordinals:[1,3]}});
  tasks[1].xor.scheduleMode='shared';tasks[1].xor.sharedSchedule={frequency:'weekly',anchor:'2026-10-22',days:[0,1,2,3,4]};
 });
 const saved=await call(db,'save_task_list',args),after=await read(db);assert(saved.saved);assert.equal(saved.replayed,false);assert.equal(saved.revision,after.revision);assert.equal(after.document.tasks[0].id,'initial-4');assert.equal(after.document.tasks.find(t=>t.id==='monthly-note').parentId,'initial-1');assert.deepEqual(after.document.tasks.find(t=>t.id==='monthly-note').schedule.ordinals,[1,3]);assert(after.document.tasks.every(t=>Number.isSafeInteger(t.boxSeed)));
 const all=await rows(db),before=JSON.parse(all.find(r=>r.record_key===saved.backup_key).payload),version=JSON.parse(all.find(r=>r.record_key===saved.version_key).payload);assert.deepEqual(before.tasks,list.document.tasks);assert.deepEqual(version.tasks,after.document.tasks);
 const materialized=D.materialize(Object.fromEntries(all.map(r=>[r.record_key,JSON.parse(r.payload)])),'2026-10-22');assert(materialized.versions.some(v=>v.label==='Opdateret arbejdsstart'));assert.equal(T.apply(T.parse(JSON.stringify({format:'starting-work-tasks',version:2,tasks:before.tasks,lists:before.lists})),materialized.state,'2026-10-22').tasks[0].id,list.document.tasks[0].id);
});
test('removal tombstones only explicit missing definitions and leaves progress, notes, reminders, stats and positions byte-identical',async()=>{
 const db=database(),list=await seed(db);const keep={
 'day/2026-10-22/status/initial-1':{checked:true,markSeed:17,completedOrder:1},'day/2026-10-22/draft/initial-2/0':'Arbejd videre',
 'note/definition/sticky':{id:'sticky',text:'Fast note',writing:{mode:'note',count:1}},'note/status/sticky':{checked:true},
 'reminder/definition/reminder-test':{id:'reminder-test',text:'Ring til tandlægen',reminder:{date:'2026-10-23',createdAt:now,updatedAt:now}},'stats/2026-10-22':{checked:15},'position/initial-2':{x:60,y:300,space:'list'}};
 for(const [key,value] of Object.entries(keep))await put(db,key,value);const unchanged=(await rows(db)).filter(r=>Object.hasOwn(keep,r.record_key));
 await call(db,'save_task_list',saving(list,tasks=>{tasks.splice(tasks.findIndex(t=>t.id==='initial-3'),1);tasks.find(t=>t.id==='initial-1').text='Åbn dagens plan';}));
 const after=await rows(db);assert.deepEqual(after.filter(r=>Object.hasOwn(keep,r.record_key)),unchanged);assert.equal(after.find(r=>r.record_key==='def/initial-3').payload,'null');const fields=Object.fromEntries(after.map(r=>[r.record_key,JSON.parse(r.payload)])),state=D.materialize(fields,'2026-10-22').state;assert(state.tasks.find(t=>t.id==='initial-1').checked);assert(state.tasks.find(t=>t.id==='sticky').permanentNote);assert(!state.tasks.some(t=>t.id==='initial-3'));
});
test('stale saves cannot overwrite another device or add partial history; identical retries return one result',async()=>{
 const db=database(),list=await seed(db),args=saving(list,tasks=>tasks[1].text='Plan fra ChatGPT');const a=await call(db,'save_task_list',args),after=await rows(db),retry=await call(db,'save_task_list',args);assert(retry.replayed);assert.equal(retry.revision,a.revision);assert.deepEqual(await rows(db),after);
 await assert.rejects(call(db,'save_task_list',{...args,label:'Anden ændring'}),/request_id/);
 await assert.rejects(call(db,'save_task_list',saving(list,tasks=>tasks[3].text='Forældet')),/ændret et andet sted/);assert.deepEqual(await rows(db),after);
 const latest=await read(db);await put(db,'def/from-phone',{id:'from-phone',text:'En ny opgave',parentId:null,parentChoice:null});const before=await rows(db);await assert.rejects(call(db,'save_task_list',saving(latest)),/ændret et andet sted/);assert.deepEqual(await rows(db),before);
});
test('the atomic guard catches an intervening edit after validation, without a partial list or backups',async()=>{
 const db=database(),list=await seed(db),batch=db.batch;let before;
 db.batch=async statements=>{await put(db,'def/initial-1',{...list.document.tasks[1],text:'Redigeret på telefonen'});before=await rows(db);return batch(statements);};
 await assert.rejects(call(db,'save_task_list',saving(list,tasks=>{tasks[1].text='ChatGPT';tasks.push({id:'new-task',text:'Ny opgave'});})),/ændret et andet sted/);assert.deepEqual(await rows(db),before);
});
test('concurrent identical retries have one transaction winner and one version pair',async()=>{
 const db=database(),list=await seed(db),args=saving(list,tasks=>tasks[1].text='Én gang'),batch=db.batch;let competing=false,inner;
 db.batch=async statements=>{if(!competing){competing=true;inner=await call(db,'save_task_list',args);}return batch(statements);};
 const outer=await call(db,'save_task_list',args);assert.equal(inner.saved,true);assert.equal(outer.replayed,true);assert.equal(inner.revision,outer.revision);const all=await rows(db);assert.equal(all.filter(r=>r.record_key===outer.version_key).length,1);assert.equal((await read(db)).revision,outer.revision);
});
test('bad timing, circular dependencies, duplicate IDs and daily data fail without mutation',async()=>{
 const db=database(),list=await seed(db),before=await rows(db);
 for(const modify of [tasks=>tasks[1].schedule={frequency:'weekly',anchor:'not-a-date'},tasks=>tasks[1].schedule={frequency:'weekly',anchor:'2026-10-22',from:'25:00'},tasks=>tasks[1].parentId='initial-2',tasks=>tasks.push(tasks[0]),tasks=>tasks[0].checked=true,tasks=>tasks[0].temporaryDay='2026-10-22',tasks=>tasks[2].writing.count=100,tasks=>tasks[2].writing={mode:'note',count:3}])await assert.rejects(call(db,'save_task_list',saving(list,modify)));
 assert.deepEqual(await rows(db),before);
 await put(db,'note/definition/sticky',{id:'sticky',text:'Min note',writing:{mode:'note',count:1}});await assert.rejects(call(db,'save_task_list',saving(list,tasks=>tasks.push({id:'sticky',text:'Forkert type'}))),/unikt ID/);
});
test('clear and deletion prevent stale or in-flight saves from recreating data',async()=>{
 const db=database(),list=await seed(db),{handleSync}=await import('../../server/sync-service.mjs');const action=body=>handleSync(new Request('https://site.test/api/sync?day=2026-10-22',{method:'POST',headers:{Origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify(body)}),db,user);
 await action({action:'clear',generation:1});await assert.rejects(call(db,'save_task_list',saving(list)),/ændret et andet sted/);assert.equal((await read(db)).source,'standard');
 await action({action:'delete',generation:2,confirmation:'DELETE'});await assert.rejects(read(db),/slettet/);await assert.rejects(call(db,'save_task_list',saving(list)),/slettet/);assert.equal((await rows(db)).length,0);
});
test('MCP exposes Danish controls, bounded JSON saves and useful schema errors',async()=>{
 const db=database(),{handleMCP}=await import('../../server/reminder-mcp.mjs');const rpc=async(method,params,who=user)=>(await (await handleMCP(new Request('https://site.test/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),db,who,{now})).json()).result;
 const tools=(await rpc('tools/list')).tools;assert.equal(tools.find(t=>t.name==='get_task_list').title,'Hent opgavelisten');assert(tools.find(t=>t.name==='save_task_list').annotations.destructiveHint);const read=await rpc('tools/call',{name:'get_task_list'});assert(read.structuredContent.document.tasks.length);
 const error=await rpc('tools/call',{name:'save_task_list',arguments:{}});assert(error.isError);assert.match(error.content[0].text,/mangler/);assert((await rpc('tools/call',{name:'get_task_list'},null)).isError);
});
test('large JSON documents use the same RPC path',async()=>{
 const db=database(),{handleMCP}=await import('../../server/reminder-mcp.mjs');let list=await seed(db);const args=saving(list,tasks=>{for(let i=0;i<400;i++)tasks.push({id:'task-'+i,text:'En tilbagevendende opgave med en lidt længere dansk beskrivelse '.repeat(3)});});
 const body=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'save_task_list',arguments:args}});assert(body.length>65536);
 const response=await(await handleMCP(new Request('https://site.test/mcp',{method:'POST',body}),db,user,{now})).json();assert.equal(response.result.isError,undefined);assert.equal((await read(db)).document.tasks.length,405);
});
test('server version history stays bounded after repeated small edits',async()=>{
 const db=database();let list=await seed(db);
 for(let i=0;i<17;i++){list=await read(db);await call(db,'save_task_list',saving(list,tasks=>tasks[1].text='Plan '+i));}assert.equal((await rows(db)).filter(r=>r.record_key.startsWith('history/')).length,30);
});
test('in-flight clear or an identity newly taken by a note aborts the entire save',async()=>{
 for(const race of ['clear','note']){
  const db=database(),list=await seed(db),batch=db.batch;let before;
  db.batch=async statements=>{if(race==='clear')await db.prepare('UPDATE sync_accounts SET generation=generation+1 WHERE owner=?').bind(user.userId).run();else await put(db,'note/definition/task-raced',{id:'task-raced',text:'Fast note',writing:{mode:'note',count:1}});before=await rows(db);return batch(statements);};
  await assert.rejects(call(db,'save_task_list',saving(list,tasks=>tasks.push({id:'task-raced',text:'Ny opgave'}))),/ændret et andet sted/);assert.deepEqual(await rows(db),before);
 }
});

test('MCP edits and backs up scheduled lists and guards list-only races',async()=>{
 const db=database(),before=await seed(db),document=structuredClone(before.document);document.lists=[{id:'morn',name:'Morgen',group:'rutine',schedule:{frequency:'daily',anchor:'2026-01-01',from:'06:00',to:'14:00'},taskIds:['initial-0','initial-1','initial-2']},{id:'evening',name:'Aften',group:'',schedule:{frequency:'daily',anchor:'2026-01-01',from:'18:00',to:'23:00'},taskIds:['initial-0','initial-3','initial-4']}];
 const result=await call(db,'save_task_list',{revision:before.revision,request_id:crypto.randomUUID(),document}),after=await read(db);assert.equal(after.document.version,2);assert.equal(after.document.lists.length,2);assert.equal(after.revision,result.revision);const fields=Object.fromEntries((await rows(db)).map(r=>[r.record_key,JSON.parse(r.payload)]));assert.equal(D.materialize(fields,'2026-10-22').state.lists[0].name,'Morgen');assert.equal(fields[result.backup_key].lists[0].name,'Min liste');assert.equal(fields[result.version_key].lists[1].name,'Aften');
 const latest=await read(db),batch=db.batch;db.batch=async statements=>{await put(db,'list/morn',{...latest.document.lists[0],name:'Telefonens morgen'});return batch(statements);};await assert.rejects(call(db,'save_task_list',saving(latest,tasks=>tasks[0].text='Forældet tekst')),/ændret et andet sted/);assert.equal((await read(db)).document.tasks[0].text,latest.document.tasks[0].text);
});

test('MCP saves emphasis definitions without modifying first-seen times or other daily state',async()=>{
 const db=database(),list=await seed(db);await put(db,'day/2026-10-22/seen/initial-1',now-600000);const args=saving(list,tasks=>{tasks[1].emphasis={effect:'dance',basis:'visible',mode:'until',minutes:60};});await call(db,'save_task_list',args);const after=await read(db);assert.deepEqual(after.document.tasks[1].emphasis,args.document.tasks[1].emphasis);const records=await rows(db);assert.equal(JSON.parse(records.find(r=>r.record_key==='day/2026-10-22/seen/initial-1').payload),now-600000);await assert.rejects(call(db,'save_task_list',saving(after,tasks=>{tasks[1].emphasis={effect:'glow',basis:'clock',mode:'after',time:'25:00'};})));assert.deepEqual(await rows(db),records);
});

test('MCP rejects obsolete document versions and aliases without changing database records',async()=>{
 const db=database(),list=await seed(db),before=await rows(db);
 for(const modify of [d=>d.version=1,d=>delete d.lists,d=>d.tasks[1].emphasis={effect:'underline',basis:'visible',mode:'after',minutes:1}]){
  const args=saving(list);modify(args.document);await assert.rejects(call(db,'save_task_list',args));assert.deepEqual(await rows(db),before);
 }
 const schema=(await import('../../server/task-list-mcp.mjs')).taskTools.find(t=>t.name==='save_task_list').inputSchema.properties.document;
 assert.deepEqual(schema.properties.version.enum,[2]);assert(schema.required.includes('lists'));
});
