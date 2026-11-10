const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../../public/tasks.js'),D=require('../../public/sync-data.js');
const {appFixture}=require('../helpers/dom.cjs');
const invalid={version:2,tasks:[]};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('an unsupported local list leaves a working native sign-in link and does not write to the server',async()=>{
 const requests=[],f=appFixture(invalid,{fetcher:async(url,options)=>{requests.push(options);return {ok:true,json:async()=>({user:null})};}});
 await tick();assert(!f.get('#startup-recovery').hidden);const login=f.get('.recovery-actions').querySelector('a');assert.equal(login.href,'/signin-with-chatgpt?return_to=%2F');assert.equal(login.target,'_top');
 assert.match(f.get('.recovery-status').textContent,/Log ind/);assert.deepEqual(f.saved(),invalid);assert(requests.every(options=>!options.method));
});
test('a signed-in visitor replaces deprecated caches and keeps server progress on single-digit dates',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-02T10:00:00Z')});
 const server=M.fresh('2026-11-02');server.tasks[1].text='Serverens dagsplan';M.toggle(server,'initial-1');const fields=D.capture(server),records=Object.entries(fields).map(([key,value])=>({key,value,revision:1}));
 const f=appFixture(invalid,{stored:[['starting-work-sync-account',JSON.stringify('alice')],['starting-work-sync-alice',JSON.stringify({pending:{bad:{value:'local'}}})]],fetcher:async()=>({ok:true,json:async()=>({user:{id:'alice'},generation:4,records})})});
 let reloads=0;f.window.location={reload(){reloads++;}};await tick();assert.equal(reloads,1);assert.equal(f.saved().tasks.find(t=>t.id==='initial-1').text,'Serverens dagsplan');assert(f.saved().tasks.find(t=>t.id==='initial-1').checked);const reopened=appFixture(f.saved());assert(reopened.saved().tasks.find(t=>t.id==='initial-1').checked);
 const meta=JSON.parse(f.storage.get('starting-work-sync-alice'));assert.equal(meta.generation,4);assert.deepEqual(meta.pending,{});assert(![...f.storage.keys()].some(key=>key.includes('recovery-backup')));
});
test('invalid server data and network errors leave recovery retryable without uploading a default list',async()=>{
 let calls=0;const f=appFixture(invalid,{fetcher:async()=>{if(++calls===1)throw Error('offline');return {ok:true,json:async()=>({user:{id:'alice'},records:[{key:'list-order',value:[]},{key:'def/bad',value:{id:'bad',text:'Bad',schedule:{frequency:'invalid'}}}]})};}});
 await tick();assert.match(f.get('.recovery-status').textContent,/ikke kontaktes/);const retry=f.get('.recovery-actions').querySelector('button');assert(!retry.disabled);retry.fire('click');await tick();assert.match(f.get('.recovery-status').textContent,/ikke åbnes/);assert.deepEqual(f.saved(),invalid);assert(!retry.disabled);
});
