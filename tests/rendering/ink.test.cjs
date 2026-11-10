const test=require('node:test');
const assert=require('node:assert/strict');
const I=require('../../public/ink.js');
const {appFixture}=require('../helpers/dom.cjs');
test('seeded pressure varies smoothly within subtle limits and tapers the tips',()=>{
 const a=I.pressure(123,200),b=I.pressure(123,200),c=I.pressure(124,200);
 const samples=Array.from({length:101},(_,i)=>a(i/100));
 assert.deepEqual(samples,Array.from({length:101},(_,i)=>b(i/100)));
 assert.notDeepEqual(samples,Array.from({length:101},(_,i)=>c(i/100)));
 assert(samples.every(p=>p>=.68&&p<=1.14));assert(new Set(samples.map(p=>p.toFixed(3))).size>20);
 assert(a(0)<a(.025));assert(a(1)<a(.975));
 for(let i=4;i<96;i++)assert(Math.abs(samples[i]-samples[i-1])<.035);
});
test('the filled outline follows curves, has finite coordinates and deterministic thickness',()=>{
 const points=Array.from({length:101},(_,i)=>({x:i*2,y:10+Math.sin(i/20)*4}));
 const d=I.outline(points,5,123,200);assert.equal(d,I.outline(points,5,123,200));assert.notEqual(d,I.outline(points,5,124,200));
 assert(d.startsWith('M'));assert(d.endsWith(' Z'));assert(!/NaN|Infinity/.test(d));
});
test('pressure keeps the original animated path as a reveal mask and uses a filled ink outline',()=>{
 const f=appFixture(),doc=f.doc,svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');doc.body.append(svg);
 const path=doc.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M0 10 L100 10');path.setAttribute('pathLength','1');
 path.getTotalLength=()=>{throw Error('Native length must not be called');};path.getPointAtLength=()=>{throw Error('Native sampling must not be called');};svg.append(path);
 const g=I.apply(path,{width:5,color:'#bd3029',seed:123});
 assert.equal(path.parentNode.tag,'mask');assert.equal(path.getAttribute('pathLength'),'1');assert.equal(path.style.stroke,'#fff');
 const body=g.children[1];assert.equal(body.style.fill,'#bd3029');assert.equal(body.style.stroke,'none');assert.equal(body.style.transition,'none');
 assert.equal(body.getAttribute('mask'),`url(#${g.querySelector('mask').getAttribute('id')})`);
});


test('curve sampling preserves endpoints, smooth cubic continuation and arc length',()=>{
 const line=I.sample('M0 10 L100 10');assert.equal(line.length,100);assert.deepEqual(line.points[0],{x:0,y:10});assert.deepEqual(line.points.at(-1),{x:100,y:10});
 const q=I.sample('M0 0 Q50 100 100 0');assert.deepEqual(q.points[0],{x:0,y:0});assert.deepEqual(q.points.at(-1),{x:100,y:0});assert(Math.abs(q.points[Math.floor(q.points.length/2)].y-50)<.1);
 let reference=0,previous={x:0,y:0};for(let i=1;i<=10000;i++){const t=i/10000,next={x:100*t,y:200*t*(1-t)};reference+=Math.hypot(next.x-previous.x,next.y-previous.y);previous=next;}assert(Math.abs(q.length-reference)<.2);
 const smooth=I.sample('M0 0 C10 20 20 20 30 0 S50 -20 60 0'),explicit=I.sample('M0 0 C10 20 20 20 30 0 C40 -20 50 -20 60 0');assert.deepEqual(smooth,explicit);
 assert.equal(I.sample('M0 0 A20 20 0 0 0 50 50'),null);assert.equal(I.sample('M0 0 Q2 3'),null);
});

test('long deferred strokes are sampled once and stay bounded without native SVG APIs',()=>{
 const D=require('../../public/deferral.js'),d=D.stroke({x:0,y:18,width:1200,height:36},9123),a=I.sample(d);
 assert(a.points.length<=1801);assert(a.length>1200);assert(a.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));assert.equal(I.sample(d),a);
});


test('unchanged task geometry retains its pressure paths across redraws',()=>{
 const f=appFixture(),row=f.get('.checklist').children[0],group=row.querySelector('.xor-group-defer-strike');
 row.querySelector('.defer-button').fire('click');const mark=group.children[0];assert(mark);
 // Visibility refresh runs render and layoutMarks again, without changing dimensions.
 f.doc.body.fire('visibilitychange');assert.equal(group.children[0],mark);
});
