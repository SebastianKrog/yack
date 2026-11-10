(function(){
'use strict';
  const {t:translateUI,locale}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
const M = window.MorningTasks;
const F = window.MorningFormatting;
const key = 'starting-work-v2';
const svgNS = 'http://www.w3.org/2000/svg';
const $ = selector => document.querySelector(selector);
function localDate() {return window.MorningReminders.today();}
let timer;
let syncUI;
let reminderUI;
let opener;
function readSaved(name) {try{return JSON.parse(localStorage.getItem(name)||'null');}catch{return null;}}
let state;
try{state=M.restore(readSaved(key),localDate());}catch(error){window.MorningRecovery.create();return;}
window.MorningStats.visit(state);
window.MorningStats.render(state,document);
const rows=new Map();
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const deferralUI=window.MorningDeferral.create(document);
const ease='cubic-bezier(.22, 1, .36, 1)';
const scribbleUI=window.MorningScribbles.create({sound:window.MorningSound,reducedMotion});
const achievementUI=window.MorningAchievementUI.create({getState:()=>state,animate,reducedMotion,checkNewDay});
const writingUI=window.MorningWriting.create({model:M,getState:()=>state,format:F,save,checkNewDay,animate,drawBox,drawMarks,drawDeferral,deferralUI,onArchive:()=>render(true),onDefer:(button,item)=>commitScribble(button,{defer:true,reverse:!item.deferred}),onToggle:(button,item)=>commitScribble(button,{reverse:!item.checked}),onSubmit:task=>{
  const row=rows.get(task.id),button=row?.querySelector('.task');
  if(button){button.classList.remove('restored');drawMarks(button,task.markSeed);setRowState(row,task);commitScribble(button);}
  else{save(true,0);render(true);}
}});
const xorUI=window.MorningXorUI.create({model:M,getState:()=>state,format:F,deferralUI,drawBox,drawCheck,drawMarks,drawDeferral,commitScribble,save,checkNewDay,redrawLater,reducedMotion});
function redrawLater(delay) {clearTimeout(timer);timer=setTimeout(()=>{render(true);layoutMarks();if($('#editor').open)renderEditor();},delay);}
function save(celebrate=true,celebrationDelay=760) {
  const unlocked=window.MorningAchievements.claim(state);
  achievementUI.update();
  window.MorningStats.render(state,document);
  taskHistory.record();
  try {localStorage.setItem(key,JSON.stringify(state));$('#storage-message').hidden=true;}
  catch {$('#storage-message').textContent=translateUI("Ændringerne kan ikke gemmes på denne enhed.");$('#storage-message').hidden=false;}
  if(celebrate)achievementUI.celebrate(unlocked,celebrationDelay);
  syncUI?.capture();
  reminderUI?.render();
  return unlocked;
}
function commitScribble(node,options={}) {
  const unlocked=save(false);
  refreshEmphasis();
  scribbleUI.enqueue(node,options.steps||window.MorningScribbles.stages(node,options),()=>{
    achievementUI.celebrate(unlocked,0);redrawLater(0);
  });
}
function animate(node,frames,duration=420) {
  if(reducedMotion.matches||typeof node.animate!=='function')return null;
  return node.animate(frames,{duration,easing:ease});
}
function makeRow(task) {
  if(task.xor){const row=xorUI.makeRow(task);row.dataset.writing='null';return row;}
  const li=document.createElement('li');li.dataset.taskId=task.id;li.dataset.xorId='';
  const button=document.createElement('button');
  li.dataset.writing=JSON.stringify(task.writing||null);
  button.type='button';button.className='task restored';button.setAttribute('role','checkbox');
  button.setAttribute('aria-checked',String(task.checked));
  button.innerHTML='<span class="box" aria-hidden="true"><svg class="box-outline" viewBox="0 0 30 30"><path/></svg><svg class="check" viewBox="0 0 40 38"><path pathLength="1" d="M7 23 Q11 26 16 32 Q22 19 35 5"/><path class="fine" pathLength="1" d="M6 24 15 33 Q22 22 36 5"/></svg></span><span class="label"><span class="text"></span><svg class="strike" aria-hidden="true"></svg><svg class="defer-strike" aria-hidden="true"></svg></span>';
  const deferButton=document.createElement('button');deferButton.type='button';deferButton.className='quiet-button defer-button';
  deferButton.setAttribute('aria-label',translateUI("Udskyd opgave"));deferButton.setAttribute('aria-pressed','false');
  deferButton.innerHTML='<svg viewBox="0 0 30 30" aria-hidden="true"><path d="M5 15 Q7 9 12 6 Q8 15 4 24 Q8 13 16 7 Q13 17 11 23 Q15 13 20 8 Q19 17 18 24 Q21 15 25 8"/><path class="defer-icon-detail" d="M6 16 Q10 10 13 7 M13 22 Q17 14 21 9"/></svg>';
  F.render(button.querySelector('.text'),task.text);
  drawBox(button,task.boxSeed);
  button.addEventListener('click',()=>{
    if(button.classList.contains('scribbling'))return;
    checkNewDay();
    if(task.writing){writingUI.open(task.id);return;}
    const current=M.toggle(state,task.id);if(!current)return;window.MorningEmphasis.apply(li,current,state);
    li.deferControl.hide();
    button.classList.remove('restored');
    if(current.checked){drawMarks(button,current.markSeed);button.getBoundingClientRect();}
    setRowState(li,current);
    commitScribble(button,{reverse:!current.checked});
  });
  deferButton.addEventListener('click',()=>{
    if(button.classList.contains('scribbling'))return;
    checkNewDay();const current=M.defer(state,task.id);if(!current)return;window.MorningEmphasis.apply(li,current,state);
    li.deferControl.hide();button.classList.remove('restored');
    if(current.deferred){drawDeferral(button,current);button.getBoundingClientRect();}
    setRowState(li,current);
    commitScribble(button,{defer:true,reverse:!current.deferred});
    button.focus({preventScroll:true});
  });
  li.append(button,deferButton);li.deferControl=deferralUI.attach(li,button,deferButton);return li;
}
function setRowState(row,task) {
  task=M.displayTask(state,task);
  if(task.xor)return xorUI.setRowState(row,task);
  const button=row.querySelector('.task'),deferButton=row.querySelector('.defer-button');
  button.setAttribute('aria-checked',String(task.checked));button.classList.toggle('deferred',task.deferred);
  button.setAttribute('aria-disabled',String(task.deferred));
  button.classList.toggle('writing-task',!!task.writing);
  if(task.writing){window.MorningPaper.small(button,task.boxSeed);button.setAttribute('role','button');button.setAttribute('aria-controls','writing-pad');button.removeAttribute('aria-checked');button.classList.toggle('writing-completed',task.checked);}
  button.setAttribute('aria-label',`${F.plain(task.text)}${task.deferred?translateUI(" — Udskudt"):''}`);
  deferButton.setAttribute('aria-pressed',String(task.deferred));
  deferButton.setAttribute('aria-label',task.deferred?translateUI("Fortryd udsættelse"):translateUI("Udskyd opgave"));
}
let emphasisTimer;
function refreshEmphasis(){
  clearTimeout(emphasisTimer);const E=window.MorningEmphasis,visible=(window.location?.pathname||'/')==='/'&&!document.hidden&&!$('#editor').open&&$('#sync-panel').hidden&&!$('#tasks-view').hidden;
  let next=null;const tasks=M.visible(state).map(task=>M.displayTask(state,task));
  if(visible){const observed=tasks.filter(task=>{const row=rows.get(task.id),rect=row?.getBoundingClientRect();return rect&&rect.bottom>0&&rect.top<window.innerHeight;}).map(task=>task.id);if(E.observe(state,observed)){try{localStorage.setItem(key,JSON.stringify(state));syncUI?.capture();}catch{}}}
  for(const task of tasks){const row=rows.get(task.id);if(!row)continue;const delay=E.apply(row,task,state);if(delay!=null)next=next==null?delay:Math.min(next,delay);}
  if(visible&&next!=null)emphasisTimer=setTimeout(refreshEmphasis,next);
}
window.addEventListener('scroll',refreshEmphasis,{passive:true});
window.addEventListener('focus',refreshEmphasis);
window.addEventListener('yackviewchange',refreshEmphasis);
document.addEventListener('visibilitychange',refreshEmphasis);
function render(withMotion=false) {
  const activeLists=window.MorningLists.active(state);$('#active-lists').textContent=activeLists.map(list=>list.name).join(' · ');$('#active-lists').hidden=state.lists.length<2||!activeLists.length;
  reminderUI?.render();
  clearTimeout(timer);
  const list=$('.checklist');
  withMotion=withMotion&&!list.hidden;
  const oldRows=Array.from(list.children);
  const geometry=new Map(oldRows.map(li=>[li.dataset.taskId,li.getBoundingClientRect()]));
  const anchors=[$('.page-header')];
  const oldAnchors=anchors.map(el=>el.getBoundingClientRect());
  oldRows.forEach(row=>row.motion?.cancel());anchors.forEach(el=>el.motion?.cancel());
  const tasks=M.visible(state).map(task=>M.displayTask(state,task));
  const ids=new Set(tasks.map(t=>t.id));
  const activeId=document.activeElement?.closest?.('li[data-task-id]')?.dataset.taskId;
  const activeIndex=oldRows.findIndex(li=>li.dataset.taskId===activeId);
  oldRows.filter(li=>!ids.has(li.dataset.taskId)).forEach(li=>{
    if(withMotion&&!reducedMotion.matches) {
      const rect=geometry.get(li.dataset.taskId),ghost=li.cloneNode(true);
      ghost.classList.add('departing');ghost.setAttribute('aria-hidden','true');ghost.inert=true;
      Object.assign(ghost.style,{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,margin:'0',pointerEvents:'none',listStyle:'none',zIndex:'1'});
      ghost.querySelector('button').tabIndex=-1;$('.view-stage').append(ghost);
      const motion=animate(ghost,[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-8px)'}],220);
      if(motion)motion.finished.catch(()=>{}).finally(()=>ghost.remove());else ghost.remove();
    }
    li.deferControl.hide();li.remove();
  });
  tasks.forEach((task,index)=>{
    let row=rows.get(task.id),replaced=false;
    if(row&&(row.dataset.xorId!==(task.xor?.otherId||'')||row.dataset.writing!==JSON.stringify(task.writing||null))){row.deferControl.dispose();row.remove();rows.delete(task.id);row=null;replaced=true;}
    if(!row){row=makeRow(task);rows.set(task.id,row);}
    const button=row.querySelector('.task'),deferralChanged=button.dataset.deferSeed!==String(task.deferSeed);
    setRowState(row,task);
    let changed;
    if(task.xor)changed=xorUI.syncText(row,task);
    else{const text=button.querySelector('.text');changed=text.dataset.source!==task.text;if(changed)F.render(text,task.text);}
    if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
    if(replaced||changed||deferralChanged||!geometry.has(task.id)){button.classList.add('restored');drawRow(row,task);}
  });
  for(const [id,row] of rows)if(!state.tasks.some(t=>t.id===id)){row.motion?.cancel();row.deferControl.dispose();rows.delete(id);}
  if(withMotion&&!reducedMotion.matches) {
    tasks.forEach(task=>{
      const row=rows.get(task.id),old=geometry.get(task.id),now=row.getBoundingClientRect();
      row.motion?.cancel();
      row.motion=old?animate(row,[{transform:`translate(${old.left-now.left}px,${old.top-now.top}px)`},{transform:'translate(0,0)'}]):animate(row,[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],440);
    });
    anchors.forEach((el,i)=>{const now=el.getBoundingClientRect();el.motion?.cancel();el.motion=animate(el,[{transform:`translateY(${oldAnchors[i].top-now.top}px)`},{transform:'translateY(0)'}]);});
  }
  writingUI.sync();
  refreshEmphasis();
  if(activeId&&!ids.has(activeId)) {
    const next=list.children[Math.max(0,Math.min(activeIndex,list.children.length-1))];
    (next?.querySelector('button')||$('#edit')).focus({preventScroll:true});
  }
}
function layoutMarks() {
  M.visible(state).forEach(task=>{const row=rows.get(task.id);if(row?.isConnected)drawRow(row,task);});
  writingUI.layout();
  refreshEmphasis();
}
function drawRow(row,task) {task=M.displayTask(state,task);if(row.querySelector('.task').classList.contains('scribbling'))return;if(task.xor)xorUI.drawRow(row,task);else{drawMarks(row.querySelector('.task'),task.markSeed);drawDeferral(row.querySelector('.task'),task);}}
const listEditor=window.MorningListEditor.create({getState:()=>state,onChange:(rebuild=true)=>{save(false);render(true);if(rebuild)renderEditor();},onSelect:()=>renderEditor(),message:editorMessage});
function editorState(){return {...state,editListId:listEditor.selected()==='*'?null:listEditor.selected(),tasks:listEditor.tasks()};}
function editSelection(action){const scope=editorState();action(scope);const selected=new Set(scope.tasks.map(t=>t.id));let i=0;state.tasks=state.tasks.map(t=>selected.has(t.id)?scope.tasks[i++]:t);const list=state.lists.find(l=>l.id===listEditor.selected());if(list)list.taskIds=scope.tasks.map(t=>t.id);for(const task of scope.tasks)for(const owner of window.MorningLists.memberships(state,task.id))window.MorningLists.assign(state,owner.id,task.id);}
const taskDrag=window.MorningTaskDrag.create({model:M,getState:editorState,list:$('#editor-list'),editor:$('#editor'),onCommit:(id,location)=>editTree(()=>editSelection(scope=>M.place(scope,id,location.index,location.depth)),id)});
function editorMessage(message='') {$('#editor-message').textContent=message;$('#editor-message').hidden=!message;}
function editorRow(id) {return Array.from($('#editor-list').children).find(li=>li.dataset.taskId===id);}
function editTree(change,id,focusAction='drag-handle') {
  const list=$('#editor-list');
  const old=new Map(Array.from(list.children).map(li=>[li.dataset.taskId,li.getBoundingClientRect()]));
  try {change();save();render(true);renderEditor();editorMessage();}
  catch(error){editorMessage(error.message);return;}
  for(const li of list.children){const previous=old.get(li.dataset.taskId),now=li.getBoundingClientRect();if(previous)animate(li,[{transform:`translate(${previous.left-now.left}px,${previous.top-now.top}px)`},{transform:'translate(0,0)'}]);}
  const li=editorRow(id),button=li?.querySelector(`.${focusAction}`);if(button?.closest('.editor-inspector'))button.closest('.editor-inspector').open=true;(button&&!button.disabled?button:li?.querySelector('.drag-handle'))?.focus({preventScroll:true});
}
function renderEditor() {
  taskDrag.cancel();
  listEditor.render();
  const list=$('#editor-list');
  const expanded=new Map(Array.from(list.children).map(row=>[row.dataset.taskId,{open:!!row.querySelector('.editor-inspector')?.open,schedules:Array.from(row.querySelectorAll('.schedule-editor')).map(node=>node.open)}]));
  list.replaceChildren();
  const tasks=listEditor.tasks();
  $('#editor-count').textContent=`${tasks.length} opgaver`;
  tasks.forEach((task,index)=>{
    const level=M.depth(state,task.id);
    const li=document.createElement('li');li.dataset.taskId=task.id;li.style.setProperty('--depth',level);
    if(level)li.classList.add('tree-child');
    const order=document.createElement('div');order.className='order-controls';
    const handle=document.createElement('button');handle.type='button';handle.className='quiet-button drag-handle';handle.textContent='⠿';
    handle.setAttribute('aria-label',translateUI("Flyt: {0}", task.text));handle.title=translateUI("Træk for at flytte. Piletaster: op/ned, ind/ud.");
    handle.addEventListener('keydown',event=>{
      const actions={ArrowUp:()=>editSelection(scope=>M.shift(scope,task.id,-1)),ArrowDown:()=>editSelection(scope=>M.shift(scope,task.id,1)),ArrowRight:()=>editSelection(scope=>M.indent(scope,task.id)),ArrowLeft:()=>editSelection(scope=>M.outdent(scope,task.id))};
      if(!actions[event.key])return;event.preventDefault();editTree(actions[event.key],task.id);
    });
    taskDrag.attach(handle,task.id);
    order.append(handle);
    const fields=document.createElement('div');fields.className='editor-fields';
    const input=choice=>{
      const text=document.createElement('input');text.type='text';text.className='edit-text';text.value=choice===1?task.xor.otherText:task.text;text.maxLength=300;text.autocomplete='off';text.setAttribute('aria-label',task.xor?translateUI("Valg {0}", choice===0?'A':'B'):translateUI("Opgavens tekst"));
      text.addEventListener('input',()=>{
        if(!text.value.trim())return;
        try {
          if(task.xor)M.updateChoice(state,task.id,choice,text.value);else M.update(state,task.id,text.value,task.parentId);
          save();render(false);window.MorningEditorUI.refreshNames(list,state,F);editorMessage();
          if(task.xor)for(const scope of list.querySelectorAll('.dependency-choice'))if(scope.dataset.parentId===task.id&&scope.dataset.choice!=='either'){
            const label=F.plain(scope.dataset.choice==='0'?task.text:task.xor.otherText);scope.textContent=label;scope.title=translateUI("Vis kun efter: ")+label;scope.setAttribute('aria-label',scope.title);
          }
        }catch(error){editorMessage(error.message);}
      });
      text.addEventListener('change',()=>{text.value=choice===1?task.xor.otherText:task.text;});return text;
    };
    if(task.xor){
      const choices=document.createElement('div');choices.className='xor-editor-choices';
      const or=document.createElement('span');or.className='xor-or';or.textContent=translateUI("ELLER");choices.append(input(0),or,input(1));fields.append(choices);
      const split=document.createElement('button');split.type='button';split.className='quiet-button xor-editor-action';split.textContent=translateUI("Adskil");split.title=translateUI("Gør mulighederne til to separate opgaver");
      split.addEventListener('click',()=>editTree(()=>M.unpair(state,task.id),task.id,'edit-text'));fields.append(split);
    }else{
      fields.append(input(0));
      const type=document.createElement('select');type.className='writing-type';type.setAttribute('aria-label',translateUI("Opgavetype"));
      for(const [value,label] of [['check',translateUI("Afkrydsning")],['note','Note'],['list',translateUI("Liste")],['media',translateUI("Billede / PDF")]]){const option=document.createElement('option');option.value=value;option.textContent=label;type.append(option);}type.value=task.writing?.mode||'check';
      type.addEventListener('change',()=>editTree(()=>M.configureWriting(state,task.id,type.value==='check'?null:{mode:type.value,count:type.value==='list'?3:1,...(type.value==='media'?{mat:'small'}:{})}),task.id,'writing-type'));fields.append(type);
      if(task.writing?.mode==='list'){
        const countLabel=document.createElement('label');countLabel.className='writing-count';countLabel.textContent=translateUI("Antal punkter ");
        const count=document.createElement('input');count.type='number';count.min=1;count.max=10;count.value=task.writing.count;count.setAttribute('aria-label',translateUI("Antal punkter"));
        count.addEventListener('change',()=>editTree(()=>M.configureWriting(state,task.id,{...task.writing,mode:'list',count:Number(count.value)}),task.id,'writing-type'));countLabel.append(count);fields.append(countLabel);
      }

      if(task.writing){
        const pinLabel=document.createElement('div');pinLabel.className='writing-content-label pin-field';pinLabel.textContent=translateUI("Knappenål");
        const pinColor=document.createElement('div');pinColor.className='pin-color';pinColor.setAttribute('role','group');pinColor.setAttribute('aria-label',translateUI("Farve på knappenål"));
        const selected=window.MorningPaper.color(task.boxSeed,task.writing.pinColor).id;
        const picker=document.createElement('details');picker.className='pin-picker';
        const current=document.createElement('summary');current.className='pin-choice pin-current';
        const selectedColor=window.MorningPaper.color(task.boxSeed,selected),selectedIndex=window.MorningPaper.colors.findIndex(color=>color.id===selected);
        current.title=translateUI("Skift knappenål: {0}", selectedColor.name);current.setAttribute('aria-label',current.title);current.append(window.MorningPaper.pin(Math.imul(selectedIndex+7,2654435761)>>>0,selected));picker.append(current);
        window.MorningPaper.colors.forEach((color,index)=>{
          const choice=document.createElement('button');choice.type='button';choice.className=`pin-choice pin-choice-${color.id}`;choice.title=color.name;choice.setAttribute('aria-label',color.name);choice.setAttribute('aria-pressed',String(color.id===selected));
          choice.append(window.MorningPaper.pin(Math.imul(index+7,2654435761)>>>0,color.id));
          choice.addEventListener('click',()=>editTree(()=>M.configureWriting(state,task.id,{...task.writing,pinColor:color.id}),task.id,'pin-current'));pinColor.append(choice);
        });picker.append(pinColor);pinLabel.append(picker);fields.append(pinLabel);
        const styleLabel=document.createElement('label');styleLabel.className='writing-content-label';styleLabel.textContent=translateUI("Indhold ");
        const contentStyle=document.createElement('select');contentStyle.className='writing-content-style';contentStyle.setAttribute('aria-label',translateUI("Visning af notens indhold"));
        const styles=task.writing.mode==='list'?[['tasks',translateUI("Opgaver (afkrydsning)")],['disc','• Prikker'],['decimal','1. 2. 3.'],['upper-roman','I. II. III.'],['upper-alpha','A. B. C.'],['lower-alpha','a. b. c.'],['lower-roman','i. ii. iii.']]:[['tasks',translateUI("Opgave (stor afkrydsning)")],['plain',translateUI("Almindelig note")]];
        for(const [value,text] of styles){const option=document.createElement('option');option.value=value;option.textContent=text;contentStyle.append(option);}contentStyle.value=task.writing.asTasks===false?(task.writing.mode==='list'?task.writing.listStyle||'disc':'plain'):'tasks';
        contentStyle.addEventListener('change',()=>editTree(()=>M.configureWriting(state,task.id,{...task.writing,asTasks:contentStyle.value==='tasks',...(task.writing.mode==='list'&&contentStyle.value!=='tasks'?{listStyle:contentStyle.value}:{})}),task.id,'writing-content-style'));styleLabel.append(contentStyle);fields.append(styleLabel);
        if(task.writing.mode==='media'){
          fields.append(window.MorningMedia.picker(task.writing,asset=>editTree(()=>M.configureWriting(state,task.id,{...task.writing,asset}),task.id,'writing-type')));
          if(task.writing.asset?.type!=='application/pdf'){const label=document.createElement('label');label.className='writing-content-label';label.textContent=translateUI("Passepartout");const mat=document.createElement('select');mat.setAttribute('aria-label',translateUI("Passepartout"));for(const [value,text] of [['none',translateUI("Ingen")],['small',translateUI("Lille")],['large',translateUI("Stor")]]){const option=document.createElement('option');option.value=value;option.textContent=text;mat.append(option);}mat.value=window.MorningMediaModel.border(task.writing);mat.addEventListener('change',()=>editTree(()=>M.configureWriting(state,task.id,{...task.writing,mat:mat.value}),task.id,'writing-type'));label.append(mat);fields.append(label);}
        }else{
        for(const [key,labelText,choices] of [['paperColor',translateUI("Papirfarve"),window.MorningPaper.paperColors],['paperType',translateUI("Papirtype"),window.MorningPaper.paperTypes]]){
          const label=document.createElement('label');label.className='writing-content-label';label.textContent=labelText;const select=document.createElement('select');select.className=`writing-${key}`;select.setAttribute('aria-label',labelText);
          for(const choice of choices){const option=document.createElement('option');option.value=choice.id;option.textContent=choice.name;select.append(option);}select.value=task.writing[key]||choices[0].id;
          select.addEventListener('change',()=>editTree(()=>M.configureWriting(state,task.id,{...task.writing,[key]:select.value}),task.id,`writing-${key}`));label.append(select);fields.append(label);
        }
        fields.append(window.MorningPaper.alignmentPicker(task.writing.align,align=>{M.configureWriting(state,task.id,{...task.writing,align});save(false);writingUI.sync();}));}
        const title=document.createElement('input');title.type='text';title.className='note-title-input';title.maxLength=300;title.value=task.writing.title??F.plain(task.text);title.placeholder=translateUI("Titel (valgfri)");title.setAttribute('aria-label',translateUI("Titel på den færdige note"));
        title.addEventListener('input',()=>{M.configureWriting(state,task.id,{...task.writing,title:title.value});save(false);writingUI.sync();});fields.append(title);
      }
      const siblings=tasks.filter(t=>t.parentId===task.parentId),next=siblings[siblings.findIndex(t=>t.id===task.id)+1];
      if(next&&!next.xor&&!task.writing&&!next.writing&&task.parentChoice===next.parentChoice){
        const pair=document.createElement('button');pair.type='button';pair.className='quiet-button xor-editor-action';pair.textContent=translateUI("ELLER");pair.title=translateUI("Kombinér med næste opgave: {0}", F.plain(next.text));pair.setAttribute('aria-label',pair.title);
        pair.addEventListener('click',()=>editTree(()=>M.pair(state,task.id,next.id),task.id,'edit-text'));fields.append(pair);
      }
    }
    if(task.xor){
      const label=document.createElement('label');label.className='writing-content-label';label.textContent=translateUI("Tidsplan ");
      const mode=document.createElement('select');mode.className='writing-content-style schedule-mode';mode.setAttribute('aria-label',translateUI("Tidsplan for ELLER"));
      for(const [value,text] of [['shared',translateUI("Fælles for begge")],['separate',translateUI("Hver sin tidsplan")]]){const option=document.createElement('option');option.value=value;option.textContent=text;mode.append(option);}mode.value=task.xor.scheduleMode||'separate';
      mode.addEventListener('change',()=>editTree(()=>M.setScheduleMode(state,task.id,mode.value),task.id,'schedule-mode'));label.append(mode);fields.append(label);
    }
    for(const choice of task.xor?(task.xor.scheduleMode==='shared'?['shared']:[0,1]):[0])fields.append(window.MorningScheduleEditor.field(task,choice,{model:M,getState:()=>state,onChange:()=>{save(false);render(true);window.MorningEditorUI.refresh(li,task);}}));
    const parent=state.tasks.find(t=>t.id===task.parentId);
    if(parent?.xor){
      const scopes=document.createElement('div');scopes.className='xor-dependency-options';scopes.setAttribute('role','group');scopes.setAttribute('aria-label',translateUI("Vis opgaven efter"));
      const after=document.createElement('span');after.textContent=translateUI("Efter:");scopes.append(after);
      for(const [choice,label] of [[null,translateUI("Et af valgene")],[0,F.plain(parent.text)],[1,F.plain(parent.xor.otherText)]]){
        const scope=document.createElement('button');scope.type='button';scope.className='quiet-button dependency-choice';scope.dataset.parentId=parent.id;scope.dataset.choice=choice==null?'either':String(choice);scope.textContent=label;scope.title=choice==null?translateUI("Vis efter et af valgene"):translateUI("Vis kun efter: ")+label;scope.setAttribute('aria-pressed',String(task.parentChoice===choice));scope.setAttribute('aria-label',scope.title);
        scope.addEventListener('click',()=>editTree(()=>M.setDependencyChoice(state,task.id,choice),task.id,'edit-text'));scopes.append(scope);
      }fields.append(scopes);
    }
    const remove=document.createElement('button');remove.className='quiet-button remove-button';remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',translateUI("Fjern: {0}", task.text));
    remove.addEventListener('click',()=>{listEditor.remove(task.id);save();render(true);renderEditor();editorMessage();(list.children[Math.min(index,list.children.length-1)]?.querySelector('.edit-text')||$('#add')).focus();});
    window.MorningEditorUI.row({li,fields,order,remove,task,state,open:expanded.get(task.id)?.open,scheduleOpen:expanded.get(task.id)?.schedules||[],format:F,onParent:parentId=>editTree(()=>M.update(state,task.id,task.text,parentId),task.id,'editor-parent-select')});listEditor.decorate(li,task);li.querySelector('.editor-settings-panel').append(window.MorningEmphasis.field(task,{getState:()=>state,onChange:()=>{save(false);render(true);}}));list.append(li);
  });
  window.MorningEditorUI.tree(list,state);
}
function openEditor() {
  writingUI.close();
  checkNewDay();opener=document.activeElement;renderEditor();editorMessage();$('#form-message').hidden=true;
  $('#add-form').hidden=true;$('#add').setAttribute('aria-expanded','false');achievementUI.setEditing(true);$('#editor').show();$('#edit').setAttribute('aria-pressed','true');window.scrollTo?.({top:0,behavior:'instant'});
  animate($('#editor'),[{opacity:0,transform:'translateX(12px)'},{opacity:1,transform:'translateX(0)'}],440);
}
function finishEditor(){if($('#editor').open||$('#edit').getAttribute('aria-pressed')!=='true')return;taskDrag.cancel();taskHistory.flush();$('#edit').setAttribute('aria-pressed','false');achievementUI.setEditing(false);render(true);opener?.focus({preventScroll:true});}
window.MorningTabs.register('editor',{isOpen:()=>$('#editor').open,open:openEditor,close:()=>{if($('#editor').open){opener=null;$('#editor').close();finishEditor();}}});
$('#edit').addEventListener('click',()=>window.MorningTabs.toggle('editor'));
$('#add').addEventListener('click',()=>{const form=$('#add-form');form.hidden=!form.hidden;$('#add').setAttribute('aria-expanded',String(!form.hidden));if(!form.hidden)$('#task-text').focus();});
$('#close-editor').addEventListener('click',()=>window.MorningTabs.close('editor'));
$('#back-editor').addEventListener('click',()=>window.MorningTabs.close('editor'));
$('#editor').addEventListener('close',finishEditor);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&!window.MorningTabs.hasModal()&&$('#editor').open&&$('#sync-panel').hidden){event.preventDefault();window.MorningTabs.close('editor');}});
$('#add-form').addEventListener('submit',event=>{
  event.preventDefault();checkNewDay();
  try {
    const id=window.crypto?.randomUUID?.()||`task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    M.add(state,$('#task-text').value,null,id);if(listEditor.selected()!=='*'){for(const list of state.lists)list.taskIds=list.taskIds.filter(value=>value!==id);window.MorningLists.assign(state,listEditor.selected(),id);}save();render(true);renderEditor();
    $('#task-text').value='';$('#add-form').hidden=true;$('#add').setAttribute('aria-expanded','false');editorRow(id)?.querySelector('.edit-text').focus();$('#form-message').hidden=true;
  } catch(error) {$('#form-message').textContent=error.message;$('#form-message').hidden=false;}
});
const taskHistory=window.MorningTaskVersions.create({getState:()=>state,storage:localStorage,onChange:()=>{renderVersions();syncUI?.capture();},onError:()=>editorMessage(translateUI("Versionshistorikken kunne ikke gemmes på denne enhed."))});
function renderVersions(){
  const select=$('#task-versions');select.replaceChildren();
  for(const entry of taskHistory.list()){
    const option=document.createElement('option');option.value=String(entry.revision);
    option.textContent=`v${entry.revision} · ${new Date(entry.createdAt).toLocaleString(locale,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} · ${window.YackI18n.historyLabel(entry.label)}`;select.append(option);
  }
  const latest=taskHistory.list().at(-1);select.value=latest?String(latest.revision):'';$('#restore-version').disabled=!latest;
}
taskHistory.record('Første version',true);renderVersions();
const importBackupKey='starting-work-import-backup';
let importCandidate=null,importVersions=[],importSequence=0;
$('#undo-import').hidden=!readSaved(importBackupKey);
$('#export-tasks').addEventListener('click',()=>{
  try{
    taskHistory.flush();
    const url=URL.createObjectURL(new Blob([window.MorningTaskJSON.encode(state,taskHistory.list())],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`opgaver-${localDate()}.json`;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    editorMessage(translateUI("Opgaverne er eksporteret."));
  }catch{editorMessage(translateUI("Filen kunne ikke eksporteres."));}
});
$('#import-tasks').addEventListener('click',()=>{$('#import-file').value='';$('#import-file').click();});
$('#import-file').addEventListener('change',async()=>{
  const sequence=++importSequence,file=$('#import-file').files?.[0];importCandidate=null;$('#import-preview').hidden=true;
  if(!file)return;
  try{
    if(file.size>8388608)throw new Error(translateUI("JSON-filen må højst fylde 8 MB."));
    const imported=window.MorningTaskJSON.read(await file.text());if(sequence!==importSequence)return;
    const tasks=imported.tasks;importCandidate=tasks;importVersions=imported.versions;$('#import-summary').textContent=translateUI("{0}: {1} opgaver. Filen erstatter listen og bevarer dagens status for opgaver med samme ID. Nye opgaver starter uden flueben.", file.name, tasks.length);
    $('#import-preview').hidden=false;editorMessage();$('#confirm-import').focus();
  }catch(error){if(sequence===importSequence)editorMessage(error.message);}
});
function replaceImportedState(next){
  localStorage.setItem(key,JSON.stringify(next));
  scribbleUI.cancelAll();taskDrag.cancel();achievementUI.clearDaily();state=next;
  for(const row of rows.values()){row.deferControl.dispose();row.remove();}rows.clear();
  achievementUI.update();render(true);renderEditor();save(false);
}
$('#confirm-import').addEventListener('click',()=>{
  if(!importCandidate)return;
  try{
    const next=window.MorningTaskJSON.apply(importCandidate,state,localDate());
    taskHistory.flush();localStorage.setItem(importBackupKey,JSON.stringify(state));replaceImportedState(next);
    taskHistory.record('Importeret');taskHistory.addImported(importVersions);taskHistory.record('Importeret',true);
    importCandidate=null;importVersions=[];$('#import-preview').hidden=true;$('#undo-import').hidden=false;editorMessage(translateUI("Listen er importeret. Du kan fortryde importen."));
  }catch(error){editorMessage(translateUI("Importen kunne ikke gemmes: {0}", error.message));}
});
$('#cancel-import').addEventListener('click',()=>{importSequence++;importCandidate=null;$('#import-preview').hidden=true;});
$('#undo-import').addEventListener('click',()=>{
  const backup=readSaved(importBackupKey);if(!backup)return;
  try{replaceImportedState(M.restore(backup,localDate()));taskHistory.record('Fortrudt import',true);localStorage.removeItem(importBackupKey);$('#undo-import').hidden=true;editorMessage(translateUI("Importen er fortrudt."));}
  catch(error){editorMessage(translateUI("Listen kunne ikke gendannes: {0}", error.message));}
});
$('#restore-version').addEventListener('click',()=>{
  const revision=Number($('#task-versions').value);taskHistory.flush();const version=taskHistory.get(revision);if(!version)return;
  try{replaceImportedState(version.snapshot?window.MorningSyncData.materialize(version.snapshot.fields,localDate()).state:window.MorningTaskJSON.apply(window.MorningTaskJSON.parse(JSON.stringify({format:'starting-work-tasks',version:2,tasks:version.tasks,lists:version.lists})),state,localDate()));taskHistory.record(`Gendannet fra v${revision}`,true);editorMessage(translateUI("Version {0} er gendannet.", revision));}
  catch(error){editorMessage(translateUI("Versionen kunne ikke gendannes: {0}", error.message));}
});
function checkNewDay() {
  const changed=M.resetDay(state,localDate()),visited=!document.hidden&&window.MorningStats.visit(state);
  if(!changed&&!visited)return;
  if(changed){scribbleUI.cancelAll();deferralUI.hideAll();achievementUI.clearDaily();}
  save();render(true);if($('#editor').open)renderEditor();
}
window.addEventListener('storage',event=>{
  if(event.key!==key||!event.newValue)return;
  try {scribbleUI.cancelAll();const saved=JSON.parse(event.newValue);if(saved.version!==2||!Array.isArray(saved.tasks))return;const previousDay=state.day;state=M.restore(saved,localDate());if(previousDay!==state.day)achievementUI.clearDaily();achievementUI.update();render(true);layoutMarks();if($('#editor').open)renderEditor();}catch{}
});
render();const startupAwards=save(false);achievementUI.celebrate(startupAwards.filter(p=>p.scope==='week'),0);
if(document.fonts)document.fonts.ready.then(layoutMarks);
if(typeof ResizeObserver!=='undefined') {
  let width=0;
  new ResizeObserver(entries=>{const next=entries[0].contentRect.width;if(next!==width){width=next;layoutMarks();}}).observe($('.checklist'));
} else window.addEventListener('resize',layoutMarks);
document.addEventListener('visibilitychange',()=>{if(document.hidden)scribbleUI.cancelAll();else{checkNewDay();render(true);layoutMarks();}});
window.addEventListener('focus',()=>{checkNewDay();if(!document.querySelector('.scribbling')){render(true);achievementUI.update();}});
function scheduleMinute(){setTimeout(()=>{checkNewDay();if(!document.hidden&&!document.querySelector('.scribbling')){render(true);if(window.MorningAchievements.progress(state).some(p=>p.met&&!p.earned))save(true,0);else achievementUI.update();}scheduleMinute();},60000-Date.now()%60000+20);}
scheduleMinute();

function randomFrom(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function drawBox(button, boxSeed) {
  // Keep each box's character stable while its checkmark can change.
  const random = randomFrom(boxSeed);
  const vary = (value, spread = 1) => value + (random() * 2 - 1) * spread;
  const corners = [[vary(3),vary(3)],[vary(27),vary(3)],[vary(27),vary(27)],[vary(3),vary(27)]];
  let d = `M ${corners[0].join(' ')}`;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    d += ` Q ${vary((a[0]+b[0])/2,1.4)} ${vary((a[1]+b[1])/2,1.4)} ${b[0]} ${b[1]}`;
  }
  const outline = button.querySelector('.box-outline');
  outline.querySelector('path').setAttribute('d',d);
  outline.style.transform = `rotate(${vary(0,4)}deg)`;
}
function drawCheck(button,seed) {
  const random = randomFrom(seed);
  const between = (min, max) => min + random() * (max - min);
  button.querySelector('.check').style.transform = `translate(${between(-4,4)}px, ${between(-3.5,3.5)}px) rotate(${between(-15,15)}deg) scale(${between(.91,1.09)})`;
}
function inkLayoutKey(seed,lines,bounds,mode='') {
  return JSON.stringify([seed,mode,...lines.map(r=>[r.left-bounds.left,r.top-bounds.top,r.width,r.height].map(v=>Math.round(v*100)/100))]);
}
function drawMarks(button, seed) {
  if(button.querySelector('.check'))drawCheck(button,seed);
  const random=randomFrom(seed);for(let i=0;i<4;i++)random();
  const between=(min,max)=>min+random()*(max-min);
  const label = button.querySelector('.label');
  const text = button.querySelector('.text');
  const svg = button.querySelector('.strike');
  const bounds = label.getBoundingClientRect();
  // One red stroke per wrapped text line, also on narrow screens.
  const range = document.createRange(); range.selectNodeContents(text);
  const lines = F.lines(range.getClientRects());
  const geometryKey=inkLayoutKey(seed,lines,bounds);if(svg.inkLayoutKey===geometryKey&&svg.children.length)return;svg.inkLayoutKey=geometryKey;svg.replaceChildren();
  for (const [i,rect] of lines.entries()) {
    const x = rect.left - bounds.left - between(1,4);
    const y = rect.top - bounds.top + rect.height * .55;
    const w = rect.width + between(3,7);
    const start = y + between(-2,2), end = y + between(-3,3);
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', `M ${x} ${start} C ${x+w*.25} ${y+between(-5,5)}, ${x+w*.32} ${y+between(-5,5)}, ${x+w*.5} ${y+between(-2,2)} S ${x+w*.8} ${y+between(-5,5)}, ${x+w} ${end}`);
    path.setAttribute('pathLength','1');
    const width=between(4.1,5.5);path.setAttribute('stroke-width',width);
    svg.append(path);
    window.MorningInk.apply(path,{width,color:'#bd3029',seed:(seed+i*2654435761)>>>0});
  }
}
function drawDeferral(button,task,lengthwise=false,wholeGroup=false) {
  button.dataset.deferSeed=String(task.deferSeed);
  const svg=button.querySelector(wholeGroup?'.xor-group-defer-strike':'.defer-strike');
  const label=button.querySelector(wholeGroup?'.xor-options':'.label'),bounds=label.getBoundingClientRect();
  let lines;
  if(wholeGroup)lines=[bounds];
  else{const range=document.createRange();range.selectNodeContents(button.querySelector('.text'));lines=F.lines(range.getClientRects());}
  const geometryKey=inkLayoutKey(task.deferSeed,lines,bounds,`${lengthwise}:${wholeGroup}`);if(svg.inkLayoutKey===geometryKey&&svg.children.length)return;svg.inkLayoutKey=geometryKey;svg.replaceChildren();
  lines.forEach((rect,i)=>{
    const path=document.createElementNS(svgNS,'path');
    path.setAttribute('d',(lengthwise?window.MorningDeferral.longStroke:window.MorningDeferral.stroke)({x:rect.left-bounds.left-2,y:rect.top-bounds.top+rect.height*.54,width:rect.width+4,height:rect.height},(task.deferSeed+i*2654435761)>>>0));
    path.setAttribute('pathLength','1');svg.append(path);
    window.MorningInk.apply(path,{width:1.2,color:'#39372f',seed:(task.deferSeed+i*2654435761)>>>0});
  });
}

reminderUI=window.MorningReminderUI.create({getState:()=>state,model:M,save,onChange:()=>render(true),checkNewDay});

if(typeof window.fetch==='function'){
  syncUI=window.MorningSync.create({getState:()=>state,getVersions:()=>taskHistory.list(),canApply:()=>!$('#note-composer').open&&!$('#profile-reminders').contains(document.activeElement)&&!taskHistory.hasPending()&&!document.querySelector('.scribbling')&&!document.querySelector('.is-dragging')&&!document.querySelector('.note-dragging')&&!document.querySelector('.note-resizing')&&!document.querySelector('.mobile-note-dragging'),apply:(next,versions,options={})=>{
    const restored=M.restore(next,localDate());if(!document.hidden)window.MorningStats.visit(restored);const changed=JSON.stringify(restored)!==JSON.stringify(state);
    if(options.reset){scribbleUI.cancelAll();writingUI.close();}
    if(changed){const oldDay=state.day;state=restored;window.MorningStats.render(state,document);if(oldDay!==state.day)achievementUI.clearDaily();render(true);layoutMarks();achievementUI.update();localStorage.setItem(key,JSON.stringify(state));if($('#editor').open&&!$('#editor').contains(document.activeElement))renderEditor();}
    taskHistory.replaceRemote(versions);
    if(window.MorningAchievements.progress(state).some(p=>p.scope==='week'&&p.met&&!p.earned))setTimeout(()=>save(true,0),0);
  }});syncUI.start();
}
window.MorningTabs.start();

$('#new-note').addEventListener('click',()=>writingUI.newNote());

})();
