(function(root){
 'use strict';
  const {t:translateUI}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
 const ownerText=(task,parent,format)=>parent?.xor?(task.parentChoice===0?'A: '+format.plain(parent.text):task.parentChoice===1?'B: '+format.plain(parent.xor.otherText):format.plain(parent.text)+' / '+format.plain(parent.xor.otherText)):parent?format.plain(parent.text):'';
 const el=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls||'';if(text!==undefined)node.textContent=text;return node;};
 function help(text,label=translateUI("Hjælp")){
  const wrap=el('span','editor-help'),button=el('button','editor-help-trigger','?'),tip=el('span','editor-tooltip',text);button.type='button';button.setAttribute('aria-label',`${label}: ${text}`);tip.setAttribute('role','tooltip');wrap.append(button,tip);return wrap;
 }
 function section(title,description){const box=el('section','editor-section'),heading=el('h3','',title);heading.setAttribute('aria-label',title);if(description)heading.append(help(description));box.append(heading);return box;}
 function refresh(row,task){
  const R=root.MorningRecurrence,summary=row.querySelector('.editor-schedule-label');if(!summary)return;
  const label=task.xor?(task.xor.scheduleMode==='shared'?translateUI("Fælles: {0}", R.label(task.xor.sharedSchedule)):`A: ${R.label(task.schedule)} · B: ${R.label(task.xor.otherSchedule)}`):task.schedule?R.label(task.schedule):translateUI("Arver listens tidsplan");
  summary.textContent=label;summary.title=label;
 }
 function row({li,fields,order,remove,task,state,open=false,scheduleOpen=[],format,onParent}){
  const controls=Array.from(fields.children),name=el('div','editor-name'),type=el('div','editor-type'),inspector=el('details','editor-inspector');inspector.open=open;
  const heading=el('summary','editor-settings-toggle',translateUI("Indstillinger"));heading.setAttribute('aria-label',translateUI("Indstillinger for ")+format.plain(task.text));inspector.append(heading);
  const panel=el('div','editor-settings-panel'),note=section('Note',translateUI("Disse indstillinger tilhører den note, der oprettes, når denne opgave besvares.")),relations=section(translateUI("Afhængighed og valg"),translateUI("Træk i håndtaget for at flytte opgaven. Træk mod højre for at placere den under en forudsætning. En følgeopgave vises først, når forudsætningen er fuldført.")),schedule=section(translateUI("Tidsplan"),translateUI("Bestemmer, hvornår denne opgave vises. Dato og tid følger Europe/Copenhagen. Uger starter mandag."));
  const parent=state.tasks.find(t=>t.id===task.parentId),ownership=el('div','editor-parent',parent?translateUI("Efter: {0}", ownerText(task,parent,format)):translateUI("Selvstændig opgave"));ownership.title=parent?translateUI("Forudsætning: {0}", ownerText(task,parent,format)):translateUI("Ingen forudsætning");
  name.style.setProperty('--row-depth',root.MorningTasks.depth(state,task.id));name.append(ownership);
  const owner=el('label','editor-note-title',translateUI("Vis efter")),parentSelect=el('select','editor-parent-select');parentSelect.setAttribute('aria-label',translateUI("Forudsætning for ")+format.plain(task.text));
  const none=el('option','', translateUI("Ingen forudsætning"));none.value='';parentSelect.append(none);
  for(const candidate of root.MorningTasks.ordered(state)){if(candidate.temporaryDay||candidate.permanentNote||candidate.id===task.id||root.MorningTasks.dependsOn(state,candidate.id,task.id))continue;const option=el('option','',format.plain(candidate.text)+(candidate.xor?' / '+format.plain(candidate.xor.otherText):''));option.value=candidate.id;parentSelect.append(option);}parentSelect.value=task.parentId||'';parentSelect.addEventListener('change',()=>onParent?.(parentSelect.value||null));owner.append(parentSelect);relations.append(owner);
  const pair=controls.filter(node=>node.classList.contains('xor-editor-action'));
  for(const control of controls){
   if(control.classList.contains('edit-text'))name.insertBefore(control,ownership);
   else if(control.classList.contains('xor-editor-choices')){
    const inputs=Array.from(control.querySelectorAll('.edit-text'));control.replaceChildren();inputs.forEach((input,index)=>{const label=el('label','editor-choice'),badge=el('span','editor-choice-label',index?'B':'A');label.append(badge,input);control.append(label);});name.insertBefore(control,ownership);
   }else if(control.classList.contains('writing-type')){type.append(el('span','editor-mobile-label','Type'),control);}
   else if(control.classList.contains('schedule-editor')){control.open=!!scheduleOpen[schedule.querySelectorAll('.schedule-editor').length];schedule.append(control);}
   else if(control.querySelector('.schedule-mode'))schedule.append(control);
   else if(control.classList.contains('xor-dependency-options'))relations.append(control);
   else if(control.classList.contains('xor-editor-action'))continue;
   else if(control.classList.contains('note-title-input')){const label=el('label','editor-note-title',translateUI("Titel på note"));label.append(control);note.append(label);}
   else note.append(control);
  }
  if(task.xor){type.append(el('span','editor-mobile-label','Type'),el('span','editor-type-badge',translateUI("ELLER · 2 valg")));}
  if(pair.length){const choices=el('div','editor-choice-actions');pair.forEach(button=>{button.textContent=task.xor?translateUI("Adskil muligheder"):translateUI("Kombinér med næste");choices.append(button);});relations.append(choices);}
  if(task.writing)panel.append(note);panel.append(relations,schedule);inspector.append(panel);
  const scheduleButton=el('button','editor-schedule-summary');scheduleButton.type='button';scheduleButton.setAttribute('aria-label',translateUI("Åbn tidsplan for ")+format.plain(task.text));scheduleButton.append(el('span','editor-mobile-label',translateUI("Tidsplan")),el('span','editor-schedule-label'));
  scheduleButton.addEventListener('click',()=>{inspector.open=true;for(const control of schedule.querySelectorAll('.schedule-editor'))control.open=true;schedule.querySelector('select')?.focus({preventScroll:true});});
  remove.textContent=translateUI("Slet");remove.title=translateUI("Fjern opgaven");remove.classList.add('editor-delete');
  fields.replaceChildren(name,type,scheduleButton,inspector);li.append(order,fields,remove);refresh(li,task);
 }
 function refreshNames(list,state,format){
  const byId=new Map(state.tasks.map(t=>[t.id,t]));
  for(const row of list.children){const task=byId.get(row.dataset.taskId);if(!task)continue;const parent=byId.get(task.parentId),owner=row.querySelector('.editor-parent');if(owner){owner.textContent=parent?translateUI("Efter: ")+ownerText(task,parent,format):translateUI("Selvstændig opgave");owner.title=parent?translateUI("Forudsætning: ")+ownerText(task,parent,format):translateUI("Ingen forudsætning");}
   row.querySelector('.editor-settings-toggle')?.setAttribute('aria-label',translateUI("Indstillinger for ")+format.plain(task.text));row.querySelector('.editor-schedule-summary')?.setAttribute('aria-label',translateUI("Åbn tidsplan for ")+format.plain(task.text));
   const select=row.querySelector('.editor-parent-select');if(select)for(const option of select.children){const candidate=byId.get(option.value);if(candidate)option.textContent=format.plain(candidate.text)+(candidate.xor?' / '+format.plain(candidate.xor.otherText):'');}
  }
 }
 function tree(list,state){
  const byId=new Map(state.tasks.map(task=>[task.id,task])),children=new Map();
  for(const task of root.MorningTasks.ordered(state)){const siblings=children.get(task.parentId)||[];siblings.push(task);children.set(task.parentId,siblings);}
  for(const row of list.children){
   const task=byId.get(row.dataset.taskId);if(!task)continue;
   const path=[task];for(let parent=byId.get(task.parentId);parent;parent=byId.get(parent.parentId))path.unshift(parent);
   const depth=path.length-1,gutter=el('span','editor-tree');gutter.setAttribute('aria-hidden','true');row.style.setProperty('--row-depth',depth);row.classList.toggle('editor-root',depth===0);
   const part=(cls,level)=>{const node=el('span',cls);node.style.setProperty('--tree-level',level);gutter.append(node);};
   for(let level=0;level<depth;level++){
    const child=path[level+1],last=children.get(child.parentId).at(-1).id===child.id;
    if(level===depth-1)part('editor-tree-line'+(last?' editor-tree-end':''),level);
    else if(!last)part('editor-tree-line',level);
   }
   if(depth)part('editor-tree-elbow',depth-1);
   if(children.has(task.id))part('editor-tree-stem',depth);
   part('editor-tree-node',depth);row.append(gutter);
  }
 }
 const api={help,row,refresh,refreshNames,tree};root.MorningEditorUI=api;
})(window);
