const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){
 let seed=1234;
 class Particle{
  constructor(){this.style={setProperty(name,value){this[name]=value;}};this.handlers={};}
  addEventListener(name,fn){this.handlers[name]=fn;}
  remove(){layer.children=layer.children.filter(child=>child!==this);}
 }
 const layer={children:[],append(particle){this.children.push(particle);}};
 const window={innerHeight:900},document={createElement:()=>new Particle()};
 const math=Object.assign(Object.create(Math),{random:()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}});
 vm.runInNewContext(fs.readFileSync('public/confetti.js','utf8'),{window,document,Math:math});
 const ui=window.MorningConfetti.create({layer,reducedMotion:{matches:false}});return {ui,layer};
}
test('CSS confetti keeps the full burst count, with quick fades and full flights below the viewport',()=>{
 const f=fixture();for(let i=0;i<4;i++)f.ui.burst({x:40,y:800,vx:8,vy:-15,count:135,colors:['red','gold']});
 assert.equal(f.layer.children.length,540);
 const short=f.layer.children.filter(p=>p.className.includes('quick')),long=f.layer.children.filter(p=>!p.className.includes('quick'));
 assert(short.length>100&&long.length>300);
 long.forEach(p=>assert(Math.abs(parseFloat(p.style['--y8'])-940)<1e-6));
 assert(short.some(p=>parseFloat(p.style['--y8'])<900));
 assert(new Set(short.map(p=>p.style['--duration'])).size>20);
});
test('particles remove themselves only at flight completion or an explicit clear',()=>{
 const f=fixture();f.ui.burst({x:10,y:800,vx:5,vy:-12,count:84,colors:['red']});const p=f.layer.children[0];
 p.handlers.animationend({target:p,animationName:'confetti-quick-fade'});assert.equal(f.layer.children.length,84);
 p.handlers.animationend({target:p,animationName:'confetti-flight'});assert.equal(f.layer.children.length,83);
 f.ui.clear();assert.equal(f.layer.children.length,0);
});

test('downward bursts have a wider spread and higher launch speeds without reducing count',()=>{
 const up=fixture(),down=fixture();
 up.ui.burst({x:0,y:400,vx:0,vy:-12,count:200,colors:['red']});
 down.ui.burst({x:0,y:400,vx:0,vy:12,count:200,colors:['red']});
 const velocities=f=>f.layer.children.map(p=>{const age=parseFloat(p.style['--duration'])*60/8;return {x:parseFloat(p.style['--x1'])/age,y:(parseFloat(p.style['--y1'])-400-.12*age*age)/age};});
 const a=velocities(up),b=velocities(down),width=v=>Math.max(...v.map(p=>p.x))-Math.min(...v.map(p=>p.x));
 assert.equal(down.layer.children.length,200);assert(width(b)>width(a)*3);
 assert(b.reduce((n,p)=>n+Math.hypot(p.x,p.y),0)>a.reduce((n,p)=>n+Math.hypot(p.x,p.y),0)*1.4);
});
