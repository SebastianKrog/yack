import M from '../public/tasks.js';
import T from '../public/task-json.js';
import R from '../public/reminders.js';

const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const string={type:'string'},id={...string,minLength:1,maxLength:200},label={...string,minLength:1,maxLength:300};
const integer=(minimum,maximum)=>({type:'integer',minimum,maximum});
const array=(items,maxItems=1000)=>({type:'array',items,maxItems});
const nullable=s=>({...s,type:[s.type,'null']});
const schedule=nullable(object({
 frequency:{type:'string',enum:['daily','weekly','monthly','yearly','once']},
 interval:integer(1,365),anchor:{...string,description:'Startdato YYYY-MM-DD. Datoer og klokkeslæt fortolkes i Europe/Copenhagen.'},until:string,
 days:{...array(integer(0,6),7),minItems:1,description:'Mandag=0 … søndag=6.'},
 monthMode:{type:'string',enum:['date','weekday','last-weekday','last']},monthDays:{...array(integer(1,31),31),minItems:1},
 ordinals:{...array({type:'integer',enum:[1,2,3,4,5,-1]},6),minItems:1,description:'Fx [1,3] for første og tredje; -1 betyder sidste.'},
 weekday:integer(0,6),from:{...string,description:'HH:MM, inklusiv.'},to:{...string,description:'HH:MM, eksklusiv. Kan være før from ved natlige intervaller.'}
},['frequency','anchor']));
const writing=object({mode:{type:'string',enum:['note','list','media']},count:integer(1,10),title:{...string,maxLength:300},asTasks:{type:'boolean'},
 listStyle:{type:'string',enum:['disc','decimal','upper-roman','upper-alpha','lower-alpha','lower-roman']},align:{type:'string',enum:['left','center','right']},
 mat:{type:'string',enum:['none','small','large']},asset:object({id:{type:'string',minLength:36,maxLength:36},name:{type:'string',minLength:1,maxLength:240},type:{type:'string',enum:['image/jpeg','image/png','image/webp','image/gif','image/avif','application/pdf']},size:integer(1,20971520),width:{type:'number'},height:{type:'number'},pages:integer(1,10000)},['id','name','type','size','width','height','pages']),
 paperColor:{type:'string',enum:M.paperColors},paperType:{type:'string',enum:M.paperTypes},pinColor:{type:'string',enum:M.pinColors}
},['mode','count']);
const definition=object({id,text:label,parentId:nullable(id),parentChoice:{type:['integer','null'],enum:[0,1,null]},boxSeed:integer(0,4294967295),schedule,writing,emphasis:object({effect:{type:'string',enum:['glow','fire','pulse','dance','circle','wobble'],description:'circle tegner tre forskellige håndtegnede ellipser, holder dem og lader dem fade ud.'},mode:{type:'string',enum:['after','until']},basis:{type:'string',enum:['clock','visible']},time:{type:'string',description:'HH:MM i Europe/Copenhagen.'},minutes:integer(1,10080)},['effect','mode','basis']),
 xor:object({otherId:id,otherText:label,scheduleMode:{type:'string',enum:['shared','separate']},sharedSchedule:schedule,otherSchedule:schedule},['otherId','otherText'])
},['id','text']);
const documentSchema=object({format:{type:'string',enum:['starting-work-tasks']},version:{type:'integer',enum:[2]},lists:array(object({id,name:{...string,minLength:1,maxLength:100},group:{...string,maxLength:100},schedule,taskIds:array(id)},['id','name','taskIds']),100),tasks:array(definition)},['format','version','lists','tasks']);
export const taskTools=[
 {name:'get_task_list',title:'Hent opgavelisten',description:'Read the authenticated user’s recurring task list as editable JSON with an opaque revision. Read before adding, editing, removing, reordering or scheduling tasks. Includes scheduled lists, reusable task membership, exclusive groups (first matching list wins), dependencies, ELLER and note settings, but excludes daily progress, pinned notes and reminders. If no list is saved, returns the defaults without writing them. Task text and user-facing controls stay Danish. Ask for clarification when the task, timing, recurrence or dependency is ambiguous.',inputSchema:object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
 {name:'save_task_list',title:'Gem ændringer i opgavelisten',description:'Save a complete edited JSON task definition document read with get_task_list. Preserve all unrelated tasks, IDs and fields; include unchanged tasks. Supports scheduled lists (lists ordered by priority; same nonempty group is exclusive), taskIds referencing shared task definitions, adding, editing, removing, reordering, dependencies, ELLER choices, recurring schedules and note settings and visual emphasis (after/until a clock time or minutes after first seen that day). Requires the revision from the read and a unique request_id reused only for identical retries. Saves before/after versions in the existing history. Rejects stale edits atomically. Does not change daily checkmarks, notes, reminders or statistics. Use document version 2 and preserve lists. A shared task has one daily status, even across lists. Use separate task IDs for independently repeated actions. Keep task wording Danish and clarify ambiguous timing before saving. Deletion must be explicitly requested by the user.',inputSchema:object({revision:{...string,minLength:64,maxLength:64},request_id:{...string,minLength:8,maxLength:100},label:{...string,minLength:1,maxLength:80,description:'Kort dansk beskrivelse af ændringen i versionshistorikken.'},document:documentSchema},['revision','request_id','document']),annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false}}
];
export class TaskListError extends Error {}
const fail=message=>{throw new TaskListError(message);};
function validate(value,schema,path='argumenter'){
 const types=Array.isArray(schema.type)?schema.type:[schema.type];
 const type=value===null?'null':Array.isArray(value)?'array':typeof value==='number'&&Number.isInteger(value)?'integer':typeof value;
 if(!types.includes(type)&&!(type==='integer'&&types.includes('number')))fail(`Ugyldig type i ${path}.`);
 if(schema.enum&&!schema.enum.includes(value))fail(`Ugyldig værdi i ${path}.`);
 if(value===null)return;
 if(type==='string'&&(value.length<(schema.minLength||0)||value.length>(schema.maxLength||Infinity)))fail(`Ugyldig tekstlængde i ${path}.`);
 if((type==='integer'||type==='number')&&(!Number.isFinite(value)||type==='integer'&&!Number.isSafeInteger(value)||value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity)))fail(`Ugyldigt tal i ${path}.`);
 if(type==='array'){if(value.length<(schema.minItems||0)||value.length>(schema.maxItems??Infinity))fail(`Ugyldigt antal i ${path}.`);value.forEach((item,i)=>validate(item,schema.items,`${path}[${i}]`));}
 if(type==='object'){
  for(const key of Object.keys(value))if(!Object.hasOwn(schema.properties,key))fail(`Ukendt felt: ${path}.${key}.`);
  for(const key of schema.required||[])if(!Object.hasOwn(value,key))fail(`Feltet ${path}.${key} mangler.`);
  for(const [key,item] of Object.entries(value))validate(item,schema.properties[key],`${path}.${key}`);
 }
}
async function hash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const defKey=id=>'def/'+encodeURIComponent(id);
const listSQL="SELECT record_key,payload,revision,updated_at FROM sync_records WHERE owner=? AND (record_key LIKE 'def/%' OR record_key='order' OR record_key LIKE 'list/%' OR record_key='list-order') ORDER BY record_key";
async function account(db,owner){return await db.prepare('SELECT generation,deleted FROM sync_accounts WHERE owner=?').bind(owner).first();}
async function revision(generation,rows){return await hash(JSON.stringify({generation,records:rows.map(r=>[r.record_key,r.revision,r.payload])}));}
function tree(tasks){const children=new Map();for(const task of tasks){const group=children.get(task.parentId)||[];group.push(task);children.set(task.parentId,group);}const result=[];const visit=id=>{for(const task of children.get(id)||[]){result.push(task);visit(task.id);}};visit(null);return result;}
async function currentList(db,owner,now){
 const a=await account(db,owner);if(a?.deleted)fail('Din profil er slettet. Opret den igen under Profil, før du redigerer opgaver.');
 const {results:rows}=await db.prepare(listSQL).bind(owner).all();if(rows.length>2000)fail('Listen er for stor til at redigere her. Brug sidens editor.');
 const fields=new Map(rows.map(r=>[r.record_key,JSON.parse(r.payload)])),saved=fields.has('order')||rows.some(r=>r.record_key.startsWith('def/')&&r.payload!=='null');
 const today=R.today(new Date(now));let tasks,lists;
 if(!saved){const defaults=M.fresh(today);defaults.tasks.find(t=>t.writing).writing.pinColor=M.pinColors[parseInt((await hash(owner)).slice(0,8),16)%M.pinColors.length];({tasks,lists}=JSON.parse(T.encode(defaults)));}
 else{
  const order=Array.isArray(fields.get('order'))?fields.get('order'):[],rank=new Map(order.map((id,i)=>[id,i]));
  tasks=rows.filter(r=>r.record_key.startsWith('def/')&&r.payload!=='null').map(r=>JSON.parse(r.payload)).sort((a,b)=>(rank.get(a.id)??1e6)-(rank.get(b.id)??1e6)||a.id.localeCompare(b.id));
  const listOrder=fields.get('list-order');lists=Array.isArray(listOrder)?listOrder.map(id=>fields.get('list/'+encodeURIComponent(id))).filter(Boolean):undefined;tasks=T.parse(JSON.stringify({format:'starting-work-tasks',version:2,tasks,lists}));lists=tasks.lists;
 }
 return {account:a,generation:a?.generation||1,rows,today,timezone:R.timezone,source:saved?'profil':'standard',document:{format:'starting-work-tasks',version:2,lists,tasks:tree(tasks)},revision:await revision(a?.generation||1,rows)};
}
const publicList=list=>({today:list.today,timezone:list.timezone,source:list.source,revision:list.revision,updated_at:Math.max(0,...list.rows.map(r=>r.updated_at)),document:list.document});
const receiptSQL='SELECT payload,last_op FROM sync_records WHERE owner=? AND record_key=?';
const stale=()=>fail('Opgavelisten er ændret et andet sted. Hent den igen med get_task_list, sammenlign ændringerne, og prøv med den nye revision.');
export async function callTaskTool(name,args,db,user,{now=Date.now()}={}){
 const tool=taskTools.find(t=>t.name===name);if(!tool)fail('Ukendt opgaveværktøj.');validate(args,tool.inputSchema);
 if(!user?.userId)fail('Log ind med ChatGPT for at redigere din opgaveliste.');
 const owner=user.userId;
 if(name==='get_task_list')return publicList(await currentList(db,owner,now));
 if(!/^[a-f0-9]{64}$/.test(args.revision))fail('Brug revision fra get_task_list.');
 const requestHash=await hash(JSON.stringify({revision:args.revision,document:args.document,label:args.label||'Redigeret via ChatGPT'})),receiptKey='mcp-edit/'+await hash(owner+'\n'+args.request_id);
 const retry=async(attempt)=>{const a=await account(db,owner);if(a?.deleted)fail('Din profil er slettet.');const row=await db.prepare(receiptSQL).bind(owner,receiptKey).first();if(!row)return null;const value=JSON.parse(row.payload);if(value.requestHash!==requestHash)fail('request_id er allerede brugt til andre ændringer. Brug et nyt request_id.');return {...value.result,replayed:row.last_op!==attempt};};
 const previous=await retry();if(previous)return previous;
 const current=await currentList(db,owner,now);if(current.revision!==args.revision)stale();
 if(!Array.isArray(args.document.lists))fail('Dokumentversion 2 skal indeholde lists. Bevar listerne fra get_task_list.');
 let tasks;try{tasks=T.parse(JSON.stringify(args.document));}catch(error){fail(error.message);}
 const old=new Map(current.document.tasks.map(t=>[t.id,t]));
 // Definitions cannot claim identities owned by reminders or pinned notes.
 const {results:otherRows}=await db.prepare("SELECT payload FROM sync_records WHERE owner=? AND (record_key LIKE 'note/definition/%' OR record_key LIKE 'reminder/definition/%' OR record_key LIKE 'day/%/temporary/%') AND payload!='null'").bind(owner).all();
 const occupied=new Set(otherRows.map(r=>JSON.parse(r.payload)?.id).filter(Boolean));
 const existing=new Set(current.document.tasks.flatMap(t=>[t.id,...(t.xor?[t.xor.otherId]:[])]));
 for(const task of tasks){
  for(const id of [task.id,...(task.xor?[task.xor.otherId]:[])])if(occupied.has(id)||!existing.has(id)&&!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(id))fail('En ny opgave skal have et unikt ID med bogstaver, tal, bindestreg eller understregning.');
  if(task.boxSeed===undefined)task.boxSeed=old.get(task.id)?.boxSeed??parseInt((await hash(owner+'\n'+task.id)).slice(0,8),16);
 }
 const incomingLists=tasks.lists;tasks=tree(tasks);Object.defineProperty(tasks,'lists',{value:incomingLists});if(new TextEncoder().encode(JSON.stringify(tasks)).length>1000000)fail('Listen må højst fylde 1 MB.');const lists=tasks.lists;const document={format:'starting-work-tasks',version:2,lists,tasks};
 const values=new Map(current.rows.map(r=>[r.record_key,JSON.parse(r.payload)])),next=new Map(tasks.map(t=>[defKey(t.id),t]));next.set('order',tasks.map(t=>t.id));next.set('list-order',lists.map(l=>l.id));for(const list of lists)next.set('list/'+encodeURIComponent(list.id),list);
 const changes=[];for(const [key,value] of next)if(!equal(values.get(key),value))changes.push({key,payload:JSON.stringify(value)});
 for(const row of current.rows)if((row.record_key.startsWith('def/')||row.record_key.startsWith('list/'))&&row.payload!=='null'&&!next.has(row.record_key))changes.push({key:row.record_key,payload:'null'});
 if(!changes.length)return {saved:false,message:'Listen er allerede opdateret.',revision:current.revision,document};
 const token=crypto.randomUUID(),beforeKey=`history/${now}-${token}-before-chatgpt`,afterKey=`history/${now+1}-${token}-chatgpt`;
 changes.push({key:beforeKey,payload:JSON.stringify({createdAt:now,label:'Før ændring fra ChatGPT',tasks:current.document.tasks,lists:current.document.lists})},{key:afterKey,payload:JSON.stringify({createdAt:now+1,label:args.label||'Redigeret via ChatGPT',tasks,lists})});
 const updatedRows=new Map(current.rows.map(row=>[row.record_key,row]));for(const change of changes.filter(c=>!c.key.startsWith('history/'))){const row=updatedRows.get(change.key);updatedRows.set(change.key,{record_key:change.key,revision:(row?.revision||0)+1,payload:change.payload});}
 const result={saved:true,replayed:false,message:'Opgavelisten er gemt. Den synkroniseres ved næste opdatering på dine enheder.',saved_at:now,timezone:R.timezone,revision:await revision(current.generation,[...updatedRows.values()].sort((a,b)=>a.record_key<b.record_key?-1:a.record_key>b.record_key?1:0)),version_key:afterKey,backup_key:beforeKey,task_count:tasks.length};
 const expected=JSON.stringify(Object.fromEntries(current.rows.map(r=>[r.record_key,r.revision])));
 await db.prepare('INSERT INTO sync_accounts(owner,generation,deleted) VALUES(?,1,0) ON CONFLICT(owner) DO NOTHING').bind(owner).run();
 // The guard and every definition/history write share one D1 transaction. An
 // intervening browser edit, new task, clear, deletion or identical retry cannot
 // result in a partially replaced list. Daily records are never written here.
 const guard=db.prepare(`INSERT INTO sync_records(owner,record_key,payload,revision,last_op,updated_at)
 SELECT ?,?,?,1,?,? WHERE EXISTS (SELECT 1 FROM sync_accounts WHERE owner=? AND generation=? AND deleted=0)
 AND (SELECT count(*) FROM sync_records WHERE owner=? AND (record_key LIKE 'def/%' OR record_key='order' OR record_key LIKE 'list/%' OR record_key='list-order'))=?
 AND NOT EXISTS (SELECT 1 FROM sync_records r LEFT JOIN json_each(?) e ON r.record_key=e.key WHERE r.owner=? AND (r.record_key LIKE 'def/%' OR r.record_key='order' OR r.record_key LIKE 'list/%' OR r.record_key='list-order') AND (e.key IS NULL OR r.revision<>e.value))
 AND NOT EXISTS (SELECT 1 FROM sync_records r JOIN json_each(?) ids ON json_extract(r.payload,'$.id')=ids.value WHERE r.owner=? AND (r.record_key LIKE 'note/definition/%' OR r.record_key LIKE 'reminder/definition/%' OR r.record_key LIKE 'day/%/temporary/%') AND r.payload!='null')
 ON CONFLICT(owner,record_key) DO NOTHING`).bind(owner,receiptKey,JSON.stringify({requestHash,result}),token,now,owner,current.generation,owner,current.rows.length,expected,owner,JSON.stringify(tasks.flatMap(t=>[t.id,...(t.xor?[t.xor.otherId]:[])])),owner);
 const write=db.prepare(`INSERT INTO sync_records(owner,record_key,payload,revision,last_op,updated_at)
 SELECT ?,json_extract(value,'$.key'),json_extract(value,'$.payload'),1,?,? FROM json_each(?)
 WHERE EXISTS (SELECT 1 FROM sync_records WHERE owner=? AND record_key=? AND last_op=?)
 ON CONFLICT(owner,record_key) DO UPDATE SET payload=excluded.payload,revision=sync_records.revision+1,last_op=excluded.last_op,updated_at=excluded.updated_at`).bind(owner,token,now,JSON.stringify(changes),owner,receiptKey,token);
 const prune=db.prepare("DELETE FROM sync_records WHERE owner=? AND record_key LIKE 'history/%' AND record_key NOT IN (SELECT record_key FROM sync_records WHERE owner=? AND record_key LIKE 'history/%' ORDER BY updated_at DESC,record_key DESC LIMIT 30) AND EXISTS (SELECT 1 FROM sync_records WHERE owner=? AND record_key=? AND last_op=?)").bind(owner,owner,owner,receiptKey,token);
 await db.batch([guard,write,prune]);
 const saved=await retry(token);if(!saved)stale();return saved;
}
