(function (root) {
  'use strict';
  const {t:translateUI,translate,language}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
  const stats=typeof module!=='undefined'&&module.exports?require('./stats.js'):root.MorningStats;
  const recurrence=typeof module!=='undefined'&&module.exports?require('./recurrence.js'):root.MorningRecurrence;
  const reminders=typeof module!=='undefined'&&module.exports?require('./reminders.js'):root.MorningReminders;
  const media=typeof module!=='undefined'&&module.exports?require('./media-model.js'):root.MorningMediaModel;
  const lists=typeof module!=='undefined'&&module.exports?require('./lists.js'):root.MorningLists;
  const emphasis=typeof module!=='undefined'&&module.exports?require('./emphasis.js'):root.MorningEmphasis;
  const safeSchedule=value=>{try{return recurrence.normalize(value);}catch{return null;}};
  const defaults=['Hent kaffe','Åbn din dagsplan.','Skriv 3 ting, du vil gøre i dag','Tjek ikke dine mails','Planlæg din første pause'];
  const defaultAlternative='Åbn en Monster!';
  const defaultListName='Min liste';
  const matchesStarterText=(value,source)=>value===source||value===translate(source,'en');

  // Treat starter labels as display text only while the task definitions are intact.
  function localizeStarter(state,target=language){
    const tasks=state.tasks.filter(lists.recurring),list=state.lists?.[0];
    if(tasks.length!==defaults.length||state.lists?.length!==1||list.id!=='default'||list.group||list.schedule
      ||!matchesStarterText(list.name,defaultListName)||list.taskIds.length!==defaults.length)return state;
    for(const [index,task] of tasks.entries()){
      const id='initial-'+index;
      if(task.id!==id||list.taskIds[index]!==id||!matchesStarterText(task.text,defaults[index])
        ||task.parentId!==(index===2?'initial-1':null)||task.parentChoice!=null||task.schedule||task.emphasis)return state;
      if(index===0){
        const choice=task.xor;
        if(!choice||choice.otherId!=='initial-monster'||!matchesStarterText(choice.otherText,defaultAlternative)
          ||choice.scheduleMode||choice.sharedSchedule||choice.otherSchedule)return state;
      }else if(task.xor)return state;
      if(index===2){
        if(task.writing?.mode!=='list'||task.writing.count!==3||Object.keys(task.writing).some(key=>!['mode','count','pinColor'].includes(key)))return state;
      }else if(task.writing)return state;
    }
    const names=defaults.map(name=>translate(name,target));
    const otherText=translate(defaultAlternative,target),listName=translate(defaultListName,target);
    if(list.name===listName&&tasks[0].xor.otherText===otherText&&tasks.every((task,index)=>task.text===names[index]))return state;
    const replacements=new Map(tasks.map((task,index)=>[task.id,{
      ...task,text:names[index],...(task.xor?{xor:{...task.xor,otherText}}:{})
    }]));
    return {...state,tasks:state.tasks.map(task=>replacements.get(task.id)||task),lists:[{...list,name:listName}]};
  }
  const paperColors=['cream','yellow','white','rose','blue','sage'];
  const paperTypes=['plain','lined','grid','dots'];
  const pinColors=['terracotta','mustard','sage','forest','teal','blue','navy','plum','rose','charcoal'];
  const seed = () => Math.random() * 4294967296 >>> 0;
  function fresh(day) {
    const state={version:2,  stats:{}, day, weeklyAchievements:stats.weeklyAwards(null,day), dailyAchievements:{day,earned:{}}, completionCounter:0, tasks:defaults.map((text,i) => ({id:`initial-${i}`, text:translateUI(text), parentId:i===2?'initial-1':null, parentChoice:null, checked:false, deferred:false, completedOrder:null, deferredOrder:null, markSeed:seed(), deferSeed:seed(), boxSeed:Math.imul(i+1,2654435761)>>>0}))};
    state.tasks[2].writing={mode:'list',count:3,pinColor:pinColors[Math.floor(Math.random()*pinColors.length)]};state.tasks[2].writingDraft=[];state.tasks[2].writingAnswer=[];
    state.tasks[0].xor={otherId:'initial-monster',otherText:translateUI(defaultAlternative),choice:null};
    state.lists=lists.initial(state.tasks);return state;
  }
  function resetDay(state, day) {
    if (state.day === day) return false;
    state.day = day;state.firstSeen={};
    state.weeklyAchievements=stats.weeklyAwards(state.weeklyAchievements,day);
    state.completionCounter = 0;
    state.dailyAchievements={day,earned:{}};
    state.tasks=state.tasks.filter(t=>!t.temporaryDay);
    state.tasks.forEach(t => {if(t.permanentNote||t.reminder)return;delete t.noteItemCount;delete t.noteCreatedDay;delete t.noteCompletedDay;delete t.noteArchivedDay;delete t.noteArchived;t.checked=false; t.deferred=false; t.completedOrder=null; t.deferredOrder=null;if(t.xor)t.xor.choice=null;if(t.writing){t.writingDraft=[];t.writingAnswer=[];t.writingItems=[];}});
    return true;
  }
  function restore(saved, day) {
    if(saved==null)return fresh(day);
    if(saved.version!==2||!Array.isArray(saved.tasks)||!Array.isArray(saved.lists))throw new Error(translateUI("Den gemte liste har et format, der ikke længere understøttes."));
    for(const task of saved.tasks){
      if(!task||typeof task!=='object')continue;
      emphasis.normalize(task.emphasis);recurrence.normalize(task.schedule);recurrence.normalize(task.xor?.otherSchedule);recurrence.normalize(task.xor?.sharedSchedule);
      if(task.notePosition&&!validPosition(task.notePosition)||task.noteMobilePosition&&!validMobilePosition(task.noteMobilePosition))throw new Error(translateUI("Notens placering har et format, der ikke længere understøttes."));
      if(task.writingAnswer?.length&&(!Array.isArray(task.writingItems)||task.writingItems.length!==task.writingAnswer.length||task.writingItems.some(item=>!item||typeof item.id!=='string'||!item.id)))throw new Error(translateUI("Notens indhold har et format, der ikke længere understøttes."));
    }
    const ids = new Set();
    const tasks = saved.tasks.filter(t => {
      if (!t || typeof t.id !== 'string' || ids.has(t.id) || typeof t.text !== 'string' || !t.text.trim()) return false;
      if(t.permanentNote===true&&(!validWriting(t.writing)||t.xor))return false;
      if(t.temporaryDay!==undefined&&(t.temporaryDay!==saved.day||!validWriting(t.writing)||t.xor))return false;
      if(t.reminder!==undefined&&(!reminders.validMeta(t.reminder)||!reminders.validId(t.id)||t.writing||t.xor||t.permanentNote||t.temporaryDay))return false;
      ids.add(t.id); return true;
    }).map(t => ({id:t.id, text:t.text, ...(emphasis.safe(t.emphasis)?{emphasis:emphasis.safe(t.emphasis)}:{}), ...(t.reminder?{reminder:reminders.meta(t.reminder),checkedDay:reminders.dateKey(t.checkedDay),deferredDay:reminders.dateKey(t.deferredDay)}:{}), ...(t.permanentNote===true?{permanentNote:true}:t.temporaryDay?{temporaryDay:t.temporaryDay}:{}),...(Number.isInteger(t.noteItemCount)&&t.noteItemCount>=1&&t.noteItemCount<=100?{noteItemCount:t.noteItemCount}:{}),...Object.fromEntries(['noteCreatedDay','noteCompletedDay','noteArchivedDay'].filter(key=>typeof t[key]==='string').map(key=>[key,t[key]])), ...(safeSchedule(t.schedule)?{schedule:safeSchedule(t.schedule)}:{}), ...(t.noteArchived===true?{noteArchived:true}:{}), parentId:typeof t.parentId==='string'?t.parentId:null, parentChoice:t.parentChoice===0||t.parentChoice===1?t.parentChoice:null, checked:t.checked===true&&t.deferred!==true, deferred:t.deferred===true, completedOrder:t.deferred!==true&&Number.isSafeInteger(t.completedOrder)&&t.completedOrder>0?t.completedOrder:null, deferredOrder:t.deferred===true&&Number.isSafeInteger(t.deferredOrder)&&t.deferredOrder>0?t.deferredOrder:null, markSeed:Number.isInteger(t.markSeed)?t.markSeed>>>0:seed(), deferSeed:Number.isInteger(t.deferSeed)?t.deferSeed>>>0:seed(), boxSeed:Number.isInteger(t.boxSeed)?t.boxSeed>>>0:seed(), ...(validWriting(t.writing)&&!t.xor?{writing:{...t.writing},writingDraft:cleanWriting(t.writingDraft),writingAnswer:cleanWriting(t.writingAnswer),...(Array.isArray(t.writingItems)?{writingItems:t.writingItems}:{}),...(validPosition(t.notePosition)?{notePosition:{...t.notePosition}}:{}),...(validMobilePosition(t.noteMobilePosition)?{noteMobilePosition:{...t.noteMobilePosition}}:{}),...(validNoteSize(t.noteSize)?{noteSize:{...t.noteSize}}:{})}:{}), ...(t.xor&&typeof t.xor.otherId==='string'&&typeof t.xor.otherText==='string'&&t.xor.otherText.trim()?{xor:{otherId:t.xor.otherId,otherText:t.xor.otherText,...(t.xor.scheduleMode==='shared'||t.xor.scheduleMode==='separate'?{scheduleMode:t.xor.scheduleMode}:{}),...(Object.prototype.hasOwnProperty.call(t.xor,'sharedSchedule')?{sharedSchedule:safeSchedule(t.xor.sharedSchedule)}:{}),...(safeSchedule(t.xor.otherSchedule)?{otherSchedule:safeSchedule(t.xor.otherSchedule)}:{}),choice:t.checked===true&&t.deferred!==true?(t.xor.choice===1?1:0):null}}:{})}));
    // Persisted content must remain editable even if separately synced row-count metadata lags behind.
    tasks.forEach(t=>{if(t.writing?.mode==='list'&&(t.writingAnswer.length>writingCount(t)||t.writingDraft.length<t.writingAnswer.length)){
      t.noteItemCount=Math.min(100,Math.max(writingCount(t),t.writingAnswer.length,t.writingDraft.length));
      t.writingDraft=Array.from({length:t.noteItemCount},(_,i)=>t.writingDraft[i]??t.writingAnswer[i]??'');
    }});
    tasks.forEach(t=>{if(t.writing&&t.checked&&!validAnswer(t,t.writingAnswer,t.writing.mode==='list'?t.writingAnswer.length:1)){t.checked=false;t.completedOrder=null;}});
    tasks.forEach(t=>{if(t.writing&&t.writingAnswer.length)reconcileItems(t,t.writingAnswer);});
    const byId = new Map(tasks.map(t => [t.id,t]));
    const choiceIds=new Set(byId.keys());
    tasks.forEach(t=>{if(t.xor){if(choiceIds.has(t.xor.otherId))delete t.xor;else choiceIds.add(t.xor.otherId);}});
    tasks.forEach(t => {
      if (t.reminder || byId.get(t.parentId)?.reminder || !byId.has(t.parentId) || byId.get(t.parentId)?.temporaryDay || byId.get(t.parentId)?.permanentNote || t.parentId===t.id) t.parentId=null;
      const seen = new Set([t.id]);
      let p = t.parentId;
      while (p) {
        if (seen.has(p)) {t.parentId=null; break;}
        seen.add(p); p=byId.get(p)?.parentId;
      }
      if(!byId.get(t.parentId)?.xor)t.parentChoice=null;
    });
    const earned={};
    if(saved.dailyAchievements?.day===saved.day&&saved.dailyAchievements.earned&&typeof saved.dailyAchievements.earned==='object'){
      Object.entries(saved.dailyAchievements.earned).forEach(([id,time])=>{if(Number.isFinite(time)&&time>=0)Object.defineProperty(earned,id,{value:time,enumerable:true,writable:true,configurable:true});});
    }
    const state = {version:2,  day:saved.day, dailyAchievements:{day:saved.day,earned}, tasks, completionCounter:Math.max(0,...tasks.flatMap(t=>[t.completedOrder||t.deferredOrder||0,...(t.writingItems||[]).map(item=>item.completedOrder||item.deferredOrder||0)]))};
    state.firstSeen=emphasis.firstSeen(saved.firstSeen);
    state.lists=lists.normalize(saved.lists,tasks);
    state.weeklyAchievements=stats.weeklyAwards(saved.weeklyAchievements,day);
    state.stats=stats.normalize(saved.stats);
    state.tasks=treeOrder(state);
    tasks.filter(t=>t.checked&&!t.completedOrder).forEach(t=>{t.completedOrder=++state.completionCounter;});
    tasks.flatMap(t=>t.writingItems||[]).filter(item=>item.checked&&!item.completedOrder).forEach(item=>{item.completedOrder=++state.completionCounter;});
    tasks.flatMap(t=>t.writingItems||[]).filter(item=>item.deferred&&!item.deferredOrder).forEach(item=>{item.deferredOrder=++state.completionCounter;});
    tasks.filter(t=>t.deferred&&!t.deferredOrder).forEach(t=>{t.deferredOrder=++state.completionCounter;});
    resetDay(state,day);
    return localizeStarter(state);
  }
  function treeOrder(state) {
    const children=new Map();
    state.tasks.forEach(t=>{const group=children.get(t.parentId)||[];group.push(t);children.set(t.parentId,group);});
    const result=[];
    function visit(parent) {(children.get(parent)||[]).forEach(t=>{result.push(t);visit(t.id);});}
    visit(null); return result;
  }
  function ordered(state) {return treeOrder(state);}
  function dependsOn(state,id,ancestorId) {
    const byId=new Map(state.tasks.map(t=>[t.id,t]));
    let parent=byId.get(id)?.parentId;
    while(parent){if(parent===ancestorId)return true;parent=byId.get(parent)?.parentId;}
    return false;
  }
  function scheduledChoices(state,task,now=lists.clock()){if(!lists.contains(state,task,now))return [];if(task.reminder)return reminders.onDay(task,state.day,now.getHours()*60+now.getMinutes())?[0]:[];return task.xor?[0,1].filter(choice=>recurrence.matches(task.xor.scheduleMode==='shared'?task.xor.sharedSchedule:choice===1?task.xor.otherSchedule:task.schedule,state.day,now)):recurrence.matches(task.schedule,state.day,now)?[0]:[];}
  function scheduled(state,task,now){
    if(!scheduledChoices(state,task,now).length)return false;
    const byId=new Map(state.tasks.map(t=>[t.id,t]));let child=task,parent=byId.get(child.parentId);
    while(parent){const choices=scheduledChoices(state,parent,now);if(!choices.length||child.parentChoice!=null&&!choices.includes(child.parentChoice))return false;child=parent;parent=byId.get(child.parentId);}return true;
  }
  function displayTask(state,task,now){if(!task?.xor)return task;const choices=scheduledChoices(state,task,now);if(choices.length!==1)return task;const choice=choices[0],{xor,...rest}=task;return {...rest,text:choice===1?xor.otherText:task.text,checked:task.checked&&xor.choice===choice,deferred:task.deferred||task.checked&&xor.choice!==choice,scheduledChoice:choice};}
  function setSchedule(state,id,value,choice=0){const task=state.tasks.find(t=>t.id===id);if(!task||![0,1,'shared'].includes(choice)||choice!==0&&!task.xor)throw new Error(translateUI("Opgaven findes ikke."));const schedule=recurrence.normalize(value),target=choice===0?task:task.xor,key=choice==='shared'?'sharedSchedule':choice===1?'otherSchedule':'schedule';if(schedule||choice==='shared')target[key]=schedule;else delete target[key];return task;}
  function setScheduleMode(state,id,mode){const task=state.tasks.find(t=>t.id===id);if(!task?.xor||!['shared','separate'].includes(mode))throw new Error(translateUI("Vælg fælles eller hver sin tidsplan."));if(mode==='shared'&&!Object.prototype.hasOwnProperty.call(task.xor,'sharedSchedule'))task.xor.sharedSchedule=safeSchedule(task.schedule);task.xor.scheduleMode=mode;return task;}
  function eligibleTasks(state,now) {
    const byId=new Map(state.tasks.map(t=>[t.id,t]));
    return lists.ordered(state,ordered(state),now).filter(t=>{
      if(t.temporaryDay||t.permanentNote||t.writing&&t.noteArchived||!scheduled(state,t,now))return false;
      let child=t;
      while(child.parentId) {const parent=byId.get(child.parentId);if(!parent?.checked||parent.deferred||(parent.xor&&child.parentChoice!=null&&child.parentChoice!==parent.xor.choice))return false;child=parent;}
      return true;
    });
  }
  function overflowTasks(state,limit=10,now){const shown=new Set(visible(state,limit,now).map(t=>t.id));return eligibleTasks(state,now).filter(t=>!shown.has(t.id));}
  function visible(state,limit=10,now){
    const eligible=eligibleTasks(state,now);
    const closed=t=>t.checked||t.deferred;
    const activeCount=eligible.filter(t=>!closed(t)).length;
    const completedSlots=Math.max(0,limit-activeCount);
    const retained=new Set(eligible.filter(closed).sort((a,b)=>(b.completedOrder||b.deferredOrder)-(a.completedOrder||a.deferredOrder)).slice(0,completedSlots).map(t=>t.id));
    return eligible.filter(t=>!closed(t)||retained.has(t.id));
  }
  function createDefaultList(state){state.lists.push(...lists.initial([]));return 'default';}
  function add(state,text,parentId,id,standalone=false) {
    text=text.trim();
    if(!text)throw new Error(translateUI("Skriv en opgave først."));
    if(state.tasks.some(t=>t.id===id))throw new Error(translateUI("Opgaven findes allerede."));
    if(parentId&&!state.tasks.some(t=>t.id===parentId&&!t.temporaryDay&&!t.permanentNote&&!t.reminder))throw new Error(translateUI("Vælg en eksisterende opgave."));
    if(state.tasks.some(t=>t.xor?.otherId===id))throw new Error(translateUI("Opgaven findes allerede."));
    const task={id,text,parentId:parentId||null,parentChoice:null,checked:false,deferred:false,completedOrder:null,deferredOrder:null,markSeed:seed(),deferSeed:seed(),boxSeed:seed()};
    let index=state.tasks.length;
    if(parentId){index=state.tasks.findIndex(t=>t.id===parentId)+1;while(index<state.tasks.length&&dependsOn(state,state.tasks[index].id,parentId))index++;}
    state.tasks.splice(index,0,task);if(!standalone)lists.assign(state,lists.memberships(state,parentId)[0]?.id||lists.ensure(state)[0]?.id||createDefaultList(state),id);return task;
  }
  function update(state,id,text,parentId) {
    const task=state.tasks.find(t=>t.id===id);
    if(!task)throw new Error(translateUI("Opgaven findes ikke længere."));
    text=text.trim();
    if(!text)throw new Error(translateUI("Opgaven skal have en tekst."));
    if(parentId&&!state.tasks.some(t=>t.id===parentId&&!t.temporaryDay&&!t.permanentNote&&!t.reminder))throw new Error(translateUI("Vælg en eksisterende opgave."));
    if(parentId===id||(parentId&&dependsOn(state,parentId,id)))throw new Error(translateUI("Opgaverne kan ikke afhænge af hinanden i en cirkel."));
    task.text=text;if(task.parentId!==(parentId||null))task.parentChoice=null;task.parentId=parentId||null;for(const list of lists.memberships(state,id))lists.assign(state,list.id,id);state.tasks=ordered(state);return task;
  }
  function depth(state,id) {
    const byId=new Map(state.tasks.map(t=>[t.id,t]));
    let level=0,parent=byId.get(id)?.parentId;
    while(parent){level++;parent=byId.get(parent)?.parentId;}
    return level;
  }
  function branch(state,id) {return ordered(state).filter(t=>t.id===id||dependsOn(state,t.id,id));}
  function project(state,id,index,desiredDepth) {
    if(!state.tasks.some(t=>t.id===id))throw new Error(translateUI("Opgaven findes ikke længere."));
    const remaining=ordered(state).filter(t=>!t.temporaryDay&&!t.permanentNote&&!t.reminder&&t.id!==id&&!dependsOn(state,t.id,id));
    index=Math.max(0,Math.min(remaining.length,index));
    const previous=remaining[index-1],next=remaining[index];
    const min=next?depth(state,next.id):0,max=previous?depth(state,previous.id)+1:0;
    const level=Math.max(min,Math.min(max,desiredDepth));
    let parentId=null;
    if(level>0){for(let i=index-1;i>=0;i--)if(depth(state,remaining[i].id)===level-1){parentId=remaining[i].id;break;}}
    return {index,depth:level,parentId};
  }
  function place(state,id,index,desiredDepth) {
    const location=project(state,id,index,desiredDepth),block=branch(state,id),removed=new Set(block.map(t=>t.id));
    const notes=ordered(state).filter(t=>t.temporaryDay||t.permanentNote||t.reminder),remaining=ordered(state).filter(t=>!t.temporaryDay&&!t.permanentNote&&!t.reminder&&!removed.has(t.id));
    if(block[0].parentId!==location.parentId)block[0].parentChoice=null;block[0].parentId=location.parentId;
    remaining.splice(location.index,0,...block);state.tasks=[...remaining,...notes];
    for(const list of lists.ensure(state).filter(l=>!state.editListId||l.id===state.editListId)){const rank=new Map(state.tasks.map((t,i)=>[t.id,i]));list.taskIds.sort((a,b)=>(rank.get(a)??1e9)-(rank.get(b)??1e9));}
    return location;
  }
  function shift(state,id,direction) {
    const task=state.tasks.find(t=>t.id===id);if(!task)return;
    const siblings=ordered(state).filter(t=>!t.temporaryDay&&!t.permanentNote&&!t.reminder&&t.parentId===task.parentId),position=siblings.findIndex(t=>t.id===id),other=siblings[position+direction];
    if(!other)return;
    const remaining=ordered(state).filter(t=>!t.temporaryDay&&!t.permanentNote&&!t.reminder&&t.id!==id&&!dependsOn(state,t.id,id));
    let index=remaining.findIndex(t=>t.id===other.id);
    if(direction>0)index+=branch(state,other.id).length;
    place(state,id,index,depth(state,id));
  }
  function indent(state,id) {
    const task=state.tasks.find(t=>t.id===id);if(!task)return;
    const siblings=ordered(state).filter(t=>!t.temporaryDay&&!t.permanentNote&&!t.reminder&&t.parentId===task.parentId),index=siblings.findIndex(t=>t.id===id),previous=siblings[index-1];
    if(!previous)return;
    const remaining=ordered(state).filter(t=>!t.temporaryDay&&!t.permanentNote&&!t.reminder&&t.id!==id&&!dependsOn(state,t.id,id));
    const insertion=remaining.findIndex(t=>t.id===previous.id)+branch(state,previous.id).length;
    place(state,id,insertion,depth(state,previous.id)+1);
  }
  function outdent(state,id) {
    const task=state.tasks.find(t=>t.id===id);if(!task?.parentId)return;
    const parent=state.tasks.find(t=>t.id===task.parentId);
    const remaining=ordered(state).filter(t=>!t.temporaryDay&&!t.permanentNote&&!t.reminder&&t.id!==id&&!dependsOn(state,t.id,id));
    const insertion=remaining.findIndex(t=>t.id===parent.id)+remaining.filter(t=>t.id===parent.id||dependsOn(state,t.id,parent.id)).length;
    place(state,id,insertion,depth(state,parent.id));
  }
  function remove(state,id) {
    const task=state.tasks.find(t=>t.id===id);if(!task)return;
    // Keep follow-up tasks, inheriting the removed task's prerequisite.
    state.tasks.forEach(t=>{if(t.parentId===id){t.parentId=task.parentId;t.parentChoice=task.parentChoice;}});
    state.tasks=state.tasks.filter(t=>t.id!==id);for(const list of lists.ensure(state))list.taskIds=list.taskIds.filter(value=>value!==id);
  }
  function toggle(state,id,choice) {
    const t=state.tasks.find(t=>t.id===id);if(!t||!scheduled(state,t))return null;
    if(t.xor&&choice===undefined){const choices=scheduledChoices(state,t);if(choices.length===1)choice=choices[0];}
    if(t.xor&&!scheduledChoices(state,t).includes(choice))return null;
    if(t.writing||deferStatus(state,id)||t.xor&&choiceStatus(state,id,choice)==='passive')return null;
    if(t.xor){
      if(choice!==0&&choice!==1)return null;
      const checked=!(t.checked&&t.xor.choice===choice);t.xor.choice=checked?choice:null;t.checked=!checked;
    }
    t.deferred=false;t.deferredOrder=null;
    t.checked=!t.checked;
    t.completedOrder=t.checked?++state.completionCounter:null;
    if(t.reminder){t.checkedDay=t.checked?reminders.dateKey(state.day):null;t.deferredDay=null;}
    if(t.checked){t.markSeed=seed();stats.record(state,'checked');}
    return t;
  }
  function deferStatus(state,id) {
    const byId=new Map(state.tasks.map(t=>[t.id,t])),task=byId.get(id);
    if(!task)return null;
    if(task.deferred)return 'active';
    let child=task,parent=byId.get(child.parentId);
    while(parent){if(parent.deferred||(parent.xor&&parent.checked&&child.parentChoice!=null&&child.parentChoice!==parent.xor.choice))return 'passive';child=parent;parent=byId.get(child.parentId);}
    return null;
  }
  function defer(state,id) {
    const t=state.tasks.find(t=>t.id===id);if(!t||!scheduled(state,t)||t.xor&&t.checked&&!scheduledChoices(state,t).includes(t.xor.choice)||t.noteArchived||deferStatus(state,id)==='passive')return null;
    t.deferred=!t.deferred;t.checked=false;t.completedOrder=null;
    if(t.xor)t.xor.choice=null;
    t.deferredOrder=t.deferred?++state.completionCounter:null;
    if(t.reminder){t.deferredDay=t.deferred?reminders.dateKey(state.day):null;t.checkedDay=null;}
    if(t.deferred){t.deferSeed=seed();stats.record(state,'deferred');}
    return t;
  }
  function pair(state,id,otherId) {
    const a=state.tasks.find(t=>t.id===id),b=state.tasks.find(t=>t.id===otherId);
    if(!a||!b||a.reminder||b.reminder||a===b||a.xor||b.xor||a.writing||b.writing||a.parentId!==b.parentId||a.parentChoice!==b.parentChoice)throw new Error(translateUI("Vælg to enkeltopgaver på samme niveau med samme afhængighed."));
    if(JSON.stringify(lists.memberships(state,a.id).map(l=>l.id).sort())!==JSON.stringify(lists.memberships(state,b.id).map(l=>l.id).sort()))throw new Error(translateUI("ELLER-valg skal tilhøre de samme lister. Tilpas medlemskabet først."));
    const choice=a.checked?0:b.checked?1:null;
    a.xor={otherId:b.id,otherText:b.text,...(b.schedule?{otherSchedule:b.schedule}:{}),choice};
    state.tasks.forEach(t=>{if(t.parentId===a.id)t.parentChoice=0;else if(t.parentId===b.id){t.parentId=a.id;t.parentChoice=1;}});
    a.checked=choice!==null;a.deferred=!a.checked&&(a.deferred||b.deferred);
    a.completedOrder=a.checked?(choice===0?a.completedOrder:b.completedOrder):null;
    a.deferredOrder=a.deferred?(a.deferredOrder||b.deferredOrder):null;
    for(const list of lists.ensure(state)){if(list.taskIds.includes(b.id)&&!list.taskIds.includes(a.id))list.taskIds.splice(list.taskIds.indexOf(b.id),0,a.id);list.taskIds=list.taskIds.filter(id=>id!==b.id);}
    state.tasks=ordered({tasks:state.tasks.filter(t=>t.id!==b.id)});return a;
  }
  function unpair(state,id) {
    const a=state.tasks.find(t=>t.id===id);if(!a?.xor)return null;
    const {otherId,otherText,otherSchedule,choice,scheduleMode,sharedSchedule}=a.xor;
    const b={...a,id:otherId,text:otherText,checked:a.checked&&choice===1,deferred:false,completedOrder:choice===1?a.completedOrder:null,deferredOrder:null,markSeed:a.markSeed,deferSeed:(a.deferSeed^2654435761)>>>0,boxSeed:(a.boxSeed^2654435761)>>>0};
    delete b.schedule;if(scheduleMode==='shared'){delete a.schedule;if(sharedSchedule){a.schedule=safeSchedule(sharedSchedule);b.schedule=safeSchedule(sharedSchedule);}}else if(otherSchedule)b.schedule=otherSchedule;
    delete b.xor;delete a.xor;a.checked=a.checked&&choice===0;if(!a.checked)a.completedOrder=null;
    state.tasks.forEach(t=>{if(t.parentId===a.id){if(t.parentChoice===1||(t.parentChoice==null&&choice===1))t.parentId=b.id;t.parentChoice=null;}});
    for(const list of lists.memberships(state,a.id))list.taskIds.splice(list.taskIds.indexOf(a.id)+1,0,b.id);
    const insertion=state.tasks.indexOf(a)+1;state.tasks.splice(insertion,0,b);state.tasks=ordered(state);return b;
  }
  function updateChoice(state,id,choice,text) {
    const t=state.tasks.find(t=>t.id===id);if(!t?.xor||(choice!==0&&choice!==1))throw new Error(translateUI("Valget findes ikke."));
    text=text.trim();if(!text)throw new Error(translateUI("Opgaven skal have en tekst."));
    if(choice===0)t.text=text;else t.xor.otherText=text;return t;
  }
  function setDependencyChoice(state,id,choice) {
    const t=state.tasks.find(t=>t.id===id),parent=state.tasks.find(p=>p.id===t?.parentId);
    if(!parent?.xor||!(choice==null||choice===0||choice===1))throw new Error(translateUI("Vælg en af opgavens to muligheder."));
    t.parentChoice=choice==null?null:choice;return t;
  }
  function choiceStatus(state,id,choice) {
    const t=state.tasks.find(t=>t.id===id);if(!t?.xor)return null;
    if(t.deferred)return choice===0?'active':'passive';
    if(deferStatus(state,id)==='passive')return 'passive';
    if(t.checked)return t.xor.choice===choice?'completed':'passive';
    return null;
  }
  const dayScheduleCache=new WeakMap();
  function dailyScheduled(state){const signature=JSON.stringify([state.day,state.lists,state.tasks.map(t=>[t.id,t.parentId,t.parentChoice,t.schedule,t.xor?.scheduleMode,t.xor?.sharedSchedule,t.xor?.otherSchedule,t.reminder])]);const cached=dayScheduleCache.get(state);if(cached?.signature===signature)return cached.ids;const ids=new Set();for(const now of lists.samples(state))for(const task of state.tasks)if(scheduled(state,task,now))ids.add(task.id);dayScheduleCache.set(state,{signature,ids});return ids;}
  function achievementTasks(state,wholeDay=false) {
    const byId=new Map(state.tasks.map(t=>[t.id,t]));
    const applicable=state.tasks.filter(t=>{
      if(wholeDay?!(t.checked&&!t.reminder)&&!dailyScheduled(state).has(t.id):!(t.checked&&!t.reminder)&&!scheduled(state,t))return false;
      let child=t,parent=byId.get(child.parentId);
      while(parent){if(parent.xor&&parent.checked&&child.parentChoice!=null&&child.parentChoice!==parent.xor.choice)return false;child=parent;parent=byId.get(child.parentId);}
      return true;
    });
    return applicable.flatMap(t=>[...(!t.temporaryDay&&!t.permanentNote?[t]:[]),...(t.writing&&t.writing.asTasks!==false&&t.checked&&!deferStatus(state,t.id)?(t.writingItems||[]).map(item=>t.permanentNote?{...item,permanentNote:true,checked:item.checked&&item.checkedDay===state.day}:item):[])]);
  }
  function validWriting(value){return value&&(value.asset===undefined||media.validAsset(value.asset))&&(value.mat===undefined||media.borders.includes(value.mat))&&(value.align===undefined||['left','center','right'].includes(value.align))&&(value.paperColor===undefined||paperColors.includes(value.paperColor))&&(value.paperType===undefined||paperTypes.includes(value.paperType))&&(value.pinColor===undefined||pinColors.includes(value.pinColor))&&(value.asTasks===undefined||typeof value.asTasks==='boolean')&&(value.listStyle===undefined||['disc','decimal','upper-roman','upper-alpha','lower-alpha','lower-roman'].includes(value.listStyle))&&(value.title===undefined||typeof value.title==='string'&&value.title.length<=300)&&(((value.mode==='note'||value.mode==='media')&&value.count===1)||(value.mode==='list'&&Number.isInteger(value.count)&&value.count>=1&&value.count<=10));}
  function cleanWriting(value){return Array.isArray(value)?value.slice(0,100).map(v=>typeof v==='string'?v.slice(0,2000):''):[];}
  function writingCount(task){if(task.writing?.mode!=='list')return 1;if(Number.isInteger(task.noteItemCount)&&task.noteItemCount>=1&&task.noteItemCount<=100)return task.noteItemCount;return Math.min(100,Math.max(task.writing.count||1,task.writingAnswer?.length||0,task.writingDraft?.length||0));}
  function validAnswer(task,values,count=writingCount(task)){return (task.writing?.mode!=='media'||media.validAsset(task.writing.asset))&&Array.isArray(values)&&count>=1&&count<=100&&values.length===count&&values.every(v=>typeof v==='string'&&v.trim()&&v.length<=2000);}
  function configureWriting(state,id,config){
    const task=state.tasks.find(t=>t.id===id);if(!task||task.xor)throw new Error(translateUI("Skriveopgaver skal være enkeltopgaver."));
    if(config&&!validWriting(config))throw new Error(translateUI("Vælg en note, en liste med 1–10 punkter eller et billede/PDF."));
    if(config)config={...config,pinColor:config.pinColor||task.writing?.pinColor||pinColors[Math.floor(Math.random()*pinColors.length)]};
    if(JSON.stringify(task.writing||null)===JSON.stringify(config))return task;
    if(config&&task.writing?.mode===config.mode&&task.writing.count===config.count&&task.writing.asset?.id===config.asset?.id){task.writing={...config};if(task.writingAnswer?.length)reconcileItems(task,task.writingAnswer);return task;}
    delete task.noteItemCount;
    if(config){task.writing={...config};task.writingDraft=[];task.writingAnswer=[];task.writingItems=[];}else{delete task.writing;delete task.writingDraft;delete task.writingAnswer;delete task.writingItems;}task.checked=false;task.completedOrder=null;return task;
  }
  function draftWriting(state,id,values){const task=state.tasks.find(t=>t.id===id);if(!task?.writing||task.noteArchived||!task.writingAnswer?.length&&!scheduled(state,task)||deferStatus(state,id))return null;task.writingDraft=cleanWriting(values).slice(0,writingCount(task));return task;}
  function submitWriting(state,id,values){
    const task=state.tasks.find(t=>t.id===id);if(!task?.writing||task.noteArchived||!task.writingAnswer?.length&&!scheduled(state,task)||deferStatus(state,id))return null;
    if(!validAnswer(task,values))throw new Error(translateUI("Udfyld alle felter først."));
    const wasComplete=noteComplete(task);
    if(!task.writingAnswer?.length&&!task.noteCreatedDay){stats.record(state,'notes');task.noteCreatedDay=state.day;}
    task.writingAnswer=values.map(v=>v.trim());task.writingDraft=[...task.writingAnswer];
    reconcileItems(task,task.writingAnswer);
    if(!task.checked){task.checked=true;task.completedOrder=++state.completionCounter;task.markSeed=seed();if(!task.temporaryDay&&!task.permanentNote)stats.record(state,'checked');}if(!wasComplete&&noteComplete(task))task.noteCompletedDay=state.day;return task;
  }
  function createTemporaryNote(state,id,config={mode:'note',count:1,asTasks:true}){
    if(!validWriting(config))throw new Error(translateUI("Vælg en gyldig notetype."));
    const task=add(state,'Ny note',null,id,true);task.temporaryDay=state.day;configureWriting(state,id,{title:'',...config});return task;
  }
  function setNotePermanence(state,id,permanent){
    const task=state.tasks.find(t=>t.id===id);if(!task?.writing||!(task.temporaryDay||task.permanentNote))return null;
    if(permanent){task.permanentNote=true;delete task.temporaryDay;if(task.writingAnswer?.length&&!task.noteCreatedDay)task.noteCreatedDay=state.day;if(noteComplete(task)&&!task.noteCompletedDay)task.noteCompletedDay=state.day;for(const item of task.writingItems||[]){if(item.checked&&!item.checkedDay)item.checkedDay=state.day;if(item.deferred&&!item.deferredDay)item.deferredDay=state.day;}}
    else{delete task.permanentNote;task.temporaryDay=state.day;}return task;
  }
  function editWritingList(state,id,values){
    const task=state.tasks.find(t=>t.id===id);if(task?.writing?.mode!=='list'||task.noteArchived||!task.writingAnswer?.length&&!scheduled(state,task)||deferStatus(state,id))return null;
    if(!Array.isArray(values)||values.length<1||values.length>100)throw new Error(translateUI("En liste kan have 1–100 punkter."));
    task.noteItemCount=values.length;task.writingDraft=cleanWriting(values);return task;
  }
  function itemHash(text){let hash=2166136261;for(const char of text)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;return hash;}
  function reconcileItems(task,answers){
    const old=Array.isArray(task.writingItems)?task.writingItems:[],used=new Set(),ids=new Set();
    task.writingItems=answers.map(text=>{
      const match=old.find(item=>item&&item.text===text&&!used.has(item));if(match)used.add(match);
      let itemID=match&&typeof match.id==='string'&&!ids.has(match.id)?match.id:`${task.id}:note:${itemHash(text).toString(36)}`;while(ids.has(itemID))itemID+='x';ids.add(itemID);
      const deferred=match?.deferred===true,checked=match?.checked===true&&!deferred;
      return {id:itemID,text,checked,deferred,deferredOrder:deferred&&Number.isSafeInteger(match.deferredOrder)&&match.deferredOrder>0?match.deferredOrder:null,deferSeed:Number.isInteger(match?.deferSeed)?match.deferSeed>>>0:seed(),...(typeof match?.checkedDay==='string'?{checkedDay:match.checkedDay}:{}),...(typeof match?.deferredDay==='string'?{deferredDay:match.deferredDay}:{}),completedOrder:checked&&Number.isSafeInteger(match.completedOrder)&&match.completedOrder>0?match.completedOrder:null,markSeed:Number.isInteger(match?.markSeed)?match.markSeed>>>0:seed(),boxSeed:Number.isInteger(match?.boxSeed)?match.boxSeed>>>0:itemHash(itemID)};
    });
  }
  function toggleWritingItem(state,id,itemId){
    const task=state.tasks.find(t=>t.id===id),item=task?.writingItems?.find(item=>item.id===itemId);
    if(!task?.checked||task.noteArchived||task.writing?.asTasks===false||!item||item.deferred||deferStatus(state,id))return null;
    item.checked=!item.checked;item.completedOrder=item.checked?++state.completionCounter:null;if(item.checked){item.checkedDay=state.day;item.markSeed=seed();stats.record(state,'checked');}if(noteComplete(task))task.noteCompletedDay=state.day;return item;
  }
  function deferWritingItem(state,id,itemId){
    const task=state.tasks.find(t=>t.id===id),item=task?.writingItems?.find(item=>item.id===itemId);
    if(!task?.checked||task.noteArchived||task.writing?.asTasks===false||!item||deferStatus(state,id))return null;
    item.deferred=!item.deferred;item.checked=false;item.completedOrder=null;item.deferredOrder=item.deferred?++state.completionCounter:null;if(item.deferred){item.deferredDay=state.day;item.deferSeed=seed();stats.record(state,'deferred');}if(noteComplete(task))task.noteCompletedDay=state.day;return item;
  }
  function validPosition(p){const min=-100000;return p&&p.space==='list'&&Number.isFinite(p.x)&&p.x>=min&&p.x<=100000&&Number.isFinite(p.y)&&p.y>=min&&p.y<=100000;}
  function validNoteSize(s){return s&&Number.isFinite(s.width)&&s.width>=180&&s.width<=1200&&Number.isFinite(s.height)&&s.height>=0&&s.height<=2000;}
  function resizeNote(state,id,size){const task=state.tasks.find(t=>t.id===id);if(!task?.writing||!validNoteSize(size))return null;task.noteSize={width:size.width,height:task.writing.mode==='media'?0:size.height};return task;}
  function validMobilePosition(p){return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.space==='page'&&p.y<=100000;}
  function moveMobileNote(state,id,position){const task=state.tasks.find(t=>t.id===id);if(!task?.writing||position!==null&&!validMobilePosition(position))return null;if(position===null)delete task.noteMobilePosition;else task.noteMobilePosition={...position};return task;}
  function moveNote(state,id,position){const task=state.tasks.find(t=>t.id===id);if(!task?.writing||!validPosition(position))return null;task.notePosition={x:position.x,y:position.y,space:'list'};return task;}
  function noteComplete(task){return !!(task?.writing&&task.checked&&task.writing.asTasks!==false&&task.writingItems?.length&&task.writingItems.every(item=>item.checked||item.deferred));}
  function canArchiveNote(task){return !!(task?.writing&&task.checked&&task.writingAnswer?.length&&!task.noteArchived&&(task.writing.asTasks===false||noteComplete(task)));}
  function archiveNote(state,id){const task=state.tasks.find(t=>t.id===id);if(!canArchiveNote(task))return null;task.noteArchived=true;task.noteArchivedDay=state.day;return task;}
  function addReminder(state,text,date,id,{time,dayOnly,emphasis:effect}={}){
    if(!reminders.validId(id)||reminders.dateKey(date)!==date||date<reminders.dateKey(state.day))throw new Error(translateUI("Vælg en gyldig dato fra i dag og frem."));
    if(typeof text!=='string'||!text.trim()||text.length>300)throw new Error(translateUI("Skriv en opgave på højst 300 tegn."));
    const now=Date.now(),reminder=reminders.meta({date,time,dayOnly,createdAt:now,updatedAt:now});
    if(!reminder)throw new Error(translateUI("Vælg et gyldigt tidspunkt."));
    const appearance=emphasis.normalize(effect);
    const task=add(state,text,null,id,true);
    task.reminder=reminder;
    if(appearance)task.emphasis=appearance;
    return task;
  }
  function changeReminder(state,id,date,text){
    const task=state.tasks.find(t=>t.id===id&&t.reminder);if(!task||task.checked||task.deferred||task.reminder.cancelledAt!==undefined)throw new Error(translateUI("Påmindelsen er allerede afsluttet."));
    if(reminders.dateKey(date)!==date||date<reminders.dateKey(state.day)&&date!==task.reminder.date)throw new Error(translateUI("Vælg en gyldig dato fra i dag og frem, eller behold den oprindelige dato."));
    if(typeof text!=='string'||!text.trim()||text.length>300)throw new Error(translateUI("Skriv en opgave på højst 300 tegn."));
    task.text=text.trim();task.reminder.date=date;task.reminder.updatedAt=Date.now();return task;
  }
  function cancelReminder(state,id){const task=state.tasks.find(t=>t.id===id&&t.reminder);if(!task||task.checked||task.deferred||task.reminder.cancelledAt!==undefined)return null;task.reminder.cancelledAt=task.reminder.updatedAt=Date.now();return task;}
  const api={localizeStarter,addReminder,changeReminder,cancelReminder,writingCount,editWritingList,setNotePermanence,createTemporaryNote,paperColors,paperTypes,setScheduleMode,setSchedule,scheduledChoices,scheduled,displayTask,noteComplete,canArchiveNote,archiveNote,overflowTasks,moveMobileNote,validPosition,validMobilePosition,pinColors,deferWritingItem,resizeNote,toggleWritingItem,moveNote,validWriting,configureWriting,draftWriting,submitWriting,fresh,restore,resetDay,ordered,visible,add,update,depth,branch,project,place,shift,indent,outdent,dependsOn,remove,toggle,defer,deferStatus,pair,unpair,updateChoice,setDependencyChoice,choiceStatus,achievementTasks};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.MorningTasks=api;
})(typeof window!=='undefined'?window:globalThis);
