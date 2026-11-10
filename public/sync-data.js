(function(root){
  'use strict';
  const {t:translateUI}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
  const M=typeof module!=='undefined'&&module.exports?require('./tasks.js'):root.MorningTasks;
  const S=typeof module!=='undefined'&&module.exports?require('./stats.js'):root.MorningStats;
  const T=typeof module!=='undefined'&&module.exports?require('./task-json.js'):root.MorningTaskJSON;
  const R=typeof module!=='undefined'&&module.exports?require('./reminders.js'):root.MorningReminders;
  const L=typeof module!=='undefined'&&module.exports?require('./lists.js'):root.MorningLists;
  const key=id=>encodeURIComponent(id),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function hash(text){let n=2166136261;for(const char of text)n=Math.imul(n^char.charCodeAt(0),16777619)>>>0;return n.toString(36);}
  function capture(state,versions=[]){
    state=M.localizeStarter(state,'da');
    const fields={order:M.ordered(state).filter(t=>!t.temporaryDay&&!t.permanentNote&&!t.reminder).map(t=>t.id)},prefix=`day/${state.day}/`;
    const lists=L.normalize(state.lists,state.tasks);fields['list-order']=lists.map(l=>l.id);for(const list of lists)fields[`list/${key(list.id)}`]=list;
    for(const task of JSON.parse(T.encode(state)).tasks)fields[`def/${key(task.id)}`]=task;
    for(const task of state.tasks){
      const id=key(task.id),scope=task.reminder?'reminder/':task.permanentNote?'note/':prefix;
      if(task.temporaryDay===state.day)fields[`${prefix}temporary/${id}`]=T.definition(task);
      if(task.reminder)fields[`reminder/definition/${id}`]=R.definition(task);
      if(task.permanentNote)fields[`note/definition/${id}`]=T.definition(task);
      fields[`${scope}status/${id}`]={checked:task.checked,deferred:task.deferred,completedOrder:task.completedOrder,deferredOrder:task.deferredOrder,markSeed:task.markSeed,deferSeed:task.deferSeed,choice:task.xor?.choice??null,...(task.reminder?{checkedDay:task.checkedDay||null,deferredDay:task.deferredDay||null}:{}),...(task.noteItemCount?{noteItemCount:task.noteItemCount}:{}),...(task.noteCreatedDay?{noteCreatedDay:task.noteCreatedDay}:{}),...(task.noteCompletedDay?{noteCompletedDay:task.noteCompletedDay}:{}),...(task.noteArchivedDay?{noteArchivedDay:task.noteArchivedDay}:{})};
      if(task.writing){
        fields[`${scope}archive/${id}`]=!!task.noteArchived;
        if(task.writingAnswer?.length)fields[`${scope}answer/${id}`]={values:task.writingAnswer,items:(task.writingItems||[]).map(item=>({id:item.id,text:item.text,boxSeed:item.boxSeed}))};
        (task.writingDraft||[]).forEach((value,i)=>fields[`${scope}draft/${id}/${i}`]=value);
        for(const item of task.writingItems||[])fields[`${scope}check/${key(item.id)}`]={checked:item.checked,deferred:!!item.deferred,deferredOrder:item.deferredOrder||null,deferSeed:item.deferSeed,completedOrder:item.completedOrder,markSeed:item.markSeed,...(item.checkedDay?{checkedDay:item.checkedDay}:{}),...(item.deferredDay?{deferredDay:item.deferredDay}:{})};
        const positionPrefix=task.permanentNote?'note/':task.temporaryDay?prefix:'';
        if(task.noteSize)fields[`${positionPrefix}size/${id}`]=task.noteSize;
        if(task.noteMobilePosition)fields[`${positionPrefix}mobile-position/${id}`]=task.noteMobilePosition;
        if(task.notePosition)fields[`${positionPrefix}position/${id}`]=task.notePosition;
      }
    }
    for(const [id,time] of Object.entries(state.firstSeen||{}))fields[`${prefix}seen/${key(id)}`]=time;
    for(const [day,value] of Object.entries(state.stats||{}))fields[`stats/${day}`]=value;
    for(const [id,time] of Object.entries(state.dailyAchievements?.earned||{}))fields[`${prefix}achievement/${key(id)}`]=time;
    if(state.weeklyAchievements?.week===S.weekStart(state.day))for(const [id,time] of Object.entries(state.weeklyAchievements.earned||{}))fields[`week/${state.weeklyAchievements.week}/achievement/${key(id)}`]=time;
    for(const entry of versions){const version=T.history(entry);fields[version.syncKey||`history/${version.createdAt}-${hash(JSON.stringify([version.tasks,version.lists]))}`]={createdAt:version.createdAt,label:version.label,tasks:version.tasks,lists:version.lists,...(version.snapshot?{snapshot:version.snapshot}:{})};}
    return fields;
  }
  function materialize(fields,day){
    const prefix=`day/${day}/`,definitions=Object.entries(fields).filter(([key,value])=>key.startsWith('def/')&&value&&typeof value.id==='string'&&typeof value.text==='string').map(([,value])=>value);
    for(const [field,value] of Object.entries(fields))if(field.startsWith('note/definition/')&&value&&typeof value.id==='string'&&typeof value.text==='string'&&M.validWriting(value.writing)&&!definitions.some(task=>task.id===value.id))definitions.push({...value,permanentNote:true,parentId:null,parentChoice:null,xor:undefined});
    for(const [field,value] of Object.entries(fields))if(field.startsWith(`${prefix}temporary/`)&&value&&typeof value.id==='string'&&typeof value.text==='string'&&M.validWriting(value.writing)&&!definitions.some(task=>task.id===value.id))definitions.push({...value,temporaryDay:day,parentId:null,parentChoice:null,xor:undefined});
    for(const [field,value] of Object.entries(fields))if(field.startsWith('reminder/definition/')&&value&&R.validId(value.id)&&field==='reminder/definition/'+key(value.id)&&R.validMeta(value.reminder)&&typeof value.text==='string'&&!definitions.some(task=>task.id===value.id))definitions.push(R.definition(value));
    const order=Array.isArray(fields.order)?fields.order:[],rank=new Map(order.map((id,i)=>[id,i]));definitions.sort((a,b)=>(rank.get(a.id)??1e6)-(rank.get(b.id)??1e6)||a.id.localeCompare(b.id));
    const tasks=definitions.map(def=>{
      const id=key(def.id),scope=def.reminder?'reminder/':def.permanentNote?'note/':prefix,status=fields[`${scope}status/${id}`]||{},answer=fields[`${scope}answer/${id}`]||{};
      const task={...def,...status,...(def.xor?{xor:{...def.xor,choice:status.choice}}:{})};
      if(answer.values?.length&&(!Array.isArray(answer.items)||answer.items.length!==answer.values.length||answer.items.some(item=>!item||typeof item.id!=='string'||!item.id)))throw new Error(translateUI("Notens indhold har et format, der ikke længere understøttes."));
      if(def.writing){
        task.noteArchived=fields[`${scope}archive/${id}`]===true;
        task.writingAnswer=Array.isArray(answer.values)?answer.values:[];task.writingDraft=Array.from({length:Math.max(M.writingCount(task),task.writingAnswer.length)},(_,i)=>fields[`${scope}draft/${id}/${i}`]??task.writingAnswer[i]??'');
        task.writingItems=(Array.isArray(answer.items)?answer.items:[]).map(item=>({...item,...(fields[`${scope}check/${key(item.id)}`]||{})}));
        const positionPrefix=def.permanentNote?'note/':def.temporaryDay?prefix:'';
        task.noteSize=fields[`${positionPrefix}size/${id}`];
        task.notePosition=fields[`${positionPrefix}position/${id}`];task.noteMobilePosition=fields[`${positionPrefix}mobile-position/${id}`];
      }return task;
    });
    const earned={};for(const [field,value] of Object.entries(fields))if(field.startsWith(`${prefix}achievement/`)&&Number.isFinite(value))earned[decodeURIComponent(field.slice(`${prefix}achievement/`.length))]=value;
    const versions=Object.entries(fields).filter(([key,value])=>key.startsWith('history/')&&value).flatMap(([key,v])=>{try{return [{...T.history(v),syncKey:key}];}catch{return [];}}).sort((a,b)=>a.createdAt-b.createdAt).slice(-30);
    const stats=Object.fromEntries(Object.entries(fields).filter(([key,value])=>key.startsWith('stats/')&&value).map(([key,value])=>[key.slice(6),value]));
    const weeklyAchievements=S.weeklyAwards(null,day),weekPrefix=`week/${weeklyAchievements.week}/achievement/`;for(const [field,value] of Object.entries(fields))if(field.startsWith(weekPrefix)&&Number.isFinite(value)&&value>=0)Object.defineProperty(weeklyAchievements.earned,decodeURIComponent(field.slice(weekPrefix.length)),{value,enumerable:true,writable:true,configurable:true});
    const listOrder=fields['list-order'];const lists=Array.isArray(listOrder)?listOrder.map(id=>fields[`list/${key(id)}`]).filter(Boolean):Object.hasOwn(fields,'order')||Object.keys(fields).some(field=>field.startsWith('def/'))?undefined:[];
    const firstSeen=Object.fromEntries(Object.entries(fields).filter(([field,time])=>field.startsWith(`${prefix}seen/`)&&Number.isFinite(time)).map(([field,time])=>[decodeURIComponent(field.slice(`${prefix}seen/`.length)),time]));
    const restored=M.restore({version:2,day,tasks,lists,firstSeen,weeklyAchievements,dailyAchievements:{day,earned},...(Object.keys(stats).length?{stats}:{})},day);
    return {state:restored,versions};
  }
  function overlay(records,pending){const fields={};for(const record of records)fields[record.key]=record.value;for(const op of Object.values(pending))fields[op.key]=op.value;return fields;}
  function temporaryFields(state){return Object.fromEntries(Object.entries(capture({...state,tasks:state.tasks.filter(t=>t.temporaryDay===state.day)})).filter(([field])=>field.startsWith(`day/${state.day}/`)&&!field.includes('/achievement/')));}
  function noteFields(state){return Object.fromEntries(Object.entries(capture({...state,tasks:state.tasks.filter(t=>t.temporaryDay===state.day||t.permanentNote||t.reminder)})).filter(([field])=>field.startsWith('reminder/')||field.startsWith('note/')||field.startsWith(`day/${state.day}/`)&&!field.includes('/achievement/')));}
  const api={capture,materialize,overlay,equal,temporaryFields,noteFields};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MorningSyncData=api;
})(typeof window!=='undefined'?window:globalThis);
