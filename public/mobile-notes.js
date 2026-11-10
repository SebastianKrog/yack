(function(root){
  'use strict';
  const {t:translateUI}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
  const width=112,height=100,holdTime=650;
  const mediaModel=typeof module!=='undefined'&&module.exports?require('./media-model.js'):root.MorningMediaModel;
  function miniatureSize(note){if(note?.writing?.mode!=='media'||!mediaModel.validAsset(note.writing.asset))return {width,height};const ratio=mediaModel.ratio(note.writing);return ratio>=1?{width,height:width/ratio}:{width:width*ratio,height:width};}
  function bounds(viewWidth,viewHeight,menuBottom=64,size={width,height}){return {left:8,top:menuBottom+4,right:Math.max(8,viewWidth-size.width-8),bottom:Math.max(menuBottom+4,viewHeight-size.height-12)};}
  function clamp(point,b){return {x:Math.max(b.left,Math.min(b.right,point.x)),y:Math.max(b.top,Math.min(b.bottom,point.y))};}
  function pagePosition(point,b,scrollY=0){const p=clamp(point,b);return {x:(p.x-b.left)/(b.right-b.left||1),y:p.y+scrollY,space:'page'};}
  function placedPoint(position,b){return {x:b.left+position.x*(b.right-b.left),y:position.y};}
  function create({getState,model,save,board,onLayout=()=>{}}){
    const desktop=root.matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)'),entries=new Map();
    const layer=document.querySelector('#mobile-notes-layer'),dialog=document.querySelector('#mobile-note-view'),content=document.querySelector('#mobile-note-content'),drop=document.querySelector('#mobile-note-drop'),shield=document.querySelector('#mobile-note-drag-shield'),closeButton=document.querySelector('#mobile-note-close');
    let held=null,pending=null,holdTimer,expanded=null,ignoreClickUntil=0;
    const task=id=>getState().tasks.find(t=>t.id===id);
    const viewport=id=>bounds(root.visualViewport?.width||root.innerWidth,root.visualViewport?.height||root.innerHeight,document.querySelector('.top-menu')?.getBoundingClientRect().bottom||64,miniatureSize(task(id)));
    const pageBounds=id=>bounds(document.documentElement?.clientWidth||root.innerWidth,root.innerHeight,64,miniatureSize(task(id)));
    const restingPoint=(id,position)=>placedPoint(position,pageBounds(id));
    const isDrop=event=>event.clientY>=(root.visualViewport?.height||root.innerHeight)-104;
    function place(mini,p){mini.style.setProperty('--mobile-note-x',`${p.x}px`);mini.style.setProperty('--mobile-note-y',`${p.y}px`);}
    function layout(){
      for(const [id,entry] of entries){
        if(held?.id===id)continue;
        const position=task(id)?.noteMobilePosition,small=!desktop.matches&&!!position;
        entry.card.classList.toggle('mobile-note-stowed',small&&expanded!==id);
        entry.mini.hidden=!small||expanded===id;
        if(small)place(entry.mini,restingPoint(id,position));
      }
    }
    function closeView(){if(dialog.open){dialog.close();returned();}}
    function returned(playSound=true){
      if(!expanded)return;const id=expanded,entry=entries.get(id);expanded=null;
      if(entry){board.append(entry.card);entry.card.classList.remove('mobile-note-expanded');}
      if(playSound!==false)root.MorningSound?.noteSetdown?.();layout();onLayout();if(entry&&!entry.mini.hidden)entry.mini.focus({preventScroll:true});
    }
    dialog.addEventListener('close',returned);dialog.addEventListener('cancel',event=>{event.preventDefault();closeView();});closeButton.addEventListener('click',closeView);
    function openView(id){
      if(desktop.matches||Date.now()<ignoreClickUntil)return;const entry=entries.get(id);if(!entry)return;
      if(dialog.open)closeView();expanded=id;entry.card.classList.remove('mobile-note-stowed');entry.card.classList.add('mobile-note-expanded');content.append(entry.card);entry.mini.hidden=true;dialog.showModal();root.MorningSound?.notePickup?.();onLayout();closeButton.focus({preventScroll:true});
    }
    function stopPending(){clearTimeout(holdTimer);pending=null;}
    function finish(event,canceled=false){
      stopPending();if(!held||event&&event.pointerId!==held.pointer)return;
      const current=held;held=null;drop.hidden=true;shield.hidden=true;drop.classList.remove('drop-ready');current.mini.classList.remove('mobile-note-dragging');
      ignoreClickUntil=Date.now()+600;
      try{if(!current.touchGesture)current.captureTarget.releasePointerCapture?.(current.pointer);}catch{}
      if(!canceled){model.moveMobileNote(getState(),current.id,event&&isDrop(event)?null:pagePosition(current.point,{...viewport(current.id),right:pageBounds(current.id).right},root.scrollY||0));save(false);}
      root.MorningSound?.noteSetdown?.();layout();onLayout();
    }
    function cancel(){stopPending();finish(null,true);}
    function pickup(current,event=current){
      stopPending();const entry=entries.get(current.id);if(!entry)return;
      held={id:current.id,pointer:current.pointer,touchGesture:current.touchGesture,captureTarget:document.body,mini:entry.mini,offset:current.offset,point:clamp({x:event.clientX-current.offset.x,y:event.clientY-current.offset.y},viewport(current.id))};
      // Capture on a stable element before changing the note's layout.
      // A temporary capture loss on the moving preview must not end a drag.
      try{if(!current.touchGesture)held.captureTarget.setPointerCapture?.(current.pointer);}catch{}
      if(expanded===current.id){returned(false);dialog.close();}
      shield.hidden=false;
      entry.card.classList.add('mobile-note-stowed');entry.card.classList.remove('note-controls-visible');entry.mini.hidden=false;entry.mini.classList.add('mobile-note-dragging');place(entry.mini,held.point);drop.hidden=false;
      root.MorningSound?.notePickup?.();
    }
    function startHold(event,id,compact=false){
      if(desktop.matches||held||(expanded&&(expanded!==id||task(id)?.writing?.mode!=='media'))||event.isPrimary===false||event.pointerType==='mouse'&&event.button!==0)return;
      stopPending();ignoreClickUntil=0;
      const rect=compact?entries.get(id).mini.getBoundingClientRect():null;
      const {width,height}=miniatureSize(task(id));
      const offset=rect?{x:Math.max(0,Math.min(width,event.clientX-rect.left)),y:Math.max(0,Math.min(height,event.clientY-rect.top))}:{x:width/2,y:36};
      pending={id,pointer:event.pointerId,touchGesture:event.touchGesture,clientX:event.clientX,clientY:event.clientY,compact,offset};
      holdTimer=setTimeout(()=>{if(pending)pickup(pending);},holdTime);
    }
    function move(event){
      if(pending?.pointer===event.pointerId&&Math.hypot(event.clientX-pending.clientX,event.clientY-pending.clientY)>10)stopPending();
      if(!held||held.pointer!==event.pointerId)return;
      if(event.pointerType==='mouse'&&event.buttons===0){finish(event);return;}
      event.preventDefault();event.stopPropagation?.();held.point=clamp({x:event.clientX-held.offset.x,y:event.clientY-held.offset.y},viewport(held.id));place(held.mini,held.point);drop.classList.toggle('drop-ready',isDrop(event));
    }
    document.addEventListener('pointermove',move,{capture:true,passive:false});
    document.addEventListener('pointerup',event=>{if(held?.pointer===event.pointerId){event.preventDefault();event.stopPropagation?.();finish(event);}else if(pending?.pointer===event.pointerId)stopPending();},{capture:true,passive:false});
    document.addEventListener('pointercancel',event=>{if(held?.pointer===event.pointerId||pending?.pointer===event.pointerId)cancel();},{capture:true});
    document.addEventListener('pointerdown',event=>{if(event.isPrimary===false)cancel();});
    shield.addEventListener('contextmenu',event=>event.preventDefault());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});root.addEventListener?.('blur',cancel);
    function bindHoldSurface(surface,id,compact=false){
        surface.addEventListener('pointerdown',event=>{if(event.pointerType!=='touch')startHold(event,id,compact);});
        // Let native scrolling win until a stationary hold actually picks up the
        // note. Touch events can then cancel scrolling for that active gesture;
        // changing touch-action after pointerdown would be too late.
        const touchEvent=(event,touch)=>({pointerType:'touch',pointerId:'touch:'+touch.identifier,touchGesture:true,isPrimary:true,clientX:touch.clientX,clientY:touch.clientY,preventDefault:()=>event.preventDefault(),stopPropagation:()=>event.stopPropagation()});
        surface.addEventListener('touchstart',event=>{if(event.touches.length!==1){cancel();return;}startHold(touchEvent(event,event.touches[0]),id,compact);},{passive:true});
        surface.addEventListener('touchmove',event=>{
          const current=held||pending;if(!current?.touchGesture||current.id!==id)return;
          if(event.touches.length!==1){cancel();return;}
          const touch=[...event.touches].find(t=>'touch:'+t.identifier===current.pointer);if(!touch)return;
          move(touchEvent(event,touch));
        },{passive:false});
        surface.addEventListener('touchend',event=>{
          const current=held||pending;if(!current?.touchGesture||current.id!==id)return;
          const touch=[...event.changedTouches].find(t=>'touch:'+t.identifier===current.pointer);if(!touch)return;
          if(held){event.preventDefault();finish(touchEvent(event,touch));}else stopPending();
        },{passive:false});
        surface.addEventListener('touchcancel',()=>{if((held||pending)?.id===id&&(held||pending)?.touchGesture)cancel();},{passive:true});
        surface.addEventListener('pointercancel',()=>{if(pending?.touchGesture&&pending.id===id)stopPending();});
    }
    function attach(card,grip,note){
      const mini=document.createElement('button');mini.type='button';mini.draggable=false;mini.className='mobile-note-mini';mini.hidden=true;const noteTitle=root.MorningFormatting.plain(root.MorningPaper.title(note));mini.setAttribute('aria-label',noteTitle?translateUI("Åbn note: {0}", noteTitle):translateUI("Åbn note"));mini.classList.toggle('note-untitled',!noteTitle);
      const size=miniatureSize(note);mini.style.setProperty('--mobile-note-width',`${size.width}px`);mini.style.setProperty('--mobile-note-height',`${size.height}px`);
      root.MorningPaper.paper(mini,note.boxSeed,note.writing);mini.classList.toggle('permanent-note',!!note.permanentNote);mini.append(...root.MorningPaper.pins(note));
      if(noteTitle){const title=document.createElement('strong');title.textContent=noteTitle;mini.append(title);}
      const preview=document.createElement('span');preview.className='mobile-note-preview';if(note.writing.mode==='media'&&root.MorningMedia)root.MorningMedia.mount(preview,note.writing,{compact:true,interactive:false});else preview.textContent=(note.writingAnswer||[]).map(root.MorningFormatting.plain).join('\n');mini.append(preview);layer.append(mini);entries.set(note.id,{card,mini});
      grip.addEventListener('pointerdown',event=>{if(!event.target.closest('button'))startHold(event,note.id);});bindHoldSurface(mini,note.id,true);
      if(note.writing.mode==='media'){
        // A short tap opens the file; a deliberate hold picks up its pinned note.
        const surface=card.querySelector('.note-media');
        bindHoldSurface(surface,note.id);
        surface.addEventListener('contextmenu',event=>{if(!desktop.matches)event.preventDefault();});
        card.addEventListener('click',event=>{if(event.target.closest('.media-frame')&&Date.now()<ignoreClickUntil){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
      }
      for(const element of [grip,mini])element.addEventListener('contextmenu',event=>{if(!desktop.matches)event.preventDefault();});
      mini.addEventListener('dragstart',event=>event.preventDefault());
      mini.addEventListener('click',event=>{if(Date.now()<ignoreClickUntil){event.preventDefault();event.stopImmediatePropagation();return;}openView(note.id);});
      layout();
    }
    function remove(id){if(held?.id===id||pending?.id===id)cancel();if(expanded===id){closeView();returned();}entries.get(id)?.mini.remove();entries.delete(id);}
    desktop.addEventListener?.('change',()=>{cancel();closeView();returned();layout();});root.addEventListener?.('resize',layout);root.visualViewport?.addEventListener('resize',layout);
    return {attach,remove,layout,close:closeView};
  }
  const api={miniatureSize,pagePosition,placedPoint,create,bounds,clamp};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MorningMobileNotes=api;
})(typeof window!=='undefined'?window:globalThis);
