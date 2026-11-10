(function(root) {
  'use strict';
  // Seeded one-dimensional gradient Perlin noise, with quintic interpolation.
  function perlin(seed) {
    const permutation=Array.from({length:256},(_,i)=>i);
    for(let i=255;i>0;i--) {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const j=seed%(i+1);
      [permutation[i],permutation[j]]=[permutation[j],permutation[i]];
    }
    return position=>{
      const lattice=Math.floor(position),t=position-lattice;
      const gradient=index=>(permutation[index&255]&1)?1:-1;
      const fade=t*t*t*(t*(t*6-15)+10);
      const left=gradient(lattice)*t,right=gradient(lattice+1)*(t-1);
      return 2*(left+(right-left)*fade);
    };
  }
  function stroke({x,y,width,height},seed) {
    const noise=perlin(seed),sample=(i,channel)=>noise(i*.63+channel*17.37+.41);
    const turns=Math.max(3,Math.ceil(width/10))+1,step=width/(turns-1);
    let previousX=x,previousY=y+height*.045*sample(0,0);
    let d=`M${previousX.toFixed(2)} ${previousY.toFixed(2)}`;
    for(let i=0;i<turns;i++) {
      const progress=i/(turns-1);
      // Begin upward from the middle; the first return lands bottom-left.
      const nextX=i===0?x-step*(.16+.05*sample(0,8)):i===turns-1?x+width:x+step*i+step*.3*sample(i,1);
      const amplitude=1+.14*sample(i,2);
      const peakY=y-height*.34*amplitude;
      const nextY=y+height*.3*(1+.14*sample(i,3));
      // Lean from vertical: taper the slant while keeping the final hatches diagonal.
      const angle=(53-29*progress+3.5*sample(i,4))*Math.PI/180;
      const peakX=Math.min(x+width+1,previousX+(previousY-peakY)*Math.tan(angle));
      const dx=peakX-previousX,dy=peakY-previousY,span=Math.hypot(dx,dy);
      const bend=height*(.1+.025*sample(i,5));
      const controlX=(previousX+peakX)/2+dy/span*bend;
      const controlY=(previousY+peakY)/2-dx/span*bend;
      // The rising stroke bows toward the upper left; its return is loose too.
      d+=` Q${controlX.toFixed(2)} ${controlY.toFixed(2)} ${peakX.toFixed(2)} ${peakY.toFixed(2)}`;
      if(i===turns-1)break; // Lift the pen after the final upstroke.
      d+=` Q${((peakX+nextX)/2+sample(i,6)).toFixed(2)} ${((peakY+nextY)/2+1.4*sample(i,7)).toFixed(2)} ${nextX.toFixed(2)} ${nextY.toFixed(2)}`;
      previousX=nextX;previousY=nextY;
    }
    return d;
  }
  function create(doc) {
    const controls=new Set();
    doc.addEventListener('pointerdown',event=>{
      for(const c of controls)if(event.isPrimary===false||!c.row.contains(event.target))c.hide();
    });
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden)for(const c of controls)c.hide();});
    function attach(row,taskButton,deferButton) {
      let revealTimer,hold=null,ignoreClickUntil=0;
      const listeners=[];
      const on=(el,type,fn,options)=>{el.addEventListener(type,fn,options);listeners.push([el,type,fn,options]);};
      function show(){
        row.classList.add('show-defer');
        deferButton.tabIndex=0;deferButton.setAttribute('aria-hidden','false');
      }
      function hide(){
        clearTimeout(revealTimer);hold=null;
        row.classList.remove('show-defer');deferButton.tabIndex=0;deferButton.setAttribute('aria-hidden','false');
      }
      function end(event){
        if(!hold||hold.id!==event.pointerId)return;
        if(hold.revealed)ignoreClickUntil=Date.now()+600;
        clearTimeout(revealTimer);hold=null;
      }
      function cancel(event){
        if(!hold||hold.id!==event.pointerId)return;
        ignoreClickUntil=Date.now()+600;hide();
      }
      on(taskButton,'pointerdown',event=>{
        ignoreClickUntil=0;
        if((event.pointerType!=='touch'&&event.pointerType!=='pen')||event.isPrimary===false)return;
        clearTimeout(revealTimer);hold={id:event.pointerId,x:event.clientX,y:event.clientY,revealed:false};
        revealTimer=setTimeout(()=>{if(!hold)return;hold.revealed=true;ignoreClickUntil=Infinity;show();},1000);
      });
      on(taskButton,'pointermove',event=>{
        if(hold&&hold.id===event.pointerId&&Math.hypot(event.clientX-hold.x,event.clientY-hold.y)>10)cancel(event);
      });
      on(taskButton,'pointerup',end);on(taskButton,'pointercancel',cancel);
      on(taskButton,'contextmenu',event=>event.preventDefault());
      on(taskButton,'click',event=>{
        if(Date.now()<ignoreClickUntil){event.preventDefault();event.stopImmediatePropagation();}
      },true);
      on(taskButton,'keydown',event=>{
        if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();show();deferButton.focus();}
      });
      on(row,'focusout',event=>{if(!row.contains(event.relatedTarget))hide();});
      const control={row,hide,dispose(){hide();listeners.forEach(args=>args[0].removeEventListener(...args.slice(1)));controls.delete(control);}};
      controls.add(control);hide();return control;
    }
    return {attach,hideAll(){for(const c of controls)c.hide();}};
  }
  function longStroke({x,y,width,height},seed) {
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const vary=(value,spread)=>value+(random()*2-1)*spread;
    let d=`M${x.toFixed(2)} ${vary(y,height*.13).toFixed(2)}`;
    for(let pass=0;pass<6;pass++) {
      const from=pass%2?x+width:x,to=pass%2?x:x+width;
      d+=` C${vary(from+(to-from)*.3,width*.04).toFixed(2)} ${vary(y,height*.22).toFixed(2)} ${vary(from+(to-from)*.7,width*.04).toFixed(2)} ${vary(y,height*.22).toFixed(2)} ${vary(to,2).toFixed(2)} ${vary(y,height*.17).toFixed(2)}`;
    }
    return d;
  }
  const api={create,stroke,longStroke,perlin};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.MorningDeferral=api;
})(typeof window!=='undefined'?window:globalThis);
