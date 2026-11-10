(function(root){
  'use strict';
  const {t:translateUI}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
  // Keep the paper reachable, while allowing it over the checklist and other notes.
  function safePosition(point,size,obstacle,width){
    const margin=8,maxX=Math.max(margin,width-size.width-margin),minY=Math.max(margin,(obstacle?.menuBottom??4)+4);
    return {x:Math.max(margin,Math.min(maxX,point.x)),y:Math.max(minY,Math.min(100000,point.y))};
  }
  function relativePosition(point,anchor){return {x:point.x-anchor.x,y:point.y-anchor.y,space:'list'};}
  function pagePosition(position,anchor){return {x:position.x+anchor.x,y:position.y+anchor.y};}
  function fitSize(size,available){return {width:Math.max(180,Math.min(Math.min(1200,Math.max(180,available)),size.width)),height:Math.max(0,Math.min(2000,size.height))};}
  function create({getState,model,save,onResize=()=>{}}){
    const media=root.matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)'),cards=new Map();let gesture=null;
    const scroll=()=>root.scrollY||0;
    function listOrigin(){const rect=document.querySelector('.view-stage')?.getBoundingClientRect();return {x:(rect?.left||0)+(root.scrollX||0),y:(rect?.top||0)+scroll()};}
    function menuBounds(){const bottom=document.querySelector('.top-menu')?.getBoundingClientRect().bottom;return {menuBottom:(Number.isFinite(bottom)?bottom:64)+scroll()};}
    function obstacle(){const rect=document.querySelector('.view-stage').getBoundingClientRect(),header=document.querySelector('.page-header').getBoundingClientRect();return {left:rect.left,right:rect.right,top:header.top+scroll(),bottom:rect.bottom+scroll(),menuBottom:menuBounds().menuBottom-scroll()};}
    function apply(card,p){card.style.setProperty('--note-x',`${p.x}px`);card.style.setProperty('--note-y',`${p.y}px`);card.notePoint=p;}
    function sizeCard(card,size){if(card.mediaAspect)size={...size,height:0};card.style.setProperty('--note-width',`${size.width}px`);card.style.setProperty('--note-height',`${size.height}px`);card.noteSize=size;}
    function layout(){
      if(!media.matches){for(const [id,card] of cards){if(gesture?.card===card)continue;const size=getState().tasks.find(t=>t.id===id)?.noteSize;if(size)sizeCard(card,fitSize(size,root.innerWidth-48));}return;}
      if(document.body?.classList?.contains('profile-page-open')||document.querySelector('#editor')?.open||document.querySelector('#crown')?.classList?.contains('showing-achievements'))return;
      const bounds=obstacle(),anchor=listOrigin();let nextY=Math.max(110,bounds.top);
      for(const [id,card] of cards){
        if(!card.isConnected||gesture?.card===card)continue;
        const task=getState().tasks.find(t=>t.id===id),size=fitSize(task?.noteSize||card.noteSize||{width:240,height:0},root.innerWidth-16);sizeCard(card,size);
        const height=card.offsetHeight||card.getBoundingClientRect().height||200;
        const position=task?.notePosition||card.noteAnchor;
        const preferred=position?pagePosition(position,anchor):{x:bounds.right+36,y:nextY};
        const point=safePosition(preferred,{width:size.width,height},bounds,root.innerWidth);apply(card,point);nextY=point.y+height+28;
        if(!position)card.noteAnchor=relativePosition(point,anchor);
      }
    }
    function attach(card,handle,id,resize){
      cards.set(id,card);const config=getState().tasks.find(t=>t.id===id)?.writing;card.mediaAspect=config?.mode==='media'?root.MorningMediaModel.ratio(config):null;handle.title=translateUI("Træk for at flytte noten");
      function bind(grip,kind){
        grip.addEventListener('pointerdown',event=>{
          if(gesture||(event.pointerType==='mouse'&&event.button!==0)||(kind==='resize'&&!media.matches)||(kind==='move'&&(!media.matches||event.pointerType!=='mouse')))return;
          const r=card.getBoundingClientRect(),point=(media.matches&&card.notePoint)||{x:r.left,y:r.top+scroll()};
          gesture={card,id,kind,grip,pointer:event.pointerId,origin:{...point},size:{width:card.offsetWidth||240,height:card.offsetHeight||r.height||200},start:{x:event.clientX,y:event.clientY},moved:false};
          card.classList.add(kind==='resize'?'note-resizing':'note-dragging');if(kind==='move')root.MorningSound?.notePickup?.();
          grip.setPointerCapture?.(event.pointerId);event.preventDefault();
        });
        grip.addEventListener('pointermove',event=>{
          if(!gesture||gesture.card!==card||gesture.kind!==kind||gesture.pointer!==event.pointerId)return;
          if(event.pointerType==='mouse'&&event.buttons===0){finish(event);return;}
          const dx=event.clientX-gesture.start.x,dy=event.clientY-gesture.start.y;if(Math.hypot(dx,dy)<4&&!gesture.moved)return;
          gesture.moved=true;
          if(kind==='resize')sizeCard(card,fitSize({width:gesture.size.width+(card.mediaAspect?(Math.abs(dx)>=Math.abs(dy)?dx:dy*card.mediaAspect):dx),height:gesture.size.height+dy},root.innerWidth-gesture.origin.x-(media.matches?8:24)));
          else apply(card,safePosition({x:gesture.origin.x+dx,y:gesture.origin.y+dy},{width:card.offsetWidth||240},menuBounds(),root.innerWidth));
        });
        function finish(event){
          if(!gesture||gesture.card!==card||gesture.kind!==kind||gesture.pointer!==event.pointerId)return;
          const current=gesture;gesture=null;if(kind==='move')root.MorningSound?.noteSetdown?.();card.classList.remove('note-dragging');card.classList.remove('note-resizing');try{grip.releasePointerCapture?.(event.pointerId);}catch{}
          if(current.moved){if(kind==='resize')model.resizeNote(getState(),id,card.noteSize);else model.moveNote(getState(),id,relativePosition(card.notePoint,listOrigin()));save(false);if(kind==='resize')onResize();}
        }
        grip.addEventListener('pointerup',finish);grip.addEventListener('pointercancel',finish);grip.addEventListener('lostpointercapture',finish);
      }
      bind(handle,'move');
      if(resize){
        bind(resize,'resize');resize.addEventListener('keydown',event=>{
          if(!media.matches||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
          event.preventDefault();const size={width:card.noteSize?.width||240,height:card.offsetHeight||card.noteSize?.height||96},step=event.shiftKey?30:10;
          sizeCard(card,fitSize({width:size.width+((card.mediaAspect?{'ArrowLeft':-step,'ArrowRight':step,'ArrowUp':-step,'ArrowDown':step}:{'ArrowLeft':-step,'ArrowRight':step})[event.key]||0),height:size.height+({'ArrowUp':-step,'ArrowDown':step}[event.key]||0)},root.innerWidth-(card.notePoint?.x||8)-8));model.resizeNote(getState(),id,card.noteSize);save(false);onResize();
        });
      }
    }
    function cancel(){if(gesture){const current=gesture;gesture=null;current.card.classList.remove('note-dragging');current.card.classList.remove('note-resizing');if(current.kind==='move')apply(current.card,current.origin);else sizeCard(current.card,current.size);try{current.grip.releasePointerCapture?.(current.pointer);}catch{}}}
    function remove(id){if(gesture?.id===id)cancel();cards.delete(id);}
    root.addEventListener?.('blur',cancel);document.addEventListener?.('visibilitychange',()=>{if(document.hidden)cancel();});
    root.addEventListener?.('resize',layout);media.addEventListener?.('change',()=>{cancel();layout();});
    return {attach,remove,layout};
  }
  const api={safePosition,relativePosition,pagePosition,fitSize,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MorningNoteDrag=api;
})(typeof window!=='undefined'?window:globalThis);
