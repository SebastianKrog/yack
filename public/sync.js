(function(root){
  'use strict';
  const {t:translateUI,translate,locale}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
  function create({getState,getVersions,apply,canApply=()=>true,storage=localStorage,fetcher=(...args)=>root.fetch(...args),onStatus}){
    const D=root.MorningSyncData,$=selector=>document.querySelector(selector),accountKey='starting-work-sync-account';
    const pollInterval=5*60*1000;let lastSyncStarted=0,lastStatus=null;
    async function requestJSON(url,options={}){
      const controller=new root.AbortController();let timeout;
      try{return await Promise.race([
        (async()=>{const response=await fetcher(url,{...options,signal:controller.signal});return {response,data:response.ok?await response.json():null};})(),
        new Promise((_,reject)=>{timeout=setTimeout(()=>{reject(new Error('Sync request timed out'));controller.abort();},20000);})
      ]);}finally{clearTimeout(timeout);}
    }

    const read=key=>{try{return JSON.parse(storage.getItem(key)||'null');}catch{return null;}};
    const put=(key,value)=>storage.setItem(key,String(JSON.stringify(value)??''));
    const id=()=>root.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let owner=read(accountKey),meta=owner&&read(`starting-work-sync-${owner}`),user=null,authKnown=false,busy=false,managing=false,waiting=null,confirmAction=null,applying=false,timer,setup=false,records={},pending={},conflicts={},lastLocal=D.capture(getState(),getVersions());
    if(meta){records=meta.records||{};pending=meta.pending||{};conflicts=meta.conflicts||{};}
    const listSignature=state=>{const doc=JSON.parse(root.MorningTaskJSON.encode(root.MorningTasks.localizeStarter(state,'da')));return JSON.stringify([doc.lists,doc.tasks.map(({boxSeed,...task})=>task)]);};
    function genericList(state){if(state.lists&&(state.lists.length!==1||state.lists[0].id!=='default'||state.lists[0].schedule||state.lists[0].group||!['Min liste',translate('Min liste','en')].includes(state.lists[0].name)))return false;
      const tasks=root.MorningTasks.ordered(state).filter(task=>!task.temporaryDay&&!task.permanentNote&&!task.reminder),clean=text=>String(text||'').trim().toLocaleLowerCase().replace(/[.!]/g,'').replace(/\s+/g,' ');
      const names=[['Hent kaffe'],['Åbn din dagsplan'],['Skriv 3 ting, du vil gøre i dag'],['Tjek ikke dine mails'],['Planlæg din første pause']];
      if(tasks.length!==5)return false;
      return tasks.every((task,i)=>{
        if(task.schedule||task.xor?.otherSchedule||task.xor?.sharedSchedule)return false;
        if(!names[i].some(name=>[name,translate(name,'en')].some(candidate=>clean(candidate)===clean(task.text)))||task.parentChoice!=null)return false;
        if(task.parentId&&!(i===2&&task.parentId===tasks[1].id))return false;
        if(task.xor&&(i!==0||!['Åbn en Monster'].some(name=>[name,translate(name,'en')].some(candidate=>clean(candidate)===clean(task.xor.otherText)))))return false;
        const w=task.writing;if(!w)return true;
        return i===2&&w.mode==='list'&&w.count===3&&w.asTasks!==false&&(!w.title||[task.text].some(title=>clean(title)===clean(w.title)));
      });
    }
    const versionTime=()=>Math.max(0,...getVersions().filter(v=>v.label!=='Første version').map(v=>Number(v.createdAt)||0));
    let localModifiedAt=Number(owner&&read(`starting-work-cache-${owner}`)?.modifiedAt)||Number(read('starting-work-list-modified-at'))||versionTime();
    const localState=()=>({state:getState(),versions:getVersions(),modifiedAt:localModifiedAt});
    const cloudTime=()=>Math.max(0,...Object.values(records).filter(r=>r.key==='order'||r.key==='list-order'||r.key.startsWith('list/')||r.key.startsWith('def/')).map(r=>Number(r.updatedAt)||0));
    function comparison(){
      const hasCloud=!!records.order,cloud=hasCloud?D.materialize(D.overlay(Object.values(records),{}),getState().day).state:null;
      const local=listSignature(getState()),remote=cloud?listSignature(cloud):'',isDefault=genericList(getState()),same=local===remote;
      const cloudAt=cloudTime();
      const message=!hasCloud?translateUI("Vil du gemme din lokale liste på profilen?"):same?translateUI("Listerne er ens."):!localModifiedAt||!cloudAt?translateUI("Du har to forskellige lister. Hvilken vil du bruge?"):localModifiedAt<cloudAt?translateUI("Din liste på profilen er nyere. Vil du hente den?"):localModifiedAt>cloudAt?translateUI("Din lokale liste er nyere. Behold den, eller hent den ældre liste fra profilen?"):translateUI("Listerne er forskellige og gemt samtidig. Hvilken vil du bruge?");
      let hash=0;for(const c of local+'|'+remote)hash=Math.imul(hash,31)+c.charCodeAt(0)|0;
      return {hasCloud,isDefault,same,message,key:`${owner}:${meta?.generation}:${hash}`,cloudAt};
    }
    const dateLabel=time=>time?new Date(time).toLocaleString(locale,{dateStyle:'short',timeStyle:'short'}):translateUI("Tidspunkt ukendt");
    function status(message){if(message===lastStatus)return;lastStatus=message;if($('#sync-status'))$('#sync-status').textContent=message;onStatus?.(message);}
    function identityControls(){
      const firstName=user?.name?.trim().split(/\s+/)[0]||translateUI("Profil");
      $('#profile-label').textContent=translateUI("Profil");$('#sync-toggle').setAttribute('aria-label',user?translateUI("Åbn profil for {0}", firstName):translateUI("Åbn profil og log ind"));
      $('#profile-quick-signin').hidden=!!user;$('#profile-quick-signout').hidden=!user;$('#profile-quick-name').textContent=firstName;$('#profile-account-help').hidden=!!user;
      $('#profile-hint').hidden=!authKnown||!!user||!!read('starting-work-login-hint-dismissed')||!$('#sync-panel').hidden;
      $('#sync-signin').hidden=!!user;$('#sync-signout').hidden=!user;$('#sync-account').textContent=user?user.name:'';$('#sync-retry').hidden=!user;
    }
    function controls(){
      root.MorningStats.render(getState(),document);identityControls();
      const choice=comparison(),showChoice=!!user&&setup&&!meta?.deleted;$('#sync-list-comparison').hidden=!user||!!meta?.deleted;
      $('#sync-choice-hint').hidden=!showChoice||!$('#sync-panel').hidden||meta?.choiceDismissed===choice.key;
      $('#sync-choice-message').textContent=choice.message;$('#sync-comparison').textContent=choice.message;
      $('#sync-local-date').textContent=dateLabel(localModifiedAt);$('#sync-cloud-date').textContent=choice.hasCloud?dateLabel(choice.cloudAt):translateUI("Ingen gemt liste");
      $('#sync-choice-local-date').textContent=dateLabel(localModifiedAt);$('#sync-choice-cloud-date').textContent=choice.hasCloud?dateLabel(choice.cloudAt):translateUI("Ingen gemt liste");
      $('#sync-choice-cloud').hidden=!choice.hasCloud;$('#sync-choice-local').textContent=choice.hasCloud?translateUI("Behold den lokale"):translateUI("Gem min liste");
      $('#sync-use-local').textContent=choice.hasCloud?translateUI("Behold den lokale liste"):translateUI("Gem min liste på profilen");
      $('#profile-clear').textContent=user?translateUI("Ryd mine data"):translateUI("Ryd data på denne enhed");$('#profile-delete').hidden=!user||!!meta?.deleted;$('#profile-data').hidden=!!meta?.deleted;
      $('#sync-retry').hidden=!user||setup||!!meta?.deleted;$('#sync-signin').hidden=!!user;$('#sync-signout').hidden=!user;
      $('#sync-initial').hidden=!setup;$('#sync-conflicts').hidden=!Object.keys(conflicts).length;
      $('#sync-use-cloud').hidden=!records.order||!!meta?.deleted;if(meta?.deleted)$('#sync-use-local').textContent=translateUI("Opret profil med denne enheds liste");
      const list=$('#sync-conflict-list');list.replaceChildren();
      const preview=value=>value===null?translateUI("Fjernet"):typeof value==='string'?value:value?.text||value?.values?.join(' · ')||(typeof value?.checked==='boolean'?(value.deferred?translateUI("Udskudt"):value.checked?translateUI("Fuldført"):translateUI("Ikke fuldført")):JSON.stringify(value));
      for(const [key,record] of Object.entries(conflicts)){
        const parts=key.split('/'),recordId=decodeURIComponent(parts[0]==='day'?parts[3]:parts[1]||''),task=getState().tasks.find(task=>task.id===recordId),note=getState().tasks.flatMap(task=>task.writingItems||[]).find(item=>item.id===recordId);
        const label=key==='order'?translateUI("Opgavernes rækkefølge"):key==='list-order'?translateUI("Listernes rækkefølge"):key.startsWith('list/')?translateUI("Liste: ")+(record.value?.name||pending[key]?.value?.name||recordId):`${parts.includes('draft')?translateUI("Kladde"):parts.includes('check')?translateUI("Notepunkt"):parts.includes('status')?'Status':parts.includes('answer')?'Note':translateUI("Opgave")}: ${task?.text||note?.text||record.value?.text||pending[key]?.value?.text||translateUI("Gemte ændringer")}`;
        const item=document.createElement('li');item.textContent=translateUI("{0} — Denne enhed: {1}. Fælles: {2}", label, preview(pending[key]?.value).slice(0,300), preview(record.value).slice(0,300));list.append(item);
      }
      const shared=Object.values(records).filter(record=>record.key.startsWith('def/')&&record.value);$('#sync-summary').textContent=setup?translateUI("På denne enhed: {0} opgaver · På din profil: {1} opgaver", getState().tasks.filter(task=>!task.temporaryDay&&!task.permanentNote&&!task.reminder).length, shared.length):'';
      $('#sync-toggle').setAttribute('aria-expanded',String(!$('#sync-panel').hidden));
      $('#sync-account').textContent=user?user.name:'';$('#sync-toggle').classList.toggle('sync-connected',!!user&&!!meta?.enabled);
    }
    function persist(){
      if(!owner)return;
      try{put('starting-work-list-modified-at',localModifiedAt);put(`starting-work-sync-${owner}`,{enabled:!!meta?.enabled,generation:meta?.generation||1,deleted:!!meta?.deleted,choiceDismissed:meta?.choiceDismissed,records,pending,conflicts});put(`starting-work-cache-${owner}`,localState());}
      catch{status(translateUI("Der er ikke plads til at gemme offlineændringer på denne enhed."));}
    }
    function cacheGuest(){put('starting-work-sync-guest',localState());}
    function applyFields(){
      if(!canApply())return;
      applying=true;
      try{const next=D.materialize(D.overlay(Object.values(records),pending),getState().day);if(!D.equal(D.capture(next.state,next.versions),lastLocal)){apply(next.state,next.versions);lastLocal=D.capture(getState(),getVersions());}if(!Object.keys(pending).some(k=>k==='order'||k==='list-order'||k.startsWith('list/')||k.startsWith('def/')))localModifiedAt=cloudTime()||localModifiedAt;}
      finally{applying=false;}
    }
    function capture(){
      if(applying||managing)return;
      const next=D.capture(getState(),getVersions());
      if(!D.equal(Object.fromEntries(Object.entries(next).filter(([k])=>k==='order'||k==='list-order'||k.startsWith('list/')||k.startsWith('def/'))),Object.fromEntries(Object.entries(lastLocal).filter(([k])=>k==='order'||k==='list-order'||k.startsWith('list/')||k.startsWith('def/'))))){localModifiedAt=Date.now();put('starting-work-list-modified-at',localModifiedAt);}
      if(!owner||!meta?.enabled){lastLocal=next;if(owner)persist();return;}
      for(const key of new Set([...Object.keys(lastLocal),...Object.keys(next)])){
        if(key.startsWith('day/')&&!key.startsWith(`day/${getState().day}/`))continue;
        if(key.startsWith('week/')&&!key.startsWith(`week/${root.MorningStats.weekStart(getState().day)}/`))continue;
        if(key.startsWith('history/')&&next[key]===undefined)continue;
        const value=next[key]??null;if(D.equal(lastLocal[key]??null,value))continue;
        const previous=pending[key];pending[key]={key,value,base:previous?.base??records[key]?.revision??0,id:id(),previous:previous?[...(previous.previous||[]),previous.id].slice(-12):[]};
        if(conflicts[key])conflicts[key]={...conflicts[key]};
      }
      lastLocal=next;persist();clearTimeout(timer);timer=setTimeout(sync,650);
    }
    function ingest(incoming){
      for(const record of incoming){
        const op=pending[record.key];
        if(record.key.startsWith('stats/')){
          const value=root.MorningStats.mergeDay(record.value,root.MorningStats.mergeDay(op?.value,getState().stats?.[record.key.slice(6)]));
          delete conflicts[record.key];
          if(!D.equal(value,root.MorningStats.mergeDay(record.value)))pending[record.key]={key:record.key,value,base:record.revision,id:id()};
          else delete pending[record.key];
        }else if(record.key.includes('/seen/')){
          const local=getState().firstSeen?.[decodeURIComponent(record.key.split('/').at(-1))],values=[record.value,op?.value,local].filter(v=>Number.isFinite(v)&&v>=0),value=Math.min(...values);delete conflicts[record.key];if(values.length&&value!==record.value)pending[record.key]={key:record.key,value,base:record.revision,id:id()};else delete pending[record.key];
        }else if(record.key.includes('/archive/')){
          // Archiving is irreversible until the next day (or an explicit data reset).
          delete conflicts[record.key];
          if(record.value===true){delete pending[record.key];}
          else if(op?.value===true)pending[record.key]={key:record.key,value:true,base:record.revision,id:id()};
          else if(op)delete pending[record.key];
        }else if(op){
          if(record.op===op.id||D.equal(record.value,op.value)){delete pending[record.key];delete conflicts[record.key];}
          else if((record.key.includes('/status/')||record.key.includes('/check/'))&&op.value&&record.value&&op.value.checked===record.value.checked&&!!op.value.deferred===!!record.value.deferred&&(op.value.choice??null)===(record.value.choice??null)){delete pending[record.key];delete conflicts[record.key];}
          else if(record.key.includes('/achievement/')&&Number.isFinite(record.value)&&Number.isFinite(op.value)){if(record.value<=op.value)delete pending[record.key];else op.base=record.revision;delete conflicts[record.key];}
          else if(op.previous?.includes(record.op)){op.base=record.revision;delete conflicts[record.key];}
          else if(record.revision>op.base)conflicts[record.key]=record;
        }
        records[record.key]=record;
      }
    }
    async function sync(){
      if(busy||managing||typeof fetcher!=='function')return;busy=true;lastSyncStarted=Date.now();let connected=false;
      try{
        const day=getState().day,url=`/api/sync?day=${encodeURIComponent(day)}`;
        const {response,data:remote}=await requestJSON(url,{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw new Error('offline');authKnown=true;connected=true;
        if(!remote.user){
          if(owner){applying=true;try{const guest=read('starting-work-sync-guest');if(guest){apply(guest.state,guest.versions,{reset:true});localModifiedAt=guest.modifiedAt||0;}}finally{applying=false;}}
          put('starting-work-list-modified-at',localModifiedAt);user=null;owner=null;meta=null;records={};pending={};conflicts={};setup=false;storage.removeItem(accountKey);lastLocal=D.capture(getState(),getVersions());status(translateUI("Log ind for at dele listen mellem dine enheder."));controls();return;
        }
        user=remote.user;identityControls();
        if(owner!==user.id){
          if(!owner)cacheGuest();owner=user.id;meta=read(`starting-work-sync-${owner}`)||{enabled:false};records=meta.records||{};pending=meta.pending||{};conflicts=meta.conflicts||{};
          const cached=read(`starting-work-cache-${owner}`),guest=read('starting-work-sync-guest');
          applying=true;try{if(cached){apply(cached.state,cached.versions,{reset:true});localModifiedAt=cached.modifiedAt||0;}else if(guest){apply(guest.state,guest.versions,{reset:true});localModifiedAt=guest.modifiedAt||0;}}finally{applying=false;}
          lastLocal=D.capture(getState(),getVersions());put(accountKey,owner);
        }
        const generation=remote.generation||1;
        if(meta.enabled&&((meta.generation||1)!==generation||remote.deleted))resetLocal();
        meta.generation=generation;meta.deleted=!!remote.deleted;
        if(remote.deleted){meta.enabled=false;setup=true;records={};pending={};conflicts={};status(translateUI("Din profil på denne side er slettet. Du kan oprette den igen eller logge ud."));controls();persist();return;}
        const received=new Set((remote.records||[]).map(record=>record.key));for(const key of Object.keys(records))if(key.startsWith('history/')&&!received.has(key)&&!pending[key])delete records[key];
        ingest(remote.records||[]);
        D.materialize(D.overlay(Object.values(records),pending),getState().day);
        const mediaReady=meta.enabled?await root.MorningMedia?.syncAssets(getState(),user.id,remote.generation):true;
        if(meta.enabled)for(const [day,value] of Object.entries(getState().stats||{})){
          const key=`stats/${day}`,merged=root.MorningStats.mergeDay(records[key]?.value,value);
          if(!pending[key]&&!D.equal(merged,root.MorningStats.mergeDay(records[key]?.value)))pending[key]={key,value:merged,base:records[key]?.revision||0,id:id()};
        }
        if(!meta?.enabled){setup=true;const choice=comparison();if(canApply()&&(choice.isDefault||choice.same)){await choose(choice.hasCloud?'cloud':'local');clearTimeout(timer);timer=setTimeout(sync,0);return;}status(translateUI("Vælg din liste nedenfor."));controls();persist();return;}
        setup=false;
        const batch=[];let batchSize=0;
        for(const op of Object.values(pending)){if(conflicts[op.key])continue;const size=JSON.stringify(op).length*2;if(batch.length&&(batch.length>=100||batchSize+size>900000))break;batch.push(op);batchSize+=size;}
        if(batch.length){
          const sent=Object.fromEntries(batch.map(op=>[op.key,op]));
          const {response:result,data}=await requestJSON(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({ops:batch,generation:meta.generation||1})});
          if(result.status===409){clearTimeout(timer);timer=setTimeout(sync,0);return;}
          if(!result.ok)throw new Error('offline');
          for(const record of data.accepted){
            records[record.key]=record;
            if(pending[record.key]?.id===sent[record.key].id){delete pending[record.key];delete conflicts[record.key];}
            else if(pending[record.key])pending[record.key].base=record.revision;
          }
          ingest(data.conflicts);
        }
        applyFields();persist();controls();
        if(Object.keys(conflicts).length){status(translateUI("Samme felt er ændret på to enheder. Vælg hvilke ændringer der skal bruges."));}
        else if(Object.keys(pending).length){status(translateUI("Synkroniserer…"));clearTimeout(timer);timer=setTimeout(sync,100);}
        else status(mediaReady===false?translateUI("Listen er synkroniseret. Nogle filer er kun gemt lokalt og forsøges sendt igen."):translateUI("Synkroniseret på dine enheder."));
      }catch{persist();identityControls();status(connected&&user?translateUI("Du er logget ind, men listen kunne ikke indlæses. Prøv at synkronisere igen."):connected?translateUI("Den lokale liste kunne ikke indlæses. Log ind for at hente din onlineprofil."):translateUI("Offline — ændringer gemmes på denne enhed og sendes, når forbindelsen er tilbage."));}
      finally{busy=false;if(waiting){const next=waiting;waiting=null;manage(next.action,next.confirmation).then(next.resolve);}}
    }
    async function choose(source){
      if(!owner||!user)return;
      const noteStates=[D.materialize(D.overlay(Object.values(records),pending),getState().day).state,getState()],notes=new Map();for(const state of noteStates)for(const task of state.tasks)if(task.reminder||task.permanentNote||task.temporaryDay===state.day)notes.set(task.id,task);for(const task of noteStates[0].tasks)if(task.reminder)notes.set(task.id,task);
      const temporary=D.noteFields({...getState(),tasks:[...notes.values()]});
      if(meta.deleted){try{const response=await requestAction('create');meta.generation=response.generation;meta.deleted=false;records={};}catch{status(translateUI("Profilen kunne ikke oprettes. Prøv igen, når forbindelsen er tilbage."));return;}}
      const localAwards=root.MorningStats.weeklyAwards(getState().weeklyAchievements,getState().day),cloudAwards=D.materialize(D.overlay(Object.values(records),pending),getState().day).state.weeklyAchievements;
      const mergedAwards=root.MorningStats.weeklyAwards({week:localAwards.week,earned:{...localAwards.earned,...cloudAwards?.earned}},getState().day);
      const mergedStats=root.MorningStats.merge(getState().stats,D.materialize(D.overlay(Object.values(records),pending),getState().day).state.stats);
      put('starting-work-before-first-sync',localState());if(records.order)put('starting-work-before-sync-cloud',D.materialize(D.overlay(Object.values(records),{}),getState().day));meta.enabled=true;delete meta.choiceDismissed;setup=false;conflicts={};pending={};
      if(source==='local'){
        const next=D.capture(getState(),getVersions());
        for(const key of new Set([...Object.keys(records),...Object.keys(next)])){
          if(key.startsWith('day/')&&!key.startsWith(`day/${getState().day}/`))continue;
        if(key.startsWith('week/')&&!key.startsWith(`week/${root.MorningStats.weekStart(getState().day)}/`))continue;
          if(key.startsWith('history/')&&!next[key])continue;
          const value=next[key]??null;if(D.equal(records[key]?.value??null,value))continue;
          pending[key]={key,value,base:records[key]?.revision||0,id:id()};
        }
      }else{applying=true;try{const next=D.materialize(D.overlay(Object.values(records),{}),getState().day);apply(next.state,next.versions,{reset:true});localModifiedAt=cloudTime();}finally{applying=false;}}
      const withNotes=D.materialize({...D.capture(getState(),getVersions()),...temporary},getState().day);
      apply({...withNotes.state,stats:mergedStats,weeklyAchievements:mergedAwards},withNotes.versions);
      for(const [key,value] of Object.entries(temporary)){if(!D.equal(value,records[key]?.value))pending[key]={key,value,base:records[key]?.revision||0,id:id()};else delete pending[key];}
      for(const [award,time] of Object.entries(mergedAwards.earned)){const key=`week/${mergedAwards.week}/achievement/${encodeURIComponent(award)}`;if(records[key]?.value==null)pending[key]={key,value:time,base:records[key]?.revision||0,id:id()};else delete pending[key];}
      for(const [day,value] of Object.entries(mergedStats)){const key=`stats/${day}`;if(!D.equal(value,records[key]?.value))pending[key]={key,value,base:records[key]?.revision||0,id:id()};else delete pending[key];}
      lastLocal=D.capture(getState(),getVersions());persist();controls();return sync();
    }
    function resolve(source){
      for(const [key,record] of Object.entries(conflicts)){
        records[key]=record;
        if(source==='cloud')delete pending[key];else if(pending[key]){pending[key].base=record.revision;pending[key].id=id();}
      }
      conflicts={};applyFields();persist();controls();return sync();
    }
    function resetLocal(){
      clearTimeout(timer);localModifiedAt=0;pending={};records={};conflicts={};
      const keys=['starting-work-v2','starting-work-task-versions','starting-work-import-backup','starting-work-before-first-sync','starting-work-before-sync-cloud','starting-work-list-modified-at','starting-work-sync-guest',accountKey,`starting-work-cache-${owner}`,`starting-work-sync-${owner}`];
      keys.forEach(key=>storage.removeItem(key));if(owner)put(accountKey,owner);
      applying=true;try{apply(D.materialize({},getState().day).state,[],{reset:true});lastLocal=D.capture(getState(),getVersions());}finally{applying=false;}
    }
    async function requestAction(action,extra={}){
      const {response,data}=await requestJSON(`/api/sync?day=${encodeURIComponent(getState().day)}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,generation:meta?.generation||1,...extra})});
      if(!response.ok)throw new Error('Account action failed');return data;
    }
    async function manage(action,confirmation){
      if(action==='delete'&&confirmation!=='DELETE')return false;
      if(busy)return new Promise(resolve=>waiting={action,confirmation,resolve});
      if(managing)return false;managing=true;clearTimeout(timer);
      try{
        const savedVersions=getVersions(),backup=action==='clear'?{createdAt:Date.now(),label:'Før rydning',...JSON.parse(root.MorningTaskJSON.encode(getState())),snapshot:{day:getState().day,fields:D.capture(getState(),[])}}:null;
        const result=user?await requestAction(action,action==='delete'?{confirmation}:backup?{backup}:{}):null;
        if(action==='delete')await root.MorningMedia?.clearLocal();
        resetLocal();setup=false;
        if(action==='clear'){
          records=Object.fromEntries((result?.records||[]).map(record=>[record.key,record]));
          const next=D.materialize(D.overlay(Object.values(records),{}),getState().day),versions=user?next.versions:[...savedVersions,backup].slice(-30);
          applying=true;try{apply(next.state,versions,{reset:true});lastLocal=D.capture(getState(),getVersions());}finally{applying=false;}
        }
        if(user){meta={enabled:action!=='delete',generation:result.generation,deleted:action==='delete'};put(accountKey,owner);if(meta.deleted)setup=true;persist();}else{owner=null;meta=null;storage.removeItem(accountKey);}
        status(action==='delete'?translateUI("Din profil og dens data på denne side er slettet."):user?translateUI("Dine data er ryddet. Sikkerhedskopien ligger i Rediger → Versionshistorik."):translateUI("Data er ryddet. Sikkerhedskopien ligger i Rediger → Versionshistorik."));
        $('#profile-confirm').hidden=true;confirmAction=null;controls();return true;
      }catch{status(translateUI("Kunne ikke slette data. Kontrollér forbindelsen, og prøv igen."));return false;}
      finally{managing=false;}
    }
    function confirm(action){
      confirmAction=action;$('#profile-confirm').hidden=false;
      $('#profile-confirm-message').textContent=action==='delete'?translateUI("Slet din profil på denne side og alle dens opgaver, noter, kladder, fremskridt, historik og sikkerhedskopier? Det kan ikke fortrydes. Din ChatGPT-konto bliver ikke slettet."):user?translateUI("Ryd dine opgaver, noter, kladder og fremskridt på alle enheder? Din profil og versionshistorik beholdes. Der gemmes en sikkerhedskopi, som kan gendannes via Rediger → Versionshistorik."):translateUI("Ryd opgaver, noter, kladder og fremskridt på denne enhed? Versionshistorikken beholdes, og der gemmes en sikkerhedskopi i Rediger → Versionshistorik.");
      $('#profile-delete-word').hidden=action!=='delete';$('#profile-delete-text').value='';$('#profile-confirm-action').disabled=action==='delete';
      $('#profile-confirm-action').textContent=action==='delete'?translateUI("Slet profil og alle sikkerhedskopier"):user?translateUI("Ryd mine data"):translateUI("Ryd data på denne enhed");(action==='delete'?$('#profile-delete-text'):$('#profile-confirm-action')).focus();
    }
    let choiceSource=null;
    function requestChoose(source){
      choiceSource=source;
      $('#sync-choice-confirm-message').textContent=source==='cloud'?translateUI("Din lokale opgaveliste erstattes af listen fra din onlineprofil. Noter og påmindelser fra begge versioner bevares. Dagens status følger de valgte opgaver. Vil du fortsætte?"):records.order?translateUI("Opgavelisten på din onlineprofil erstattes af den lokale liste. Noter og påmindelser fra begge versioner bevares. Dagens status følger de valgte opgaver. Vil du fortsætte?"):translateUI("Vil du gemme denne enheds liste på din onlineprofil?");
      $('#sync-choice-confirm').showModal();$('#sync-choice-confirm-cancel').focus();
    }
    function start(){
      const dismissHint=()=>{put('starting-work-login-hint-dismissed',true);$('#profile-hint').hidden=true;$('#sync-choice-hint').hidden=true;if(meta&&setup){meta.choiceDismissed=comparison().key;persist();}};
      function page(open){
        $('#sync-panel').hidden=!open;$('#sync-toggle').setAttribute('aria-expanded',String(open));
        $('body').classList.toggle('profile-page-open',open);controls();if(open){dismissHint();$('#sync-close').focus();}else $('#sync-toggle').focus();
      }
      root.MorningTabs.register('profile',{isOpen:()=>!$('#sync-panel').hidden,open:()=>page(true),close:()=>{if(!$('#sync-panel').hidden)page(false);}});
      $('#sync-toggle').addEventListener('click',()=>root.MorningTabs.toggle('profile'));
      $('#profile-open').addEventListener('click',()=>root.MorningTabs.show('profile'));
      $('#sync-close').addEventListener('click',()=>root.MorningTabs.close('profile'));
      $('#profile-hint-close').addEventListener('click',dismissHint);
      $('#sync-toggle').addEventListener('pointerenter',event=>{if(event.pointerType==='touch')return;dismissHint();});
      $('#sync-toggle').addEventListener('focus',dismissHint);

      $('#sync-choice-cloud').addEventListener('click',()=>requestChoose('cloud'));$('#sync-choice-local').addEventListener('click',()=>requestChoose('local'));
      $('#sync-choice-confirm-cancel').addEventListener('click',()=>$('#sync-choice-confirm').close());
      $('#sync-choice-confirm').addEventListener('close',()=>{choiceSource=null;});
      $('#sync-choice-confirm-ok').addEventListener('click',()=>{if(!choiceSource)return;const source=choiceSource;$('#sync-choice-confirm').close();choose(source).catch(()=>status(translateUI("Listen kunne ikke skiftes. Prøv igen.")));});
      $('#sync-choice-close').addEventListener('click',()=>{if(meta){meta.choiceDismissed=comparison().key;persist();}$('#sync-choice-hint').hidden=true;});
      $('#sync-use-cloud').addEventListener('click',()=>requestChoose('cloud'));$('#sync-use-local').addEventListener('click',()=>requestChoose('local'));
      $('#sync-keep-cloud').addEventListener('click',()=>resolve('cloud'));$('#sync-keep-local').addEventListener('click',()=>resolve('local'));$('#sync-retry').addEventListener('click',sync);
      $('#profile-clear').addEventListener('click',()=>confirm('clear'));$('#profile-delete').addEventListener('click',()=>confirm('delete'));
      $('#profile-delete-text').addEventListener('input',()=>{$('#profile-confirm-action').disabled=confirmAction==='delete'&&$('#profile-delete-text').value!=='DELETE';});
      $('#profile-cancel').addEventListener('click',()=>{confirmAction=null;$('#profile-confirm').hidden=true;});$('#profile-confirm-action').addEventListener('click',()=>{if(confirmAction&&(confirmAction!=='delete'||$('#profile-delete-text').value==='DELETE')){const button=$('#profile-confirm-action');button.disabled=true;manage(confirmAction,$('#profile-delete-text').value).finally(()=>button.disabled=confirmAction==='delete'&&$('#profile-delete-text').value!=='DELETE');}});
      document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&!root.MorningTabs.hasModal()){if(!$('#sync-panel').hidden)root.MorningTabs.close('profile');confirmAction=null;$('#profile-confirm').hidden=true;}});
      // Focus and visibility can fire together; coalesce their refreshes. Local edits still sync after 650 ms.
      const refresh=()=>{if(!document.hidden&&Date.now()-lastSyncStarted>=1000)return sync();};
      controls();root.addEventListener?.('online',sync);root.addEventListener?.('focus',refresh);document.addEventListener('visibilitychange',refresh);
      setInterval(refresh,pollInterval);return sync();
    }
    return {start,capture,sync,choose,resolve,manage,inspect:()=>({owner,records,pending,conflicts,setup,localModifiedAt,comparison:comparison()})};
  }
  root.MorningSync={create};
})(window);
