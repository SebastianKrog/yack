import { taskTools, callTaskTool, TaskListError } from './task-list-mcp.mjs';
import R from '../public/reminders.js';
const instructions='For recurring task edits use get_task_list, modify its complete JSON document and save with save_task_list and the returned revision. Preserve unrelated tasks and IDs. Task wording, controls and history labels are Danish. Clarify ambiguous timing, recurrence, dependencies or task identity before saving. Weekdays start Monday=0. Deleting a task requires an explicit user request. On revision conflict read again and reconcile the intended edit instead of blindly replacing the revision. Local-only tasks are unavailable until synced to the profile. Yack checklist reminders are one-off tasks stored immediately and shown on the due day in Europe/Copenhagen. Unhandled reminders remain overdue until completed, deferred or cancelled. These tools do not create phone notifications. Resolve relative dates in Europe/Copenhagen; get_reminders returns the current date. All actions use the authenticated caller’s own profile. Do not claim a reminder was saved if a tool returns an error.';
const string={type:'string'},object=properties=>({type:'object',properties,additionalProperties:false});
const reminderTools=[
 {name:'get_reminders',title:'Vis påmindelser',description:'List your Yack reminders, including upcoming, due, overdue and optionally handled items. Also returns today’s date and timezone for interpreting relative dates.',inputSchema:{...object({include_handled:{type:'boolean',default:false}})},annotations:{readOnlyHint:true,openWorldHint:false}},
 {name:'add_reminder',title:'Tilføj påmindelse',description:'Save a one-off reminder now to appear as a temporary Yack checklist task on the specified date. Dates use Europe/Copenhagen. Requires a unique request_id; reuse that same ID for retries to avoid duplicates. Does not send a phone notification.',inputSchema:{...object({text:{...string,minLength:1,maxLength:300},date:{...string,description:'Scheduled date YYYY-MM-DD, today or later, resolved in Europe/Copenhagen.'},request_id:{...string,minLength:8,maxLength:100,description:'Unique ID for this creation request; reuse on retries.'}}),required:['text','date','request_id']},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'reschedule_reminder',title:'Rediger påmindelse',description:'Change the date and optionally text of an existing unhandled reminder. Get its ID and revision from get_reminders first. Completed, deferred or cancelled reminders cannot be rescheduled; create a new reminder instead.',inputSchema:{...object({reminder_id:string,revision:{type:'integer',minimum:1},date:{...string,description:'Date YYYY-MM-DD in Europe/Copenhagen: today or later, or keep the existing date (including overdue) when editing text.'},text:{...string,minLength:1,maxLength:300}}),required:['reminder_id','revision','date']},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'cancel_reminder',title:'Annuller påmindelse',description:'Cancel a specific unhandled reminder so it no longer appears in the checklist. Get its ID and revision from get_reminders first. This preserves its history and does not delete other tasks or profile data.',inputSchema:{...object({reminder_id:string,revision:{type:'integer',minimum:1}}),required:['reminder_id','revision']},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false}}
];
export const tools=[...reminderTools,...taskTools];
const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const rpcError=(id,code,message)=>response({jsonrpc:'2.0',id,error:{code,message}});
const toolResult=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});
class ReminderError extends Error {}
const fail=message=>{throw new ReminderError(message);};
const checkedArgs=(args,schema)=>{if(!args||typeof args!=='object'||Array.isArray(args))fail('Invalid tool arguments.');for(const key of Object.keys(args))if(!Object.hasOwn(schema.properties,key))fail('Unknown argument: '+key);for(const key of schema.required||[])if(args[key]===undefined)fail('Missing argument: '+key);};
const text=value=>{if(typeof value!=='string'||!value.trim()||value.length>300)fail('Task text must contain 1–300 characters.');return value.trim();};
const date=(value,today)=>{if(R.dateKey(value)!==value||value<today)fail('Use a valid date YYYY-MM-DD, today or later, in Europe/Copenhagen.');return value;};
async function hash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
const key=id=>'reminder/definition/'+id;
async function getAccount(db,owner){return await db.prepare('SELECT generation,deleted FROM sync_accounts WHERE owner=?').bind(owner).first();}
async function record(db,owner,id){return await db.prepare('SELECT payload,revision FROM sync_records WHERE owner=? AND record_key=?').bind(owner,key(id)).first();}
async function state(db,owner,id){const row=await db.prepare('SELECT payload FROM sync_records WHERE owner=? AND record_key=?').bind(owner,'reminder/status/'+id).first();return row?JSON.parse(row.payload)||{}:{};}
function item(row,status,today){const task={...JSON.parse(row.payload),checked:status?.checked===true,deferred:status?.deferred===true};return {id:task.id,text:task.text,date:task.reminder.date,...(task.reminder.time?{time:task.reminder.time}:{}),status:R.status(task,today),revision:row.revision,created_at:task.reminder.createdAt,updated_at:task.reminder.updatedAt};}
export async function callReminderTool(name,args,db,user,{now=Date.now()}={}){
 const tool=reminderTools.find(tool=>tool.name===name);if(!tool)fail('Unknown reminder tool.');checkedArgs(args,tool.inputSchema);
 if(!user?.userId)fail('Sign in with ChatGPT to use your checklist reminders.');
 const owner=user.userId,today=R.today(new Date(now));let account=await getAccount(db,owner);
 if(account?.deleted)fail('Your checklist profile has been deleted. Open Profil on the site to recreate it before using reminders.');
 if(name==='get_reminders'){
  if(args.include_handled!==undefined&&typeof args.include_handled!=='boolean')fail('include_handled must be true or false.');
  const rows=await db.prepare("SELECT record_key,payload,revision FROM sync_records WHERE owner=? AND record_key LIKE 'reminder/%' ORDER BY record_key LIMIT 20001").bind(owner).all();
  if(rows.results.length>20000)fail('Too many reminder records.');
  const values=new Map(rows.results.map(row=>[row.record_key,row]));
  const reminders=rows.results.filter(row=>row.record_key.startsWith('reminder/definition/')&&R.validMeta(JSON.parse(row.payload)?.reminder)).map(row=>{const id=row.record_key.slice('reminder/definition/'.length),status=values.get('reminder/status/'+id);return item(row,status?JSON.parse(status.payload)||{}:{},today);}).filter(value=>args.include_handled||['upcoming','due','overdue'].includes(value.status)).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  return {today,timezone:R.timezone,reminders};
 }
 if(name==='add_reminder'){
  const label=text(args.text),due=date(args.date,today);if(typeof args.request_id!=='string'||args.request_id.length<8||args.request_id.length>100)fail('request_id must contain 8–100 characters.');
  const id='reminder-'+(await hash(owner+'\n'+args.request_id)).slice(0,32),requestHash=await hash(JSON.stringify({text:label,date:due}));
  let row=await record(db,owner,id);
  if(row){if(JSON.parse(row.payload)?.reminder?.requestHash!==requestHash)fail('This request_id was already used for another reminder. Use a new request_id.');return {today,timezone:R.timezone,created:false,reminder:item(row,await state(db,owner,id),today)};}
  if(!account){await db.prepare('INSERT INTO sync_accounts(owner,generation,deleted) VALUES(?,1,0) ON CONFLICT(owner) DO NOTHING').bind(owner).run();account=await getAccount(db,owner);}
  const value={id,text:label,parentId:null,parentChoice:null,boxSeed:parseInt(id.slice(9,17),16)>>>0,reminder:{date:due,createdAt:now,updatedAt:now,requestHash}};
  await db.prepare('INSERT INTO sync_records(owner,record_key,payload,revision,last_op,updated_at) SELECT ?,?,?,1,?,? WHERE EXISTS (SELECT 1 FROM sync_accounts WHERE owner=? AND generation=? AND deleted=0) ON CONFLICT(owner,record_key) DO NOTHING').bind(owner,key(id),JSON.stringify(value),'mcp-create-'+id,now,owner,account.generation).run();
  const current=await getAccount(db,owner);if(current.deleted||current.generation!==account.generation)fail('Your profile changed during this request. Please try again.');
  row=await record(db,owner,id);if(!row)fail('The reminder could not be saved. Please try again.');if(JSON.parse(row.payload).reminder.requestHash!==requestHash)fail('This request_id was already used for another reminder.');
  return {today,timezone:R.timezone,created:true,reminder:item(row,await state(db,owner,id),today)};
 }
 if(!R.validId(args.reminder_id)||!Number.isSafeInteger(args.revision)||args.revision<1)fail('Use a reminder ID and revision returned by get_reminders.');
 let row=await record(db,owner,args.reminder_id);if(!row||row.payload==='null')fail('Reminder not found.');const value=JSON.parse(row.payload),status=await state(db,owner,value.id);
 if(name==='cancel_reminder'&&value.reminder.cancelledAt!==undefined)return {today,timezone:R.timezone,reminder:item(row,status,today)};
 if(status.checked||status.deferred||value.reminder.cancelledAt!==undefined)fail('This reminder has already been handled. Create a new reminder instead.');
 if(name==='reschedule_reminder'){
  const due=date(args.date,args.date===value.reminder.date?value.reminder.date:today),label=args.text===undefined?value.text:text(args.text);
  if(due===value.reminder.date&&label===value.text)return {today,timezone:R.timezone,reminder:item(row,status,today)};
  value.text=label;value.reminder.date=due;
 }else value.reminder.cancelledAt=now;
 value.reminder.updatedAt=now;
 // Revision and generation guards prevent overwriting edits or reviving cleared data.
 // Keep completion in its own record, so a device checking a task never loses the check.
 const result=await db.prepare("UPDATE sync_records SET payload=?,revision=revision+1,last_op=?,updated_at=? WHERE owner=? AND record_key=? AND revision=? AND EXISTS (SELECT 1 FROM sync_accounts WHERE owner=? AND generation=? AND deleted=0) AND NOT EXISTS (SELECT 1 FROM sync_records WHERE owner=? AND record_key=? AND (json_extract(payload,'$.checked')=1 OR json_extract(payload,'$.deferred')=1)) RETURNING payload,revision").bind(JSON.stringify(value),'mcp-'+crypto.randomUUID(),now,owner,key(value.id),args.revision,owner,account?.generation||1,owner,'reminder/status/'+value.id).all();
 if(!result.results.length)fail('The reminder changed on another device. Call get_reminders and review it before trying again.');
 return {today,timezone:R.timezone,reminder:item(result.results[0],await state(db,owner,value.id),today)};
}
export async function handleMCP(request,db,user,options){
 if(request.method!=='POST')return response({error:'Use POST'},405);
 let body;try{const raw=await request.text();if(raw.length>2097152)return rpcError(null,-32600,'Request too large');body=JSON.parse(raw);}catch{return rpcError(null,-32700,'Invalid JSON');}
 if(!body||Array.isArray(body)||body.jsonrpc!=='2.0'||typeof body.method!=='string')return rpcError(body?.id??null,-32600,'Invalid request');
 const id=body.id??null;
 if(body.method==='notifications/initialized')return new Response(null,{status:204});
 let result;
 if(body.method==='server/discover')result={supportedVersions:['2026-07-28'],capabilities:{tools:{}}};
 else if(body.method==='initialize')result={protocolVersion:'2026-07-28',capabilities:{tools:{}},serverInfo:{name:'starting-work',title:'Yack',description:'Yet another checklist, kinda',version:'1.0.0'},instructions};
 else if(body.method==='tools/list')result={tools};
 else if(body.method==='ping')result={};
 else if(body.method==='tools/call'){
  try{const name=body.params?.name,args=body.params?.arguments||{};result=toolResult(await (taskTools.some(tool=>tool.name===name)?callTaskTool(name,args,db,user,options):callReminderTool(name,args,db,user,options)));}
  catch(error){result={isError:true,content:[{type:'text',text:error instanceof ReminderError||error instanceof TaskListError?error.message:'Tjenesten er midlertidigt utilgængelig. Prøv igen.'}]};}
 }else return rpcError(id,-32601,'Method not found');
 return response({jsonrpc:'2.0',id,result});
}
