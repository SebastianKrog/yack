import R from '../public/reminders.js';
import T from '../public/task-json.js';
import M from '../public/tasks.js';
import {deleteMedia} from './media-service.mjs';
const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
export async function handleSync(request,db,user,bucket){
  if(!user)return request.method==='GET'?reply({user:null}):reply({error:'Sign in required'},401);
  const url=new URL(request.url),day=url.searchParams.get('day');
  if(!/^\d{4}-\d{1,2}-\d{1,2}$/.test(day||''))return reply({error:'Invalid day'},400);
  await db.prepare('INSERT INTO sync_accounts(owner,generation,deleted) VALUES(?,1,0) ON CONFLICT(owner) DO NOTHING').bind(user.userId).run();
  const account=await db.prepare('SELECT generation,deleted FROM sync_accounts WHERE owner=?').bind(user.userId).first();
  if(request.method==='GET'){
    if(account.deleted)return reply({user:{id:user.userId,name:user.displayName},generation:account.generation,records:[],deleted:true});
    const result=await db.prepare("SELECT record_key AS key,payload,revision,last_op AS op,updated_at AS updatedAt FROM sync_records WHERE owner=? AND (record_key NOT LIKE 'day/%' OR record_key LIKE ?) ORDER BY updated_at,record_key LIMIT 20001").bind(user.userId,`day/${day}/%`).all();
    if(result.results.length>20000)return reply({error:'Too many records'},413);
    return reply({user:{id:user.userId,name:user.displayName},generation:account.generation,deleted:false,records:result.results.map(row=>({key:row.key,value:JSON.parse(row.payload),revision:row.revision,op:row.op,updatedAt:row.updatedAt}))});
  }
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'Invalid request origin'},403);
  const raw=await request.text();if(raw.length>4000000)return reply({error:'Request too large'},413);
  let body;try{body=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}
  const generation=body?.generation;
  if(!Number.isSafeInteger(generation)||generation<1)return reply({error:'Valid sync generation required'},400);
  if(generation!==account.generation)return reply({reset:true,generation:account.generation,deleted:!!account.deleted},409);
  if(['clear','delete','create'].includes(body.action)){
    if(body.action==='create'&&!account.deleted)return reply({generation:account.generation,deleted:false});
    if(body.action==='delete'&&body.confirmation!=='DELETE')return reply({error:'Type DELETE to confirm deletion'},400);
    const deleted=body.action==='delete'?1:0,now=Date.now(),statements=[];
    if(body.action==='clear'){
      const stored=await db.prepare("SELECT record_key,payload FROM sync_records WHERE owner=? AND record_key NOT LIKE 'history/%'").bind(user.userId).all();
      const fields=Object.fromEntries(stored.results.map(row=>[row.record_key,JSON.parse(row.payload)])),order=fields['list-order']||[];
      try{T.history({createdAt:now,label:'Kontrol før rydning',tasks:Object.entries(fields).filter(([key,value])=>key.startsWith('def/')&&value).map(([,value])=>value),lists:order.map(id=>fields['list/'+encodeURIComponent(id)]),snapshot:{day,fields}});}catch{return reply({error:'Unsupported stored backup format'},400);}
      statements.push(db.prepare(`INSERT INTO sync_records(owner,record_key,payload,revision,last_op,updated_at)
        SELECT ?,?,json_object('createdAt',?,'label','Før rydning (onlineprofil)','tasks',json(COALESCE((SELECT json_group_array(json(payload)) FROM (SELECT r.payload FROM sync_records r JOIN json_each((SELECT payload FROM sync_records WHERE owner=? AND record_key='order')) ord ON json_extract(r.payload,'$.id')=ord.value WHERE r.owner=? AND r.record_key LIKE 'def/%' AND r.payload!='null' ORDER BY CAST(ord.key AS INTEGER))),'[]')),'lists',json(COALESCE((SELECT json_group_array(json(payload)) FROM (SELECT r.payload FROM sync_records r JOIN json_each((SELECT payload FROM sync_records WHERE owner=? AND record_key='list-order')) ord ON json_extract(r.payload,'$.id')=ord.value WHERE r.owner=? AND r.record_key LIKE 'list/%' AND r.payload!='null' ORDER BY CAST(ord.key AS INTEGER))),'[]')),'snapshot',json_object('day',?,'fields',json(COALESCE((SELECT json_group_object(record_key,json(payload)) FROM sync_records WHERE owner=? AND record_key NOT LIKE 'history/%'),'{}')))),1,?,?
        WHERE EXISTS (SELECT 1 FROM sync_accounts WHERE owner=? AND generation=? AND deleted=0)`)
        .bind(user.userId,`history/${now}-before-clear-cloud-${generation}`,now,user.userId,user.userId,user.userId,user.userId,day,user.userId,`clear-${now}`,now,user.userId,generation));
      if(body.backup){
        if(!Array.isArray(body.backup.tasks)||!Array.isArray(body.backup.lists)||!body.backup.snapshot||typeof body.backup.snapshot.fields!=='object'||!body.backup.snapshot.fields||JSON.stringify(body.backup).length>1800000)return reply({error:'Invalid backup'},400);
        const backup={createdAt:now+1,label:'Før rydning (denne enhed)',tasks:body.backup.tasks,lists:body.backup.lists,snapshot:body.backup.snapshot};
        try{T.history(backup);}catch{return reply({error:'Invalid backup format'},400);}
        statements.push(db.prepare('INSERT INTO sync_records(owner,record_key,payload,revision,last_op,updated_at) SELECT ?,?,?,1,?,? WHERE EXISTS (SELECT 1 FROM sync_accounts WHERE owner=? AND generation=? AND deleted=0)').bind(user.userId,`history/${now+1}-before-clear-local-${generation}`,JSON.stringify(backup),`clear-local-${now}`,now+1,user.userId,generation));
      }
    }
    statements.push(
      db.prepare(`DELETE FROM sync_records WHERE owner=? AND ${body.action==='clear'?"record_key NOT LIKE 'history/%' AND ":''}EXISTS (SELECT 1 FROM sync_accounts WHERE owner=? AND generation=?)`).bind(user.userId,user.userId,generation),
      db.prepare('UPDATE sync_accounts SET generation=generation+1,deleted=? WHERE owner=? AND generation=? RETURNING generation,deleted').bind(deleted,user.userId,generation)
    );
    const reset=await db.batch(statements),next=reset.at(-1).results[0];if(!next)return reply({reset:true},409);
    if(body.action==='clear'){
      const history=await db.prepare("SELECT record_key AS key,payload,revision,last_op AS op,updated_at AS updatedAt FROM sync_records WHERE owner=? AND record_key LIKE 'history/%'").bind(user.userId).all();
      return reply({generation:next.generation,deleted:false,records:history.results.map(row=>({key:row.key,value:JSON.parse(row.payload),revision:row.revision,op:row.op,updatedAt:row.updatedAt}))});
    }
    if(body.action==='delete')await deleteMedia(bucket,user.userId);
    return reply({generation:next.generation,deleted:!!next.deleted});
  }
  if(account.deleted)return reply({reset:true,generation:account.generation,deleted:true},409);
  if(!Array.isArray(body.ops)||!body.ops.length||body.ops.length>100)return reply({error:'Invalid operations'},400);
  const keys=new Set();
  for(const op of body.ops){
    if(!op||typeof op.key!=='string'||op.key.length>450||keys.has(op.key)||!(/^(def|list|position|mobile-position|size|history)\/[^/]+$/.test(op.key)||/^stats\/\d{4}-\d{2}-\d{2}$/.test(op.key)||/^week\/\d{4}-\d{2}-\d{2}\/achievement\/[^/]+$/.test(op.key)||(op.key==='order'||op.key==='list-order')||/^reminder\/(definition|status)\/[^/]+$/.test(op.key)||/^note\/(definition|status|answer|draft|check|archive|position|mobile-position|size)\/[^/]+(?:\/\d+)?$/.test(op.key)||/^day\/\d{4}-\d{1,2}-\d{1,2}\/(status|answer|draft|check|seen|achievement|archive|temporary|position|mobile-position|size)\/[^/]+(?:\/\d+)?$/.test(op.key))||!Number.isSafeInteger(op.base)||op.base<0||typeof op.id!=='string'||op.id.length<8||op.id.length>100||op.value===undefined||new TextEncoder().encode(JSON.stringify(op.value)).length>1800000)return reply({error:'Invalid operation'},400);
    if(op.key.startsWith('reminder/definition/')&&op.value!==null&&(!R.validId(op.value?.id)||op.key!=='reminder/definition/'+op.value.id||!R.validMeta(op.value.reminder)||typeof op.value.text!=='string'||!op.value.text.trim()||op.value.text.length>300||op.value.writing||op.value.xor||op.value.temporaryDay||op.value.permanentNote))return reply({error:'Invalid reminder'},400);
    if(op.value!==null&&(/(?:^|\/)position\//.test(op.key)&&!M.validPosition(op.value)||/(?:^|\/)mobile-position\//.test(op.key)&&!M.validMobilePosition(op.value)))return reply({error:'Invalid position format'},400);
    if(op.key.startsWith('def/')&&op.value!==null){try{T.definition(op.value);}catch{return reply({error:'Invalid task format'},400);}}
    if(op.key.startsWith('history/')&&op.value!==null){try{T.history(op.value);}catch{return reply({error:'Invalid history format'},400);}}
    keys.add(op.key);
  }
  const statements=body.ops.map(op=>op.base===0?
    db.prepare('INSERT INTO sync_records(owner,record_key,payload,revision,last_op,updated_at) SELECT ?,?,?,1,?,? WHERE EXISTS (SELECT 1 FROM sync_accounts WHERE owner=? AND generation=? AND deleted=0) ON CONFLICT(owner,record_key) DO NOTHING RETURNING record_key AS key,payload,revision,last_op AS op,updated_at AS updatedAt').bind(user.userId,op.key,JSON.stringify(op.value),op.id,Date.now(),user.userId,generation):
    db.prepare('UPDATE sync_records SET payload=?,revision=revision+1,last_op=?,updated_at=? WHERE owner=? AND record_key=? AND revision=? AND last_op<>? AND EXISTS (SELECT 1 FROM sync_accounts WHERE owner=? AND generation=? AND deleted=0) RETURNING record_key AS key,payload,revision,last_op AS op,updated_at AS updatedAt').bind(JSON.stringify(op.value),op.id,Date.now(),user.userId,op.key,op.base,op.id,user.userId,generation));
  const results=await db.batch(statements),accepted=[],conflicts=[];
  const current=await db.prepare('SELECT generation,deleted FROM sync_accounts WHERE owner=?').bind(user.userId).first();
  if(current.generation!==generation||current.deleted)return reply({reset:true,generation:current.generation,deleted:!!current.deleted},409);
  for(let i=0;i<body.ops.length;i++){
    let row=results[i].results[0];
    if(!row)row=await db.prepare('SELECT record_key AS key,payload,revision,last_op AS op,updated_at AS updatedAt FROM sync_records WHERE owner=? AND record_key=?').bind(user.userId,body.ops[i].key).first();
    const record=row?{key:row.key,value:JSON.parse(row.payload),revision:row.revision,op:row.op,updatedAt:row.updatedAt}:{key:body.ops[i].key,value:null,revision:0,op:null};
    if(record.op===body.ops[i].id)accepted.push(record);else conflicts.push(record);
  }
  // Version snapshots are bounded, while daily records retain their own dates.
  await db.prepare("DELETE FROM sync_records WHERE owner=? AND record_key LIKE 'history/%' AND record_key NOT IN (SELECT record_key FROM sync_records WHERE owner=? AND record_key LIKE 'history/%' ORDER BY updated_at DESC,record_key DESC LIMIT 30)").bind(user.userId,user.userId).run();
  return reply({accepted,conflicts});
}
