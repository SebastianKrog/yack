(function(root) {
  'use strict';
  const {t:translateUI}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
  function projectAt(model,state,id,startDepth,startX,x,y,rects) {
    const ordered=model.ordered(state).filter(t=>!t.temporaryDay&&!t.permanentNote);
    const remaining=ordered.filter(t=>t.id!==id&&!model.dependsOn(state,t.id,id));
    const candidates=rects.filter(r=>r.id===id||remaining.some(t=>t.id===r.id));
    if(!candidates.length)return null;
    let target=candidates.find(r=>y>=r.top&&y<=r.bottom);
    if(!target)target=candidates.reduce((best,r)=>Math.abs(y-(r.top+r.bottom)/2)<Math.abs(y-(best.top+best.bottom)/2)?r:best);
    const after=y>(target.top+target.bottom)/2;
    const index=target.id===id?ordered.findIndex(t=>t.id===id):remaining.findIndex(t=>t.id===target.id)+(after?1:0);
    const depth=startDepth+Math.round((x-startX)/24);
    return {...model.project(state,id,index,depth),targetId:target.id,after:target.id===id?false:after};
  }
  function create({model,getState,list,editor,onCommit}) {
    let gesture=null,frame;
    function clearMarkers(){for(const row of list.children)row.classList.remove('drop-before','drop-after','drop-parent');}
    function clean(){
      cancelAnimationFrame(frame);clearMarkers();
      for(const row of list.children)row.classList.remove('dragging');
      gesture?.preview?.remove();
      gesture?.indicator?.remove();
      gesture?.connector?.remove();
      editor.classList.remove('is-dragging');
    }
    function updateTarget(){
      if(!gesture?.moving)return;
      const rects=Array.from(list.children).map(row=>{const r=row.getBoundingClientRect();return {id:row.dataset.taskId,top:r.top,bottom:r.bottom};});
      gesture.location=projectAt(model,getState(),gesture.id,gesture.depth,gesture.startX,gesture.x,gesture.y,rects);
      clearMarkers();
      const location=gesture.location;
      if(location){
        const row=Array.from(list.children).find(r=>r.dataset.taskId===location.targetId);
        const rowRect=row.getBoundingClientRect(),listRect=list.getBoundingClientRect();
        const left=listRect.left+location.depth*24,right=listRect.left+listRect.width;
        const top=location.after?rowRect.bottom:rowRect.top;
        const parent=getState().tasks.find(t=>t.id===location.parentId);
        gesture.indicator.style.left=`${left}px`;gesture.indicator.style.top=`${top}px`;
        gesture.indicator.style.width=`${Math.max(40,right-left)}px`;
        const parentText=parent?`${parent.text}${parent.xor?translateUI(" ELLER {0}", parent.xor.otherText):''}`:'';
        gesture.label.textContent=translateUI("Niveau {0} · {1}", location.depth+1, parent?translateUI("Efter {0}", root.MorningFormatting?.plain(parentText)??parentText):translateUI("Ingen afhængighed"));
        gesture.label.title=gesture.label.textContent;
        const parentRow=parent?Array.from(list.children).find(r=>r.dataset.taskId===parent.id):null;
        gesture.connector.hidden=!parentRow;
        if(parentRow){
          parentRow.classList.add('drop-parent');const parentRect=parentRow.getBoundingClientRect();
          const branchLeft=parentRect.left+12,branchTop=parentRect.top+parentRect.height/2;
          Object.assign(gesture.connector.style,{left:`${branchLeft}px`,top:`${branchTop}px`,width:`${Math.max(6,left-branchLeft)}px`,height:`${Math.max(0,top-branchTop)}px`});
        }
        // Show the resulting tier, rather than the cursor's unconstrained x.
        const width=Math.max(100,right-left),difference=width-gesture.originalWidth;
        gesture.preview.style.left=`${left}px`;gesture.preview.style.width=`${width}px`;
        for(const clone of gesture.preview.children)clone.style.width=`${Math.max(100,Number(clone.dataset.originalWidth)+difference)}px`;
      }
      gesture.preview.style.transform=`translateY(${gesture.y-gesture.startY}px)`;
    }
    function startMoving(){
      gesture.moving=true;
      const branch=new Set(model.branch(getState(),gesture.id).map(t=>t.id));
      const rows=Array.from(list.children).filter(row=>branch.has(row.dataset.taskId));
      const origin=rows[0].getBoundingClientRect(),preview=document.createElement('div');
      preview.className='editor-drag-preview';preview.setAttribute('aria-hidden','true');preview.inert=true;
      Object.assign(preview.style,{left:`${origin.left}px`,top:`${origin.top}px`,width:`${origin.width}px`});
      for(const row of rows){
        const rect=row.getBoundingClientRect(),clone=document.createElement('div'),task=getState().tasks.find(t=>t.id===row.dataset.taskId);
        clone.className='drag-preview-row';clone.textContent=root.MorningFormatting?.plain(task.text+(task.xor?' / '+task.xor.otherText:''))??task.text;clone.dataset.originalWidth=String(rect.width);
        Object.assign(clone.style,{margin:'0',marginLeft:`${rect.left-origin.left}px`,width:`${rect.width}px`});
        preview.append(clone);row.classList.add('dragging');
      }
      const indicator=document.createElement('div'),label=document.createElement('span'),connector=document.createElement('div');
      indicator.className='tree-drop-preview';indicator.setAttribute('aria-hidden','true');label.className='tree-drop-label';indicator.append(label);
      connector.className='tree-drop-connector';connector.setAttribute('aria-hidden','true');connector.hidden=true;
      editor.append(preview,connector,indicator);gesture.preview=preview;gesture.indicator=indicator;gesture.label=label;gesture.connector=connector;gesture.originalWidth=origin.width;
      editor.classList.add('is-dragging');
      function scroll(){
        if(!gesture?.moving)return;
        const rect=editor.getBoundingClientRect(),edge=42;
        const speed=gesture.y<rect.top+edge?-Math.min(15,(rect.top+edge-gesture.y)/4):gesture.y>rect.bottom-edge?Math.min(15,(gesture.y-(rect.bottom-edge))/4):0;
        if(speed){editor.scrollTop+=speed;updateTarget();}
        frame=requestAnimationFrame(scroll);
      }
      frame=requestAnimationFrame(scroll);
    }
    function finish(event,commit){
      if(!gesture||event.pointerId!==gesture.pointerId)return;
      const current=gesture;
      if(commit&&current.moving){current.x=event.clientX;current.y=event.clientY;updateTarget();}
      clean();gesture=null;
      if(current.handle.hasPointerCapture(current.pointerId))current.handle.releasePointerCapture(current.pointerId);
      if(commit&&current.moving&&current.location)onCommit(current.id,current.location);
    }
    function cancel(){
      if(!gesture)return;
      const current=gesture;clean();gesture=null;
      if(current.handle.hasPointerCapture(current.pointerId))current.handle.releasePointerCapture(current.pointerId);
    }
    function attach(handle,id){
      handle.addEventListener('pointerdown',event=>{
        if(gesture||event.isPrimary===false||(event.pointerType==='mouse'&&event.button!==0))return;
        event.preventDefault();handle.focus({preventScroll:true});
        gesture={id,handle,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,depth:model.depth(getState(),id),moving:false,location:null};
        handle.setPointerCapture(event.pointerId);
      });
      handle.addEventListener('pointermove',event=>{
        if(!gesture||event.pointerId!==gesture.pointerId)return;
        gesture.x=event.clientX;gesture.y=event.clientY;
        if(!gesture.moving&&Math.hypot(gesture.x-gesture.startX,gesture.y-gesture.startY)<6)return;
        event.preventDefault();if(!gesture.moving)startMoving();updateTarget();
      });
      handle.addEventListener('pointerup',event=>finish(event,true));
      handle.addEventListener('pointercancel',event=>finish(event,false));
      handle.addEventListener('lostpointercapture',()=>{if(gesture?.handle===handle)cancel();});
      handle.addEventListener('click',event=>event.preventDefault());
    }
    editor.addEventListener('close',cancel);
    return {attach,cancel};
  }
  const api={create,projectAt};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.MorningTaskDrag=api;
})(typeof window!=='undefined'?window:globalThis);
