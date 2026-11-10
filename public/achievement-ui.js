(function(root) {
  'use strict';
  const {t:translateUI,locale}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
  function progressStroke(id) {
    // A different handwritten curve for each trophy, stable across reloads.
    let seed=2166136261;
    for(const char of id)seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;
    const y=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (2+seed/4294967296*6).toFixed(2);};
    return `M2 ${y()} C15 ${y()} 27 ${y()} 40 ${y()} S65 ${y()} 78 ${y()} S103 ${y()} 118 ${y()}`;
  }
  const reflectionMarkup='<svg class="reflection-star" viewBox="0 0 52 52" aria-hidden="true"><g class="reflection-shape"><path class="reflection-fill" d="M25 2 Q28 20 49 25 Q30 28 26 50 Q22 30 2 26 Q21 23 25 2Z"/><path class="reflection-edge" d="M26 10 Q29 21 40 24 M41 27 Q30 30 27 41 M23 41 Q20 30 11 28 M11 23 Q20 21 23 11"/></g></svg>';
  const trophyMarkup='<span class="trophy-art" aria-hidden="true"><span class="trophy-metal"></span><svg class="trophy-drawing" viewBox="0 0 64 84" aria-hidden="true"><g class="trophy-geometry"><path class="trophy-cup" d="M16 8 Q31 6 48 9 L45 25 Q42 37 33 39 Q22 37 19 26 Z"/><path class="trophy-shade" d="M45 10 L47.8 9.5 L45 25 Q42 37 33 39 Q23 36 20 29 Q33 34 40 24 Q44 17 45 10Z"/><path class="trophy-shade-deep" d="M20 28 Q27 34 34 33 Q39 33 43 29 Q40 37 33 39 Q25 37 20 28Z"/><path class="trophy-rim-shade" d="M16 8 Q31 6 48 9 L47.6 11 Q31 9 16.5 10Z"/><path class="trophy-highlight" d="M19 11 Q22 10 25 11 L24 23 Q24 28 22 27 Q20 23 19 11Z"/><path d="M17 13 Q3 8 6 22 Q8 32 22 33 M47 14 Q61 9 58 23 Q55 33 43 33 M30 39 29 49 M35 39 36 49 M23 51 Q32 47 42 51 L44 56 21 56 Z M9 58 Q31 56 55 59 L56 79 Q31 82 8 77 Z"/><path class="trophy-detail" d="M19 10 Q31 9 45 11 M23 18 Q23 29 29 33 M8 17 Q7 25 17 28 M55 17 Q57 24 48 28 M11 79 Q32 83 54 80"/><path class="trophy-plaque" d="M14 62 Q31 60 50 63 L50 75 13 74 Z"/><text class="trophy-plaque-text" x="32" y="71.5" text-anchor="middle"></text></g></svg><span class="trophy-reflection">'+reflectionMarkup+'</span></span>';
  const tierNames={bronze:'Bronze',silver:translateUI("Sølv"),gold:translateUI("Guld")};
  function tierOf(item){return Object.prototype.hasOwnProperty.call(tierNames,item.tier)?item.tier:'bronze';}
  // Solve an arc to the target rather than using a fixed screen-dependent angle.
  function trajectory(origin,target,jitter={x:0,y:0}) {
    const dx=target.x+jitter.x-origin.x,dy=target.y+jitter.y-origin.y;
    const flight=Math.max(30,Math.min(68,Math.hypot(dx,dy)/12));
    return {vx:dx/flight,vy:dy/flight-.5*.24*flight,flight};
  }
  const metalPeriod=12000,metalSpacing=32,metalTravel=96,silverDuration=450;
  function shinePhase(width,height,point) {
    const radians=115*Math.PI/180,ux=Math.sin(radians),uy=-Math.cos(radians);
    const length=Math.abs(width*ux)+Math.abs(height*uy);
    const position=(point.x-width/2)*ux+(point.y-height/2)*uy+length/2;
    return ((position-16)%metalSpacing+metalSpacing)%metalSpacing/metalTravel;
  }
  function whiteWait(phase,glarePhase) {
    return ((glarePhase-phase-silverDuration/2/metalPeriod)%(1/3)+1/3)%(1/3)*metalPeriod;
  }
  function create({getState,animate,reducedMotion,checkNewDay}) {
    const $=selector=>document.querySelector(selector);
    const page=document.documentElement||$('body');
    function alignTrophy(host) {
      const art=host.querySelector('.trophy-art'),rect=art.getBoundingClientRect();
      const width=art.offsetWidth||rect.width,height=art.offsetHeight||rect.height;
      const phase=shinePhase(width,height,{x:width*.67,y:height*.18});
      art.querySelector('.reflection-shape').style.setProperty('--glare-phase',String(phase));
      return phase;
    }
    function alignGoldPopup() {
      const rect=$('.achievement-toast-card').getBoundingClientRect();
      // Corresponds to the four CSS placements, in the same metal coordinate system.
      const locations=[{x:rect.width*.09+29,y:rect.height*.13+29},{x:rect.width*.9-23,y:rect.height*.26+23},{x:rect.width*.13+23,y:rect.height*.88-23},{x:rect.width*.93-32,y:rect.height*.9-32}];
      locations.forEach((point,i)=>{
        $(`.gold-glints`).querySelectorAll('span')[i].querySelector('.reflection-shape').style.setProperty('--glare-phase',String(shinePhase(rect.width,rect.height,point)));
      });
    }
    const crown=$('#crown'),panel=$('#achievements-view'),tasks=$('#tasks-view');
    const list=$('#achievement-list'),toast=$('#achievement-toast');
    const confettiUI=root.MorningConfetti.create({layer:$('#confetti'),reducedMotion}),sounds=new Set();
    let toastSequence=0;
    const launchers=$('#celebration-launchers'),cannons=[0,1,2,3].map(i=>$(`#launcher-${i}`));
    const rows=new Map(),queue=[],fireTimers=new Set();
    let activeTier='bronze',aimOffsets=[];
    let silverTimer,glintTimer,activeSilver=null,silverRows=[];
    let editing=false,pinned=false,hovered=false,focused=false,suppressed=false,shown=false;
    let hoverTimer;
    let toastTimer,toastActive=false,toastAnimation,celebrationSound;
    $('#achievement-toast-trophy').innerHTML=trophyMarkup.replace('<g class="trophy-geometry">','<defs><mask id="popup-trophy-mask" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" x="-.2" y="-.2" width="1.4" height="1.4"><g transform="scale(.015625 .0119047619)"><g class="trophy-mask-motion"><path class="mask-cup" d="M16 8 Q31 6 48 9 L45 25 Q42 37 33 39 Q22 37 19 26 Z"/><path d="M17 13 Q3 8 6 22 Q8 32 22 33 M47 14 Q61 9 58 23 Q55 33 43 33 M30 39 29 49 M35 39 36 49 M23 51 Q32 47 42 51 L44 56 21 56 Z M9 58 Q31 56 55 59 L56 79 Q31 82 8 77 Z"/><path stroke-width=".55" d="M19 10 Q31 9 45 11 M23 18 Q23 29 29 33 M8 17 Q7 25 17 28 M55 17 Q57 24 48 28 M11 79 Q32 83 54 80"/><path stroke-width=".8" d="M14 62 Q31 60 50 63 L50 75 13 74 Z"/></g></g></mask></defs><g class="trophy-geometry">');
    $('.gold-glints').innerHTML=Array.from({length:4},()=>`<span>${reflectionMarkup}</span>`).join('');
    function setView() {
      const next=!editing&&(pinned||(!suppressed&&(hovered||focused)));
      crown.setAttribute('aria-pressed',String(pinned));
      crown.setAttribute('aria-label',pinned?translateUI("Vis opgaver"):translateUI("Vis dagens trofæer"));
      crown.classList.toggle('showing-achievements',next);
      if(next===shown)return;
      shown=next;panel.hidden=!shown;tasks.hidden=shown;
      if(root.Event&&root.dispatchEvent)root.dispatchEvent(new root.Event('yackviewchange'));
      if(shown){rows.forEach(row=>alignTrophy(row));scheduleSilver();}else stopSilver();
      $('#view-title').textContent=shown?translateUI("Trofæer"):translateUI("Godmorgen!");
      const view=shown?panel:tasks;
      view.motion?.cancel();
      view.motion=animate(view,[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],shown&&hovered&&!pinned&&!focused?600:440);
    }
    function cancelHover(){clearTimeout(hoverTimer);hoverTimer=null;}
    crown.addEventListener('pointerenter',event=>{if(event.pointerType==='touch')return;cancelHover();hoverTimer=setTimeout(()=>{hoverTimer=null;checkNewDay();hovered=true;suppressed=false;setView();},200);});
    crown.addEventListener('pointerleave',()=>{cancelHover();hovered=false;suppressed=false;setView();});
    crown.addEventListener('focus',()=>{checkNewDay();focused=crown.matches(':focus-visible');if(focused)cancelHover();setView();});
    crown.addEventListener('blur',()=>{cancelHover();focused=false;suppressed=false;setView();});
    root.MorningTabs.register('trophies',{isOpen:()=>pinned,open:()=>{cancelHover();checkNewDay();pinned=true;suppressed=false;setView();},close:()=>{cancelHover();pinned=false;hovered=false;focused=false;suppressed=true;setView();}});
    crown.addEventListener('click',()=>root.MorningTabs.toggle('trophies'));
    function stopSilver() {
      clearTimeout(silverTimer);clearTimeout(glintTimer);silverTimer=null;glintTimer=null;
      activeSilver?.classList.toggle('silver-glint',false);activeSilver=null;
    }
    function scheduleSilver() {
      if(silverTimer!=null||glintTimer!=null||!shown||!silverRows.length||document.hidden||reducedMotion.matches)return;
      silverTimer=setTimeout(()=>{
        silverTimer=null;
        if(!shown||document.hidden||reducedMotion.matches)return;
        const selected=silverRows[Math.floor(Math.random()*silverRows.length)];
        if(!selected)return;
        const glarePhase=alignTrophy(selected);
        // Read the CSS animation phase once; CSS alone paints and moves the metal.
        const phase=Number.parseFloat(root.getComputedStyle?.(page).getPropertyValue('--metal-phase'))||0;
        silverTimer=setTimeout(()=>{
          silverTimer=null;
          if(!shown||document.hidden||reducedMotion.matches||!silverRows.includes(selected))return;
          activeSilver=selected;activeSilver.classList.toggle('silver-glint',true);
          glintTimer=setTimeout(()=>{
            glintTimer=null;activeSilver?.classList.toggle('silver-glint',false);activeSilver=null;scheduleSilver();
          },silverDuration);
        },whiteWait(phase,glarePhase));
      },5000+Math.random()*9000);
    }
    function update() {
      const ranks={bronze:0,silver:1,gold:2};
      const progress=root.MorningAchievements.progress(getState()).sort((a,b)=>Number(b.earned)-Number(a.earned)||(a.earned?-1:1)*(ranks[tierOf(a)]-ranks[tierOf(b)]));
      const ids=new Set(progress.map(p=>p.id));
      for(const [id,row] of rows)if(!ids.has(id)){row.remove();rows.delete(id);}
      silverRows=[];
      progress.forEach((p,index)=>{
        let row=rows.get(p.id);
        if(!row){
          row=document.createElement('li');row.className='achievement-row';
          row.innerHTML=`${trophyMarkup}<div class="achievement-copy"><span class="achievement-title"></span><span class="achievement-tier"></span><span class="achievement-description"></span><div class="achievement-progress"><svg viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden="true"><path class="achievement-progress-base"/><path class="achievement-progress-fill" pathLength="1"/></svg><span class="achievement-count"></span></div></div><span class="achievement-check" aria-hidden="true">✓</span>`;
          const stroke=progressStroke(p.id);
          row.querySelector('.achievement-progress-base').setAttribute('d',stroke);
          row.querySelector('.achievement-progress-fill').setAttribute('d',stroke);
          rows.set(p.id,row);list.append(row);
        }
        if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
        row.classList.toggle('earned',p.earned);
        row.setAttribute('data-tier',tierOf(p));
        if(p.earned&&tierOf(p)==='silver')silverRows.push(row);
        row.querySelector('.achievement-tier').textContent=tierNames[tierOf(p)]+(p.scope==='week'?translateUI(" · Denne uge"):'');
        row.querySelector('.trophy-plaque-text').textContent=p.trophy?.plaque||'✓';
        row.querySelector('.achievement-title').textContent=p.title;
        row.querySelector('.achievement-description').textContent=p.description||'';
        const unit=p.scope==='week'?translateUI("dage"):translateUI("opgaver"),earnedLabel=p.scope==='week'?translateUI("Opnået denne uge"):translateUI("Fuldført i dag");
        row.querySelector('.achievement-count').textContent=p.earned?earnedLabel:p.target>0?`${Math.min(p.current,p.target).toLocaleString(locale)} / ${p.target.toLocaleString(locale)} ${unit}`:translateUI("Ingen opgaver endnu");
        row.querySelector('.achievement-progress-fill').style.strokeDashoffset=String(1-p.ratio);
        row.setAttribute('aria-label',`${p.title} ${p.description||''}. ${p.earned?earnedLabel:translateUI("{0} af {1} {2}", p.current, p.target, unit)} · ${p.scope==='week'?translateUI("Denne uge · mandag–søndag"):translateUI("I dag")}`);
      });
      rows.forEach(row=>alignTrophy(row));
      if(activeSilver&&!silverRows.includes(activeSilver))stopSilver();
      scheduleSilver();
    }
    function target() {
      const rect=$('.view-stage').getBoundingClientRect();
      return {x:rect.left+rect.width/2,y:rect.top};
    }
    function aim(cannon,index) {
      const rect=cannon.getBoundingClientRect();
      const arc=trajectory({x:rect.left+rect.width*.3,y:rect.top+rect.height*.6},target(),aimOffsets[index]);
      cannon.querySelector('.confetti-cannon').style.transform=`rotate(${Math.atan2(arc.vy,arc.vx)*180/Math.PI+23}deg)`;
    }
    function placeCannons() {
      const rect=toast.getBoundingClientRect();
      launchers.style.setProperty('--mobile-right-cannon-bottom',`${Math.max(24,root.innerHeight-rect.top-18)}px`);
      cannons[0].style.left=activeTier==='gold'?'':`${Math.max(8,rect.left+8)}px`;
      cannons[0].style.top=activeTier==='gold'?'':`${rect.top+20}px`;
      cannons.forEach((c,i)=>{if(!c.hidden)aim(c,i);});
    }
    function clearShots() {for(const timer of fireTimers)clearTimeout(timer);fireTimers.clear();}
    function clearParticles(){confettiUI.clear();}
    function confetti(cannon,index) {
      if(reducedMotion.matches)return;
      celebrationSound?.pop();

      aim(cannon,index);
      const rect=cannon.querySelector('.cannon-muzzle').getBoundingClientRect();
      const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
      const arc=trajectory({x,y},target(),aimOffsets[index]);
      const recoil=cannon.querySelector('.cannon-recoil');
      const magnitude=Math.hypot(arc.vx,arc.vy),rx=-arc.vx/magnitude*5,ry=-arc.vy/magnitude*5;
      recoil.motion?.cancel();recoil.motion=animate(recoil,[{transform:'translate(0,0)'},{transform:`translate(${rx}px,${ry}px)`,offset:.25},{transform:'translate(0,0)'}],260);
      const colors=activeTier==='gold'?['#d7a328','#f3d878','#b48021','#fff0b2','#bd3029']:['#bd3029','#d0a246','#727f64','#708ca0','#49443a'];
      const count=activeTier==='gold'?135:84;
      confettiUI.burst({x,y,vx:arc.vx,vy:arc.vy,count,colors});
    }
    function stopCelebration(clearEffects=false) {
      toastSequence++;
      if(clearEffects){for(const sound of sounds)sound.stop();sounds.clear();clearParticles();}
      celebrationSound=null;
      clearShots();toastAnimation?.cancel();
      cannons.forEach(c=>c.querySelector('.cannon-recoil').motion?.cancel());
      launchers.classList.toggle('launching',false);launchers.hidden=true;
      toast.classList.toggle('launching',false);
    }
    function finishToast() {
      clearTimeout(toastTimer);stopCelebration();toast.hidden=true;toastActive=false;
      if(document.activeElement===$('#close-toast'))crown.focus({preventScroll:true});
      nextToast();
    }
    function nextToast() {
      if(toastActive||!queue.length)return;
      const item=queue.shift();if(item.day!==getState().day){nextToast();return;}
      toastActive=true;
      // Let the task's pencil stroke finish before the celebration.
      toastTimer=setTimeout(()=>{
        if(item.day!==getState().day){finishToast();return;}
        $('#achievement-toast-title').textContent=item.title;
        $('#achievement-toast-description').textContent=item.description||'';
        $('#achievement-toast-trophy').querySelector('.trophy-plaque-text').textContent=item.trophy?.plaque||'✓';
        activeTier=tierOf(item);
        // Inline fragment URL resolves against this document, including in Firefox.
        $('#achievement-toast-trophy').querySelector('.trophy-metal').style.mask=activeTier==='gold'?'url("#popup-trophy-mask")':'';
        toast.setAttribute('data-tier',activeTier);launchers.setAttribute('data-tier',activeTier);
        const count=activeTier==='gold'?4:activeTier==='silver'?2:1;
        aimOffsets=cannons.map(()=>count>1?{x:(Math.random()-.5)*80,y:(Math.random()-.5)*44}:{x:0,y:0});
        cannons.forEach((c,i)=>c.hidden=i>=count);
        toast.hidden=false;launchers.hidden=reducedMotion.matches;
        placeCannons();alignTrophy($('#achievement-toast-trophy'));if(activeTier==='gold')alignGoldPopup();toast.classList.toggle('launching',true);launchers.classList.toggle('launching',true);
        const duration=reducedMotion.matches?4500:activeTier==='gold'?8500:activeTier==='silver'?6900:6300;
        const sequence=++toastSequence;
        toastAnimation=animate(toast,[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],440);
        const firstConfettiAt=Date.now()+3800;
        const startSound=()=>{
          if(sequence!==toastSequence||toast.hidden||document.hidden)return;
          celebrationSound=root.MorningSound?.begin(activeTier,{reactionDelay:Math.max(0,(firstConfettiAt-Date.now()-200)/1000)});
          if(celebrationSound){const playing=celebrationSound;sounds.add(playing);playing.finished?.then(()=>sounds.delete(playing));}
        };
        if(toastAnimation?.finished)toastAnimation.finished.then(startSound).catch(()=>{});else startSound();
        if(!reducedMotion.matches)cannons.slice(0,count).forEach((c,i)=>{
          const delay=3800+(i?i*210+Math.random()*110:0);
          const timer=setTimeout(()=>{
            fireTimers.delete(timer);checkNewDay();
            if(item.day===getState().day&&!document.hidden)confetti(c,i);
          },delay);
          fireTimers.add(timer);
        });
        toastTimer=setTimeout(finishToast,duration);
      },item.delay);
    }
    function celebrate(unlocked,delay=760) {unlocked.forEach(p=>queue.push({id:p.id,title:p.title,description:p.description,trophy:p.trophy,tier:tierOf(p),day:getState().day,delay}));nextToast();}
    function clearDaily() {
      queue.length=0;stopSilver();clearTimeout(toastTimer);stopCelebration(true);toast.hidden=true;toastActive=false;
      update();
    }
    $('#close-toast').addEventListener('click',finishToast);
    document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelHover();for(const sound of sounds)sound.stop();sounds.clear();celebrationSound=null;toastSequence++;stopSilver();clearShots();clearParticles();}else scheduleSilver();});
    reducedMotion.addEventListener?.('change',()=>{if(reducedMotion.matches)stopSilver();else scheduleSilver();});
    window.addEventListener('resize',()=>{rows.forEach(row=>alignTrophy(row));if(toastActive&&!toast.hidden){placeCannons();alignTrophy($('#achievement-toast-trophy'));if(activeTier==='gold')alignGoldPopup();}});
    update();
    function setEditing(value){editing=value;if(value){cancelHover();pinned=false;hovered=false;focused=false;suppressed=false;}setView();}
    return {update,celebrate,clearDaily,setEditing};
  }
  root.MorningAchievementUI={create,trajectory,shinePhase,whiteWait};
})(window);
