(function(root){
  'use strict';
  const {t:translateUI}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
  const colors=[
    {id:'terracotta',name:translateUI("Terrakotta"),value:'#b75d4f'},{id:'mustard',name:translateUI("Sennep"),value:'#c09b46'},
    {id:'sage',name:translateUI("Salvie"),value:'#93a184'},{id:'forest',name:translateUI("Skovgrøn"),value:'#537d65'},
    {id:'teal',name:translateUI("Petrol"),value:'#548c8b'},{id:'blue',name:translateUI("Støvet blå"),value:'#7797b6'},
    {id:'navy',name:translateUI("Marineblå"),value:'#526782'},{id:'plum',name:translateUI("Blomme"),value:'#8d728f'},
    {id:'rose',name:translateUI("Gammelrosa"),value:'#bf8f95'},{id:'charcoal',name:translateUI("Koksgrå"),value:'#686b68'}
  ];
  function color(seed,id){return colors.find(c=>c.id===id)||colors[(seed>>>0)%colors.length];}
  function random(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
  function geometry(seed){
    const r=random(seed),n=(a,b)=>+(a+r()*(b-a)).toFixed(2);
    const corners=[[n(0,2),n(0,1.5)],[n(97.5,100),n(0,1.5)],[n(98,100),n(98,100)],[n(0,2),n(98,100)]];
    const shape=`polygon(${corners.map(([x,y])=>`${x}% ${y}%`).join(',')})`;
    const small=`M${n(3,4)} ${n(3,4)} L${n(25,27)} ${n(2,4)} L${n(25,27)} ${n(25,27)} L${n(2,4)} ${n(25,27)} Z`;
    const squiggles=[9,15,21].map(y=>`M${n(7,8)} ${n(y-.5,y+.5)} C${n(10,12)} ${n(y-1.5,y-.5)} ${n(13,14)} ${n(y+1,y+1.6)} ${n(16,17)} ${n(y-.5,y+.5)} S${n(21,22)} ${n(y-1.2,y+1.2)} ${n(22,23)} ${n(y-.4,y+.4)}`);
    return {shape,corners,small,squiggles,rotation:n(-7,7),tilt:n(-2.2,2.2),pinX:n(44,56),pinY:n(9,15),pinRotation:n(-16,16),pinSize:n(.9,1.12),pinLength:n(.88,1.14)};
  }
  function title(task){if(typeof task.writing?.title==='string')return task.writing.title.trim();if((task.temporaryDay||task.permanentNote)&&task.text==='Ny note')return '';return task.text||(task.writing?.mode==='list'?translateUI("Dagens {0} ting:", task.writing.count):translateUI("Dagens note:"));}
  function small(button,seed){
    const box=button.querySelector('.box');if(box.dataset.noteSeed===String(seed))return;box.dataset.noteSeed=String(seed);
    const g=geometry(seed),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','small-note');svg.setAttribute('viewBox','0 0 30 30');svg.setAttribute('aria-hidden','true');
    svg.style.transform=`rotate(${g.rotation}deg)`;
    const paper=document.createElementNS('http://www.w3.org/2000/svg','path');paper.setAttribute('class','small-note-paper');paper.setAttribute('d',g.small);svg.append(paper);
    for(const d of g.squiggles){const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('class','small-note-squiggle');path.setAttribute('d',d);svg.append(path);}
    box.querySelector('.small-note')?.remove();box.insertBefore(svg,box.children[0]||null);
  }
  const paperColors=[{id:'cream',name:translateUI("Creme"),value:'#f8edb5'},{id:'yellow',name:translateUI("Gul"),value:'#f5e28b'},{id:'white',name:translateUI("Hvid"),value:'#fffdf5'},{id:'rose',name:translateUI("Rosa"),value:'#f4d6d9'},{id:'blue',name:translateUI("Blå"),value:'#dceaf3'},{id:'sage',name:translateUI("Grøn"),value:'#dfe8d1'}];
  const paperTypes=[{id:'plain',name:translateUI("Blankt")},{id:'lined',name:translateUI("Linjer")},{id:'grid',name:translateUI("Ternet")},{id:'dots',name:translateUI("Prikker")}];
  function paper(element,seed,config={}){const g=geometry(seed);element.style.setProperty('--note-shape',g.shape);element.style.setProperty('--paper-corner-top',`${g.corners[1][1]}%`);element.style.setProperty('--paper-corner-right',`${100-g.corners[1][0]}%`);element.style.setProperty('--note-tilt',`${g.tilt}deg`);element.style.setProperty('--paper-color',(paperColors.find(c=>c.id===config.paperColor)||paperColors[0]).value);element.setAttribute('data-paper-type',paperTypes.some(p=>p.id===config.paperType)?config.paperType:'plain');element.setAttribute('data-note-align',['left','center','right'].includes(config.align)?config.align:'left');element.setAttribute('data-writing-mode',config.mode||'note');element.setAttribute('data-list-style',config.asTasks===false?config.listStyle||'disc':'tasks');return g;}
  function pin(seed,colorID,corner){
    const g=geometry(seed),pin=document.createElement('span');pin.className='note-pin';pin.setAttribute('aria-hidden','true');pin.style.setProperty('--pin-color',color(seed,colorID).value);pin.style.setProperty('--pin-rotation',`${g.pinRotation}deg`);pin.style.width=`${21*g.pinSize}px`;pin.style.height=`${26*g.pinSize*g.pinLength}px`;pin.style.left=`${g.pinX}%`;pin.style.top=`${g.pinY}px`;pin.style.transform=`translateX(-50%) rotate(${g.pinRotation}deg)`;
    if(corner){
      pin.classList.add('permanent-pin',`permanent-pin-${corner}`);
      pin.style.width=`${26*g.pinSize}px`;pin.style.height=`${28*g.pinSize*g.pinLength}px`;
      pin.style.top='0px';pin.style.left=corner==='right'?'auto':corner==='left'?'10px':'2px';if(corner==='right')pin.style.right='10px';
      pin.style.transform=`rotate(${g.pinRotation*.5+(corner==='right'?6:corner==='left'?-6:0)}deg)`;
      const metalID=`pin-metal-${seed>>>0}-${corner}`;
      // One solid thumbtack, viewed from above: a broad cap and foreshortened body.
      // No independently moving cap or needle; the complete pin lifts with its paper.
      pin.innerHTML=`<svg viewBox="0 0 36 36">
        <defs><linearGradient id="${metalID}" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#a7b2b9"/><stop offset=".38" stop-color="#fff"/><stop offset=".64" stop-color="#f7fbfd"/><stop offset="1" stop-color="#aab6bd"/></linearGradient></defs>
        <path class="pin-stem" style="fill:url(#${metalID})" d="M16.5 25.2 20 25.5 18.1 31.5 Q17.7 32.6 17.2 31.4 L16.4 28.3Z"/>
        <path class="pin-head" d="M14 16 Q15.5 19 13.5 21.2 L9.2 23.4 Q8.2 25 11.5 26.4 Q19 29 26 26.3 Q29 25 27 23.3 L23 21.2 Q21.4 19 23 16Z"/>
        <path class="pin-shade" d="M20.5 17 23 16 Q21.4 19 23 21.2 L27 23.3 Q29 25 26 26.3 Q23 27.5 18.8 27.5 L19.5 25 Q24.2 24.8 23 23.3 L19.8 21.4Z"/>
        <path class="pin-contour" d="M10 24 Q17.8 27.4 26.5 24.3"/>
        <path class="pin-head" d="M7.2 10.2 8 13.3 Q9.7 18.5 19 18 Q28.8 18 30 13 L30.4 9.8Z"/>
        <path class="pin-shade" d="M23 13.4 30.4 9.8 30 13 Q28.8 18 19 18 L18.7 15.8Z"/>
        <path class="pin-head" d="M7.2 10.2 Q6.6 3.3 18 3.3 Q29.3 2.9 30.4 9.8 Q31.2 16.2 19 16.5 Q8 16.8 7.2 10.2Z"/>
        <path class="pin-glint" d="M11 8 Q14.5 5.2 21.5 6 M12.3 23.6 15.5 24.6"/>
      </svg>`;return pin;
    }
    const r=random(seed^0xa4c39f17),n=(a,b)=>(a+r()*(b-a)).toFixed(2),left=n(5.4,7.2),right=n(17,18.8),top=n(1.6,3.1),base=n(14,15.5);
    pin.innerHTML=`<svg viewBox="0 0 24 30"><circle class="pin-hole" cx="10" cy="28" r="1.7"/><path class="pin-stem" d="M13 12 Q13 20 10 28"/><g class="pin-cap"><path class="pin-head" d="M${left} 8 Q${Number(left)-1} ${top} 12 ${top} Q${right} ${top} ${right} 8 Q${Number(right)+1} 12 13 ${base} Q${left} ${base} ${left} 8Z"/><path class="pin-shade" d="M16 4 Q21 12 13 15 L10 13 Q17 12 16 4Z"/><path class="pin-glint" d="M8 7 Q8 4 12 4"/></g></svg>`;return pin;
  }
  function pins(task){const colorID=color(task.boxSeed,task.writing.pinColor).id;return task.permanentNote?[pin(task.boxSeed,colorID,'left'),pin(task.boxSeed^0x91bce716,colorID,'right')]:[pin(task.boxSeed,colorID)];}
  function alignmentPicker(value,onChange){
    const choices=[['left',translateUI("Venstre"),'M4 5 Q14 4 27 5 M4 11 Q10 10 19 11 M4 17 Q16 16 27 17 M4 23 Q11 22 19 23'],['center',translateUI("Centreret"),'M4 5 Q14 4 27 5 M8 11 Q15 10 23 11 M4 17 Q16 16 27 17 M8 23 Q15 22 23 23'],['right',translateUI("Højre"),'M4 5 Q14 4 27 5 M12 11 Q19 10 27 11 M4 17 Q16 16 27 17 M12 23 Q20 22 27 23']];
    const field=document.createElement('div');field.className='note-align-field';
    const picker=document.createElement('details');picker.className='note-align-picker';const current=document.createElement('summary');current.className='note-align-current';picker.append(current);
    const options=document.createElement('div');options.className='note-align-options';options.setAttribute('role','group');options.setAttribute('aria-label',translateUI("Tekstjustering"));
    function update(next){const selected=choices.find(choice=>choice[0]===next)||choices[0];current.innerHTML=`<svg viewBox="0 0 32 28" aria-hidden="true"><path d="${selected[2]}"/></svg>`;current.setAttribute('aria-label',translateUI("Tekstjustering: ")+selected[1]);for(const button of options.children)button.setAttribute('aria-pressed',String(button.dataset.align===selected[0]));}
    for(const choice of choices){const button=document.createElement('button');button.type='button';button.dataset.align=choice[0];button.textContent=choice[1];button.addEventListener('click',()=>{onChange(choice[0]);update(choice[0]);picker.open=false;current.focus({preventScroll:true});});options.append(button);}
    picker.append(options);picker.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();picker.open=false;current.focus({preventScroll:true});}});field.append(picker);update(value);return field;
  }
  function settingsIcon(summary){summary.innerHTML='<svg class="note-options-gear" viewBox="0 0 32 32" aria-hidden="true"><path d="M12.48 7.50 Q12.64 7.59 13.23 5.78 Q13.81 3.97 16.01 3.90 Q18.21 3.83 18.80 5.67 Q19.39 7.51 19.51 7.52 Q19.63 7.53 21.28 6.77 Q22.92 6.00 24.51 7.51 Q26.10 9.01 25.31 10.68 Q24.51 12.35 24.54 12.46 Q24.57 12.58 26.37 13.18 Q28.16 13.79 28.12 15.99 Q28.07 18.20 26.28 18.79 Q24.49 19.39 24.46 19.50 Q24.42 19.61 25.24 21.29 Q26.07 22.97 24.52 24.53 Q22.98 26.09 21.29 25.23 Q19.59 24.37 19.52 24.50 Q19.45 24.64 18.82 26.31 Q18.18 27.99 15.99 28.04 Q13.80 28.09 13.22 26.25 Q12.64 24.41 12.52 24.41 Q12.40 24.40 10.77 25.15 Q9.15 25.90 7.57 24.41 Q5.99 22.93 6.81 21.26 Q7.62 19.60 7.56 19.49 Q7.50 19.39 5.80 18.78 Q4.09 18.17 3.99 15.98 Q3.88 13.79 5.65 13.18 Q7.41 12.57 7.50 12.48 Q7.59 12.39 6.78 10.72 Q5.97 9.06 7.54 7.56 Q9.12 6.06 10.72 6.73 Q12.31 7.41 12.48 7.50 Z M21.3 16.2 C21.5 23.1 10.2 23.0 10.6 15.7 C10.9 8.5 21.8 9.1 21.3 16.2Z"/><path class="gear-fine" d="M12 9.5 Q17 7 21 10.8 M11 22 Q15 24.5 19 22.5"/></svg><svg class="note-options-triangle" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3 Q8 5 12 8 Q8 11 4 13 Q5 8 5 3Z"/></svg>';}
  function closeIcon(button,seed){button.innerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><path class="close-ink" d="M5 4 C6.5 7.8 10 9.7 12.6 12.7 S18.2 17.6 20.2 20.1 Q23.6 24.8 27 28"/><path class="close-ink" d="M28 5 C24.9 6.5 21.5 11.8 18 14.3 S8.2 23.5 4 27"/><path class="close-fine" d="M6 5 Q8 9 11.7 12 M20.3 21 Q24 26 26.5 27 M26 6 Q21.3 10.6 19 13"/></svg>';button.querySelectorAll('.close-ink').forEach((path,i)=>root.MorningInk.apply(path,{width:i?1.75:1.55,color:'currentColor',seed:(seed+i*2654435761)>>>0}));}
  const api={settingsIcon,closeIcon,alignmentPicker,colors,color,geometry,title,small,paper,pin,pins,paperColors,paperTypes};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MorningPaper=api;
})(typeof window!=='undefined'?window:globalThis);
