(function(root){
 'use strict';
  const {t:translateUI}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
 function field(task,choice,{model,getState,onChange,inherit=true}){
  const R=root.MorningRecurrence,details=document.createElement('details');details.className='schedule-editor';
  const summary=document.createElement('summary'),body=document.createElement('div'),message=document.createElement('p');body.className='schedule-fields';message.className='form-message';message.setAttribute('role','status');details.append(summary,body,message);
  const current=()=>choice==='shared'?task.xor?.sharedSchedule:choice===1?task.xor?.otherSchedule:task.schedule;
  const prefix=()=>choice==='shared'?translateUI("Fælles · "):task.xor?translateUI("Valg {0} · ", choice===0?'A':'B'):'';
  let draft=current()?{...current()}:null;
  const today=()=>root.MorningStats.dateKey(getState().day);
  function commit(next,rebuild=false){try{model.setSchedule(getState(),task.id,next,choice);draft=current()?{...current()}:null;summary.textContent=`${prefix()}${!draft?(inherit?translateUI("Arver listens tidsplan"):translateUI("Altid")):translateUI("Egen tidsplan: ")+R.label(draft)}`;message.textContent='';onChange();if(rebuild)draw();return true;}catch(error){message.textContent=error.message;return false;}}
  function input(label,type,value,change){const wrap=document.createElement('label'),control=document.createElement('input');wrap.textContent=label+' ';control.type=type;control.value=value??'';control.setAttribute('aria-label',label);control.addEventListener('change',()=>change(control.value));wrap.append(control);body.append(wrap);return control;}
  function select(label,options,value,change){const wrap=document.createElement('label'),control=document.createElement('select');wrap.textContent=label+' ';control.setAttribute('aria-label',label);for(const [v,text] of options){const option=document.createElement('option');option.value=v;option.textContent=text;control.append(option);}control.value=value;control.addEventListener('change',()=>change(control.value));wrap.append(control);body.append(wrap);return control;}
  function draw(){
   body.replaceChildren();summary.textContent=`${prefix()}${!draft?(inherit?translateUI("Arver listens tidsplan"):translateUI("Altid")):translateUI("Egen tidsplan: ")+R.label(draft)}`;
   select(translateUI("Hurtigt valg"),[['always',translateUI("Altid")],['daily',translateUI("Hver dag")],['weekdays',translateUI("Kun hverdage")],['weekend',translateUI("Kun i weekenden")],['no-monday',translateUI("Ikke om mandagen")],['custom',translateUI("Tilpasset…")]],!draft?'always':'custom',value=>{
    if(value==='always')return commit(null,true);
    const next={frequency:'daily',interval:1,anchor:today()};if(value==='weekdays')next.days=[0,1,2,3,4];if(value==='weekend')next.days=[5,6];if(value==='no-monday')next.days=[1,2,3,4,5,6];commit(next,true);
   });
   if(!draft)return;
   select(translateUI("Gentag"),[['daily',translateUI("Dagligt")],['weekly',translateUI("Ugentligt")],['monthly',translateUI("Månedligt")],['yearly',translateUI("Årligt")],['once',translateUI("Kun én dato")]],draft.frequency,value=>commit({...draft,frequency:value,...(value==='weekly'&&!draft.days?{days:[(new Date(draft.anchor+'T00:00:00Z').getUTCDay()+6)%7]}:{})},true));
   if(draft.frequency!=='once'){const interval=input(translateUI('Interval ({0})',{daily:translateUI('dage'),weekly:translateUI('uger'),monthly:translateUI('måneder'),yearly:root.YackI18n.language==='en'?'years':translateUI('år')}[draft.frequency]),'number',draft.interval,value=>commit({...draft,interval:Number(value)}));interval.min=1;interval.max=365;}
   input(draft.frequency==='once'?translateUI("Dato"):translateUI("Fra dato"),'date',draft.anchor,value=>commit({...draft,anchor:value}));
   if(draft.frequency!=='once')input(translateUI("Til og med (valgfrit)"),'date',draft.until,value=>commit({...draft,until:value}));
   if(draft.frequency==='monthly')select(translateUI("På"),[['date',translateUI("Valgte datoer i måneden")],['weekday',translateUI("Ugedag og placering")],['last-weekday',translateUI("Sidste valgte ugedag")],['last',translateUI("Sidste dag i måneden")]],draft.monthMode||'date',value=>commit({...draft,monthMode:value},true));
   if(draft.frequency==='monthly'&&(!draft.monthMode||draft.monthMode==='date')){const dates=input(translateUI("Datoer i måneden"), 'text',(draft.monthDays||[Number(draft.anchor.slice(-2))]).join(', '),value=>commit({...draft,monthDays:value.split(/[,; ]+/).filter(Boolean).map(Number)}));dates.placeholder=translateUI("Fx 1, 2, 15");body.append(root.MorningEditorUI.help(translateUI("Adskil flere datoer med komma. I korte måneder bruges sidste dag, hvis datoen ikke findes."),translateUI("Datoer i måneden")));}
   if(draft.frequency==='monthly'&&['weekday','last-weekday'].includes(draft.monthMode)){const date=new Date(draft.anchor+'T00:00:00Z');if(draft.monthMode==='weekday'){
    const positions=document.createElement('fieldset'),legend=document.createElement('legend');positions.className='schedule-days';legend.textContent=translateUI("Placering i måneden");positions.append(legend);
    const selected=draft.ordinals||[Math.floor((date.getUTCDate()-1)/7)+1];
    for(const [number,name] of [[1,translateUI("Første")],[2,translateUI("Anden")],[3,translateUI("Tredje")],[4,translateUI("Fjerde")],[5,translateUI("Femte")],[-1,translateUI("Sidste")]]){const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=selected.includes(number);box.setAttribute('aria-label',name);box.addEventListener('change',()=>{const values=draft.ordinals||selected;if(!commit({...draft,ordinals:box.checked?[...new Set([...values,number])]:values.filter(n=>n!==number)}))box.checked=!box.checked;});label.append(box,document.createTextNode(name));positions.append(label);}body.append(positions);
   }select(translateUI("Ugedag"),R.days.map((name,index)=>[String(index),name]),String(draft.weekday??(date.getUTCDay()+6)%7),value=>commit({...draft,weekday:Number(value)}));}
   if(!(draft.frequency==='monthly'&&['weekday','last-weekday'].includes(draft.monthMode)&&(!draft.days||draft.days.length===7))){
   const days=document.createElement('fieldset'),legend=document.createElement('legend');days.className='schedule-days';legend.textContent=translateUI("Ugedage");days.append(legend);
   R.days.forEach((name,index)=>{const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=!draft.days||draft.days.includes(index);box.setAttribute('aria-label',name);box.addEventListener('change',()=>{const selected=draft.days?[...draft.days]:[0,1,2,3,4,5,6];if(!commit({...draft,days:box.checked?[...new Set([...selected,index])]:selected.filter(d=>d!==index)}))box.checked=!box.checked;});label.append(box,document.createTextNode(name.slice(0,3)));days.append(label);});body.append(days);
   }
   input(translateUI("Fra kl. (valgfrit)"),'time',draft.from,value=>commit({...draft,from:value}));input(translateUI("Til kl. (valgfrit)"),'time',draft.to,value=>commit({...draft,to:value}));
   const hint=root.MorningEditorUI.help(translateUI("Dato og tid følger Europe/Copenhagen. Uger starter mandag. Sluttid før starttid betyder natten over. Fravælg fx mandag for at skjule opgaven den dag. Følgeopgaver venter også på, at deres forudsætning er tilgængelig."),translateUI("Tidsregler"));body.append(hint);
  }
  draw();return details;
 }
 root.MorningScheduleEditor={field};
})(window);
