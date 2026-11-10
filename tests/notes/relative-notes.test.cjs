const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const M=require('../../public/tasks.js'),D=require('../../public/sync-data.js');
function fixture(position,{desktop=true}={}){
 const state={tasks:[{id:'note',writing:{mode:'note',count:1},...(position?{notePosition:position}:{})}]},styles={},events={};let saves=0;
 const bounds={left:420,top:200,width:560},card={isConnected:true,offsetWidth:240,offsetHeight:220,style:{setProperty:(k,v)=>styles[k]=v},classList:{add(){},remove(){}},getBoundingClientRect:()=>({left:790,top:350,width:240,height:220})};
 const window={YackI18n:require('../../public/i18n.js'),innerWidth:1440,scrollY:0,matchMedia:()=>({matches:desktop}),addEventListener:(type,fn)=>events[type]=fn};
 const document={querySelector(selector){if(selector==='.view-stage')return {getBoundingClientRect:()=>({...bounds,right:bounds.left+bounds.width,bottom:bounds.top+500})};if(selector==='.page-header')return {getBoundingClientRect:()=>({top:bounds.top-73})};if(selector==='.top-menu')return {getBoundingClientRect:()=>({bottom:64})};}};
 vm.runInNewContext(fs.readFileSync('public/note-drag.js','utf8'),{window,document});
 const ui=window.MorningNoteDrag.create({getState:()=>state,model:M,save:()=>saves++});ui.attach(card,{addEventListener(){}},'note');
 return {state,styles,bounds,window,events,ui,get saves(){return saves;}};
}
test('narrow windows constrain rendering without replacing the saved offset; widening restores it',()=>{
 const f=fixture({x:600,y:150,space:'list'});f.ui.layout();assert.equal(f.styles['--note-x'],'1020px');
 f.window.innerWidth=1000;f.bounds.left=220;f.ui.layout();assert.equal(f.styles['--note-x'],'752px');assert.equal(f.state.tasks[0].notePosition.x,600);assert.equal(f.saves,0);
 f.window.innerWidth=1920;f.bounds.left=680;f.ui.layout();assert.equal(f.styles['--note-x'],'1280px');assert.equal(f.saves,0);
});
test('relative positions left of or above the list survive reopening and cloud sync for every note scope',()=>{
 for(const scope of ['recurring','temporary','permanent']){
  const state=M.fresh('2026-10-20'),task=scope==='recurring'?state.tasks.find(t=>t.id==='initial-2'):M.createTemporaryNote(state,'note');
  if(scope==='permanent')M.setNotePermanence(state,task.id,true);
  const point={x:-240,y:-30,space:'list'};assert(M.moveNote(state,task.id,point));assert.deepEqual(M.restore(state,state.day).tasks.find(t=>t.id===task.id).notePosition,point);
  const restored=D.materialize(D.capture(state),state.day).state.tasks.find(t=>t.id===task.id);assert.deepEqual(restored.notePosition,point);
  assert.equal(M.moveNote(state,task.id,{x:0,y:0,space:'unknown'}),null);assert.equal(M.moveNote(state,task.id,{x:-1,y:0}),null);
 }
});
test('mobile layouts retain their separate placement without changing desktop positions',()=>{
 const f=fixture({x:790,y:350,space:'list'},{desktop:false});f.state.tasks[0].noteMobilePosition={x:.3,y:400,space:'page'};f.ui.layout();assert.deepEqual(f.state.tasks[0].notePosition,{x:790,y:350,space:'list'});assert.deepEqual(f.state.tasks[0].noteMobilePosition,{x:.3,y:400,space:'page'});assert.equal(f.saves,0);
});
