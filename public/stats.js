(function(root){
  'use strict';
  const counters=['checked','deferred','notes','trophies'];
  function dateKey(value){
    const match=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(value));if(!match)return null;
    const [y,m,d]=match.slice(1).map(Number),date=new Date(Date.UTC(y,m-1,d));
    return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?date.toISOString().slice(0,10):null;
  }
  const count=value=>Number.isSafeInteger(value)&&value>0?value:0;
  function mergeDay(a,b){const result={used:!!(a?.used||b?.used),visited:!!(a?.visited||b?.visited)};for(const key of counters)result[key]=Math.max(count(a?.[key]),count(b?.[key]));if(counters.some(key=>result[key]>0))result.used=true;const awards=[...new Set([...(Array.isArray(a?.weeklyTrophies)?a.weeklyTrophies:[]),...(Array.isArray(b?.weeklyTrophies)?b.weeklyTrophies:[])].filter(value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}\/[^/]{1,450}$/.test(value)))].sort();if(awards.length)result.weeklyTrophies=awards;return result;}
  function normalize(stats){const result={};for(const [day,value] of Object.entries(stats||{})){const key=dateKey(day);if(key&&value&&typeof value==='object')result[key]=mergeDay(result[key],value);}return result;}
  function merge(a,b){const result=normalize(a);for(const [day,value] of Object.entries(normalize(b)))result[day]=mergeDay(result[day],value);return result;}
  function record(state,key,amount=1){const day=dateKey(state.day);if(!day||!counters.includes(key)||!count(amount))return;state.stats=normalize(state.stats);const current=mergeDay(state.stats[day]);current.used=true;current[key]=Math.min(Number.MAX_SAFE_INTEGER,current[key]+amount);state.stats[day]=current;}
  function summary(stats,today){
    const days=normalize(stats),used=Object.keys(days).filter(day=>(days[day].used||days[day].visited)).sort(),result={checked:0,deferred:0,notes:0,trophies:0,days:used.length,longest:0,current:0};
    const weeklyTrophies=new Set();for(const value of Object.values(days)){for(const key of counters)result[key]+=value[key];for(const award of value.weeklyTrophies||[])weeklyTrophies.add(award);}result.trophies+=weeklyTrophies.size;
    const ordinal=day=>Date.parse(day+'T00:00:00Z')/86400000;let run=0,previous;
    for(const day of used){const n=ordinal(day);run=n===previous+1?run+1:1;result.longest=Math.max(result.longest,run);previous=n;}
    const key=dateKey(today),n=key?ordinal(key):NaN,set=new Set(used.map(ordinal));let cursor=set.has(n)?n:n-1;
    while(set.has(cursor)){result.current++;cursor--;}
    return result;
  }
  function recordWeeklyTrophies(state,awards){if(!awards.length)return;const day=dateKey(state.day),week=weekStart(state.day);if(!day||!week)return;state.stats=normalize(state.stats);state.stats[day]=mergeDay(state.stats[day],{weeklyTrophies:awards.map(award=>`${week}/${encodeURIComponent(award.id)}`)});}
  function visit(state){const day=dateKey(state.day);if(!day)return false;state.stats=normalize(state.stats);const value=mergeDay(state.stats[day]);if(value.visited)return false;value.visited=true;state.stats[day]=value;return true;}
  function weekStart(day){const key=dateKey(day);if(!key)return null;const date=new Date(key+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);return date.toISOString().slice(0,10);}
  function weekDays(state){const start=weekStart(state.day),today=dateKey(state.day);return Object.entries(normalize(state.stats)).filter(([day,value])=>day>=start&&day<=today&&(value.visited||value.used)).length;}
  function weeklyAwards(saved,day){const week=weekStart(day),earned={};if(saved?.week===week)for(const [id,time] of Object.entries(saved.earned||{}))if(Number.isFinite(time)&&time>=0)Object.defineProperty(earned,id,{value:time,enumerable:true,writable:true,configurable:true});return {week,earned};}
  function render(state,doc){const values=summary(state.stats,state.day);for(const [key,value] of Object.entries(values)){const element=doc.querySelector('#stat-'+key);if(element)element.textContent=value.toLocaleString(root.YackI18n?.locale||'da-DK');}}
  const api={recordWeeklyTrophies,visit,weekStart,weekDays,weeklyAwards,dateKey,mergeDay,normalize,merge,record,summary,render};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MorningStats=api;
})(typeof window!=='undefined'?window:globalThis);
