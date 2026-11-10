(function(root){
  'use strict';
  let context,master;
  const live=new Set(),sampleLoads=new Map();
  const recordings={bronze:'sounds/party-blower.mp3',silver:'sounds/two-people-clapping.mp3',gold:'sounds/cheering-applause.mp3'};
  function score(tier){
    const pitches=tier==='gold'?[196,196,247,294,392,330,392,440,494,440,494,587]:tier==='silver'?[196,196,247,294,196,247,330,392,494]:[196,196,247,294];
    const step=tier==='gold'?.25:tier==='silver'?.21:.23;
    return {instruments:tier==='gold'?['brass','woodwind','strings','bass']:tier==='silver'?['brass','woodwind']:['brass'],notes:pitches.map((frequency,i)=>({frequency,at:i*step,duration:i===pitches.length-1?.7:step*.84}))};
  }
  function isAvailable(){return !!(root.AudioContext||root.webkitAudioContext);}
  function unlock(){
    try{
      if(!context){const Audio=root.AudioContext||root.webkitAudioContext;if(!Audio)return;context=new Audio();master=context.createGain();master.gain.value=.65;const limiter=context.createDynamicsCompressor();limiter.threshold.value=-14;limiter.knee.value=12;limiter.ratio.value=8;limiter.attack.value=.006;limiter.release.value=.18;master.connect(limiter);limiter.connect(context.destination);}
      if(context.state==='suspended')context.resume().catch(()=>{});
      Object.keys(recordings).forEach(loadRecording);
    }catch{}
  }
  function group(){let resolve;const finished=new Promise(done=>resolve=done);const g={sources:new Set(),stopped:false,pending:0,finished,resolve};live.add(g);return g;}
  function finishIfDone(g){if(!g.sources.size&&!g.pending){live.delete(g);g.resolve();}}
  function loadRecording(tier){
    if(sampleLoads.has(tier))return sampleLoads.get(tier);
    if(!context||typeof root.fetch!=='function')return Promise.resolve(null);
    const pending=root.fetch(recordings[tier]).then(response=>{if(!response.ok)throw new Error('Audio asset unavailable');return response.arrayBuffer();}).then(data=>context.decodeAudioData(data)).catch(()=>null);
    sampleLoads.set(tier,pending);return pending;
  }
  function recording(g,tier,at){
    g.pending++;
    loadRecording(tier).then(buffer=>{
      if(!buffer||g.stopped)return;
      const source=context.createBufferSource();source.buffer=buffer;
      const gain=context.createGain();gain.gain.value=tier==='bronze'?.38:.5;
      source.connect(gain);gain.connect(master);track(g,source,[gain],Math.max(at,context.currentTime+.005),buffer.duration);
    }).finally(()=>{g.pending--;finishIfDone(g);});
  }
  function stop(g){if(!g)return;g.stopped=true;for(const source of g.sources){try{source.stop();source.disconnect();}catch{}}g.sources.clear();live.delete(g);g.resolve();}
  function track(g,source,nodes,at,duration){
    if(g.stopped)return;
    g.sources.add(source);source.onended=()=>{g.sources.delete(source);for(const node of [source,...nodes])try{node.disconnect();}catch{}finishIfDone(g);};
    source.start(at);source.stop(at+duration);
  }
  function noise(g,at,duration,frequency,volume,style='noise',reverse=false){
    const length=Math.ceil(context.sampleRate*duration),buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0);let brown=0;
    for(let i=0;i<length;i++){
      const t=i/context.sampleRate,white=Math.random()*2-1;brown=(brown+white*.045)/1.045;
      data[i]=style==='scribble'?(white*.58+brown*2)*(.55+.23*Math.sin(t*135)+.16*Math.sin(t*317)):white;
    }
    if(reverse)data.reverse();
    const source=context.createBufferSource();source.buffer=buffer;
    const filter=context.createBiquadFilter();filter.type=style==='clap'?'highpass':'bandpass';filter.frequency.value=frequency;filter.Q.value=style==='pop'?.45:.7;
    const gain=context.createGain();gain.gain.setValueAtTime(.0001,at);
    if(reverse){gain.gain.exponentialRampToValueAtTime(volume*.8,at+duration*.18);gain.gain.linearRampToValueAtTime(volume,at+duration-Math.min(.018,duration*.1));gain.gain.linearRampToValueAtTime(.0001,at+duration);}
    else{gain.gain.linearRampToValueAtTime(volume,at+Math.min(.018,duration*.1));if(style==='scribble')gain.gain.setValueAtTime(volume*.8,at+duration*.82);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);}
    source.connect(filter);filter.connect(gain);gain.connect(master);track(g,source,[filter,gain],at,duration);
  }
  function voice(g,at,duration,frequency,instrument,volume=.06,slide){
    const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=instrument==='brass'?1450:instrument==='strings'?2100:instrument==='bass'?550:3000;
    const gain=context.createGain();gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(volume,at+.025);gain.gain.setValueAtTime(volume*.7,at+duration*.55);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    filter.connect(gain);gain.connect(master);
    const types=instrument==='brass'?['sawtooth','triangle']:instrument==='strings'?['sawtooth','sawtooth','triangle']:['sine','triangle'];
    types.forEach((type,i)=>{const osc=context.createOscillator();osc.type=type;osc.frequency.setValueAtTime(frequency*(i===1&&instrument==='woodwind'?2:1),at);osc.detune.value=(i-(types.length-1)/2)*7+(Math.random()-.5)*9;if(slide)osc.frequency.exponentialRampToValueAtTime(slide,at+duration*.7);osc.connect(filter);track(g,osc,i===types.length-1?[filter,gain]:[],at,duration);});
  }
  function fanfare(g,tier,at){
    const music=score(tier);
    for(const note of music.notes)for(const instrument of music.instruments){
      const frequency=instrument==='bass'?note.frequency/2:instrument==='woodwind'?note.frequency*2:note.frequency;
      voice(g,at+note.at,note.duration,frequency,instrument,tier==='gold'?.025:tier==='silver'?.045:.065);
    }
    if(tier==='gold'){
      for(const [offset,chord] of [[0,[196,247,294]],[1,[220,277,330]],[2.1,[196,294,392]]])for(const frequency of chord)voice(g,at+offset,.95,frequency,'strings',.017);
      for(const note of music.notes)noise(g,at+note.at,.11,160,.08,'pop');
    }
  }
  function scribble(duration,kind,reverse=false){
    if(!context||context.state!=='running')return ()=>{};
    const g=group();try{noise(g,context.currentTime+.005,duration,kind==='check'?2300:kind==='red'?1750:1450,kind==='check'?.14:.2,'scribble',reverse);}catch{stop(g);}return ()=>stop(g);
  }
  function begin(tier,{reactionDelay=3.6}={}){
    if(!context||context.state!=='running')return {pop(){},stop(){},finished:Promise.resolve()};
    const g=group(),at=context.currentTime+.015;
    try{fanfare(g,tier,at);recording(g,tier,context.currentTime+Math.max(0,reactionDelay));}catch{stop(g);}
    return {pop(){if(g.stopped||context.state!=='running')return;try{const now=context.currentTime+.005;const pitch=.88+Math.random()*.24;noise(g,now,.12+Math.random()*.035,750*pitch,.25+Math.random()*.05,'pop');voice(g,now,.085,100*pitch,'bass',.13,42*pitch);}catch{}},stop(){stop(g);},finished:g.finished};
  }
  function noteContact(kind){
    unlock();if(!context)return;
    if(context.state==='suspended'){context.resume().then(()=>noteContact(kind)).catch(()=>{});return;}
    if(context.state!=='running')return;
    const g=group(),at=context.currentTime+.005,variation=.94+Math.random()*.12;
    try{
      if(kind==='pickup'){
        // A brief paper peel: soft friction opening into a little air.
        noise(g,at,.135,1450*variation,.11,'paper',true);
        noise(g,at+.07,.09,2400*variation,.045,'paper');
      }else{
        // Low, short contact with a table, followed by the paper settling.
        const tone=context.createOscillator(),gain=context.createGain();tone.type='sine';
        tone.frequency.setValueAtTime(145*variation,at);tone.frequency.exponentialRampToValueAtTime(48*variation,at+.11);
        gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(.2,at+.006);gain.gain.exponentialRampToValueAtTime(.0001,at+.17);
        tone.connect(gain);gain.connect(master);track(g,tone,[gain],at,.18);
        noise(g,at,.07,680*variation,.12,'paper');noise(g,at+.035,.12,1650*variation,.035,'paper');
      }
    }catch{stop(g);}
  }
  function stopAll(){for(const g of [...live])stop(g);}
  const api={notePickup:()=>noteContact('pickup'),noteSetdown:()=>noteContact('setdown'),unlock,isAvailable,scribble,begin,stopAll,score};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MorningSound=api;
  if(typeof document!=='undefined'){document.addEventListener('pointerdown',unlock,{capture:true,passive:true});document.addEventListener('keydown',unlock,{capture:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAll();});}
})(typeof window!=='undefined'?window:globalThis);
