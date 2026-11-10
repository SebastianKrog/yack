(function(root){
  'use strict';
  const {t:translateUI}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
  function create({model,getState,format,save,onSubmit,checkNewDay,animate,drawBox,drawMarks,drawDeferral,deferralUI,onDefer,onToggle,onArchive=()=>{}}){
    const composer=document.querySelector('#note-composer'),pad=document.querySelector('#writing-pad'),board=document.querySelector('#notes-board');
    let active=null,activeKind=null,refreshFields=null,session=null,day=getState().day;
    const editFields=['text','writing','writingDraft','writingAnswer','writingItems','noteItemCount','temporaryDay','permanentNote','checked','completedOrder','noteCreatedDay','noteCompletedDay'];
    const clone=value=>JSON.parse(JSON.stringify(value));
    function editState(){const state=getState();return session?{...state,tasks:state.tasks.map(task=>task.id===session.id?session.task:task)}:state;}
    const cards=new Map(),drag=root.MorningNoteDrag.create({getState,model,save,onResize:()=>layout()});
    const mobile=root.MorningMobileNotes.create({getState,model,save,board,onLayout:()=>layout()});
    let inputMode='mouse';board.setAttribute('data-note-input',inputMode);
    function input(mode){
      if(mode===inputMode)return;inputMode=mode;board.setAttribute('data-note-input',mode);
      if(mode==='mouse')for(const {card} of cards.values())card.classList.remove('note-controls-visible');
    }
    // Media queries describe hardware; pointerType identifies the input in use.
    document.addEventListener('pointermove',event=>{if(event.pointerType==='mouse')input('mouse');},{capture:true,passive:true});
    document.addEventListener('pointerdown',event=>{
      if(event.pointerType==='mouse')input('mouse');else if(event.pointerType==='touch'||event.pointerType==='pen')input('touch');
      for(const {card} of cards.values())if(!card.contains(event.target))card.classList.remove('note-controls-visible');
    },{capture:true,passive:true});
    document.addEventListener('keydown',event=>{if(event.key==='Tab'||event.key?.startsWith('Arrow'))input('keyboard');});
    function setItemState(button,item){
      button.setAttribute('aria-checked',String(item.checked));button.setAttribute('aria-disabled',String(!!item.deferred));button.classList.toggle('deferred',!!item.deferred);
      const defer=button.closest('li').querySelector('.defer-button');defer.setAttribute('aria-pressed',String(!!item.deferred));defer.setAttribute('aria-label',item.deferred?translateUI("Fortryd udsættelse"):translateUI("Udskyd notepunkt"));
    }
    composer.addEventListener('cancel',event=>{event.preventDefault();if(!pad.querySelector('.note-discard-confirm')?.hidden)confirmAction(null);else requestClose();});
    composer.addEventListener('close',()=>{if(!composer.open&&active){close();sync();}});
    function close(){active=null;refreshFields=null;session=null;if(composer.open)composer.close();pad.hidden=true;pad.replaceChildren();document.querySelectorAll('.writing-task').forEach(button=>button.setAttribute('aria-expanded','false'));}
    function discard(){
      const created=session?.created,id=active;close();
      if(created){model.remove(getState(),id);save(false);}sync();
    }
    function confirmAction(kind){
      const prompt=pad.querySelector('.note-discard-confirm');if(!prompt)return;
      prompt.dataset.action=kind||'';prompt.hidden=!kind;
      for(const child of prompt.parentNode.children)if(child!==prompt)child.inert=!!kind;
      pad.querySelector('.note-compose-close').style.visibility=kind==='discard'?'hidden':'';
      if(!kind){pad.querySelector('.note-compose-close')?.focus();return;}
      const deleting=kind==='delete';prompt.setAttribute('aria-label',deleting?translateUI("Slet note"):translateUI("Kassér ændringer"));
      prompt.querySelector('p').textContent=deleting?translateUI("Vil du slette noten og dens indhold?"):translateUI("Du har ændringer, der ikke er gemt. Vil du kassere dem?");
      prompt.querySelector('.note-keep-editing').textContent=deleting?translateUI("Behold noten"):translateUI("Fortsæt med at redigere");prompt.querySelector('.note-discard').textContent=deleting?translateUI("Slet note"):translateUI("Kassér ændringer");prompt.querySelector('.note-keep-editing').focus();
    }
    function deleteNote(){
      checkNewDay();const current=getState().tasks.find(t=>t.id===active);if(!current||(!current.temporaryDay&&!current.permanentNote))return;
      model.remove(getState(),active);root.MorningSound?.noteSetdown?.();close();save(false);onArchive();sync();
    }
    function requestClose(){
      if(!session)return;
      if(JSON.stringify(session.task)!==session.baseline)confirmAction('discard');
      else discard();
    }
    function newNote(){
      checkNewDay();const state=getState();let task=state.tasks.find(t=>(t.temporaryDay===state.day||t.permanentNote)&&!t.checked&&!t.noteArchived);
      const created=!task;if(!task)task=model.createTemporaryNote(state,`note-${Date.now()}-${root.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)}`);
      open(task.id,false,created);
    }
    function noteOptions(task){
      const options=document.createElement('details');options.className='note-options';options.open=!task.writingAnswer?.length;
      const summary=document.createElement('summary');summary.setAttribute('aria-label',translateUI("Notens udseende og indhold"));summary.title=translateUI("Notens udseende og indhold");root.MorningPaper.settingsIcon(summary);options.append(summary);
      const grid=document.createElement('div');grid.className='note-options-grid';options.append(grid);
      function configure(patch,rebuild=false){
        checkNewDay();const current=editState().tasks.find(t=>t.id===task.id);if(!current?.writing)return;const config={...current.writing,...patch};
        const draft=[...(current.writingDraft||current.writingAnswer||[])];model.configureWriting(editState(),task.id,config);model.draftWriting(editState(),task.id,draft.slice(0,model.writingCount(current)));
        if(rebuild||patch.asTasks!==undefined||patch.listStyle!==undefined)open(task.id,true);else root.MorningPaper.paper(pad,current.boxSeed,current.writing);
      }
      function select(labelText,cls,choices,value,onChange){
        const label=document.createElement('label');label.textContent=labelText;const input=document.createElement('select');input.className=cls;input.setAttribute('aria-label',labelText);
        for(const [value,text] of choices){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);}input.value=value;input.addEventListener('change',()=>onChange(input.value));label.append(input);grid.append(label);return input;
      }
      select(translateUI("Notetype"),'note-kind',[['note','Note'],['list',translateUI("Liste")],['media',translateUI("Billede / PDF")]],task.writing.mode,mode=>configure({mode,count:mode==='list'?3:1,...(mode==='media'?{mat:'small'}:{})},true));
      select(translateUI("Varighed"),'note-permanence',[['day',translateUI("Kun i dag")],['permanent','Permanent']],task.permanentNote?'permanent':'day',value=>{checkNewDay();if(model.setNotePermanence(editState(),task.id,value==='permanent')){open(task.id,true);}});
      if(task.writing.mode==='list'){
        const label=document.createElement('label');label.textContent=translateUI("Antal punkter");const count=document.createElement('input');count.type='number';count.className='note-count';count.min=1;count.max=100;count.value=model.writingCount(task);count.setAttribute('aria-label',translateUI("Antal punkter"));count.addEventListener('change',()=>{const value=Number(count.value);if(Number.isInteger(value)&&value>=1&&value<=100){const values=[...(editState().tasks.find(t=>t.id===task.id)?.writingDraft||[])];editList(task.id,Array.from({length:value},(_,i)=>values[i]||''),Math.min(value-1,values.length));}else count.value=model.writingCount(task);});label.append(count);grid.append(label);
      }
      const styles=task.writing.mode==='list'?[['tasks',translateUI("Opgaver ✓")],['disc','• Prikker'],['decimal','1. 2. 3.'],['upper-roman','I. II. III.'],['upper-alpha','A. B. C.'],['lower-alpha','a. b. c.'],['lower-roman','i. ii. iii.']]:[['tasks',translateUI("Opgave ✓")],['plain',translateUI("Almindelig tekst")]];
      select(translateUI("Indhold"),'note-content-kind',styles,task.writing.asTasks===false?(task.writing.mode==='list'?task.writing.listStyle||'disc':'plain'):'tasks',style=>configure({asTasks:style==='tasks',...(style!=='tasks'&&task.writing.mode==='list'?{listStyle:style}:{})}));
      if(task.writing.mode!=='media'){select(translateUI("Papirfarve"),'note-paper-color',root.MorningPaper.paperColors.map(c=>[c.id,c.name]),task.writing.paperColor||'cream',paperColor=>configure({paperColor}));
      select(translateUI("Papirtype"),'note-paper-type',root.MorningPaper.paperTypes.map(p=>[p.id,p.name]),task.writing.paperType||'plain',paperType=>configure({paperType}));}else if(task.writing.asset?.type!=='application/pdf')select(translateUI("Passepartout"),'note-mat',[['none',translateUI("Ingen")],['small',translateUI("Lille")],['large',translateUI("Stor")]],root.MorningMediaModel.border(task.writing),mat=>configure({mat},true));
      const label=document.createElement('div');label.className='note-pin-field';const text=document.createElement('span');text.textContent=translateUI("Knappenål");label.append(text);
      const picker=document.createElement('details');picker.className='pin-picker';const current=document.createElement('summary');current.className='pin-choice pin-current';const selected=root.MorningPaper.color(task.boxSeed,task.writing.pinColor);current.setAttribute('aria-label',translateUI("Skift knappenål: ")+selected.name);current.append(root.MorningPaper.pin(task.boxSeed,selected.id,task.permanentNote?'preview':null));picker.append(current);
      const palette=document.createElement('div');palette.className='pin-color';palette.setAttribute('role','group');palette.setAttribute('aria-label',translateUI("Farve på knappenål"));
      root.MorningPaper.colors.forEach((color,index)=>{const button=document.createElement('button');button.type='button';button.className='pin-choice';button.setAttribute('aria-label',color.name);button.title=color.name;button.setAttribute('aria-pressed',String(color.id===selected.id));button.append(root.MorningPaper.pin(Math.imul(index+7,2654435761)>>>0,color.id,task.permanentNote?'preview':null));button.addEventListener('click',()=>{configure({pinColor:color.id});current.replaceChildren(root.MorningPaper.pin(task.boxSeed,color.id,task.permanentNote?'preview':null));current.setAttribute('aria-label',translateUI("Skift knappenål: ")+color.name);for(const choice of palette.children)choice.setAttribute('aria-pressed',String(choice===button));picker.open=false;});palette.append(button);});picker.append(palette);label.append(picker);grid.append(label);
      return options;
    }
    function editList(id,values,focusIndex){
      checkNewDay();if(active!==id)return;
      try{
        const task=model.editWritingList(editState(),id,values);if(!task)return;
        // Keep the form, actions and dialog mounted: removing a row must not replace
        // the pointer target with a different action or dismiss the composer.
        activeKind=`${task.writing.mode}:${model.writingCount(task)}`;
        refreshFields?.(task);const count=pad.querySelector('.note-count');if(count)count.value=model.writingCount(task);
        pad.querySelectorAll('.writing-input')[focusIndex]?.focus({preventScroll:true});
      }
      catch(error){const message=pad.querySelector('.form-message');if(message){message.textContent=error.message;message.hidden=false;}}
    }
    function penRule(seed,extraClass=''){
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class',`note-rule ${extraClass}`);svg.setAttribute('viewBox','0 0 500 12');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
      let value=seed>>>0;const vary=(a,b)=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return a+value/4294967296*(b-a);};
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',`M2 ${vary(4,8)} C115 ${vary(2,10)} 167 ${vary(2,10)} 250 ${vary(4,8)} S398 ${vary(2,10)} 498 ${vary(4,8)}`);svg.append(path);root.MorningInk.apply(path,{width:vary(.85,1.15),color:'#39372f',seed});return svg;
    }
    function open(id,refresh=false,created=false){
      const optionsOpen=refresh?pad.querySelector('.note-options')?.open:undefined,focusClass=refresh?['note-kind','note-content-kind','note-permanence'].find(name=>document.activeElement?.classList.contains(name)):null;
      if(!refresh)mobile.close();checkNewDay();let task=editState().tasks.find(t=>t.id===id);
      if(!task?.writing||task.noteArchived||!model.scheduled(editState(),task)||model.deferStatus(editState(),id))return;
      if(!refresh){session={id,task:clone(task),baseline:JSON.stringify(task),created};task=session.task;root.MorningSound?.notePickup?.();}active=id;activeKind=`${task.writing.mode}:${model.writingCount(task)}`;pad.replaceChildren();pad.hidden=false;root.MorningPaper.paper(pad,task.boxSeed,task.writing);
      document.querySelectorAll('.writing-task').forEach(button=>button.setAttribute('aria-expanded',String(button.closest('li[data-task-id]')?.dataset.taskId===id)));
      const form=document.createElement('form'),title=document.createElement('h2'),inputs=[],custom=!!(task.temporaryDay||task.permanentNote);let lifetime;
      title.textContent=format.plain(task.text);if(!custom){const header=document.createElement('div');header.className='note-title-field';header.append(title,penRule(task.boxSeed^0xa3764b19));form.append(header);}
      const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='note-compose-close';root.MorningPaper.closeIcon(dismiss,task.boxSeed);dismiss.setAttribute('aria-label',translateUI("Luk note"));dismiss.addEventListener('click',requestClose);form.append(dismiss);
      if(task.temporaryDay||task.permanentNote){
        const heading=document.createElement('input');heading.type='text';heading.className='note-compose-title';heading.maxLength=300;heading.placeholder=translateUI("Titel (valgfri)");heading.setAttribute('aria-label',translateUI("Notens titel"));heading.value=task.writing.title??(task.text==='Ny note'?'':task.text);
        heading.addEventListener('input',()=>{checkNewDay();const current=editState().tasks.find(t=>t.id===id);if(!current?.writing)return;current.text=heading.value.trim()||'Ny note';current.writing.title=heading.value.trim();});const header=document.createElement('div');header.className='note-title-field';header.append(heading,penRule(task.boxSeed^0xa3764b19));form.append(header,noteOptions(task));
        lifetime=document.createElement('span');lifetime.className='note-lifetime';lifetime.textContent=task.permanentNote?'Permanent':translateUI("Kun i dag");
      }
      if(custom&&task.writing.mode!=='media'){const alignment=root.MorningPaper.alignmentPicker(task.writing.align,align=>{checkNewDay();const current=editState().tasks.find(t=>t.id===id);if(!current?.writing)return;model.configureWriting(editState(),id,{...current.writing,align});root.MorningPaper.paper(pad,current.boxSeed,current.writing);});alignment.classList.add('note-compose-alignment');form.querySelector('.note-pin-field').append(alignment);form.append(penRule(task.boxSeed^0x38c54d27,'note-body-rule'));}
      const fields=document.createElement('div');fields.className='writing-fields';form.append(fields);
      let add;
      refreshFields=task=>{
        fields.replaceChildren();inputs.length=0;if(task.writing.mode==='media'){fields.append(root.MorningMedia.picker(task.writing,asset=>{if(active!==id)return;model.configureWriting(editState(),id,{...session.task.writing,mode:'media',count:1,asset,mat:session.task.writing.mat||'small'});open(id,true);}));return;}const values=task.writingDraft||task.writingAnswer||[];
        for(let i=0;i<model.writingCount(task);i++){
          const label=document.createElement('div');label.className='writing-field';
          const number=document.createElement('span');number.className='writing-marker';number.setAttribute('aria-hidden','true');number.innerHTML=`<svg viewBox="0 0 30 30"><path d="${root.MorningPaper.geometry((task.boxSeed+i*2654435761)>>>0).small}"/></svg>`;
          const input=document.createElement(task.writing.mode==='list'?'input':'textarea');input.className='writing-input';input.value=values[i]||'';input.maxLength=2000;input.required=true;
          if(task.writing.mode==='list')input.type='text';else input.rows=5;
          input.setAttribute('aria-label',task.writing.mode==='list'?translateUI("Punkt {0}", i+1):translateUI("Din note"));
          input.addEventListener('input',()=>{checkNewDay();if(active!==id)return;const task=editState().tasks.find(task=>task.id===id),draft=[...(task?.writingDraft||task?.writingAnswer||[])];draft[i]=input.value;model.draftWriting(editState(),id,draft);});
          label.append(number,input);
          input.addEventListener('keydown',event=>{
            if(event.key!=='Enter'||event.isComposing||event.keyCode===229)return;
            if(!event.shiftKey){event.preventDefault();if(!event.repeat)form.requestSubmit();}
            else if(custom&&task.writing.mode==='list'){event.preventDefault();if(!event.repeat){const values=inputs.map(field=>field.value);values.splice(i+1,0,'');editList(id,values,i+1);}}
          });
          if(custom&&task.writing.mode==='list'){
            const remove=document.createElement('button');remove.type='button';remove.className='writing-remove';remove.textContent='×';remove.setAttribute('aria-label',translateUI("Fjern punkt {0}", i+1));remove.disabled=model.writingCount(task)<=1;remove.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const values=inputs.map(field=>field.value);values.splice(i,1);editList(id,values,Math.max(0,i-1));});label.append(remove);
          }
          fields.append(label);inputs.push(input);
        }
        if(add)add.disabled=inputs.length>=100;
      };refreshFields(task);
      if(custom&&task.writing.mode==='list'){add=document.createElement('button');add.type='button';add.className='quiet-button writing-add';add.textContent=translateUI("+ Tilføj punkt");add.title='Shift+Enter';add.disabled=inputs.length>=100;add.addEventListener('click',()=>editList(id,[...inputs.map(input=>input.value),''],inputs.length));form.append(add);}
      const actions=document.createElement('div');actions.className='writing-actions';
      const submit=document.createElement('button');submit.type='submit';submit.className='quiet-button note-save';submit.textContent=task.checked?translateUI("Gem note"):translateUI("Læg noten her");
      const message=document.createElement('p');message.className='form-message';message.setAttribute('role','status');message.hidden=true;
      const secondary=document.createElement('div');secondary.className='note-secondary-actions';
      if((task.temporaryDay||task.permanentNote)&&task.writingAnswer?.length){
        const remove=document.createElement('button');remove.type='button';remove.className='quiet-button note-delete';remove.textContent=translateUI("Slet note");
        remove.addEventListener('click',()=>confirmAction('delete'));secondary.append(remove);
      }
      if(task.writing.mode!=='media'){
        const copy=document.createElement('button');copy.type='button';copy.className='quiet-button note-copy';copy.innerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M10 8 Q8 8 5 8 L4 25 Q4 27 7 27 L21 28 Q23 28 23 25 L23 24 M11 4 Q17 3 25 4 Q28 4 28 7 L27 21 Q27 23 24 23 L11 22 Q9 22 9 19 L10 6 Q10 4 11 4Z"/><path class="copy-fine" d="M12 5 Q18 4 25 5 M5 11 5 24 Q5 26 8 26 M11 21 Q17 22 24 22"/></svg><span></span>';
        copy.querySelector('span').textContent=translateUI('Kopiér tekst');
        copy.addEventListener('click',async()=>{
          const text=inputs.map(input=>input.value).join('\n');
          try{await root.navigator.clipboard.writeText(text);message.textContent=translateUI("Teksten er kopieret.");}
          catch{message.textContent=translateUI("Kunne ikke kopiere. Markér teksten og kopiér den manuelt.");}
          message.hidden=false;
        });secondary.append(copy);
      }
      actions.append(secondary);if(lifetime)actions.append(lifetime);actions.append(submit);
      const confirmation=document.createElement('section');confirmation.className='note-discard-confirm';confirmation.hidden=true;confirmation.setAttribute('role','alertdialog');confirmation.setAttribute('aria-modal','true');confirmation.setAttribute('aria-label',translateUI("Kassér ændringer"));
      const confirmClose=document.createElement('button');confirmClose.type='button';confirmClose.className='note-confirm-close';confirmClose.setAttribute('aria-label',translateUI("Luk bekræftelse"));root.MorningPaper.closeIcon(confirmClose,task.boxSeed);confirmClose.addEventListener('click',()=>confirmAction(null));
      const warning=document.createElement('p');warning.textContent=translateUI("Du har ændringer, der ikke er gemt. Vil du kassere dem?");
      const choices=document.createElement('div'),keep=document.createElement('button'),drop=document.createElement('button');keep.type=drop.type='button';keep.className='quiet-button note-keep-editing';keep.textContent=translateUI("Fortsæt med at redigere");drop.className='quiet-button note-discard';drop.textContent=translateUI("Kassér ændringer");keep.addEventListener('click',()=>confirmAction(null));drop.addEventListener('click',()=>confirmation.dataset.action==='delete'?deleteNote():discard());choices.append(keep,drop);confirmation.append(confirmClose,warning,choices);
      form.addEventListener('dragover',event=>{if(event.dataTransfer?.types?.includes('Files'))event.preventDefault();});form.addEventListener('drop',async event=>{if(!event.dataTransfer?.files?.length||event.target.closest('.media-drop-zone'))return;event.preventDefault();event.stopPropagation();if(event.dataTransfer.files.length!==1){message.textContent=translateUI("Vælg én fil ad gangen.");message.hidden=false;return;}message.textContent=translateUI("Gør filen klar …");message.hidden=false;try{const asset=await root.MorningMedia.importFile(event.dataTransfer.files[0]);if(active!==id)return;model.configureWriting(editState(),id,{...session.task.writing,mode:'media',count:1,asset,mat:'small'});open(id,true);}catch(error){message.textContent=error.message;}});
      form.append(penRule(task.boxSeed^0x73d0a1c5,'note-footer-rule'),actions,message,confirmation);pad.append(form);if(!composer.open)composer.showModal();
      form.addEventListener('submit',event=>{
        event.preventDefault();checkNewDay();if(active!==id)return;
        try{const values=session.task.writing.mode==='media'?[session.task.writing.asset?.name||'']:inputs.map(field=>field.value);if(!model.submitWriting(clone(editState()),id,values))return;
          const task=getState().tasks.find(t=>t.id===id);if(!task)return;
          for(const key of editFields){if(Object.prototype.hasOwnProperty.call(session.task,key))task[key]=clone(session.task[key]);else delete task[key];}
          const current=model.submitWriting(getState(),id,values);if(!current)return;root.MorningSound?.noteSetdown?.();close();onSubmit(current);sync();}
        catch(error){message.textContent=error.message;message.hidden=false;}
      });
      if(!refresh)animate(pad,[{opacity:0,transform:'translateY(8px) rotate(-1deg)'},{opacity:1,transform:'translateY(0) rotate(0deg)'}],440);
      if(optionsOpen!==undefined&&pad.querySelector('.note-options'))pad.querySelector('.note-options').open=optionsOpen;if(focusClass)pad.querySelector('.'+focusClass)?.focus({preventScroll:true});
      layout();if(!refresh)inputs[0]?.focus({preventScroll:true});
    }
    function sync(){
      const state=getState();if(state.day!==day){day=state.day;close();}
      if(active){const task=state.tasks.find(t=>t.id===active);if(!task?.writing||task.noteArchived||!task.writingAnswer?.length&&!model.scheduled(state,task)||model.deferStatus(state,active))close();else if(activeKind!==`${session.task.writing.mode}:${model.writingCount(session.task)}`)open(active,true);else pad.querySelectorAll('.writing-input').forEach((input,i)=>{const value=(session.task.writingDraft||session.task.writingAnswer||[])[i]||'';if(input.value!==value)input.value=value;});}
      document.querySelectorAll('.writing-task').forEach(button=>button.setAttribute('aria-expanded',String(button.closest('li[data-task-id]')?.dataset.taskId===active)));
      const notes=state.tasks.filter(t=>t.writing&&!t.noteArchived&&t.checked&&t.writingAnswer?.length);
      const ids=new Set(notes.map(task=>task.id));
      for(const [id,entry] of cards)if(!ids.has(id)){entry.deferControls?.forEach(control=>control.dispose());mobile.remove(id);entry.card.remove();cards.delete(id);drag.remove(id);}
      board.hidden=!notes.length;
      notes.forEach(task=>{
        const signature=JSON.stringify([task.text,task.permanentNote,task.writing,task.writingAnswer,(task.writingItems||[]).map(item=>[item.id,item.text])]);
        let entry=cards.get(task.id);
        if(entry&&entry.signature!==signature&&!entry.card.querySelector('.scribbling')){entry.deferControls?.forEach(control=>control.dispose());mobile.remove(task.id);entry.card.remove();cards.delete(task.id);drag.remove(task.id);entry=null;}
        if(!entry){
          const card=document.createElement('article');card.className='saved-note';card.classList.toggle('permanent-note',!!task.permanentNote);root.MorningPaper.paper(card,task.boxSeed,task.writing);card.classList.toggle('media-note',task.writing.mode==='media');
          const grip=document.createElement('div');grip.className='note-grip';
          const noteTitle=root.MorningPaper.title(task);card.classList.toggle('note-untitled',!noteTitle);if(noteTitle){const title=document.createElement('h2');title.textContent=noteTitle;grip.append(title);}
          const asTasks=task.writing.asTasks!==false,style=task.writing.listStyle||'disc';
          const content=document.createElement(asTasks?'ul':task.writing.mode==='list'?(style==='disc'?'ul':'ol'):'p');content.className='note-content';if(!asTasks&&task.writing.mode==='list'){content.classList.add('note-plain-list');content.setAttribute('data-list-style',style);}
          const items=new Map(),deferControls=[];
          if(asTasks)for(const item of task.writingItems||[]){
            const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.className='task note-task restored';if(task.writing.mode==='note'||task.writing.mode==='media')button.classList.add('note-single-task');button.setAttribute('role','checkbox');button.setAttribute('aria-checked',String(item.checked));
            button.innerHTML='<span class="box" aria-hidden="true"><svg class="box-outline" viewBox="0 0 30 30"><path/></svg><svg class="check" viewBox="0 0 40 38"><path pathLength="1" d="M7 23 Q11 26 16 32 Q22 19 35 5"/><path class="fine" pathLength="1" d="M6 24 15 33 Q22 22 36 5"/></svg></span><span class="label"><span class="text"></span><svg class="strike" aria-hidden="true"></svg><svg class="defer-strike" aria-hidden="true"></svg></span>';
            format.render(button.querySelector('.text'),task.writing.mode==='media'?translateUI("Færdig"):item.text);drawBox(button,item.boxSeed);
            const defer=document.createElement('button');defer.type='button';defer.className='quiet-button defer-button';defer.innerHTML='<svg viewBox="0 0 30 30" aria-hidden="true"><path d="M5 15 Q7 9 12 6 Q8 15 4 24 Q8 13 16 7 Q13 17 11 23 Q15 13 20 8 Q19 17 18 24 Q21 15 25 8"/><path class="defer-icon-detail" d="M6 16 Q10 10 13 7 M13 22 Q17 14 21 9"/></svg>';
            li.append(button,defer);content.append(li);items.set(item.id,button);setItemState(button,item);
            const control=deferralUI.attach(li,button,defer);deferControls.push(control);
            defer.addEventListener('click',()=>{
              if(button.classList.contains('scribbling'))return;checkNewDay();const current=model.deferWritingItem(getState(),task.id,item.id);if(!current)return;
              control.hide();button.classList.remove('restored');if(current.deferred){drawDeferral(button,current);button.getBoundingClientRect();}setItemState(button,current);onDefer(button,current);button.focus({preventScroll:true});
            });
            button.addEventListener('click',()=>{
              if(button.classList.contains('scribbling'))return;checkNewDay();const current=model.toggleWritingItem(getState(),task.id,item.id);if(!current)return;
              control.hide();button.classList.remove('restored');if(current.checked)drawMarks(button,current.markSeed);button.setAttribute('aria-checked',String(current.checked));onToggle(button,current);
            });
          }else if(task.writing.mode==='list'){for(const answer of task.writingAnswer){const li=document.createElement('li');format.render(li,answer);content.append(li);}}else if(task.writing.mode!=='media')format.render(content,task.writingAnswer[0]);
          const edit=document.createElement('button');edit.type='button';edit.className='quiet-button note-edit';edit.setAttribute('aria-label',translateUI("Rediger note"));edit.title=translateUI("Rediger note");edit.innerHTML='<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M8 24 Q15 14 24 5 Q27 3 30 6 L32 9 Q33 11 30 14 L15 29 5 33 Z M8 24 15 29 M23 6 30 13 M6 32 9 29 M11 24 27 8"/><path class="note-pencil-fine" d="M12 26 Q20 18 29 10 M25 5 32 10 M5 33 10 31"/></svg>';edit.addEventListener('click',()=>open(task.id));
          const archive=document.createElement('button');archive.type='button';archive.className='quiet-button note-archive';archive.setAttribute('aria-label',translateUI("Arkivér note for i dag"));archive.title=translateUI("Arkivér for i dag");
          if(task.permanentNote){archive.setAttribute('aria-label',translateUI("Arkivér note"));archive.title=translateUI("Arkivér note");}
          archive.innerHTML='<svg viewBox="0 0 40 38" aria-hidden="true"><path d="M8 15 9 30 Q18 31 29 29 L30 14 M6 10 Q18 8 32 10 L31 15 Q18 16 6 15Z M13 9 12 4 Q18 3 24 4 L25 9"/><path d="M15 21 Q19 20 24 21 L23 24 15 24Z"/><path class="archive-fine" d="M10 13 Q20 12 29 13 M15 6 22 6"/></svg>';
          archive.addEventListener('click',()=>{checkNewDay();if(!model.archiveNote(getState(),task.id))return;root.MorningSound?.noteSetdown?.();save(true,0);onArchive();sync();});
          const resize=document.createElement('button');resize.type='button';resize.className='note-resize';resize.setAttribute('aria-label',translateUI("Tilpas notens størrelse"));resize.title=translateUI("Træk for at ændre størrelse · piletaster for finjustering");
          resize.innerHTML='<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M8 23 Q17 15 23 8 M14 24 Q20 19 24 14 M21 24 Q23 23 24 21"/><path class="resize-fine" d="M9 21 Q17 13 22 9 M16 23 23 16"/></svg>';
          // Reveal chrome only after a short, completed tap on the paper itself.
          // A task tap, hold, resize or scroll must retain its own gesture.
          let paperTap=null;
          card.addEventListener('pointerdown',event=>{
            paperTap=null;if((event.pointerType!=='touch'&&event.pointerType!=='pen')||event.isPrimary===false||event.target.closest('button')||event.target.closest('input')||event.target.closest('textarea')||event.target.closest('select')||event.target.closest('a'))return;
            paperTap={id:event.pointerId,x:event.clientX,y:event.clientY,at:Date.now()};
          });
          card.addEventListener('pointermove',event=>{if(paperTap?.id===event.pointerId&&Math.hypot(event.clientX-paperTap.x,event.clientY-paperTap.y)>10)paperTap=null;});
          card.addEventListener('pointercancel',()=>{paperTap=null;});
          card.addEventListener('pointerup',event=>{
            const tap=paperTap;paperTap=null;
            if(tap?.id===event.pointerId&&Date.now()-tap.at<500&&Math.hypot(event.clientX-tap.x,event.clientY-tap.y)<=10)card.classList.add('note-controls-visible');
          });
          card.append(...root.MorningPaper.pins(task),grip);if(task.writing.mode==='media'){const media=document.createElement('div');media.className='note-media';root.MorningMedia.mount(media,task.writing);card.append(media);}card.append(content,edit,archive,resize);board.append(card);drag.attach(card,grip,task.id,resize);mobile.attach(card,grip,task);entry={card,items,deferControls,archive,signature};cards.set(task.id,entry);
          animate(card,[{opacity:0,transform:'translateY(-10px) rotate(-3deg)'},{opacity:1,transform:'translateY(0)'}],440);
        }
        entry.archive.hidden=!model.canArchiveNote(task);entry.card.classList.toggle('media-completed',task.writing.mode==='media'&&model.noteComplete(task));
        for(const item of task.writingItems||[]){const button=entry.items.get(item.id);if(button&&!button.classList.contains('scribbling'))setItemState(button,item);}
      });
      layout();
    }
    function layout(){
      for(const task of getState().tasks)for(const item of task.writingItems||[]){const button=cards.get(task.id)?.items.get(item.id);if(button&&!button.classList.contains('scribbling')){drawMarks(button,item.markSeed);drawDeferral(button,item);}}
      mobile.layout();drag.layout();
    }
    return {open,newNote,close,sync,layout};
  }
  root.MorningWriting={create};
})(window);
