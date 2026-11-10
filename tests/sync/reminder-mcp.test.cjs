const test=require('node:test'),assert=require('node:assert/strict');
const {database}=require('../helpers/database.cjs');
function request(ops,origin='https://site.test',day='2026-10-19'){return new Request(`https://site.test/api/sync?day=${day}`,ops?{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({generation:1,ops})}:{});}
const user={userId:'alice',email:'alice@example.com'},bob={userId:'bob',email:'bob@example.com'},now=Date.parse('2026-10-20T08:00:00Z');
const service=()=>import('../../server/reminder-mcp.mjs');
const add={text:'Husk brevet',date:'2026-10-22',request_id:'request-0001'};
const call=async(db,name,args={},who=user)=>(await service()).callReminderTool(name,args,db,who,{now});
test('MCP discovery and tool listing are anonymous; user data requires authentication',async()=>{
 const {handleMCP}=await service(),db=database();const rpc=async(method,params,who=null)=>await (await handleMCP(new Request('https://site.test/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),db,who,{now})).json();
 const discovered=await rpc('server/discover');assert.deepEqual(discovered.result.supportedVersions,['2026-07-28']);
 const listed=await rpc('tools/list');assert.equal(listed.result.tools.length,6);assert(listed.result.tools.find(t=>t.name==='get_reminders').annotations.readOnlyHint);
 assert((await rpc('tools/call',{name:'get_reminders'})).result.isError);assert.deepEqual((await rpc('tools/call',{name:'get_reminders'},user)).result.structuredContent.reminders,[]);
});
test('creating reminders is authenticated, isolated and idempotent without duplicate tasks',async()=>{
 const db=database();await assert.rejects(call(db,'add_reminder',add,null),/Sign in/);
 const a=await call(db,'add_reminder',add),retry=await call(db,'add_reminder',add);assert.equal(a.created,true);assert.equal(retry.created,false);assert.equal(a.reminder.id,retry.reminder.id);
 assert.equal((await call(db,'get_reminders')).reminders.length,1);assert.equal((await call(db,'get_reminders',{},bob)).reminders.length,0);
 await assert.rejects(call(db,'add_reminder',{...add,text:'Different'}),/request_id/);await assert.rejects(call(db,'add_reminder',{...add,date:'2026-10-19'}),/valid date/);await assert.rejects(call(db,'get_reminders',{owner:'bob'}),/Unknown argument/);
});
test('revision guards protect rescheduling and cancellation from stale changes',async()=>{
 const db=database(),a=(await call(db,'add_reminder',add)).reminder;
 const changed=(await call(db,'reschedule_reminder',{reminder_id:a.id,revision:a.revision,date:'2026-10-23',text:'Nyt brev'})).reminder;assert.equal(changed.revision,2);
 await assert.rejects(call(db,'cancel_reminder',{reminder_id:a.id,revision:1}),/changed/);
 await assert.rejects(call(db,'reschedule_reminder',{reminder_id:a.id,revision:1,date:'2026-10-24'}),/changed/);
 const cancelled=(await call(db,'cancel_reminder',{reminder_id:a.id,revision:2})).reminder;assert.equal(cancelled.status,'cancelled');assert.equal((await call(db,'get_reminders')).reminders.length,0);assert.equal((await call(db,'get_reminders',{include_handled:true})).reminders.length,1);
 assert.equal((await call(db,'cancel_reminder',{reminder_id:a.id,revision:2})).reminder.status,'cancelled');
});
test('MCP and checklist use the same records; checkoff survives midnight and cannot be rescheduled',async()=>{
 const db=database(),a=(await call(db,'add_reminder',{...add,date:'2026-10-20'})).reminder,{handleSync}=await import('../../server/sync-service.mjs');
 const response=await (await handleSync(request([{key:'reminder/status/'+a.id,value:{checked:true,checkedDay:'2026-10-20'},base:0,id:'check-000001'}]),db,user)).json();assert.equal(response.accepted.length,1);
 assert.equal((await call(db,'get_reminders',{include_handled:true})).reminders[0].status,'completed');await assert.rejects(call(db,'reschedule_reminder',{reminder_id:a.id,revision:1,date:'2026-10-23'}),/handled/);
 const records=(await (await handleSync(request(null,undefined,'2026-10-21'),db,user)).json()).records;const D=require('../../public/sync-data.js'),M=require('../../public/tasks.js');const state=D.materialize(D.overlay(records,{}),'2026-10-21').state;assert.equal(M.visible(state).length,0);assert.equal(state.tasks[0].checked,true);
});
test('clearing keeps reminders in backup; deleting removes them and prevents tool resurrection',async()=>{
 const db=database();await call(db,'add_reminder',add);const {handleSync}=await import('../../server/sync-service.mjs');
 const action=body=>new Request('https://site.test/api/sync?day=2026-10-20',{method:'POST',headers:{Origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify(body)});
 const clear=await (await handleSync(action({action:'clear',generation:1}),db,user)).json();assert.equal(clear.generation,2);assert.equal((await call(db,'get_reminders',{include_handled:true})).reminders.length,0);assert(Object.keys(clear.records.find(r=>r.value.snapshot).value.snapshot.fields).some(k=>k.startsWith('reminder/')));
 await handleSync(action({action:'delete',generation:2,confirmation:'DELETE'}),db,user);await assert.rejects(call(db,'add_reminder',{...add,request_id:'request-new'}),/deleted/);const read=await (await handleSync(request(),db,user)).json();assert.equal(read.records.length,0);
});

test('chat tools edit overdue reminder text while retaining its original due date',async()=>{
 const db=database(),a=(await call(db,'add_reminder',{...add,date:'2026-10-20'})).reminder,{callReminderTool}=await service();
 const later=Date.parse('2026-10-23T08:00:00Z');
 const edited=await callReminderTool('reschedule_reminder',{reminder_id:a.id,revision:a.revision,date:a.date,text:'Rettet tekst'},db,user,{now:later});
 assert.equal(edited.reminder.status,'overdue');assert.equal(edited.reminder.date,a.date);assert.equal(edited.reminder.text,'Rettet tekst');
 await assert.rejects(callReminderTool('reschedule_reminder',{reminder_id:a.id,revision:edited.reminder.revision,date:'2026-10-21'},db,user,{now:later}),/valid date/);
});
test('published MCP discovery exposes current lists, media and emphasis schemas',async()=>{
 const {tools}=await service(),schema=tools.find(t=>t.name==='save_task_list').inputSchema.properties.document;
 assert(schema.properties.version.enum.includes(2));assert(schema.properties.lists.items.properties.taskIds);
 const task=schema.properties.tasks.items.properties;assert(task.emphasis);assert(task.writing.properties.mode.enum.includes('media'));assert(task.writing.properties.asset);
});
