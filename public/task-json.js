(function(root){
  'use strict';
  const {t:translateUI}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
  const model=typeof module!=='undefined'&&module.exports?require('./tasks.js'):root.MorningTasks;
  const R=typeof module!=='undefined'&&module.exports?require('./recurrence.js'):root.MorningRecurrence;
  const L=typeof module!=='undefined'&&module.exports?require('./lists.js'):root.MorningLists;
  const E=typeof module!=='undefined'&&module.exports?require('./emphasis.js'):root.MorningEmphasis;
  const requireEmphasis=value=>E.normalize(value);
  const format='starting-work-tasks';
  function definition(t){return {id:t.id,text:t.text,parentId:t.parentId||null,parentChoice:t.parentChoice??null,boxSeed:t.boxSeed,...(t.emphasis?{emphasis:requireEmphasis(t.emphasis)}:{}),...(t.schedule?{schedule:R.normalize(t.schedule)}:{}),...(t.writing?{writing:{...t.writing}}:{}),...(t.xor?{xor:{otherId:t.xor.otherId,otherText:t.xor.otherText,...(t.xor.scheduleMode?{scheduleMode:t.xor.scheduleMode}:{}),...(Object.prototype.hasOwnProperty.call(t.xor,'sharedSchedule')?{sharedSchedule:R.normalize(t.xor.sharedSchedule)}:{}),...(t.xor.otherSchedule?{otherSchedule:R.normalize(t.xor.otherSchedule)}:{})}}:{})};}
  function encode(state,versions){return JSON.stringify({format,version:2,lists:L.normalize(state.lists,state.tasks),tasks:model.ordered(state).filter(t=>!t.temporaryDay&&!t.permanentNote&&!t.reminder).map(definition),...(versions?{versions:versions.map(history).map(({snapshot,syncKey,...version})=>version)}: {})},null,2)+'\n';}
  function parse(text){
    if(typeof text!=='string'||text.length>8388608)throw new Error(translateUI("JSON-filen må højst fylde 8 MB."));
    let value;try{value=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error(translateUI("Filen er ikke gyldig JSON."));}
    if(!value||!(value.format===format&&value.version===2&&Array.isArray(value.lists))||!Array.isArray(value.tasks))throw new Error(translateUI("Filen er ikke en understøttet opgaveliste."));
    if(value.tasks.length>1000)throw new Error(translateUI("Listen må højst indeholde 1.000 opgaver."));
    const ids=new Set(),byId=new Map();
    const id=value=>typeof value==='string'&&value.length>0&&value.length<=200;
    const label=value=>typeof value==='string'&&value.trim().length>0&&value.length<=300;
    const tasks=value.tasks.filter(t=>!t?.temporaryDay&&!t?.permanentNote&&!t?.reminder).map(t=>{
      if(!t||!id(t.id)||!label(t.text)||ids.has(t.id))throw new Error(translateUI("Alle opgaver skal have unik ID og tekst på højst 300 tegn."));
      if(t.writing&&(!model.validWriting(t.writing)||t.xor))throw new Error(translateUI("En skriveopgave har ugyldig type eller antal felter."));
      ids.add(t.id);
      if(t.xor?.scheduleMode!==undefined&&!['shared','separate'].includes(t.xor.scheduleMode))throw new Error(translateUI("Et ELLER-valg har ugyldig tidsplanstype."));
      if(t.xor){if(!id(t.xor.otherId)||ids.has(t.xor.otherId)||!label(t.xor.otherText))throw new Error(translateUI("Et ELLER-valg mangler gyldig ID eller tekst."));ids.add(t.xor.otherId);}
      if(t.parentId!==undefined&&t.parentId!==null&&!id(t.parentId))throw new Error(translateUI("En afhængighed har ugyldig ID."));
      if(t.parentChoice!==undefined&&t.parentChoice!==null&&t.parentChoice!==0&&t.parentChoice!==1)throw new Error(translateUI("Et ELLER-valg har ugyldig afhængighed."));
      const task=definition(t);if(!Number.isInteger(task.boxSeed)||task.boxSeed<0||task.boxSeed>4294967295)delete task.boxSeed;
      byId.set(task.id,task);return task;
    });
    for(const task of tasks){
      if(task.parentId&&!byId.has(task.parentId))throw new Error(translateUI("En afhængighed henviser til en opgave, der ikke findes."));
      if(task.parentChoice!=null&&!byId.get(task.parentId)?.xor)throw new Error(translateUI("En valgspecifik afhængighed kræver en ELLER-opgave."));
      const seen=new Set([task.id]);let parent=task.parentId;
      while(parent){if(seen.has(parent))throw new Error(translateUI("Opgaverne har en cirkulær afhængighed."));seen.add(parent);parent=byId.get(parent).parentId;}
    }
    Object.defineProperty(tasks,'lists',{value:L.normalize(value.lists,tasks),enumerable:false});return tasks;
  }
  function history(entry){
    if(!entry||!Number.isFinite(entry.createdAt)||entry.createdAt<0||typeof entry.label!=='string'||entry.label.length>80)throw new Error(translateUI("En version har ugyldige oplysninger."));
    const tasks=parse(JSON.stringify({format,version:2,lists:entry.lists,tasks:entry.tasks}));
    if(entry.snapshot){const snap=entry.snapshot,fields=snap.fields;if(!snap.day||!fields||typeof fields!=='object'||Array.isArray(fields)||((Object.hasOwn(fields,'order')||Object.keys(fields).some(key=>key.startsWith('def/')))&&!Array.isArray(fields['list-order'])))throw new Error(translateUI("Sikkerhedskopien har et format, der ikke længere understøttes."));
      const order=fields['list-order']||[];parse(JSON.stringify({format,version:2,tasks:Object.entries(fields).filter(([key,value])=>key.startsWith('def/')&&value).map(([,value])=>value),lists:order.map(id=>fields['list/'+encodeURIComponent(id)])}));
      for(const [key,value] of Object.entries(fields))if(value&&(/(?:^|\/)position\//.test(key)&&!model.validPosition(value)||/(?:^|\/)mobile-position\//.test(key)&&!model.validMobilePosition(value)))throw new Error(translateUI("Sikkerhedskopien indeholder en ikke-understøttet placering."));
    }
    return {...entry,tasks,lists:tasks.lists};
  }
  function read(text){
    const tasks=parse(text),value=JSON.parse(text.replace(/^\uFEFF/,''));
    const versions=[];
    if(value.versions!==undefined){
      if(!Array.isArray(value.versions)||value.versions.length>30)throw new Error(translateUI("Versionshistorikken er ugyldig."));
      for(const entry of value.versions){
        versions.push(history(entry));
      }
    }
    return {tasks,versions};
  }
  function apply(tasks,state,day){
    // Keep today's state only for identities that still describe the same choices.
    const previous=new Map(state.tasks.map(t=>[t.id,t]));
    const merged=tasks.map(t=>{const old=previous.get(t.id),same=old&&old.writing?.mode===t.writing?.mode&&old.writing?.count===t.writing?.count&&!!old.xor===!!t.xor&&old.xor?.otherId===t.xor?.otherId;
      return {...t,...(same&&t.writing?{writingDraft:old.writingDraft,writingAnswer:old.writingAnswer,writingItems:old.writingItems,noteArchived:old.noteArchived,notePosition:old.notePosition,noteMobilePosition:old.noteMobilePosition,noteSize:old.noteSize,noteItemCount:old.noteItemCount}:{}),checked:same?old.checked:false,deferred:same?old.deferred:false,completedOrder:same?old.completedOrder:null,deferredOrder:same?old.deferredOrder:null,markSeed:same?old.markSeed:undefined,deferSeed:same?old.deferSeed:undefined,...(t.xor?{xor:{...t.xor,choice:same?old.xor.choice:null}}:{})};});
    return model.restore({...state,lists:tasks.lists,tasks:[...merged,...state.tasks.filter(t=>(t.temporaryDay===day||t.permanentNote||t.reminder)&&!merged.some(def=>def.id===t.id))]},day);
  }
  const api={definition,encode,parse,read,apply,history};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MorningTaskJSON=api;
})(typeof window!=='undefined'?window:globalThis);
