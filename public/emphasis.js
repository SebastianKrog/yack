(function(root){
 'use strict';
  const {t:translateUI}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Copenhagen',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const effects=['glow','fire','pulse','dance','circle','wobble'];
 const labels={glow:translateUI("Glød"),fire:translateUI("Ild"),pulse:translateUI("Pulseren"),dance:translateUI("Dansende bogstaver"),circle:translateUI("Tegn tre cirkler"),wobble:translateUI("Vuggen")};
 function normalize(value){
  if(value==null)return null;
  if(!value||!effects.includes(value.effect)||!['after','until'].includes(value.mode)||!['clock','visible'].includes(value.basis))throw new Error(translateUI("Vælg en gyldig fremhævning."));
  const result={effect:value.effect,mode:value.mode,basis:value.basis};
  if(value.basis==='clock'){if(typeof value.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))throw new Error(translateUI("Vælg et klokkeslæt."));result.time=value.time;}
  else {if(!Number.isInteger(value.minutes)||value.minutes<1||value.minutes>10080)throw new Error(translateUI("Vælg mellem 1 og 10.080 minutter."));result.minutes=value.minutes;}
  return result;
 }
 function safe(value){try{return normalize(value);}catch{return null;}}
 function firstSeen(value){return Object.fromEntries(Object.entries(value&&typeof value==='object'?value:{}).filter(([id,time])=>id.length<=200&&Number.isFinite(time)&&time>=0&&time<=8640000000000000));}
 function observe(state,ids,now=Date.now()){
  state.firstSeen=firstSeen(state.firstSeen);let changed=false;
  for(const id of ids)if(!Object.hasOwn(state.firstSeen,id)){Object.defineProperty(state.firstSeen,id,{value:now,enumerable:true,writable:true,configurable:true});changed=true;}
  return changed;
 }
 function measure(state,task,now=Date.now()){
  const rule=safe(task.emphasis);if(!rule||task.checked||task.deferred)return {active:false,delay:null};
  let delta;
  if(rule.basis==='visible'){const seen=state.firstSeen?.[task.id];if(!Number.isFinite(seen))return {active:false,delay:null};delta=seen+rule.minutes*60000-now;}
  else {const parts=Object.fromEntries(formatter.formatToParts(new Date(now)).map(p=>[p.type,p.value]));delta=(Number(rule.time.slice(0,2))*3600+Number(rule.time.slice(3))*60-(Number(parts.hour)*3600+Number(parts.minute)*60+Number(parts.second)))*1000-new Date(now).getMilliseconds();}
  return {active:rule.mode==='after'?delta<=0:delta>0,delay:delta>0?Math.min(delta+25,2147483647):null};
 }
 function dance(text){
  if(text.dataset.danceSource===text.dataset.source&&text.querySelector('.emphasis-letter'))return;
  const doc=text.ownerDocument,letters=[];
  function walk(node){
   if(node.nodeType===3||node.tag==='#text'){
    const nodes=[];for(const word of node.textContent.split(/(\s+)/u)){if(!word)continue;if(/^\s+$/u.test(word)){nodes.push(doc.createTextNode(word));continue;}const wrap=doc.createElement('span');wrap.className='emphasis-word';
     const graphemes=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('da',{granularity:'grapheme'}).segment(word)].map(v=>v.segment):Array.from(word);
     for(const char of graphemes){const outer=doc.createElement('span'),inner=doc.createElement('span');outer.className='emphasis-letter';inner.className='emphasis-letter-return';inner.textContent=char;outer.append(inner);wrap.append(outer);letters.push(outer);}nodes.push(wrap);
    }return nodes;
   }
   const children=Array.from(node.childNodes||node.children||[]);node.replaceChildren(...children.flatMap(walk));return [node];
  }
  const children=Array.from(text.childNodes||text.children||[]);text.replaceChildren(...children.flatMap(walk));
  const duration=Math.max(2.8,Math.min(8,letters.length*.1+1.4)),step=(duration/2-.5)/Math.max(1,letters.length-1);
  text.style.setProperty('--dance-duration',duration+'s');letters.forEach((letter,index)=>{letter.style.setProperty('--dance-forward',index*step+'s');letter.style.setProperty('--dance-back',(duration/2+(letters.length-1-index)*step)+'s');});text.dataset.danceSource=text.dataset.source;
 }
 function ink(seed=1){let n=seed>>>0;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};const d=`M2 ${3+random()*2} Q${35+random()*10} ${1+random()*3} 70 ${3+random()*2} T135 ${2+random()*3} Q170 ${3+random()*3} 198 ${2+random()*3}`;return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 8" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="#a06839" stroke-width="2.3" stroke-linecap="round"/></svg>`)}")`;}
 let artSequence=0;
 const randomFor=seed=>{let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};};
 function svgNode(doc,tag,attrs={}){const node=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));return node;}
 function ellipsePaths(width,height,seed=1){
  const random=randomFor(seed),paths=[];
  for(let ring=0;ring<3;ring++){
   const cx=width/2+(random()-.5)*3,cy=height/2+(random()-.5)*2,rx=width/2-9+(ring-1)*1.8+(random()-.5)*1.2,ry=height/2-8+(ring-1)*1.5+(random()-.5)*1.1,tilt=(random()-.5)*.028,phase=random()*Math.PI*2,points=[];
   for(let i=0;i<24;i++){const a=-Math.PI*.7+i*Math.PI*2/24,ripple=1+Math.sin(a*3+phase)*.012+Math.sin(a*5-phase)*.006,x=Math.cos(a)*rx*ripple,y=Math.sin(a)*ry*ripple;points.push([cx+x*Math.cos(tilt)-y*Math.sin(tilt),cy+x*Math.sin(tilt)+y*Math.cos(tilt)]);}
   const f=n=>Number(n.toFixed(2)),at=i=>points[(i+points.length)%points.length];let d=`M${at(0).map(f).join(' ')}`;
   for(let i=0;i<points.length;i++){const p0=at(i-1),p1=at(i),p2=at(i+1),p3=at(i+2);d+=` C${[p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6,p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6,...p2].map(f).join(' ')}`;}paths.push(d+' Z');
  }return paths;
 }
 function circleArt(row,seed){
  const rect=row.getBoundingClientRect(),parts=[...row.querySelectorAll('.box'),...row.querySelectorAll('.label')];if(!parts.length)parts.push(...row.querySelectorAll('.text'));
  const bounds=parts.map(node=>node.getBoundingClientRect()).filter(r=>r.width&&r.height);if(!bounds.length)return;
  const left=Math.min(...bounds.map(r=>r.left))-28,top=Math.min(...bounds.map(r=>r.top))-16,width=Math.max(...bounds.map(r=>r.right))-left+28,height=Math.max(...bounds.map(r=>r.bottom))-top+16;
  const signature=[Math.round(width),Math.round(height),seed].join(':');let svg=row.querySelector('.emphasis-circles');if(svg?.dataset.geometry===signature){svg.style.left=(left-rect.left)+'px';svg.style.top=(top-rect.top)+'px';return;}
  svg?.remove();const doc=row.ownerDocument;svg=svgNode(doc,'svg',{class:'emphasis-circles',viewBox:`0 0 ${width} ${height}`,'aria-hidden':'true',focusable:'false'});svg.dataset.geometry=signature;
  Object.assign(svg.style,{left:(left-rect.left)+'px',top:(top-rect.top)+'px',width:width+'px',height:height+'px'});
  ellipsePaths(width,height,seed).forEach((d,index)=>svg.append(svgNode(doc,'path',{d,pathLength:1,class:'emphasis-ring emphasis-ring-'+(index+1),'vector-effect':'non-scaling-stroke'})));row.append(svg);
 }
 function fireArt(text,seed){
  const width=Math.max(80,Math.round(text.getBoundingClientRect().width||200)),signature=width+':'+seed;let svg=text.querySelector('.emphasis-fire');if(svg?.dataset.geometry===signature)return;svg?.remove();
  const doc=text.ownerDocument,id='emphasis-flame-'+(++artSequence),random=randomFor(seed),count=Math.max(5,Math.min(24,Math.ceil(width/23)));
  svg=svgNode(doc,'svg',{class:'emphasis-fire',viewBox:`0 0 ${width} 100`,preserveAspectRatio:'none','aria-hidden':'true',focusable:'false'});svg.dataset.geometry=signature;
  const defs=svgNode(doc,'defs');
  for(const [suffix,stops] of [['outer',[[0,'#e34619',0],[.22,'#ec5f21',.55],[.68,'#f79b24',.87],[1,'#ec5d20',.12]]],['inner',[[0,'#fff7bf',0],[.25,'#fff4ad',.9],[.65,'#ffd466',.98],[1,'#ffb12a',.3]]]]){const gradient=svgNode(doc,'linearGradient',{id:id+'-'+suffix,x1:0,y1:0,x2:0,y2:1});for(const [offset,color,opacity] of stops)gradient.append(svgNode(doc,'stop',{offset,'stop-color':color,'stop-opacity':opacity}));defs.append(gradient);}
  svg.append(defs);
  for(let layer=0;layer<2;layer++)for(let i=0;i<count;i++){
   const x=(i+.3+random()*.4)*width/count,w=width/count*(.85+random()*.65),height=(layer?31:48)+random()*(layer?24:39),tip=90-height,lean=(random()-.5)*w*.9;
   const group=svgNode(doc,'g',{class:'fire-tongue '+(layer?'fire-front':'fire-back')});group.style.setProperty('--burn-duration',(1.05+random()*1.35)+'s');group.style.setProperty('--burn-delay',(-random()*4)+'s');group.style.setProperty('--flame-lean',(random()>.5?1:-1)*(2+random()*5)+'deg');
   const d=`M${x-w*.55} 94 C${x-w*.85} ${90-height*.3} ${x+w*.22} ${tip+height*.55} ${x+lean} ${tip} C${x+lean+w*.75} ${tip+height*.24} ${x-w*.04} ${tip+height*.6} ${x+w*.48} ${80-height*.13} Q${x+w*.85} 91 ${x-w*.55} 94Z`;
   group.append(svgNode(doc,'path',{d,fill:`url(#${id}-${layer?'inner':'outer'})`}));svg.append(group);
  }
  for(let i=0;i<7;i++){const ember=svgNode(doc,'circle',{class:'fire-ember',cx:8+random()*(width-16),cy:86,r:.6+random()*1.1,fill:i%2?'#e87824':'#ffc75c'});ember.style.setProperty('--ember-delay',(-random()*5)+'s');ember.style.setProperty('--ember-duration',(1.4+random()*1.8)+'s');ember.style.setProperty('--ember-drift',((random()-.5)*26)+'px');svg.append(ember);}text.append(svg);
 }
 function decorate(row,effect,seed){
  // Remove decoration before changing to per-letter animation or measuring scribbles.
  for(const art of row.querySelectorAll('.emphasis-fire'))if(effect!=='fire')art.remove();
  if(effect!=='circle')row.querySelector('.emphasis-circles')?.remove();
  for(const text of row.querySelectorAll('.text')){if(effect==='dance')dance(text);text.dataset.emphasis=effect;if(effect==='fire')fireArt(text,seed);}
  if(effect==='circle')circleArt(row,seed);
 }
 function apply(row,task,state,now=Date.now()){
  const result=measure(state,task,now),effect=result.active?safe(task.emphasis).effect:'';
  decorate(row,effect,task.boxSeed);
  return result.delay;
 }
 function field(task,{getState,onChange,planner=false}){
  const doc=root.document||document,box=doc.createElement('section');
  box.className=planner?'emphasis-settings':'editor-section emphasis-settings';
  const heading=doc.createElement('h3');
  heading.textContent=translateUI("Fremhævning");
  if(!planner&&root.MorningEditorUI)heading.append(root.MorningEditorUI.help(translateUI("Visuel påmindelse, som stopper ved fuldførelse eller udsættelse. Relative tider starter, når opgaven først ses på hovedlisten i dag, og bevares ved genåbning. På tværs af enheder bruges det tidligste tidspunkt."),translateUI("Fremhævning")));
  let draft=safe(task.emphasis);
  const help=doc.createElement('p');
  help.className='form-message';
  help.hidden=true;
  help.setAttribute('role','status');

  function commit(next){
   try{
    draft=normalize(next);
    const current=getState?getState().tasks.find(t=>t.id===task.id):task;
    if(draft)current.emphasis=draft;
    else delete current.emphasis;
    help.hidden=true;
    const focused=box.contains(doc.activeElement)?doc.activeElement.getAttribute('aria-label'):null;
    onChange?.();
    draw();
    if(focused)Array.from(box.querySelectorAll('select,input')).find(control=>control.getAttribute('aria-label')===focused)?.focus({preventScroll:true});
   }catch(error){help.textContent=error.message;help.hidden=false;}
  }
  function select(parent,label,options,value,change){
   const wrap=doc.createElement('label'),control=doc.createElement('select');
   wrap.textContent=label+' ';
   control.setAttribute('aria-label',label);
   for(const [key,text] of options){
    const option=doc.createElement('option');
    option.value=key;
    option.textContent=text;
    control.append(option);
   }
   control.value=value;
   control.addEventListener('change',()=>change(control.value));
   wrap.append(control);
   parent.append(wrap);
  }
  function timingInput(){
   const label=doc.createElement('label'),input=doc.createElement('input');
   const clock=draft.basis==='clock';
   label.textContent=clock?translateUI("Klokken "):translateUI("Minutter efter først set ");
   input.type=clock?'time':'number';
   input.setAttribute('aria-label',clock?translateUI("Fremhævningens klokkeslæt"):translateUI("Minutter efter først set"));
   input.value=clock?draft.time:draft.minutes;
   input.required=planner;
   if(!clock){input.min=1;input.max=10080;input.step=1;}
   input.addEventListener('change',()=>commit({...draft,...(clock?{time:input.value}:{minutes:Number(input.value)})}));
   label.append(input);
   box.append(label);
  }
  function draw(){
   box.replaceChildren();
   if(!planner)box.append(heading);
   const choice=doc.createElement('div'),sample=doc.createElement('span'),preview=doc.createElement('span');
   choice.className='emphasis-choice';
   select(choice,translateUI("Effekt"),[['none',translateUI("Ingen")],...effects.map(effect=>[effect,labels[effect]])],draft?.effect||'none',effect=>{
    commit(effect==='none'?null:{...(draft||{basis:'clock',time:planner?'00:00':'10:00',mode:'after'}),effect});
   });
   sample.className='emphasis-sample';
   sample.dataset.effect=draft?.effect||'';
   sample.dataset.seed=String(task.boxSeed??1);
   sample.setAttribute('aria-hidden','true');
   preview.className='text';
   preview.textContent='Animation';
   sample.append(preview);
   choice.append(sample);
   box.append(choice);
   decorate(sample,sample.dataset.effect,Number(sample.dataset.seed));
   root.requestAnimationFrame?.(()=>{if(sample.isConnected)decorate(sample,sample.dataset.effect,Number(sample.dataset.seed));});

   if(draft){
    const always=draft.mode==='after'&&draft.basis==='clock'&&draft.time==='00:00';
    select(box,translateUI("Hvornår"),[['always',translateUI("Altid")],['after',translateUI("Fremhæv efter")],['until',translateUI("Fremhæv indtil")]],always?'always':draft.mode,mode=>{
     if(mode==='always')commit({...draft,mode:'after',basis:'clock',time:'00:00'});
     else commit({...draft,mode,...(always?{time:'10:00'}:{})});
    });
    if(!always){
     select(box,translateUI("Udgangspunkt"),[['clock',translateUI("Klokkeslæt")],['visible',translateUI("Først set på hovedlisten")]],draft.basis,basis=>commit({...draft,basis,...(basis==='clock'?{time:'10:00'}:{minutes:60})}));
     timingInput();
    }
   }
   box.append(help);
  }
  draw();
  return box;
 }
 function refreshPreviews(){for(const sample of root.document?.querySelectorAll('.emphasis-sample')||[])decorate(sample,sample.dataset.effect,Number(sample.dataset.seed));}
 root.addEventListener?.('resize',refreshPreviews);
 const api={effects,labels,normalize,safe,firstSeen,observe,measure,apply,dance,field,ink,ellipsePaths,decorate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MorningEmphasis=api;
})(typeof window!=='undefined'?window:globalThis);
