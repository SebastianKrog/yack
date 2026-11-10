(function(root){
 'use strict';
  const {t:translateUI}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
 const R=typeof module!=='undefined'&&module.exports?require('./recurrence.js'):root.MorningRecurrence;
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Copenhagen',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const recurring=t=>!t.temporaryDay&&!t.permanentNote&&!t.reminder;
 const initial=tasks=>[{id:'default',name:translateUI("Min liste"),group:'',schedule:null,taskIds:tasks.filter(recurring).map(t=>t.id)}];
 function normalize(lists,tasks){
  if(!Array.isArray(lists))throw new Error(translateUI("Opgavelisten skal indeholde lists."));
  if(lists.length>100)throw new Error(translateUI("Du kan højst have 100 lister."));
  const seen=new Set(),ids=new Set(tasks.filter(recurring).map(t=>t.id));
  return lists.map(list=>{
   if(!list||typeof list.id!=='string'||!list.id.length||list.id.length>200||seen.has(list.id)||typeof list.name!=='string'||!list.name.trim()||list.name.length>100||typeof(list.group??'')!=='string'||(list.group||'').length>100||!Array.isArray(list.taskIds)||list.taskIds.some(id=>typeof id!=='string'))throw new Error(translateUI("En liste har ugyldigt navn, ID eller opgaver."));
   seen.add(list.id);return {id:list.id,name:list.name.trim(),group:(list.group||'').trim(),schedule:R.normalize(list.schedule),taskIds:[...new Set(list.taskIds)].filter(id=>ids.has(id))};
  });
 }
 function ensure(state){if(!Array.isArray(state.lists))throw new Error(translateUI("Opgavelisten skal indeholde lists."));return state.lists;}
 function clock(now=new Date()){
  const p=Object.fromEntries(formatter.formatToParts(now).map(p=>[p.type,p.value]));
  return {getFullYear:()=>+p.year,getMonth:()=>+p.month-1,getDate:()=>+p.day,getHours:()=>+p.hour,getMinutes:()=>+p.minute};
 }
 function at(day,minute){const date=new Date(day.split('-').map((v,i)=>i?v.padStart(2,'0'):v).join('-')+'T00:00:00Z');return {getFullYear:()=>date.getUTCFullYear(),getMonth:()=>date.getUTCMonth(),getDate:()=>date.getUTCDate(),getHours:()=>Math.floor(minute/60),getMinutes:()=>minute%60};}
 function active(state,now=clock()){
  const groups=new Set();return ensure(state).filter(list=>{
   if(!R.matches(list.schedule,state.day,now))return false;
   if(list.group&&groups.has(list.group))return false;
   if(list.group)groups.add(list.group);return true;
  });
 }
 function contains(state,task,now){return !recurring(task)||active(state,now).some(list=>list.taskIds.includes(task.id));}
 function ordered(state,tasks,now){const ids=[...new Set(active(state,now).flatMap(list=>list.taskIds))],rank=new Map(ids.map((id,i)=>[id,i]));return tasks.slice().sort((a,b)=>(rank.get(a.id)??1e9)-(rank.get(b.id)??1e9));}
 function memberships(state,id){return ensure(state).filter(list=>list.taskIds.includes(id));}
 function assign(state,listId,id,includeParents=true){const list=ensure(state).find(l=>l.id===listId);if(!list)throw new Error(translateUI("Vælg en liste."));const task=state.tasks.find(t=>t.id===id&&recurring(t));if(!task)throw new Error(translateUI("Opgaven findes ikke."));if(includeParents&&task.parentId)assign(state,listId,task.parentId,true);if(!list.taskIds.includes(id))list.taskIds.push(id);return list;}
 function unassign(state,listId,id){const list=ensure(state).find(l=>l.id===listId);if(!list)return;const descendants=new Set([id]);let changed=true;while(changed){changed=false;for(const t of state.tasks)if(descendants.has(t.parentId)&&!descendants.has(t.id)){descendants.add(t.id);changed=true;}}list.taskIds=list.taskIds.filter(id=>!descendants.has(id));}
 function reorder(state,listId,id,index){const list=ensure(state).find(l=>l.id===listId);if(!list)return;list.taskIds=list.taskIds.filter(value=>value!==id);list.taskIds.splice(Math.max(0,index),0,id);}
 function samples(state){const minutes=new Set([0]);const add=s=>{for(const key of ['from','to'])if(s?.[key])minutes.add(Number(s[key].slice(0,2))*60+Number(s[key].slice(3)));};ensure(state).forEach(l=>add(l.schedule));state.tasks.forEach(t=>{if(t.reminder?.date===state.day)add({from:t.reminder.time});add(t.schedule);add(t.xor?.sharedSchedule);add(t.xor?.otherSchedule);});return [...minutes].filter(m=>m<1440).sort((a,b)=>a-b).map(m=>at(state.day,m));}
 function next(state,task,predicate,now=clock()){
  if(predicate(state,task,now))return {day:state.day,time:translateUI("Nu")};
  const first=at(state.day,0),base=Date.UTC(first.getFullYear(),first.getMonth(),first.getDate()),minute=now.getHours()*60+now.getMinutes();
  for(let offset=0;offset<=366;offset++){const day=new Date(base+offset*86400000).toISOString().slice(0,10),candidate={...state,day};for(const sample of samples(candidate)){const m=sample.getHours()*60+sample.getMinutes();if(offset===0&&m<=minute)continue;if(predicate(candidate,task,sample))return {day,time:String(sample.getHours()).padStart(2,'0')+':'+String(sample.getMinutes()).padStart(2,'0')};}}
  return null;
 }
 const api={next,initial,normalize,ensure,active,contains,ordered,memberships,assign,unassign,reorder,clock,at,samples,recurring};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MorningLists=api;
})(typeof window!=='undefined'?window:globalThis);
