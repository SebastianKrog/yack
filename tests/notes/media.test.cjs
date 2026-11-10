const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../../public/tasks.js'),T=require('../../public/task-json.js'),D=require('../../public/sync-data.js'),Media=require('../../public/media-model.js');
const {database}=require('../helpers/database.cjs');
const asset={id:'12345678-1234-4234-8234-123456789012',name:'Plan.pdf',type:'application/pdf',size:14,width:420,height:595,pages:3};
test('PDF backing paper matches the dominant page edge colour despite marks and thumbnail noise',()=>{
 const width=32,height=32,data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4)data.set([246,238,211,255],i);
 for(let x=4;x<8;x++)data.set([20,20,20,255],(width+x)*4);data.set([245,239,212,255],(width+10)*4);
 assert.equal(Media.paperColor({data,width,height}),'#f6eed3');data.fill(255);assert.equal(Media.paperColor({data,width,height}),'#ffffff');
});
function state(permanent=false){const s=M.fresh('2026-10-23');s.tasks=[];const t=M.createTemporaryNote(s,'pdf',{mode:'media',count:1,asset,mat:'small',asTasks:true});if(permanent)M.setNotePermanence(s,t.id,true);M.submitWriting(s,t.id,[asset.name]);return s;}
test('media notes persist and sync, can be checked/deferred and retain permanent progress across midnight',()=>{
 const s=state(true),t=s.tasks[0],item=t.writingItems[0];assert.equal(M.achievementTasks(s).length,1);M.toggleWritingItem(s,t.id,item.id);assert(M.noteComplete(t));assert.equal(M.achievementTasks(s).filter(t=>!t.permanentNote).length,0);
 M.resizeNote(s,t.id,{width:400,height:700});assert.deepEqual(t.noteSize,{width:400,height:0});
 const restored=D.materialize(D.capture(s),'2026-10-24').state.tasks[0];assert.equal(restored.writing.asset.pages,3);assert(restored.writingItems[0].checked);assert.deepEqual(restored.noteSize,{width:400,height:0});
 M.toggleWritingItem(s,t.id,item.id);M.deferWritingItem(s,t.id,item.id);assert(M.noteComplete(t));assert.equal(M.toggleWritingItem(s,t.id,item.id),null);assert(M.canArchiveNote(t));
 const daily=state();M.resetDay(daily,'2026-10-24');assert.equal(daily.tasks.length,0);
});
test('recurring file definitions survive daily resets and JSON versions without embedding file contents',()=>{
 const s=M.fresh('2026-10-23');s.tasks=[];M.add(s,'Læs planen',null,'file');M.configureWriting(s,'file',{mode:'media',count:1,asset,mat:'large'});M.submitWriting(s,'file',[asset.name]);const doc=T.encode(s);assert.equal(T.parse(doc)[0].writing.asset.id,asset.id);assert(!doc.includes('writingAnswer'));M.resetDay(s,'2026-10-24');assert(!s.tasks[0].checked);assert.equal(s.tasks[0].writing.asset.id,asset.id);
 assert.throws(()=>M.submitWriting({day:s.day,tasks:[{...s.tasks[0],writing:{mode:'media',count:1}}]},'file',['x']));
 assert(!Media.validAsset({...asset,type:'image/svg+xml'}));assert(!Media.validAsset({...asset,pages:0}));assert(!Media.validAsset({...asset,width:NaN}));assert(!M.validWriting({mode:'media',count:1,mat:'huge'}));
 const image={...asset,type:'image/jpeg',pages:1,width:900,height:600};assert.equal(Media.ratio({asset:image,mat:'none'}),1.5);assert(Media.ratio({asset:image,mat:'large'})<1.5);assert.equal(Media.border({}),'small');
});
function bucket(){const map=new Map();return {map,async put(key,value,options){map.set(key,{bytes:new Uint8Array(value),httpMetadata:options?.httpMetadata});},async get(key){const o=map.get(key);return o&&{...o,body:o.bytes,size:o.bytes.length};},async delete(keys){for(const key of [keys].flat())map.delete(key);},async list({prefix}){return {objects:[...map.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false};}};}
const alice={userId:'alice'},bob={userId:'bob'},base='https://example.test';
async function setup(db){for(const u of [alice,bob])await db.prepare('INSERT INTO sync_accounts(owner,generation,deleted) VALUES(?,1,0)').bind(u.userId).run();}
async function upload(db,b,who=alice,{type=asset.type,generation=1,origin=base}={}){const form=new FormData();form.append('asset',JSON.stringify({...asset,type}));form.append('file',new Blob(['%PDF-1.7\nhello'],{type}),'Plan.pdf');form.append('preview',new Blob([new Uint8Array([255,216,255,1])],{type:'image/jpeg'}),'preview.jpg');const {handleMedia}=await import('../../server/media-service.mjs');return handleMedia(new Request(base+'/api/media?generation='+generation,{method:'POST',headers:{Origin:origin},body:form}),db,b,who);}
test('file storage requires sign-in, verifies signatures, rejects foreign origins and isolates accounts',async()=>{
 const db=database(),b=bucket();await setup(db);assert.equal((await upload(db,b,null)).status,401);assert.equal((await upload(db,b,alice,{origin:'https://other.test'})).status,403);assert.equal((await upload(db,b,alice,{type:'image/jpeg'})).status,400);assert.equal((await upload(db,b,alice,{generation:2})).status,409);
 assert.equal((await upload(db,b)).status,200);const {handleMedia}=await import('../../server/media-service.mjs');const get=who=>handleMedia(new Request(base+'/api/media?id='+asset.id),db,b,who);assert.equal((await get(bob)).status,404);const response=await get(alice);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'application/pdf');assert.equal(response.headers.get('Content-Disposition'),'attachment');assert.equal(await response.text(),'%PDF-1.7\nhello');
});
test('clearing retains file backups; deleting an account also removes its files without affecting other accounts',async()=>{
 const db=database(),b=bucket();await setup(db);await upload(db,b,alice);await upload(db,b,bob);const {handleSync}=await import('../../server/sync-service.mjs');const action=(action,generation,confirmation)=>handleSync(new Request(base+'/api/sync?day=2026-10-23',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action,generation,confirmation})}),db,alice,b);
 assert.equal((await action('clear',1)).status,200);assert.equal(b.map.size,4);assert.equal((await action('delete',2,'DELETE')).status,200);assert.equal(b.map.size,2);
});
