(function(root){
  'use strict';
  const M=typeof module!=='undefined'&&module.exports?require('./tasks.js'):root.MorningTasks;
  const data=typeof module!=='undefined'&&module.exports?require('./task-json.js'):root.MorningTaskJSON;
  const key='starting-work-task-versions';
  function create({getState,storage,onChange=()=>{},onError=()=>{}}){
    let entries=[],pending=null,timer,next=1;
    try{
      const saved=JSON.parse(storage.getItem(key)||'null');
      if(saved?.version===1&&Array.isArray(saved.entries))for(const entry of saved.entries){
        if(!Number.isSafeInteger(entry.revision)||entry.revision<next||!Number.isFinite(entry.createdAt)||entry.createdAt<0)continue;
        let tasks;try{tasks=data.history(entry).tasks;}catch{continue;}
        entries.push({revision:entry.revision,createdAt:entry.createdAt,lists:entry.lists,label:String(entry.label||'Redigeret').slice(0,80),tasks,...(typeof entry.syncKey==='string'&&entry.syncKey.startsWith('history/')&&entry.syncKey.length<=450?{syncKey:entry.syncKey}:{}),...(entry.snapshot&&typeof entry.snapshot.fields==='object'?{snapshot:entry.snapshot}:{})});next=entry.revision+1;
      }
    }catch{entries=[];next=1;}
    const signature=(tasks,lists)=>JSON.stringify([tasks,lists]);
    function persist(){
      while(entries.length>30||(entries.length>1&&JSON.stringify(entries).length>1500000))entries.shift();
      for(;;){try{storage.setItem(key,JSON.stringify({version:1,entries}));return;}catch(error){if(entries.length>1)entries.shift();else{onError(error);return;}}}
    }
    function flush(){
      clearTimeout(timer);if(!pending)return;
      entries.push({...pending,revision:next++,createdAt:Date.now()});pending=null;persist();onChange();
    }
    function record(label='Redigeret',immediate=false){
      const {tasks,lists}=JSON.parse(data.encode(M.localizeStarter(getState(),'da')));
      clearTimeout(timer);
      if(signature(tasks,lists)===signature(entries.at(-1)?.tasks,entries.at(-1)?.lists)){pending=null;return;}
      pending={tasks,lists,label};if(immediate)flush();else timer=setTimeout(flush,800);
    }
    function addImported(versions){
      flush();
      for(const entry of versions){if(entries.some(old=>signature(old.tasks,old.lists)===signature(entry.tasks,entry.lists)))continue;entries.push({revision:next++,createdAt:entry.createdAt,label:`Importeret: ${entry.label}`.slice(0,80),tasks:entry.tasks,lists:entry.lists});}
      persist();onChange();
    }
    function replaceRemote(versions){
      clearTimeout(timer);pending=null;
      const known=new Map(entries.map(entry=>[`${entry.createdAt}:${signature(entry.tasks)}`,entry]));
      const incoming=versions.flatMap(entry=>{try{return [data.history(entry)];}catch{return [];}}).map(entry=>({...entry,revision:known.get(`${entry.createdAt}:${signature(entry.tasks)}`)?.revision??next++})).sort((a,b)=>a.revision-b.revision);
      if(JSON.stringify(incoming)===JSON.stringify(entries))return;
      entries=incoming;persist();onChange();
    }
    return {hasPending:()=>!!pending,replaceRemote,record,flush,addImported,list:()=>entries.map(entry=>JSON.parse(JSON.stringify(entry))),get:revision=>entries.find(entry=>entry.revision===revision)};
  }
  const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MorningTaskVersions=api;
})(typeof window!=='undefined'?window:globalThis);
