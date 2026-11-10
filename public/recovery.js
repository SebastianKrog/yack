(function(root){
 'use strict';
  const {t:translateUI}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
 function create({storage=root.localStorage,fetcher=(...args)=>root.fetch(...args),reload=()=>root.location.reload()}={}){
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const panel=document.querySelector('#startup-recovery'),message=panel.querySelector('.recovery-status'),actions=panel.querySelector('.recovery-actions');
  panel.hidden=false;document.querySelector('#storage-message').hidden=true;
  for(const id of ['#edit','#crown','#new-note'])document.querySelector(id).hidden=true;
  const login=el('a',translateUI("Log ind med ChatGPT"));login.href='/signin-with-chatgpt?return_to=%2F';login.target='_top';login.className='quiet-button';
  const retrieve=el('button',translateUI("Prøv igen"));retrieve.type='button';retrieve.className='quiet-button';actions.append(login,retrieve);
  document.querySelector('#sync-toggle').addEventListener('click',()=>login.click());
  message.setAttribute('role','status');
  async function recover(){
   if(retrieve.disabled)return;retrieve.disabled=true;message.textContent=translateUI("Henter din liste fra serveren …");let received=false;
   try{
    const response=await fetcher('/api/sync?day='+encodeURIComponent(root.MorningReminders.today()),{cache:'no-store',credentials:'same-origin',signal:root.AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('fetch');const remote=await response.json();received=true;
    if(!remote.user){message.textContent=translateUI("Den lokale liste er forældet. Log ind med ChatGPT for at hente din liste fra serveren.");return;}
    login.hidden=true;
    if(remote.deleted||!Array.isArray(remote.records)||!remote.records.some(record=>record.key==='list-order'&&Array.isArray(record.value))){message.textContent=translateUI("Der blev ikke fundet en aktuel liste på serveren.");return;}
    const D=root.MorningSyncData,next=D.materialize(D.overlay(remote.records,{}),root.MorningReminders.today());
    const state=root.MorningTasks.restore(next.state,root.MorningReminders.today());
    // Do not upload the unusable local state or its pending changes.
    const owner=remote.user.id,records=Object.fromEntries(remote.records.map(record=>[record.key,record]));
    const keys=Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(key=>key?.startsWith('starting-work-'));for(const key of keys)storage.removeItem(key);
    storage.setItem('starting-work-sync-account',JSON.stringify(owner));
    storage.setItem('starting-work-sync-'+owner,JSON.stringify({enabled:true,generation:remote.generation,deleted:false,records,pending:{},conflicts:{}}));
    storage.setItem('starting-work-cache-'+owner,JSON.stringify({state,versions:next.versions,modifiedAt:Date.now()}));
    storage.setItem('starting-work-task-versions',JSON.stringify({version:1,entries:next.versions.map((entry,index)=>({...entry,revision:index+1}))}));
    storage.setItem('starting-work-v2',JSON.stringify(state));reload();
   }catch{message.textContent=received?translateUI("Listen på serveren kunne ikke åbnes eller gemmes. Prøv igen."):translateUI("Serveren kunne ikke kontaktes. Kontrollér forbindelsen, og prøv igen.");}
   finally{retrieve.disabled=false;}
  }
  retrieve.addEventListener('click',recover);const ready=recover();return {ready,panel};
 }
 root.MorningRecovery={create};
})(window);
