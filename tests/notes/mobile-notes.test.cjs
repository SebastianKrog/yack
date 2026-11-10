const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../../public/tasks.js'),D=require('../../public/sync-data.js'),J=require('../../public/task-json.js'),N=require('../../public/mobile-notes.js');
const {appFixture}=require('../helpers/dom.cjs');
function fixture(){
 const s=M.fresh('2026-10-19');s.tasks=[];M.add(s,'Skriv en liste',null,'write');M.configureWriting(s,'write',{mode:'list',count:3});M.moveNote(s,'write',{x:60,y:240,space:'list'});
 const f=appFixture(s,{desktop:false});f.get('.checklist').children[0].querySelector('.task').fire('click');
 f.get('#writing-pad').querySelectorAll('.writing-input').forEach((input,i)=>{input.value=['A','B','C'][i];input.fire('input');});f.get('#writing-pad').querySelector('form').fire('submit');f.flushRender();return f;
}
function pdfTouch(element,type,x=180,y=280){const touch={identifier:7,clientX:x,clientY:y};return element.fire(type,{touches:type==='touchend'||type==='touchcancel'?[]:[touch],changedTouches:[touch]});}
function hold(f,element){if(element.closest('.note-media')||element.classList.contains('mobile-note-mini'))pdfTouch(element,'touchstart');else element.fire('pointerdown',{pointerType:'touch',pointerId:7,clientX:180,clientY:280});const timer=[...f.timers.values()].find(t=>t.ms===650);assert(timer);timer.fn();}
function pdfFixture(desktop=false){
 const s=fixture().saved();s.tasks=[];const asset={id:'12345678-1234-4234-8234-123456789012',name:'Plan.pdf',type:'application/pdf',size:14,width:420,height:595,pages:3};
 const note=M.createTemporaryNote(s,'pdf',{mode:'media',count:1,asset,asTasks:true});M.submitWriting(s,note.id,[asset.name]);return appFixture(s,{desktop});
}
test('media miniatures follow the image/PDF ratio and their bounds use the actual size',()=>{
 const asset={id:'12345678-1234-4234-8234-123456789012',name:'Plan.pdf',type:'application/pdf',size:14,width:420,height:595,pages:3},note={writing:{mode:'media',count:1,asset}};
 const portrait=N.miniatureSize(note);assert.equal(portrait.height,112);assert.equal(portrait.width/portrait.height,420/595);assert.equal(N.bounds(356,700,64,portrait).right,356-portrait.width-8);
 const landscape=N.miniatureSize({writing:{...note.writing,asset:{...asset,width:900,height:600}}});assert.equal(landscape.width,112);assert.equal(landscape.width/landscape.height,1.5);assert.deepEqual(N.miniatureSize({writing:{mode:'note'}}),{width:112,height:100});
 const f=pdfFixture(),mini=f.get('.mobile-note-mini');assert.equal(parseFloat(mini.style['--mobile-note-width']),portrait.width);assert.equal(parseFloat(mini.style['--mobile-note-height']),portrait.height);
});
test('holding the PDF body moves its note and suppresses the release click, but a later tap opens it',t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.now()});const f=pdfFixture(),card=f.get('#notes-board').querySelector('.saved-note'),frame=card.querySelector('.media-frame'),mini=f.get('.mobile-note-mini');
 hold(f,frame);assert(mini.classList.contains('mobile-note-dragging'));assert(card.classList.contains('mobile-note-stowed'));
 assert(pdfTouch(frame,'touchmove',230,330).defaultPrevented);pdfTouch(frame,'touchend',230,330);assert(f.saved().tasks[0].noteMobilePosition);
 let clicks=0;frame.addEventListener('click',()=>clicks++);frame.fire('click');assert.equal(clicks,0);t.mock.timers.tick(700);frame.fire('click');assert.equal(clicks,1);
});
test('a PDF can be picked up from its expanded mobile note without changing desktop placement',t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.now()});const f=pdfFixture(),card=f.get('#notes-board').querySelector('.saved-note'),frame=card.querySelector('.media-frame');hold(f,frame);pdfTouch(frame,'touchend');t.mock.timers.tick(700);f.get('.mobile-note-mini').fire('click');assert(f.get('#mobile-note-view').open);
 hold(f,frame);assert(!f.get('#mobile-note-view').open);assert.equal(card.parentNode,f.get('#notes-board'));assert(f.get('.mobile-note-mini').classList.contains('mobile-note-dragging'));pdfTouch(frame,'touchend',230,340);assert(f.saved().tasks[0].noteMobilePosition);assert.equal(f.saved().tasks[0].notePosition,undefined);
});
test('a PDF swipe scrolls normally and cancels pickup; only a completed hold prevents scrolling',()=>{
 const f=pdfFixture(),frame=f.get('.media-frame'),mini=f.get('.mobile-note-mini');assert(!pdfTouch(frame,'touchstart').defaultPrevented);assert(!pdfTouch(frame,'touchmove',180,310).defaultPrevented);assert(![...f.timers.values()].some(t=>t.ms===650));assert(!mini.classList.contains('mobile-note-dragging'));assert(!pdfTouch(frame,'touchend',180,310).defaultPrevented);
 hold(f,frame);frame.fire('pointercancel',{pointerId:22,pointerType:'touch'});assert(mini.classList.contains('mobile-note-dragging'));assert(pdfTouch(frame,'touchmove',210,320).defaultPrevented);pdfTouch(frame,'touchend',210,320);assert(!pdfTouch(frame,'touchmove',210,350).defaultPrevented);
});
test('native scroll cancellation and multitouch cannot leave a PDF hold armed',()=>{
 const f=pdfFixture(),frame=f.get('.media-frame');pdfTouch(frame,'touchstart');frame.fire('pointercancel',{pointerId:22,pointerType:'touch'});assert(![...f.timers.values()].some(t=>t.ms===650));
 hold(f,frame);const pinch=frame.fire('touchmove',{touches:[{identifier:7,clientX:180,clientY:280},{identifier:8,clientX:200,clientY:300}]});assert(!pinch.defaultPrevented);assert(!f.get('.mobile-note-mini').classList.contains('mobile-note-dragging'));assert(f.get('#mobile-note-drag-shield').hidden);
});
test('PDF task buttons retain their own gestures and desktop PDF presses never trigger mobile pickup',()=>{
 const f=pdfFixture(),card=f.get('#notes-board').querySelector('.saved-note');card.querySelector('.note-task').fire('pointerdown',{pointerType:'touch',pointerId:8});assert(![...f.timers.values()].some(t=>t.ms===650));
 const pc=pdfFixture(true);pc.get('.media-frame').fire('pointerdown',{pointerType:'mouse',button:0});assert(![...pc.timers.values()].some(t=>t.ms===650));
});
test('mobile hold places a compact note, tap opens the live full note, and bottom drop restores it',t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.now()});const f=fixture(),card=f.get('#notes-board').querySelector('.saved-note'),mini=f.get('.mobile-note-mini');assert(mini.hidden);
 hold(f,card.querySelector('.note-grip'));assert(!f.get('#mobile-note-drop').hidden);assert(card.classList.contains('mobile-note-stowed'));assert(!mini.hidden);
 f.doc.body.fire('pointermove',{pointerType:'touch',pointerId:7,clientX:240,clientY:320});f.doc.body.fire('pointerup',{pointerType:'touch',pointerId:7,clientX:240,clientY:320});
 assert(f.get('#mobile-note-drop').hidden);assert(f.saved().tasks[0].noteMobilePosition);const reloaded=appFixture(f.saved(),{desktop:false});assert(!reloaded.get('.mobile-note-mini').hidden);assert(reloaded.get('#notes-board').querySelector('.saved-note').classList.contains('mobile-note-stowed'));assert.deepEqual(f.saved().tasks[0].notePosition,{x:60,y:240,space:'list'});
 mini.fire('click');assert(!f.get('#mobile-note-view').open); // Ignore the hold's synthetic click.
 t.mock.timers.tick(700);mini.fire('click');assert(f.get('#mobile-note-view').open);assert.equal(card.parentNode,f.get('#mobile-note-content'));assert(!card.classList.contains('mobile-note-stowed'));
 card.querySelector('.note-task').fire('click');assert.equal(card.querySelector('.note-task').getAttribute('aria-checked'),'true');f.get('#mobile-note-close').fire('click');assert(!f.get('#mobile-note-view').open);assert.equal(card.parentNode,f.get('#notes-board'));assert(!mini.hidden);
 hold(f,mini);pdfTouch(mini,'touchmove',230,580);assert(f.get('#mobile-note-drop').classList.contains('drop-ready'));pdfTouch(mini,'touchend',230,580);
 assert.equal(f.saved().tasks[0].noteMobilePosition,undefined);assert.deepEqual(f.saved().tasks[0].notePosition,{x:60,y:240,space:'list'});assert(mini.hidden);assert(!card.classList.contains('mobile-note-stowed'));
});
test('moving before the hold threshold cancels pickup, and task holds do not pick up notes',()=>{
 const f=fixture(),card=f.get('#notes-board').querySelector('.saved-note'),grip=card.querySelector('.note-grip');grip.fire('pointerdown',{pointerType:'touch',pointerId:7,clientX:100,clientY:200});
 f.doc.body.fire('pointermove',{pointerType:'touch',pointerId:7,clientX:100,clientY:225});assert(![...f.timers.values()].some(t=>t.ms===650));assert(f.get('#mobile-note-drop').hidden);
 card.querySelector('.note-task').fire('pointerdown',{pointerType:'touch',pointerId:8});assert(![...f.timers.values()].some(t=>t.ms===650));
});
test('mobile positions survive reset, restore and sync independently of desktop positions',()=>{
 const s=M.fresh('2026-10-19'),id='initial-2';M.moveNote(s,id,{x:700,y:260,space:'list'});M.moveMobileNote(s,id,{x:.2,y:.6,space:'page'});
 assert.equal(M.moveMobileNote(s,id,{x:7,y:.6,space:'page'}),null);const r=D.materialize(D.capture(s),'2026-10-19').state,t=r.tasks.find(t=>t.id===id);assert.deepEqual(t.noteMobilePosition,{x:.2,y:.6,space:'page'});assert.deepEqual(t.notePosition,{x:700,y:260,space:'list'});
 M.resetDay(r,'2026-10-20');assert.deepEqual(M.restore(r,r.day).tasks.find(t=>t.id===id).noteMobilePosition,{x:.2,y:.6,space:'page'});assert(!J.encode(s).includes('noteMobilePosition'));
 const fields=D.capture(s);fields['mobile-position/initial-2']=null;assert.equal(D.materialize(fields,s.day).state.tasks.find(t=>t.id===id).noteMobilePosition,undefined);
});
test('compact page placement scales horizontally and preserves its page height',()=>{
 assert.equal(N.bounds(356,700,76).top,80);
 const a=N.bounds(356,700),p=N.pagePosition({x:100,y:250},a,100);assert.equal(p.space,'page');assert.deepEqual(N.placedPoint(p,a),{x:100,y:350});const b=N.bounds(700,356),moved=N.placedPoint(p,b);assert(moved.x>=8&&moved.x<=580);assert.equal(moved.y,350);
});


test('canceling a held note restores its prior location without saving a placement',()=>{
 const f=fixture(),card=f.get('#notes-board').querySelector('.saved-note');hold(f,card.querySelector('.note-grip'));f.doc.body.fire('pointercancel',{pointerType:'touch',pointerId:7});
 assert(f.get('#mobile-note-drop').hidden);assert(f.get('.mobile-note-mini').hidden);assert(!card.classList.contains('mobile-note-stowed'));assert.equal(f.saved().tasks[0].noteMobilePosition,undefined);
});

test('small notes require a fresh hold before every move and allow ordinary swipes',()=>{
 const f=fixture(),mini=f.get('.mobile-note-mini');hold(f,f.get('#notes-board').querySelector('.note-grip'));f.doc.body.fire('pointerup',{pointerType:'touch',pointerId:7,clientX:180,clientY:280});
 for(let i=0;i<3;i++){
  const before=f.saved().tasks[0].noteMobilePosition;
  pdfTouch(mini,'touchstart');assert(!pdfTouch(mini,'touchmove',180,320).defaultPrevented);assert(!mini.classList.contains('mobile-note-dragging'));assert(![...f.timers.values()].some(t=>t.ms===650));pdfTouch(mini,'touchend',180,320);assert.deepEqual(f.saved().tasks[0].noteMobilePosition,before);
  hold(f,mini);assert(mini.classList.contains('mobile-note-dragging'));assert(pdfTouch(mini,'touchmove',220+i*20,330+i*15).defaultPrevented);pdfTouch(mini,'touchend',220+i*20,330+i*15);
  const after=f.saved().tasks[0].noteMobilePosition;assert.notDeepEqual(after,before);assert.equal(after.space,'page');assert(!mini.classList.contains('mobile-note-dragging'));assert(f.get('#mobile-note-drop').hidden);
 }
});
test('page placement includes scroll offset and stays at that document coordinate on relayout',()=>{
 const f=fixture(),mini=f.get('.mobile-note-mini');f.window.scrollY=400;hold(f,f.get('#notes-board').querySelector('.note-grip'));f.doc.body.fire('pointermove',{pointerType:'touch',pointerId:7,clientX:240,clientY:320});f.doc.body.fire('pointerup',{pointerType:'touch',pointerId:7,clientX:240,clientY:320});
 const position=f.saved().tasks[0].noteMobilePosition;assert.equal(position.space,'page');assert.equal(position.y,684);assert.equal(mini.style['--mobile-note-y'],'684px');
 f.window.scrollY=600;f.doc.body.fire('visibilitychange');assert.equal(mini.style['--mobile-note-y'],'684px');
 const restored=appFixture(f.saved(),{desktop:false});assert.equal(restored.get('.mobile-note-mini').style['--mobile-note-y'],'684px');assert.deepEqual(f.saved().tasks[0].notePosition,{x:60,y:240,space:'list'});
 const synced=D.materialize(D.capture(f.saved()),f.saved().day).state.tasks[0];assert.deepEqual(synced.noteMobilePosition,position);
});

test('capture loss on a moving preview cannot cancel a drag over checklist tasks',()=>{
 const f=fixture(),mini=f.get('.mobile-note-mini'),card=f.get('#notes-board').querySelector('.saved-note'),captures=[],releases=[];
 f.doc.body.setPointerCapture=id=>captures.push(id);f.doc.body.releasePointerCapture=id=>releases.push(id);
 hold(f,card.querySelector('.note-grip'));assert.deepEqual(captures,[7]);assert(!f.get('#mobile-note-drag-shield').hidden);
 mini.fire('lostpointercapture',{pointerId:7});assert(mini.classList.contains('mobile-note-dragging'));
 let taskMoves=0,taskUps=0;const underneath=f.get('.checklist').children[0].querySelector('.task');underneath.addEventListener('pointermove',()=>taskMoves++);underneath.addEventListener('pointerup',()=>taskUps++);
 underneath.fire('pointermove',{pointerType:'touch',pointerId:7,clientX:230,clientY:350});assert.equal(taskMoves,0);assert(mini.classList.contains('mobile-note-dragging'));
 underneath.fire('pointerup',{pointerType:'touch',pointerId:7,clientX:230,clientY:350});assert.equal(taskUps,0);assert.deepEqual(releases,[7]);assert(f.get('#mobile-note-drag-shield').hidden);assert(!mini.classList.contains('mobile-note-dragging'));assert(f.saved().tasks[0].noteMobilePosition);
});
