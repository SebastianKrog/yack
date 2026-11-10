const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const M=require('../../public/tasks.js');
const D=require('../../public/task-drag.js');
function state(){const s=M.fresh('2026-10-13');s.tasks=[];['a','b','c'].forEach(id=>M.add(s,id,null,id));return s;}
const rects=[{id:'a',top:0,bottom:60},{id:'b',top:60,bottom:120},{id:'c',top:120,bottom:180}];
test('mouse and touch coordinates project a nested task below the preceding task',()=>{
 const s=state(),location=D.projectAt(M,s,'b',0,10,35,45,rects);
 assert.equal(location.index,1);assert.equal(location.depth,1);assert.equal(location.parentId,'a');
 M.place(s,'b',location.index,location.depth);assert.equal(s.tasks.find(t=>t.id==='b').parentId,'a');
});
test('horizontal dragging on the same row can indent without changing its slot',()=>{
 const s=state(),location=D.projectAt(M,s,'b',0,10,35,90,rects);
 assert.equal(location.parentId,'a');assert.equal(location.targetId,'b');
});
test('dragging a branch never treats its descendants as candidate parents',()=>{
 const s=state();M.update(s,'c','c','b');const location=D.projectAt(M,s,'b',0,10,99,155,rects);
 assert.notEqual(location.parentId,'c');
});
function fixture(){
 class El{
  constructor(id,top=0){this.dataset=id?{taskId:id}:{};this.handlers={};this.children=[];this.parent=null;this.rect={left:0,top,bottom:top+60,width:420,height:60};this.style={setProperty(){}};this.classes=new Set();this.classList={add:(...x)=>x.forEach(c=>this.classes.add(c)),remove:(...x)=>x.forEach(c=>this.classes.delete(c))};this.capture=null;this.scrollTop=0;}
  addEventListener(name,fn){this.handlers[name]=fn;}
  getBoundingClientRect(){return this.rect;}
  append(...elements){elements.forEach(el=>{el.parent=this;this.children.push(el);});}
  setAttribute(){}
  removeAttribute(name){if(name==='data-task-id')delete this.dataset.taskId;}
  cloneNode(){return new El(this.dataset.taskId,this.rect.top);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(el=>el!==this);}
  focus(){}
  setPointerCapture(id){this.capture=id;}
  hasPointerCapture(id){return this.capture===id;}
  releasePointerCapture(id){if(this.capture===id)this.capture=null;this.handlers.lostpointercapture?.();}
 }
 const list=new El(),editor=new El();editor.rect={left:0,top:0,bottom:240,width:440,height:240};
 rects.forEach(r=>list.append(new El(r.id,r.top)));const s=state(),commits=[];
 const frames=new Map();let frameId=0;
 const context={window:{YackI18n:require('../../public/i18n.js')},document:{createElement:()=>new El()},requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),Math};
 vm.createContext(context);vm.runInContext(fs.readFileSync('public/task-drag.js','utf8'),context);
 const controller=context.window.MorningTaskDrag.create({model:M,getState:()=>s,list,editor,onCommit:(id,location)=>{commits.push(location);M.place(s,id,location.index,location.depth);}});
 const handle=new El();controller.attach(handle,'b');
 function fire(name,x,y,type='touch'){handle.handlers[name]({pointerId:7,pointerType:type,isPrimary:true,button:0,clientX:x,clientY:y,preventDefault(){}});}
 return {s,commits,handle,editor,list,frames,fire,controller};
}
for(const type of ['mouse','touch'])test(`${type} drag captures input, previews, commits and cleans up`,()=>{
 const f=fixture();f.fire('pointerdown',10,90,type);assert.equal(f.handle.capture,7);
 f.fire('pointermove',35,45,type);assert(f.editor.classes.has('is-dragging'));assert.equal(f.editor.children.length,3);
 assert.equal(f.editor.children[0].style.left,'24px');
 assert.equal(f.editor.children[2].children[0].textContent,'Niveau 2 · Efter a');
 assert(f.list.children[0].classes.has('drop-parent'));
 f.fire('pointerup',35,45,type);assert.equal(f.commits.length,1);assert.equal(f.s.tasks.find(t=>t.id==='b').parentId,'a');
 assert.equal(f.handle.capture,null);assert.equal(f.editor.children.length,0);assert.equal(f.frames.size,0);
});
test('touch cancellation restores the editor without moving a task',()=>{
 const f=fixture();f.fire('pointerdown',10,90);f.fire('pointermove',35,45);f.fire('pointercancel',35,45);
 assert.equal(f.commits.length,0);assert.equal(f.s.tasks.find(t=>t.id==='b').parentId,null);assert.equal(f.editor.children.length,0);assert.equal(f.frames.size,0);
});
test('a tap below the drag threshold does not reorder tasks',()=>{
 const f=fixture();f.fire('pointerdown',10,90);f.fire('pointermove',12,91);f.fire('pointerup',12,91);
 assert.equal(f.commits.length,0);assert.equal(f.editor.children.length,0);
});
