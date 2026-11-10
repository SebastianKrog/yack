(function(root) {
  'use strict';
  const {t:translateUI}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
  function create({model,getState,format,deferralUI,drawBox,drawCheck,drawMarks,drawDeferral,commitScribble,save,checkNewDay,redrawLater,reducedMotion}) {
    function syncText(row,task) {
      let changed=false;
      row.querySelectorAll('.xor-option').forEach((option,i)=>{
        const text=option.querySelector('.text'),source=i===0?task.text:task.xor.otherText;
        if(text.dataset.source!==source){format.render(text,source);changed=true;}
      });return changed;
    }
    function setRowState(row,task) {
      const group=row.querySelector('.task');
      group.classList.toggle('checked',task.checked);group.classList.toggle('deferred',task.deferred);
      group.setAttribute('aria-label',translateUI("{0} ELLER {1}", format.plain(task.text), format.plain(task.xor.otherText)));
      group.querySelector('.xor-checkbox').setAttribute('aria-checked',String(task.checked));
      row.querySelectorAll('.xor-option').forEach((option,i)=>{
        const status=model.choiceStatus(getState(),task.id,i),text=i===0?task.text:task.xor.otherText;
        option.classList.toggle('completed',status==='completed');option.classList.toggle('deferred',status==='active'||status==='passive');
        option.setAttribute('aria-pressed',String(status==='completed'));
        option.setAttribute('aria-disabled',String(status==='active'||status==='passive'));
        option.setAttribute('aria-label',`${format.plain(text)}${status==='passive'?translateUI(" — Passivt udskudt"):status==='active'?translateUI(" — Udskudt"):''}`);
      });
      const defer=row.querySelector('.defer-button');defer.setAttribute('aria-pressed',String(task.deferred));
      defer.setAttribute('aria-label',task.deferred?translateUI("Fortryd udsættelse af begge muligheder"):translateUI("Udskyd begge muligheder"));
    }
    function drawRow(row,task) {
      const group=row.querySelector('.task');drawCheck(group,task.markSeed);
      row.querySelectorAll('.xor-option').forEach((option,i)=>{
        drawMarks(option,(task.markSeed^(i?2654435761:0))>>>0);
        if(task.deferred)option.querySelector('.defer-strike').replaceChildren();
        else drawDeferral(option,{...task,deferSeed:(task.deferSeed^(i?2654435761:0))>>>0},true);
      });
      if(task.deferred)drawDeferral(group,task,false,true);
      else group.querySelector('.xor-group-defer-strike').replaceChildren();
      group.dataset.deferSeed=String(task.deferSeed);
    }
    function makeRow(task) {
      const row=document.createElement('li');row.dataset.taskId=task.id;row.dataset.xorId=task.xor.otherId;
      const group=document.createElement('div');group.className='task xor-task restored';group.setAttribute('role','group');
      group.innerHTML='<span class="box xor-checkbox" role="checkbox" aria-disabled="true" aria-checked="false"><svg class="box-outline" viewBox="0 0 30 30" aria-hidden="true"><path/></svg><svg class="check" viewBox="0 0 40 38" aria-hidden="true"><path pathLength="1" d="M7 23 Q11 26 16 32 Q22 19 35 5"/><path class="fine" pathLength="1" d="M6 24 15 33 Q22 22 36 5"/></svg></span><div class="xor-options"></div>';
      group.querySelector('.xor-checkbox').setAttribute('aria-label',translateUI('Valg fuldført'));
      for(let i=0;i<2;i++) {
        if(i===1){const or=document.createElement('span');or.className='xor-or';or.textContent=translateUI("ELLER");group.querySelector('.xor-options').append(or);}
        const option=document.createElement('button');option.type='button';option.className='xor-option';
        option.innerHTML='<span class="label"><span class="text"></span><svg class="strike" aria-hidden="true"></svg><svg class="defer-strike" aria-hidden="true"></svg></span>';
        option.addEventListener('click',()=>{
          if(group.classList.contains('scribbling'))return;
          checkNewDay();const previous=getState().tasks.find(t=>t.id===task.id);
          const steps=previous?.checked?root.MorningScribbles.stages(group,{xorChoice:previous.xor.choice,reverse:true}):null;
          const current=model.toggle(getState(),task.id,i);if(!current)return;root.MorningEmphasis?.apply(row,current,getState());
          row.deferControl.hide();group.classList.remove('restored');
          if(current.checked){drawRow(row,current);group.getBoundingClientRect();}
          setRowState(row,current);
          commitScribble(group,current.checked?{xorChoice:i}:{steps});
        });group.querySelector('.xor-options').append(option);
      }
      const groupStrike=document.createElementNS('http://www.w3.org/2000/svg','svg');
      groupStrike.setAttribute('class','defer-strike xor-group-defer-strike');groupStrike.setAttribute('aria-hidden','true');
      group.querySelector('.xor-options').append(groupStrike);
      const defer=document.createElement('button');defer.type='button';defer.className='quiet-button defer-button';
      defer.innerHTML='<svg viewBox="0 0 30 30" aria-hidden="true"><path d="M5 15 Q7 9 12 6 Q8 15 4 24 Q8 13 16 7 Q13 17 11 23 Q15 13 20 8 Q19 17 18 24 Q21 15 25 8"/><path class="defer-icon-detail" d="M6 16 Q10 10 13 7 M13 22 Q17 14 21 9"/></svg>';
      defer.addEventListener('click',()=>{
        if(group.classList.contains('scribbling'))return;
        checkNewDay();const current=model.defer(getState(),task.id);if(!current)return;root.MorningEmphasis?.apply(row,current,getState());
        row.deferControl.hide();group.classList.remove('restored');
        if(current.deferred){drawRow(row,current);group.getBoundingClientRect();}
        setRowState(row,current);
        commitScribble(group,{defer:true,reverse:!current.deferred});group.querySelector('.xor-option').focus({preventScroll:true});
      });
      row.append(group,defer);syncText(row,task);drawBox(group,task.boxSeed);
      row.deferControl=deferralUI.attach(row,group,defer);setRowState(row,task);return row;
    }
    return {makeRow,setRowState,syncText,drawRow};
  }
  root.MorningXorUI={create};
})(window);
