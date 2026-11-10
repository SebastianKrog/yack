const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Sound=require('../../public/sound.js');
function fixture(random){
 const sources=[],buffers=[];let context;
 const param=()=>({value:0,setValueAtTime(value,time){this.events??=[];this.events.push([value,time]);assert(Number.isFinite(value)&&Number.isFinite(time));},linearRampToValueAtTime(value,time){assert(Number.isFinite(value)&&Number.isFinite(time));},exponentialRampToValueAtTime(value,time){assert(value>0&&Number.isFinite(time));}});
 const node=()=>({connect(){},disconnect(){}});
 class Audio{
  constructor(){context=this;this.state='running';this.currentTime=10;this.sampleRate=8000;this.destination=node();}
  createGain(){return {...node(),gain:param()};}
  createDynamicsCompressor(){return {...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()};}
  createBiquadFilter(){return {...node(),frequency:param(),Q:param()};}
  decodeAudioData(){return Promise.resolve({duration:3,recorded:true});}
  createBuffer(_,length){const data=new Float32Array(length);buffers.push(data);return {getChannelData:()=>data};}
  source(extra={}){const source={...node(),...extra,start(at){this.at=at;},stop(at){this.stops=(this.stops||0)+1;if(at!==undefined)this.end=at;}};sources.push(source);return source;}
  createBufferSource(){return this.source({kind:'noise'});}
  createOscillator(){return this.source({kind:'tone',frequency:param(),detune:param()});}
 }
 const window={AudioContext:Audio,fetch:()=>Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(new ArrayBuffer(8))})};vm.runInNewContext(fs.readFileSync('public/sound.js','utf8'),{window,Math:random?Object.assign(Object.create(Math),{random}):Math});window.MorningSound.unlock();
 return {sound:window.MorningSound,sources,buffers,context};
}
test('fanfares grow from one instrument to two and then an ensemble with a longer phrase',()=>{
 const bronze=Sound.score('bronze'),silver=Sound.score('silver'),gold=Sound.score('gold');
 assert.equal(bronze.instruments.length,1);assert.equal(silver.instruments.length,2);assert.equal(gold.instruments.length,4);
 assert.equal(bronze.notes.length,4);assert.equal(silver.notes.length,9);assert.equal(gold.notes.length,12);
 assert(gold.notes.at(-1).at>silver.notes.at(-1).at);
});
test('every kind of scribble produces a finite friction buffer and can be cancelled',()=>{
 for(const kind of ['red','defer','check']){const f=fixture(),stop=f.sound.scribble(.45,kind);assert.equal(f.sources.length,1);assert.equal(f.buffers[0].length,3600);assert(f.buffers[0].every(Number.isFinite));stop();assert.equal(f.sources[0].stops,2);}
});
test('bronze, silver and gold reactions use recordings just before cannon time and remain fully cancellable',async()=>{
 for(const tier of ['bronze','silver','gold']){
  const f=fixture(),handle=f.sound.begin(tier,{reactionDelay:3.16});
  await new Promise(resolve=>setImmediate(resolve));
  assert(f.sources.some(source=>source.buffer?.recorded));
  const reaction=f.sources.find(source=>source.buffer?.recorded);
  assert.equal(reaction.at,f.context.currentTime+3.16,'Reaction should lead the first shot by 200ms after the 440ms entrance');
  assert(f.sources.filter(source=>source.kind==='tone').some(source=>Math.abs(source.detune.value)>1));
  const count=f.sources.length;handle.pop();assert(f.sources.length>count);
  handle.stop();const stopped=f.sources.length;handle.pop();assert.equal(f.sources.length,stopped);assert(f.sources.every(source=>source.stops>=2));
 }
});

test('cannon pops vary pitch independently',()=>{
 const f=fixture(),handle=f.sound.begin('bronze');
 handle.pop();const a=f.sources.at(-2).frequency.events[0][0];
 handle.pop();const b=f.sources.at(-2).frequency.events[0][0];
 assert.notEqual(a,b);handle.stop();
});

test('undo scratch plays the friction waveform backwards',()=>{
 const forward=fixture(()=>.7),reverse=fixture(()=>.7);
 forward.sound.scribble(.26,'reverse',false);reverse.sound.scribble(.26,'reverse',true);
 assert.deepEqual([...reverse.buffers[0]],[...forward.buffers[0]].reverse());
});

test('paper pickup rustles and setdown adds a short low thump with finite audio',()=>{
 const f=fixture();f.sound.notePickup();assert.equal(f.sources.length,2);assert(f.sources.every(s=>s.kind==='noise'&&s.end-s.at<.2));
 f.sound.noteSetdown();assert.equal(f.sources.length,5);const thump=f.sources.find(s=>s.kind==='tone');assert(thump);assert(thump.frequency.events[0][0]>120&&thump.frequency.events[0][0]<170);assert(thump.end-thump.at<.2);assert(f.buffers.every(b=>b.every(Number.isFinite)));
 f.sound.stopAll();assert(f.sources.every(s=>s.stops>=2));
});
