const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../../public/tasks.js'),T=require('../../public/task-json.js'),V=require('../../public/task-versions.js');
const {appFixture}=require('../helpers/dom.cjs');
const day='2026-10-13';
test('portable JSON preserves task order, formatting, XOR and scoped dependencies without daily state',()=>{
 const state=M.fresh(day);state.tasks[1].text='**Plan** med _tekst_';M.toggle(state,'initial-0',1);M.defer(state,'initial-3');
 const parsed=T.parse(T.encode(state));assert.equal(parsed[0].xor.otherText,'Åbn en Monster!');assert.equal(parsed[1].text,'**Plan** med _tekst_');assert.equal(parsed[2].parentId,'initial-1');
 assert(parsed.every(task=>!('checked' in task)&&!('deferred' in task)&&!('markSeed' in task)));assert(!T.encode(state).includes('dailyAchievements'));
 const restored=T.apply(parsed,M.fresh(day),day);assert.equal(T.encode(restored),T.encode(state));
});
test('invalid input cannot silently drop tasks or break dependencies',()=>{
 const state=M.fresh(day),base=JSON.parse(T.encode(state));
 for(const change of [data=>data.tasks.push(data.tasks[0]),data=>data.tasks[1].parentId='missing',data=>data.tasks[1].parentId=data.tasks[2].id,data=>data.tasks[0].xor.otherId=data.tasks[1].id,data=>data.tasks[3].parentChoice=0]){
  const bad=JSON.parse(JSON.stringify(base));change(bad);assert.throws(()=>T.parse(JSON.stringify(bad)));
 }
 assert.throws(()=>T.parse('{'));assert.throws(()=>T.parse('{"tasks":[]}'));assert.throws(()=>T.parse(JSON.stringify({...base,version:99})));
 assert.equal(state.tasks.length,5);
});
test('import retains current status for existing identities and leaves new tasks unfinished',()=>{
 const state=M.fresh(day);M.toggle(state,'initial-0',1);M.defer(state,'initial-3');
 const tasks=T.parse(T.encode(state));tasks.push({id:'new',text:'Ny opgave',parentId:null,parentChoice:null});
 const imported=T.apply(tasks,state,day);assert(imported.tasks[0].checked);assert.equal(imported.tasks[0].xor.choice,1);assert(imported.tasks.find(t=>t.id==='initial-3').deferred);assert(!imported.tasks.at(-1).checked);
});
test('versions persist, ignore daily checkmarks, and round-trip with JSON',()=>{
 let state=M.fresh(day);const map=new Map(),storage={getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)};
 const history=V.create({getState:()=>state,storage});history.record('Første version',true);
 M.toggle(state,'initial-0',0);history.record();history.flush();assert.equal(history.list().length,1);
 state.tasks[1].text='En ny plan';history.record('Redigeret',true);assert.equal(history.list().length,2);
 const reopened=V.create({getState:()=>state,storage});assert.equal(reopened.list().length,2);
 const portable=T.read(T.encode(state,reopened.list()));assert.equal(portable.versions.length,2);assert.equal(portable.versions[0].tasks[1].text,'Åbn din dagsplan.');
 state=T.apply(reopened.get(1).tasks,state,day);reopened.record('Gendannet fra v1',true);assert.equal(reopened.list().length,3);assert(state.tasks[0].checked);
});
test('version history stays bounded while revision numbers continue increasing',()=>{
 const state=M.fresh(day),map=new Map(),storage={getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)};
 const history=V.create({getState:()=>state,storage});
 for(let i=0;i<40;i++){state.tasks[1].text=`Plan ${i}`;history.record('Redigeret',true);}
 assert.equal(history.list().length,30);assert.equal(history.list().at(-1).revision,40);
});
test('editor previews import before replacement and offers persistent undo and version restore',async()=>{
 const f=appFixture();f.get('#edit').fire('click');const original=f.saved().tasks[1].text;
 const other=M.fresh(day);other.tasks[1].text='Importeret plan';const json=T.encode(other);
 f.get('#import-file').files=[{name:'opgaver.json',size:json.length,text:async()=>json}];f.get('#import-file').fire('change');await new Promise(resolve=>setImmediate(resolve));
 assert(!f.get('#import-preview').hidden);assert.equal(f.saved().tasks[1].text,original);
 f.get('#confirm-import').fire('click');assert.equal(f.saved().tasks[1].text,'Importeret plan');assert(!f.get('#undo-import').hidden);
 assert(f.get('#task-versions').children.length>=2);
 f.get('#undo-import').fire('click');assert.equal(f.saved().tasks[1].text,original);
 f.get('#task-versions').value='2';f.get('#restore-version').fire('click');assert.equal(f.saved().tasks[1].text,'Importeret plan');
});

test('only current task documents and application state are accepted',()=>{
 const s=M.fresh(day),doc=JSON.parse(T.encode(s));
 for(const change of [d=>d.version=1,d=>delete d.format,d=>delete d.lists,d=>d.tasks[1].emphasis={effect:'underline',basis:'visible',mode:'after',minutes:1},d=>d.tasks[1].schedule={frequency:'monthly',anchor:day,monthMode:'weekday',ordinal:1}]){
  const invalid=structuredClone(doc);change(invalid);assert.throws(()=>T.parse(JSON.stringify(invalid)));
 }
 assert.throws(()=>M.restore({version:1,checked:[true]},day));const invalid=structuredClone(s);delete invalid.lists;assert.throws(()=>M.restore(invalid,day));
 assert.throws(()=>M.restore({...s,tasks:s.tasks.map((t,i)=>i===2?{...t,notePosition:{x:1,y:2}}:t)},day));
 const malformed=structuredClone(s);M.submitWriting(malformed,'initial-2',['One','Two','Three']);delete malformed.tasks[2].writingItems;assert.throws(()=>M.restore(malformed,day));
 assert.equal(T.encode(M.restore(s,day)),T.encode(s));
});
test('current history survives alongside unsupported entries without converting them',()=>{
 const s=M.fresh(day),doc=JSON.parse(T.encode(s)),entry={revision:1,createdAt:1,label:'Current',tasks:doc.tasks,lists:doc.lists};
 const obsolete={...entry,revision:2,createdAt:2,label:'Unsupported'};delete obsolete.lists;
 const store=new Map([['starting-work-task-versions',JSON.stringify({version:1,entries:[entry,obsolete]})]]),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
 const history=V.create({getState:()=>s,storage});assert.equal(history.list().length,1);assert.deepEqual(history.list()[0].lists,doc.lists);
 assert.throws(()=>T.history(obsolete));assert.throws(()=>T.read(JSON.stringify({...doc,versions:[obsolete]})));
 const D=require('../../public/sync-data.js'),fields=D.capture(s);fields['history/current']=entry;fields['history/unsupported']=obsolete;
 assert.deepEqual(D.materialize(fields,day).versions.map(v=>v.label),['Current']);
});
