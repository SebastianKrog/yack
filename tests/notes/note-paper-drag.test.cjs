const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../../public/note-paper.js'),D=require('../../public/note-drag.js');
test('paper shapes, rotation and three separated squiggles vary by seed and stay stable',()=>{
 const a=P.geometry(17),b=P.geometry(18);assert.deepEqual(a,P.geometry(17));assert.notEqual(a.shape,b.shape);assert.notEqual(a.small,b.small);assert.notEqual(a.rotation,b.rotation);assert.equal(a.squiggles.length,3);assert.equal(new Set(a.squiggles).size,3);
 const bands=a.squiggles.map(path=>{const numbers=path.match(/-?\d+(?:\.\d+)?/g).map(Number),ys=numbers.filter((_,i)=>i%2);return {min:Math.min(...ys),max:Math.max(...ys)};});
 assert(bands[0].max<bands[1].min);assert(bands[1].max<bands[2].min);assert(a.pinX>=44&&a.pinX<=56);assert(a.pinY>=9&&a.pinY<=15);
 assert.equal(P.title({writing:{mode:'list',count:3}}),'Dagens 3 ting:');assert.equal(P.title({writing:{mode:'list',count:3,title:'Mine planer:'}}),'Mine planer:');
});
test('paper can be dropped over the checklist while remaining reachable',()=>{
 const bounds={left:420,right:980,top:200,bottom:700},size={width:240,height:260};
 assert.deepEqual(D.safePosition({x:530,y:300},size,bounds,1440),{x:530,y:300});
 assert.deepEqual(D.safePosition({x:-300,y:0},size,bounds,1440),{x:8,y:8});
 assert.deepEqual(D.safePosition({x:1800,y:350},size,bounds,1440),{x:1192,y:350});
});

test('dragging saves a list-relative desktop placement on release and stays disabled on mobile',()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 for(const desktop of [false,true]){
  const state={tasks:[{id:'note'}]},events={},styles={},classes=new Set();let saves=0,pickups=0,setdowns=0;
  const card={isConnected:true,offsetHeight:220,style:{setProperty:(key,value)=>styles[key]=value},classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)},getBoundingClientRect:()=>({left:1040,top:180,width:240,height:220})};
  const handle={addEventListener:(event,fn)=>events[event]=fn,setPointerCapture(){}};
  const window={YackI18n:require('../../public/i18n.js'),MorningSound:{notePickup:()=>pickups++,noteSetdown:()=>setdowns++},innerWidth:1440,scrollY:0,matchMedia:()=>({matches:desktop}),addEventListener(){}};
  const document={querySelector:selector=>({getBoundingClientRect:()=>selector==='.view-stage'?{left:440,right:1000,top:180,bottom:650}:{top:130}})};
  vm.runInNewContext(fs.readFileSync('public/note-drag.js','utf8'),{window,document});
  const ui=window.MorningNoteDrag.create({getState:()=>state,model:{moveNote:(_,id,point)=>state.tasks[0].position=point},save:()=>saves++});ui.attach(card,handle,'note');
  events.pointerdown({pointerType:'mouse',button:0,pointerId:1,clientX:1080,clientY:200,preventDefault(){}});
  events.pointermove({pointerId:1,clientX:650,clientY:350});assert.equal(saves,0);
  events.pointerup({pointerId:1});assert.equal(saves,desktop?1:0);assert.equal(pickups,desktop?1:0);assert.equal(setdowns,desktop?1:0);
  if(desktop){assert(!classes.has('note-dragging'));assert.equal(state.tasks[0].position.x,170);assert.equal(state.tasks[0].position.y,150);assert.equal(state.tasks[0].position.space,'list');assert(styles['--note-x']);}
  else assert.equal(state.tasks[0].position,undefined);
 }
});

test('notes use the originating task text unless a custom title is supplied',()=>{assert.equal(P.title({text:'Skriv dine planer',writing:{mode:'list',count:3}}),'Skriv dine planer');assert.equal(P.title({text:'Skriv dine planer',writing:{mode:'list',count:3,title:'Mine planer:'}}),'Mine planer:');});

test('desktop resizing saves on release; mobile resizing cannot change saved desktop dimensions',()=>{
 for(const desktop of [true,false]){
 const vm=require('node:vm'),fs=require('node:fs'),styles={},events={},classes=new Set();let saves=0;
 const state={tasks:[{id:'note'}]},card={isConnected:true,offsetWidth:240,offsetHeight:220,notePoint:{x:200,y:180},style:{setProperty:(key,value)=>styles[key]=value},classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)},getBoundingClientRect:()=>({left:200,top:180,width:240,height:220})};
 const window={YackI18n:require('../../public/i18n.js'),innerWidth:1440,scrollY:0,matchMedia:()=>({matches:desktop}),addEventListener(){}},document={querySelector(){}};
 vm.runInNewContext(fs.readFileSync('public/note-drag.js','utf8'),{window,document});
 const ui=window.MorningNoteDrag.create({getState:()=>state,model:{resizeNote:(_,id,size)=>state.tasks[0].noteSize={...size}},save:()=>saves++});
 ui.attach(card,{addEventListener(){}},'note',{addEventListener:(event,fn)=>events[event]=fn,setPointerCapture(){}});
 if(!desktop)state.tasks[0].noteSize={width:520,height:700};
 events.pointerdown({pointerType:desktop?'mouse':'touch',button:0,pointerId:1,clientX:440,clientY:400,preventDefault(){}});
 if(!desktop){events.pointermove({pointerId:1,clientX:540,clientY:460});events.pointerup({pointerId:1});events.keydown({key:'ArrowLeft',preventDefault(){}});assert(!classes.has('note-resizing'));assert.equal(saves,0);assert.deepEqual(state.tasks[0].noteSize,{width:520,height:700});continue;}
 assert(classes.has('note-resizing'));
 events.pointermove({pointerId:1,clientX:540,clientY:460});assert.equal(styles['--note-width'],'340px');assert.equal(styles['--note-height'],'280px');assert.equal(saves,0);
 events.pointerup({pointerId:1});assert.equal(saves,1);assert.deepEqual(state.tasks[0].noteSize,{width:340,height:280});assert(!classes.has('note-resizing'));
 events.keydown({key:'ArrowLeft',preventDefault(){}});assert.equal(state.tasks[0].noteSize.width,330);assert.equal(saves,2);
 assert.deepEqual(D.fitSize({width:20,height:9000},1440),{width:180,height:2000});
 }
});


test('missed mouse release and window blur cannot leave a note held',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),events={},windowEvents={},classes=new Set();let saves=0,releases=0;
 const state={tasks:[{id:'note'}]},card={isConnected:true,offsetWidth:240,offsetHeight:220,notePoint:{x:200,y:180},style:{setProperty(){}},classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)},getBoundingClientRect:()=>({left:200,top:180,width:240,height:220})};
 const window={YackI18n:require('../../public/i18n.js'),innerWidth:1440,scrollY:0,matchMedia:()=>({matches:true}),addEventListener:(type,fn)=>windowEvents[type]=fn},document={querySelector(){}};
 vm.runInNewContext(fs.readFileSync('public/note-drag.js','utf8'),{window,document});
 const ui=window.MorningNoteDrag.create({getState:()=>state,model:{moveNote:(_,id,point)=>state.tasks[0].notePosition=point},save:()=>saves++});
 ui.attach(card,{addEventListener:(type,fn)=>events[type]=fn,setPointerCapture(){},releasePointerCapture(){releases++;}},'note');
 const down=()=>events.pointerdown({pointerType:'mouse',button:0,pointerId:1,clientX:200,clientY:180,preventDefault(){}});
 down();events.pointermove({pointerType:'mouse',buttons:1,pointerId:1,clientX:300,clientY:280});events.pointermove({pointerType:'mouse',buttons:0,pointerId:1,clientX:500,clientY:500});
 assert(!classes.has('note-dragging'));assert.equal(saves,1);assert.equal(card.notePoint.x,300);assert.equal(releases,1);
 down();events.pointermove({pointerType:'mouse',buttons:1,pointerId:1,clientX:400,clientY:380});windowEvents.blur();
 assert(!classes.has('note-dragging'));assert.equal(card.notePoint.x,300);assert.equal(saves,1);assert.equal(releases,2);
 down();assert(classes.has('note-dragging'));events.pointerup({pointerId:1});assert(!classes.has('note-dragging'));
});


test('pins have stable varied size and length with ten distinct configurable colours',()=>{
 const a=P.geometry(17),b=P.geometry(18);assert.notEqual(a.pinSize,b.pinSize);assert.notEqual(a.pinLength,b.pinLength);assert(a.pinSize>=.9&&a.pinSize<=1.12);assert(a.pinLength>=.88&&a.pinLength<=1.14);
 assert.equal(P.colors.length,10);assert.equal(new Set(P.colors.map(c=>c.value)).size,10);assert.equal(P.color(17).id,P.color(17).id);assert.equal(P.color(17,'navy').id,'navy');
});


test('notes stay below the top bar while remaining freely placeable elsewhere',()=>{
 const size={width:240,height:260},menu={menuBottom:64};
 assert.deepEqual(D.safePosition({x:1200,y:12},size,menu,1440),{x:1192,y:68});
 assert.deepEqual(D.safePosition({x:530,y:300},size,menu,1440),{x:530,y:300});
 assert.equal(D.safePosition({x:530,y:300},size,{menuBottom:564},1440).y,568);
});

test('keyboard resizing starts from the rendered height of a content-sized note',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),events={};let saved;
 const card={offsetHeight:96,noteSize:{width:240,height:0},notePoint:{x:200,y:180},style:{setProperty(){}},classList:{add(){},remove(){}}};
 const handle={addEventListener(){}},resize={addEventListener:(name,callback)=>events[name]=callback};
 const window={YackI18n:require('../../public/i18n.js'),innerWidth:1440,matchMedia:()=>({matches:true}),addEventListener(){}},document={addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('public/note-drag.js','utf8'),{window,document});
 window.MorningNoteDrag.create({getState:()=>({tasks:[]}),model:{resizeNote:(_,id,size)=>saved=size},save(){}}).attach(card,handle,'note',resize);
 events.keydown({key:'ArrowDown',preventDefault(){}});assert.equal(saved.height,106);
});
