const test=require('node:test'),assert=require('node:assert/strict');
const {database}=require('../helpers/database.cjs');
const service=()=>import('../../server/sync-service.mjs');
const user={userId:'alice',displayName:'Alice'};
function request(ops,origin='https://site.test',day='2026-10-19',generation=1){return new Request(`https://site.test/api/sync?day=${day}`,ops?{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({generation,ops})}:{});}
const op=(key,value,base=0,id='operation-one')=>({key,value,base,id});
test('anonymous requests cannot read or write account records and cross-origin writes are rejected',async()=>{
 const {handleSync}=await service(),db=database();assert.deepEqual(await (await handleSync(request(),db,null)).json(),{user:null});assert.equal((await handleSync(request([op('order',[])]),db,null)).status,401);
 assert.equal((await handleSync(request([op('order',[])],'https://evil.test'),db,user)).status,403);
 assert.equal((await handleSync(request([op('order',[])],undefined,undefined,null),db,user)).status,400);
});
test('records are isolated by authenticated account and retries are idempotent',async()=>{
 const {handleSync}=await service(),db=database(),mutation=request([op('order',['a'])]);
 let response=await (await handleSync(mutation,db,user)).json();assert.equal(response.accepted[0].revision,1);
 response=await (await handleSync(request([op('order',['a'])]),db,user)).json();assert.equal(response.accepted[0].revision,1);assert.equal(response.conflicts.length,0);
 const other=await (await handleSync(request(),db,{userId:'bob',displayName:'Bob'})).json();assert.equal(other.records.length,0);
 await handleSync(request([op('order',['b'])]),db,{userId:'bob',displayName:'Bob'});
 const own=await (await handleSync(request(),db,user)).json();assert.deepEqual(own.records[0].value,['a']);
});
test('stale field edits conflict while changes to independent fields merge',async()=>{
 const {handleSync}=await service(),db=database();await handleSync(request([op('def/a',{id:'a',text:'A'})]),db,user);
 let response=await (await handleSync(request([op('def/a',{id:'a',text:'PC'},1,'operation-pc')]),db,user)).json();assert.equal(response.accepted[0].revision,2);
 response=await (await handleSync(request([op('def/a',{id:'a',text:'Phone'},1,'operation-phone'),op('day/2026-10-19/status/a',{checked:true})]),db,user)).json();
 assert.equal(response.conflicts.length,1);assert.equal(response.conflicts[0].value.text,'PC');assert.equal(response.accepted.length,1);
 response=await (await handleSync(request([op('def/a',{id:'a',text:'Phone'},2,'resolved-phone')]),db,user)).json();assert.equal(response.accepted[0].revision,3);
});
test('offline operations from yesterday remain valid without changing today’s status',async()=>{
 const {handleSync}=await service(),db=database();await handleSync(request([op('day/2026-10-18/status/a',{checked:true})]),db,user);
 const today=await (await handleSync(request(),db,user)).json();assert.equal(today.records.length,0);
 const yesterday=await (await handleSync(request(null,undefined,'2026-10-18'),db,user)).json();assert.equal(yesterday.records[0].value.checked,true);
});
module.exports={database,request};

test('clearing profile data advances its generation and prevents stale devices from restoring it',async()=>{
 const {handleSync}=await service(),db=database();await handleSync(request([op('order',['a']),op('list-order',['default']),op('list/default',{id:'default',name:'Min liste',group:'',schedule:null,taskIds:[]})]),db,user);
 const action=new Request('https://site.test/api/sync?day=2026-10-19',{method:'POST',headers:{Origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify({action:'clear',generation:1})});
 const cleared=await (await handleSync(action,db,user)).json();assert.equal(cleared.generation,2);assert.equal(cleared.deleted,false);
 const stale=new Request('https://site.test/api/sync?day=2026-10-19',{method:'POST',headers:{Origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify({generation:1,ops:[op('order',['old-data'])]})});assert.equal((await handleSync(stale,db,user)).status,409);
 const read=await (await handleSync(request(),db,user)).json();assert(read.records.every(r=>r.key.startsWith('history/')));assert(read.records.some(r=>r.value.snapshot));assert.equal(read.generation,2);
});
test('deleting a profile removes only that account’s records and requires explicit recreation',async()=>{
 const {handleSync}=await service(),db=database(),bob={userId:'bob',displayName:'Bob'};await handleSync(request([op('order',['Alice'])]),db,user);await handleSync(request([op('order',['Bob'])]),db,bob);
 const action=body=>new Request('https://site.test/api/sync?day=2026-10-19',{method:'POST',headers:{Origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify(body)});
 const deleted=await (await handleSync(action({action:'delete',generation:1,confirmation:'DELETE'}),db,user)).json();assert(deleted.deleted);
 let data=await (await handleSync(request(),db,user)).json();assert(data.deleted);assert.equal(data.records.length,0);
 assert.equal((await handleSync(action({generation:2,ops:[op('order',['resurrect'])]}),db,user)).status,409);
 data=await (await handleSync(request(),db,bob)).json();assert.deepEqual(data.records[0].value,['Bob']);
 const recreated=await (await handleSync(action({action:'create',generation:2}),db,user)).json();assert.equal(recreated.generation,3);assert.equal(recreated.deleted,false);
});

test('note dimensions are persisted as an independent account field',async()=>{
 const {handleSync}=await service(),db=database();
 const written=await (await handleSync(request([op('size/writing-note',{width:360,height:420})]),db,user)).json();assert.equal(written.accepted.length,1);
 const own=await (await handleSync(request(),db,user)).json();assert.deepEqual(own.records[0].value,{width:360,height:420});
});

test('cloud records expose their server save times for comparing list versions',async()=>{
 const {handleSync}=await service(),db=database();const before=Date.now();
 const write=await (await handleSync(request([op('def/a',{id:'a',text:'A'})]),db,user)).json();assert(write.accepted[0].updatedAt>=before);
 const read=await (await handleSync(request(),db,user)).json();assert.equal(read.records[0].updatedAt,write.accepted[0].updatedAt);
});

test('clearing retains history and a full server snapshot, while deleting requires DELETE and removes every backup',async()=>{
 const {handleSync}=await service(),db=database(),act=body=>new Request('https://site.test/api/sync?day=2026-10-19',{method:'POST',headers:{Origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify(body)});
 await handleSync(request([op('def/a',{id:'a',text:'Task A'}),op('order',['a']),op('list-order',['default']),op('list/default',{id:'default',name:'Min liste',group:'',schedule:null,taskIds:['a']}),op('history/1-current',{createdAt:1,label:'Saved version',lists:[{id:'default',name:'Min liste',group:'',schedule:null,taskIds:['a']}],tasks:[{id:'a',text:'Task A'}]})]),db,user);
 const cleared=await (await handleSync(act({action:'clear',generation:1}),db,user)).json();assert(cleared.records.some(r=>r.key==='history/1-current'));const backup=cleared.records.find(r=>r.value.snapshot);assert.deepEqual(backup.value.snapshot.fields.order,['a']);assert.equal(backup.value.snapshot.fields['def/a'].text,'Task A');assert(!Object.keys(backup.value.snapshot.fields).some(k=>k.startsWith('history/')));
 for(const confirmation of [undefined,'delete','DELETE '])assert.equal((await handleSync(act({action:'delete',generation:2,confirmation}),db,user)).status,400);
 const kept=await (await handleSync(request(),db,user)).json();assert(kept.records.length>0);
 assert((await handleSync(act({action:'delete',generation:2,confirmation:'DELETE'}),db,user)).ok);const removed=await (await handleSync(request(),db,user)).json();assert(removed.deleted);assert.equal(removed.records.length,0);
});

test('mobile and desktop note positions use separate revision records',async()=>{
 const {handleSync}=await service(),db=database();let response=await handleSync(request([op('position/note',{x:700,y:240,space:'list'}),op('mobile-position/note',{x:.2,y:.6,space:'page'},0,'mobile-position-one')]),db,user);assert.equal(response.status,200);
 const result=await (await handleSync(request(),db,user)).json();assert.deepEqual(result.records.find(r=>r.key==='position/note').value,{x:700,y:240,space:'list'});assert.deepEqual(result.records.find(r=>r.key==='mobile-position/note').value,{x:.2,y:.6,space:'page'});
 response=await handleSync(request([op('mobile-position/note',null,1,'mobile-position-two')]),db,user);assert.equal(response.status,200);assert.deepEqual((await (await handleSync(request(),db,user)).json()).records.find(r=>r.key==='position/note').value,{x:700,y:240,space:'list'});
});

test('lifetime statistics remain available across days and clearing backs them up',async()=>{
 const {handleSync}=await service(),db=database();const value={used:true,checked:5,deferred:2,notes:1,trophies:3};
 const write=await handleSync(request([op('stats/2026-10-18',value)]),db,user);assert.equal(write.status,200);
 let data=await (await handleSync(request(),db,user)).json();assert.deepEqual(data.records[0].value,value);
 const action=new Request('https://site.test/api/sync?day=2026-10-19',{method:'POST',headers:{Origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify({action:'clear',generation:1})});await handleSync(action,db,user);
 data=await (await handleSync(request(),db,user)).json();assert(data.records.every(r=>r.key.startsWith('history/')));assert.deepEqual(data.records[0].value.snapshot.fields['stats/2026-10-18'],value);
});

test('note archival is an account-owned daily sync field',async()=>{
 const {handleSync}=await service(),db=database();const response=await handleSync(request([op('day/2026-10-19/archive/note-a',true)]),db,user);assert.equal(response.status,200);
 const today=await (await handleSync(request(),db,user)).json();assert.equal(today.records[0].value,true);
 const tomorrow=await (await handleSync(request(null,undefined,'2026-10-20'),db,user)).json();assert.equal(tomorrow.records.length,0);
});

test('weekly awards are accepted and persist when the daily query date changes',async()=>{
 const {handleSync}=await service(),db=database();const key='week/2026-10-19/achievement/weekly-return';assert.equal((await handleSync(request([op(key,123)]),db,user)).status,200);
 const nextDay=await (await handleSync(request(null,undefined,'2026-10-20'),db,user)).json();assert.equal(nextDay.records[0].key,key);assert.equal(nextDay.records[0].value,123);
});
test('temporary notes and their placement use day-scoped records and never appear in tomorrow’s response',async()=>{
 const {handleSync}=await service(),db=database(),day='2026-10-20';
 const operations=[op(`day/${day}/temporary/note`,{id:'note',text:'Daily note',writing:{mode:'note',count:1,paperType:'grid'}}),op(`day/${day}/position/note`,{x:50,y:200,space:'list'}),op(`day/${day}/mobile-position/note`,{x:.3,y:300,space:'page'}),op(`day/${day}/size/note`,{width:240,height:200})];
 const response=await handleSync(request(operations,undefined,day),db,user);assert.equal(response.status,200);assert.equal((await response.json()).accepted.length,4);
 const today=await (await handleSync(request(null,undefined,day),db,user)).json();assert.equal(today.records.length,4);const tomorrow=await (await handleSync(request(null,undefined,'2026-10-21'),db,user)).json();assert.equal(tomorrow.records.length,0);
});
test('permanent note definitions and individual item states remain available on later dates',async()=>{
 const {handleSync}=await service(),db=database();const response=await handleSync(request([op('note/definition/keep',{id:'keep',text:'Keep',writing:{mode:'list',count:2}}),op('note/check/item',{checked:true,checkedDay:'2026-10-20'}),op('note/draft/keep/0','Draft'),op('note/position/keep',{x:30,y:200,space:'list'})],undefined,'2026-10-20'),db,user);assert.equal(response.status,200);assert.equal((await response.json()).accepted.length,4);
 const next=await (await handleSync(request(null,undefined,'2026-10-21'),db,user)).json();assert.equal(next.records.length,4);assert.equal(next.records.find(r=>r.key==='note/check/item').value.checked,true);
 const other=await (await handleSync(request(null,undefined,'2026-10-21'),db,{userId:'bob',displayName:'Bob'})).json();assert.equal(other.records.length,0);
});

test('database writes reject unsupported histories, backups and coordinate records atomically',async()=>{
 const {handleSync}=await service(),db=database(),legacy={createdAt:1,label:'Unsupported',tasks:[]};
 for(const [key,value] of [['history/unsupported',legacy],['position/note',{x:1,y:2}],['mobile-position/note',{x:.2,y:.4}]]){
  const result=await handleSync(request([op('stats/2026-10-19',{checked:1}),op(key,value)]),db,user);assert.equal(result.status,400);assert.equal((await (await handleSync(request(),db,user)).json()).records.length,0);
 }
 const result=await handleSync(new Request('https://site.test/api/sync?day=2026-10-19',{method:'POST',headers:{Origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify({action:'clear',generation:1,backup:{tasks:[],snapshot:{day:'2026-10-19',fields:{}}}})}),db,user);
 assert.equal(result.status,400);assert.equal((await (await handleSync(request(),db,user)).json()).generation,1);
});
test('database clear backups round-trip task lists, schedule priority and daily state',async()=>{
 const {handleSync}=await service(),M=require('../../public/tasks.js'),D=require('../../public/sync-data.js'),T=require('../../public/task-json.js'),db=database(),s=M.fresh('2026-10-19');
 s.lists=[{id:'z-first',name:'First',group:'work',schedule:{frequency:'daily',interval:1,anchor:s.day},taskIds:s.tasks.map(t=>t.id)},{id:'a-second',name:'Second',group:'work',schedule:null,taskIds:[]}];M.toggle(s,'initial-1');M.shift(s,'initial-4',-1);
 const fields=D.capture(s),ops=Object.entries(fields).map(([key,value],i)=>op(key,value,0,'snapshot-'+i));assert.equal((await handleSync(request(ops),db,user)).status,200);
 const backup={...JSON.parse(T.encode(s)),snapshot:{day:s.day,fields}};
 const cleared=await (await handleSync(new Request('https://site.test/api/sync?day='+s.day,{method:'POST',headers:{Origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify({action:'clear',generation:1,backup})}),db,user)).json();
 assert.equal(cleared.generation,2);assert.equal(cleared.records.length,2);
 for(const record of cleared.records){assert.deepEqual(record.value.lists,s.lists);assert.deepEqual(record.value.tasks.map(t=>t.id),M.ordered(s).map(t=>t.id));T.history(record.value);const restored=D.materialize(record.value.snapshot.fields,s.day).state;assert.deepEqual(restored.lists,s.lists);assert(restored.tasks.find(t=>t.id==='initial-1').checked);}
});
