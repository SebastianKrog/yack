(function(root){
 'use strict';
  const {t:translateUI,locale}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
 function create({getState,model,save,onChange,checkNewDay}){
  const section=document.querySelector('#profile-reminders'),list=document.querySelector('#reminder-list'),form=document.querySelector('#reminder-add'),message=document.querySelector('#reminder-message'),R=root.MorningReminders;
  let signature='',editing=false;
  const statusLabel={upcoming:translateUI("Planlagt"),due:translateUI("I dag"),overdue:translateUI("Overskredet"),completed:translateUI("Fuldført"),deferred:translateUI("Udskudt"),cancelled:translateUI("Annulleret")};
  const field=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const formatDate=new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  const formatPlanDate=new Intl.DateTimeFormat(locale,{weekday:'long',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  const calendarDay=document.querySelector('#plan-task-calendar-day');
  const formatDueDate=(date,time)=>{
    const label=formatDate.format(new Date(date+'T00:00:00Z'));
    return time?translateUI('{0} kl. {1}',label,time):label;
  };
  const reminderId=()=> 'reminder-'+(root.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  function commit(action,feedback=message){try{checkNewDay();action();feedback.textContent='';signature='';save(false);onChange();render(true);return true;}catch(error){feedback.textContent=error.message;return false;}}
  function render(force=false){
   const dayNumber=String(Number(getState().day.slice(-2)));
   if(calendarDay.textContent!==dayNumber)calendarDay.textContent=dayNumber;
   if(editing||!force&&section.contains(document.activeElement))return;
   const state=getState(),tasks=state.tasks.filter(t=>t.reminder).sort((a,b)=>a.reminder.date.localeCompare(b.reminder.date)||a.id.localeCompare(b.id));
   const statuses=tasks.map(task=>R.status(task,state.day)),next=JSON.stringify([state.day,tasks,statuses]);
   if(next===signature)return;signature=next;
   document.querySelector('#reminder-add-date').min=R.dateKey(state.day);if(!document.querySelector('#reminder-add-date').value)document.querySelector('#reminder-add-date').value=R.dateKey(state.day);
   const expanded=Array.from(list.querySelectorAll('details')).find(node=>node.open)?.dataset.reminderId;
   list.replaceChildren();let pending=0;
   for(const [index,task] of tasks.entries()){const status=statuses[index];if(!['upcoming','due','overdue'].includes(status))continue;pending++;
    const row=field('li'),details=field('details'),summary=field('summary'),edit=field('form');details.className='reminder-accordion';details.dataset.reminderId=task.id;details.setAttribute('name','profile-reminder');details.open=expanded===task.id;edit.className='reminder-row';
    const title=field('span',root.MorningFormatting.plain(task.text));title.className='reminder-title';
    const meta=field('span');meta.className='reminder-meta';const when=field('time',formatDueDate(task.reminder.date,task.reminder.time));when.setAttribute('datetime',task.reminder.date+(task.reminder.time?'T'+task.reminder.time:''));
    const badge=field('span',statusLabel[status]);badge.className='reminder-state reminder-state-'+status;meta.append(when,badge);summary.append(title,meta);details.append(summary);
    const textLabel=field('label',translateUI("Opgave")),text=field('input');text.type='text';text.value=task.text;text.maxLength=300;text.required=true;textLabel.append(text);
    const dateLabel=field('label',translateUI("Dato")),date=field('input');date.type='date';date.value=task.reminder.date;date.min=task.reminder.date<R.dateKey(state.day)?task.reminder.date:R.dateKey(state.day);date.required=true;dateLabel.append(date);
    const actions=field('div');actions.className='reminder-actions';const cancel=field('button',translateUI("Fjern"));cancel.type='button';cancel.title=translateUI("Fjern påmindelsen");cancel.className='quiet-button profile-danger';const saved=field('span',translateUI("Gemmes automatisk"));saved.className='reminder-saved';saved.setAttribute('role','status');actions.append(saved,cancel);
    const saveEdit=()=>{editing=true;try{checkNewDay();const current=getState().tasks.find(t=>t.id===task.id);if(!current)throw new Error(translateUI("Påmindelsen findes ikke længere."));if(current.text!==text.value.trim()||current.reminder.date!==date.value){model.changeReminder(getState(),task.id,date.value,text.value);signature='';save(false);onChange();}title.textContent=root.MorningFormatting.plain(text.value);when.textContent=formatDueDate(date.value,current.reminder.time);when.setAttribute('datetime',date.value+(current.reminder.time?'T'+current.reminder.time:''));const status=R.status(current,getState().day);badge.textContent=statusLabel[status];badge.className='reminder-state reminder-state-'+status;saved.textContent=translateUI("Gemt");message.textContent='';return true;}catch(error){message.textContent=error.message;saved.textContent=translateUI("Ikke gemt");return false;}finally{editing=false;}};
    text.addEventListener('input',()=>{if(text.value.trim()&&R.dateKey(date.value)===date.value)saveEdit();});
    text.addEventListener('change',saveEdit);date.addEventListener('change',saveEdit);
    edit.addEventListener('submit',event=>{event.preventDefault();saveEdit();});
    cancel.addEventListener('click',()=>commit(()=>model.cancelReminder(getState(),task.id)));
    edit.append(textLabel,dateLabel,actions);details.append(edit);row.append(details);list.append(row);
   }
   document.querySelector('#reminder-empty').hidden=pending>0;
  }
  form.addEventListener('submit',event=>{event.preventDefault();const text=document.querySelector('#reminder-add-text'),date=document.querySelector('#reminder-add-date');if(commit(()=>model.addReminder(getState(),text.value,date.value,reminderId())))text.value='';});
  const dialog=document.querySelector('#task-planner'),planner=document.querySelector('#plan-task-form');
  const preset=document.querySelector('#plan-task-preset'),custom=document.querySelector('#plan-task-custom');
  const date=document.querySelector('#plan-task-date'),time=document.querySelector('#plan-task-time');
  const taskText=document.querySelector('#plan-task-text'),keep=document.querySelector('#plan-task-keep');
  const settings=document.querySelector('#plan-task-settings'),preview=document.querySelector('#plan-task-preview');
  const previewDate=document.querySelector('#plan-task-preview-date'),effectSlot=document.querySelector('#plan-task-effects');
  let effectDraft;
  root.MorningPaper.settingsIcon(document.querySelector('#plan-task-settings-toggle'));
  root.MorningPaper.closeIcon(document.querySelector('#plan-task-cancel'),1);
  const planMessage=document.querySelector('#plan-task-message');
  const selectedDate=()=>preset.value==='specific'?date.value:R.planDate(preset.value,R.today());

  function showTiming(){
    const specific=preset.value==='specific';
    custom.hidden=!specific;
    date.disabled=time.disabled=!specific;
    date.required=specific;
    preview.hidden=specific;
    if(!specific){
      const day=selectedDate();
      previewDate.textContent=formatPlanDate.format(new Date(day+'T00:00:00Z'));
      previewDate.setAttribute('datetime',day);
    }
    planMessage.textContent='';
  }
  document.querySelector('#plan-task').addEventListener('click',()=>{
    preset.value='now';
    date.min=date.value=R.today();
    time.value=taskText.value='';
    effectDraft={boxSeed:1};
    effectSlot.replaceChildren(root.MorningEmphasis.field(effectDraft,{planner:true}));
    settings.open=keep.checked=false;
    showTiming();
    dialog.showModal();
  });
  preset.addEventListener('change',showTiming);
  effectSlot.addEventListener('invalid',()=>{settings.open=true;},true);
  document.querySelector('#plan-task-cancel').addEventListener('click',()=>dialog.close());
  planner.addEventListener('submit',event=>{
    event.preventDefault();
    const options={dayOnly:!keep.checked,time:preset.value==='specific'&&time.value?time.value:undefined};
    options.emphasis=effectDraft?.emphasis;
    if(commit(()=>model.addReminder(getState(),taskText.value,selectedDate(),reminderId(),options),planMessage))dialog.close();
  });
  section.addEventListener('focusout',()=>setTimeout(render,0));render();return {render};
 }
 root.MorningReminderUI={create};
})(typeof window!=='undefined'?window:globalThis);
