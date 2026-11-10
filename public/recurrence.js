(function(root){
 'use strict';
  const {t:translateUI,locale,language}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
 const S=typeof module!=='undefined'&&module.exports?require('./stats.js'):root.MorningStats;
 const days=[translateUI("Mandag"),translateUI("Tirsdag"),translateUI("Onsdag"),translateUI("Torsdag"),translateUI("Fredag"),translateUI("Lørdag"),translateUI("Søndag")];
 const englishOrdinal=new Intl.PluralRules('en',{type:'ordinal'});
 const stamp=day=>Date.parse(day+'T00:00:00Z')/86400000;
 const clock=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
 function normalize(value){
  if(value==null)return null;
  if(!value||typeof value!=='object'||!['daily','weekly','monthly','yearly','once'].includes(value.frequency))throw new Error(translateUI("Vælg en gyldig gentagelse."));
  const interval=value.interval??1;if(!Number.isInteger(interval)||interval<1||interval>365)throw new Error(translateUI("Intervallet skal være mellem 1 og 365."));
  const anchor=S.dateKey(value.anchor);if(!anchor)throw new Error(translateUI("Vælg en startdato."));
  const result={frequency:value.frequency,interval,anchor};
  if(value.until){result.until=S.dateKey(value.until);if(!result.until||result.until<anchor)throw new Error(translateUI("Slutdatoen skal ligge efter startdatoen."));}
  if(value.days!==undefined){if(!Array.isArray(value.days)||value.days.some(d=>!Number.isInteger(d)||d<0||d>6)||!value.days.length)throw new Error(translateUI("Vælg mindst én ugedag."));result.days=[...new Set(value.days)].sort();}
  if(value.monthMode!==undefined){if(!['date','weekday','last-weekday','last'].includes(value.monthMode))throw new Error(translateUI("Vælg en gyldig månedsregel."));result.monthMode=value.monthMode;}
  if(value.monthDays!==undefined){if(!Array.isArray(value.monthDays)||!value.monthDays.length||value.monthDays.some(d=>!Number.isInteger(d)||d<1||d>31))throw new Error(translateUI("Vælg datoer fra 1 til 31."));result.monthDays=[...new Set(value.monthDays)].sort((a,b)=>a-b);}
  if(value.ordinals!==undefined){if(!Array.isArray(value.ordinals)||!value.ordinals.length||value.ordinals.some(n=>![1,2,3,4,5,-1].includes(n)))throw new Error(translateUI("Vælg mindst én placering i måneden."));result.ordinals=[...new Set(value.ordinals)].sort((a,b)=>a-b);}
  if(value.ordinal!==undefined)throw new Error(translateUI("Brug ordinals til placeringer i måneden."));
  if(value.weekday!==undefined){if(!Number.isInteger(value.weekday)||value.weekday<0||value.weekday>6)throw new Error(translateUI("Vælg en ugedag."));result.weekday=value.weekday;}
  for(const key of ['from','to'])if(value[key]){if(!clock(value[key]))throw new Error(translateUI("Vælg et gyldigt klokkeslæt."));result[key]=value[key];}
  return result;
 }
 function matches(value,day,now=new Date()){
  if(!value)return true;let s;try{s=normalize(value);}catch{return false;}
  let key=S.dateKey(day);if(!key)return false;
  const local=`${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`,minute=S.dateKey(local)===key?now.getHours()*60+now.getMinutes():720;
  const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3)),from=s.from?minutes(s.from):0,to=s.to?minutes(s.to):1440;
  if(s.from&&s.to&&from>to){if(minute>=to&&minute<from)return false;if(minute<to)key=new Date((stamp(key)-1)*86400000).toISOString().slice(0,10);}
  else if(minute<from||minute>=to)return false;
  if(key<s.anchor||s.until&&key>s.until)return false;
  const date=new Date(key+'T00:00:00Z'),anchor=new Date(s.anchor+'T00:00:00Z'),weekday=(date.getUTCDay()+6)%7;
  if(s.days&&!s.days.includes(weekday))return false;
  const last=(y,m)=>new Date(Date.UTC(y,m+1,0)).getUTCDate();
  if(s.frequency==='once')return key===s.anchor;
  if(s.frequency==='daily')return (stamp(key)-stamp(s.anchor))%s.interval===0;
  if(s.frequency==='weekly')return (s.days||[(anchor.getUTCDay()+6)%7]).includes(weekday)&&(stamp(S.weekStart(key))-stamp(S.weekStart(s.anchor)))%(7*s.interval)===0;
  if(s.frequency==='yearly')return (date.getUTCFullYear()-anchor.getUTCFullYear())%s.interval===0&&date.getUTCMonth()===anchor.getUTCMonth()&&date.getUTCDate()===Math.min(anchor.getUTCDate(),last(date.getUTCFullYear(),date.getUTCMonth()));
  const months=(date.getUTCFullYear()-anchor.getUTCFullYear())*12+date.getUTCMonth()-anchor.getUTCMonth();if(months%s.interval)return false;
  if(s.monthMode==='last')return date.getUTCDate()===last(date.getUTCFullYear(),date.getUTCMonth());
  if(s.monthMode==='weekday'||s.monthMode==='last-weekday'){
   if(weekday!==(s.weekday??(anchor.getUTCDay()+6)%7))return false;
   const ordinals=s.monthMode==='last-weekday'?[-1]:s.ordinals||[Math.floor((anchor.getUTCDate()-1)/7)+1];return ordinals.includes(Math.floor((date.getUTCDate()-1)/7)+1)||ordinals.includes(-1)&&date.getUTCDate()+7>last(date.getUTCFullYear(),date.getUTCMonth());
  }
  return (s.monthDays||[anchor.getUTCDate()]).some(day=>date.getUTCDate()===Math.min(day,last(date.getUTCFullYear(),date.getUTCMonth())));
 }
 function label(value){
  if(!value)return translateUI('Altid');
  const s=normalize(value),date=key=>new Date(key+'T00:00:00Z');
  const dateLabel=key=>language==='da'
   ?key.split('-').reverse().map((part,i)=>i<2?String(Number(part)):part).join('.')
   :new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'}).format(date(key));
  const unit={daily:['dag','dage'],weekly:['uge','uger'],monthly:['måned','måneder'],yearly:['år','years']};
  const frequency=unit[s.frequency];
  let text=s.frequency==='once'?dateLabel(s.anchor):s.interval===1
   ?translateUI('Hver {0}',translateUI(frequency[0]))
   :translateUI('Hver {0}. {1}',s.interval.toLocaleString(locale),translateUI(frequency[0]),translateUI(frequency[1]));
  const ordinal=n=>n===-1?translateUI('sidste'):language==='da'?n+'.':n+({one:'st',two:'nd',few:'rd',other:'th'}[englishOrdinal.select(n)]);
  if(s.frequency==='monthly'){
   if(s.monthMode==='last')text+=translateUI(' · sidste dag');
   else if(s.monthMode==='weekday'||s.monthMode==='last-weekday'){
    const ordinals=s.monthMode==='last-weekday'?[-1]:s.ordinals||[Math.floor((date(s.anchor).getUTCDate()-1)/7)+1];
    const weekday=days[s.weekday??(date(s.anchor).getUTCDay()+6)%7];
    text+=' · '+ordinals.map(ordinal).join(translateUI(' og '))+' '+(language==='da'?weekday.toLowerCase():weekday);
   }else text+=translateUI(' · den ')+(s.monthDays||[Number(s.anchor.slice(-2))]).map(ordinal).join(', ');
  }
  const effectiveDays=s.days||(s.frequency==='weekly'?[(date(s.anchor).getUTCDay()+6)%7]:null);
  if(effectiveDays)text+=' · '+effectiveDays.map(d=>language==='da'?days[d].slice(0,3).toLowerCase():days[d].slice(0,3)).join(', ');
  if(s.frequency==='yearly'){
   const annual=language==='da'?dateLabel(s.anchor).split('.').slice(0,2).join('.')+'.'
    :new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',timeZone:'UTC'}).format(date(s.anchor));
   text+=translateUI(' · den ')+annual;
  }
  if(s.frequency!=='once')text+=translateUI(' · fra ')+dateLabel(s.anchor);
  if(s.until)text+=translateUI(' · til og med ')+dateLabel(s.until);
  if(s.from||s.to)text+=` · ${s.from||'00:00'}–${s.to||'24:00'}`;
  return text;
 }
 const api={normalize,matches,label,days};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MorningRecurrence=api;
})(typeof window!=='undefined'?window:globalThis);
