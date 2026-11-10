const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../../public/tasks.js');
const A=require('../../public/achievements.js');
const day='2026-10-13';
function fresh(count=5){const s=M.fresh(day);s.tasks=[];for(let i=0;i<count;i++)M.add(s,`Task ${i}`,null,`${i}`);return s;}
function complete(s,n=s.tasks.length){for(let i=0;i<n;i++)M.toggle(s,`${i}`);}
test('five-task progress and simultaneous daily unlocks',()=>{
 const s=fresh();complete(s,4);assert.deepEqual(A.progress(s).slice(0,4).map(p=>p.current),[4,4,4,0]);assert.deepEqual(A.claim(s).map(p=>p.id),['daily-first']);
 M.toggle(s,'4');assert.deepEqual(A.claim(s).map(p=>p.id),['daily-five','daily-all']);assert(A.progress(s).filter(p=>['daily-first','daily-five','daily-all'].includes(p.id)).every(p=>p.earned));
});
test('all tasks includes dependent tasks that are still hidden',()=>{
 const s=fresh(1);M.add(s,'Follow-up','0','child');M.toggle(s,'0');assert.deepEqual(A.claim(s).map(p=>p.id),['daily-first']);
 assert.equal(A.progress(s).find(p=>p.id==='daily-all').target,2);M.toggle(s,'child');assert.deepEqual(A.claim(s).map(p=>p.id),['daily-all']);
});
test('each achievement is claimed only once per day, even after unticking',()=>{
 const s=fresh();complete(s);A.claim(s);M.toggle(s,'0');M.toggle(s,'0');assert.deepEqual(A.claim(s),[]);
 M.toggle(s,'0');assert(A.progress(s).filter(p=>['daily-first','daily-five','daily-all'].includes(p.id)).every(p=>p.earned));
});
test('reopening restores awards and cannot replay celebration',()=>{
 const s=fresh();complete(s);A.claim(s,undefined,123456);
 const restored=M.restore(JSON.parse(JSON.stringify(s)),day);assert(A.progress(restored).filter(p=>['daily-first','daily-five','daily-all'].includes(p.id)).every(p=>p.earned));assert.deepEqual(A.claim(restored),[]);
});
test('midnight resets both awards and progress but preserves tasks',()=>{
 const s=fresh();complete(s);A.claim(s);M.resetDay(s,'2026-10-14');
 assert.equal(s.tasks.length,5);assert(A.progress(s).filter(p=>p.scope==='day').every(p=>!p.earned&&p.current===0));complete(s);assert.equal(A.claim(s).filter(p=>p.scope==='day').length,3);
});
test('an empty list cannot earn completed-all',()=>{
 const s=fresh(0);assert.deepEqual(A.claim(s),[]);assert.equal(A.progress(s).find(p=>p.id==='daily-all').ratio,0);
});
test('the first completed task unlocks the first-task award exactly once',()=>{
 const s=fresh();assert.deepEqual(A.claim(s),[]);M.toggle(s,'2');assert.deepEqual(A.claim(s).map(p=>p.id),['daily-first']);
 M.toggle(s,'2');M.toggle(s,'1');assert.deepEqual(A.claim(s),[]);
});
test('adding tasks after earning all does not revoke the daily achievement',()=>{
 const s=fresh();complete(s);A.claim(s);M.add(s,'Another task',null,'another');assert(A.progress(s).find(p=>p.id==='daily-all').earned);
});
test('data-driven custom definitions use the same progress and claiming engine',()=>{
 const s=fresh(3);const defs=[{id:'custom-three',title:'Three!',scope:'day',rule:{type:'completed-count',target:3}}];
 complete(s,2);assert.equal(A.progress(s,defs)[0].ratio,2/3);assert.deepEqual(A.claim(s,defs),[]);
 M.toggle(s,'2');assert.equal(A.claim(s,defs)[0].id,'custom-three');assert.deepEqual(A.claim(s,defs),[]);
});
test('unsupported rules are ignored and custom IDs cannot alter the record prototype',()=>{
 const s=fresh(1);complete(s);const defs=[{id:'__proto__',title:'Custom',scope:'day',rule:{type:'completed-count',target:1}},{id:'invalid',scope:'day',rule:{type:'toString'}}];
 assert.equal(A.claim(s,defs).length,1);assert.equal(Object.getPrototypeOf(s.dailyAchievements.earned),Object.prototype);assert(A.progress(s,defs)[0].earned);
});
test('the first deferral trophy counts explicit tasks and excludes inherited descendants',()=>{
 const s=fresh(1);M.add(s,'Child','0','child');M.add(s,'Grandchild','child','grandchild');M.defer(s,'0');
 const p=A.progress(s).find(p=>p.id==='daily-defer-first');assert.equal(p.current,1);
 assert.deepEqual(A.claim(s).map(p=>p.id),['daily-defer-first']);
 assert.equal(A.progress(s).find(p=>p.id==='daily-first').current,0);
 M.defer(s,'0');M.defer(s,'0');assert.deepEqual(A.claim(s),[]);
});
test('custom deferral rules count previously explicit child deferrals as well',()=>{
 const s=fresh(1);M.add(s,'Child','0','child');M.toggle(s,'0');M.defer(s,'child');M.defer(s,'0');
 const defs=[{id:'two-deferrals',title:'Two',scope:'day',rule:{type:'deferred-count',target:2}}];
 assert.equal(A.progress(s,defs)[0].current,2);assert.equal(A.claim(s,defs).length,1);
});
test('deferral awards persist across reloads and reset at midnight',()=>{
 const s=fresh();M.defer(s,'2');A.claim(s);
 const restored=M.restore(JSON.parse(JSON.stringify(s)),day);assert.deepEqual(A.claim(restored),[]);
 M.resetDay(restored,'2026-10-14');assert.equal(A.progress(restored).find(p=>p.id==='daily-defer-first').current,0);
 M.defer(restored,'1');assert.deepEqual(A.claim(restored).filter(p=>p.scope==='day').map(p=>p.id),['daily-defer-first']);
});

test('achievement tiers are data-driven and unspecified or unsupported tiers default to bronze',()=>{
 const s=fresh();assert.deepEqual(A.progress(s).map(p=>p.tier),['bronze','silver','gold','bronze','bronze','silver','silver','bronze','bronze','silver','gold']);
 const defs=['bronze','silver','gold',undefined,'platinum'].map((tier,i)=>({id:String(i),tier,scope:'day',rule:{type:'completed-count',target:1}}));
 assert.deepEqual(A.progress(s,defs).map(p=>p.tier),['bronze','silver','gold','bronze','bronze']);
});
