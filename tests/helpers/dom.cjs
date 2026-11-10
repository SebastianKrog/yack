// Lightweight DOM for behavior tests; it does not render or measure browser CSS.
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {script,projectRoot}=require('./scripts.cjs');
const html=fs.readFileSync(path.join(projectRoot,'site/index.html'),'utf8');
const appScripts=['translations','i18n','tabs','sound','scribbles','confetti','stats','recurrence','editor-ui','schedule-editor','list-editor','reminders','media-model','media','lists','emphasis','tasks','task-json','task-versions','formatting','deferral','ink','task-drag','achievements','achievement-ui','xor-ui','note-paper','note-drag','mobile-notes','writing','sync-data','sync','reminder-ui','recovery','app'].map(script);
function appFixture(saved,{desktop=true,path,fetcher,stored,languages=['da-DK']}={}){
 let doc;
 class El{
  constructor(tag,text=''){this.tag=tag;this.text=text;this.children=[];this.parentNode=null;this.attrs={};this.dataset={};this.handlers=new Map();this.style={setProperty(k,v){this[k]=v;}};this.classes=new Set();this.classList={add:(...v)=>v.forEach(x=>this.classes.add(x)),remove:(...v)=>v.forEach(x=>this.classes.delete(x)),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x),contains:x=>this.classes.has(x)};this.hidden=false;this.open=false;}
  get ownerDocument(){return doc;}
  get nodeType(){return this.tag==='#text'?3:1;}
  get nodeValue(){return this.nodeType===3?this.text:null;}
  set nodeValue(value){if(this.nodeType===3)this.text=value;}
  get tagName(){return this.tag.toUpperCase();}
  get childNodes(){return this.children;}
  set className(v){this.classes=new Set(v.split(/\s+/).filter(Boolean));}
  get className(){return [...this.classes].join(' ');}
  get textContent(){return this.tag==='#text'?this.text:this.children.map(c=>c.textContent).join('');}
  set textContent(v){if(this.tag==='#text')this.text=v;else this.replaceChildren(new El('#text',String(v)));}
  set innerHTML(html){
   this.replaceChildren();const stack=[this],voids=new Set(['meta','link','input','br','img']);
   for(const token of html.match(/<[^>]+>|[^<]+/g)||[]){
    if(/^<!/.test(token))continue;
    if(/^<\//.test(token)){stack.pop();continue;}
    if(token.startsWith('<')){
     const tag=token.match(/^<([\w-]+)/)[1],el=new El(tag);
     for(const attr of token.matchAll(/([\w-]+)(?:="([^"]*)")?/g))if(attr.index>1)el.setAttribute(attr[1],attr[2]??'');
     stack.at(-1).append(el);if(!voids.has(tag)&&!token.endsWith('/>'))stack.push(el);
    }else stack.at(-1).append(new El('#text',token));
   }
  }
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='class')this.className=v;if(k==='hidden')this.hidden=true;if(k==='value')this.value=v;if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;}
  getAttribute(k){return this.attrs[k];}
  removeAttribute(k){delete this.attrs[k];if(k.startsWith('data-'))delete this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];}
  append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;this.children.push(node);}}
  replaceChildren(...nodes){for(const c of this.children)c.parentNode=null;this.children=[];this.append(...nodes);}
  insertBefore(node,next){node.remove();node.parentNode=this;const i=this.children.indexOf(next);if(i<0)this.children.push(node);else this.children.splice(i,0,node);}
  remove(){if(this.parentNode){const p=this.parentNode;p.children=p.children.filter(c=>c!==this);this.parentNode=null;}}
  matches(selector){if(selector===':modal')return this.open&&!!this.modal;if(selector===':focus-visible')return false;if(selector.startsWith('.'))return this.classes.has(selector.slice(1));if(selector.startsWith('#'))return this.attrs.id===selector.slice(1);if(selector==='li[data-task-id]')return this.tag==='li'&&this.dataset.taskId!==undefined;return this.tag===selector;}
  querySelectorAll(selector){const found=[];for(const c of this.children){if(c.matches(selector))found.push(c);found.push(...c.querySelectorAll(selector));}return found;}
  querySelector(selector){for(const child of this.children){if(child.matches(selector))return child;const match=child.querySelector(selector);if(match)return match;}return null;}
  contains(el){return this===el||this.children.some(c=>c.contains(el));}
  closest(s){for(let el=this;el;el=el.parentNode)if(el.matches(s))return el;return null;}
  get isConnected(){return doc.root.contains(this);}
  addEventListener(type,fn,opts){const list=this.handlers.get(type)||[];list.push({fn,capture:opts===true||!!opts?.capture});this.handlers.set(type,list);}
  removeEventListener(type,fn){this.handlers.set(type,(this.handlers.get(type)||[]).filter(h=>h.fn!==fn));}
  fire(type,values={}){
   let stopped=false;const path=[];for(let el=this;el;el=el.parentNode)path.push(el);
   const event={target:this,pointerType:'mouse',pointerId:1,clientX:0,clientY:0,defaultPrevented:false,...values,preventDefault(){this.defaultPrevented=true;},stopPropagation(){stopped=true;},stopImmediatePropagation(){stopped=true;}};
   for(const el of [...path].reverse())for(const h of el.handlers.get(type)||[])if(h.capture&&!stopped)h.fn(event);
   for(const el of path)for(const h of el.handlers.get(type)||[])if(!h.capture&&!stopped)h.fn(event);
   return event;
  }
  requestSubmit(){if(!this.querySelectorAll('input,textarea').some(field=>field.required&&!field.value))this.fire('submit');}
  focus(){doc.activeElement=this;}
  showModal(){this.open=true;this.modal=true;}
  show(){this.open=true;this.modal=false;}
  close(){this.open=false;this.fire('close');}
  getContext(){return null;}
  getBoundingClientRect(){return {left:0,top:0,right:500,bottom:36,width:500,height:36};}
 }
 const root=new El('root');doc={root,createElement:tag=>new El(tag),createElementNS:(_,tag)=>new El(tag),createTextNode:text=>new El('#text',text),querySelector:s=>root.querySelector(s),querySelectorAll:s=>root.querySelectorAll(s),addEventListener:(...args)=>root.addEventListener(...args),hidden:false,createRange(){let node;return {selectNodeContents(n){node=n;},getClientRects(){const width=node.textContent.length*10;return [{left:0,top:0,right:width,bottom:36,width,height:36}];}};}};
 root.innerHTML=html;doc.documentElement=root.querySelector('html');doc.body=root.querySelector('body');doc.activeElement=doc.body;
 const storage=new Map(stored);if(saved)storage.set('starting-work-v2',JSON.stringify(saved));
 const timers=new Map(),intervals=[];let timerId=0;
 const window={navigator:{languages},AbortController,AbortSignal,localStorage:null,fetch:fetcher,matchMedia:query=>({matches:query.includes('min-width: 900px')?desktop:true}),addEventListener(){},innerWidth:800,innerHeight:600,devicePixelRatio:1};
 window.location={pathname:path||'/',search:'',hash:'',reload(){window.reloaded=true;}};
 if(path){window.history={pushState:(_state,_title,url)=>{window.location.pathname=url.split(/[?#]/)[0];}};}
 const context={window,document:doc,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),setInterval(fn,ms){intervals.push({fn,ms});},cancelAnimationFrame(){},requestAnimationFrame(){},Date,Math,Intl};
 window.localStorage=context.localStorage;context.localStorage.key=i=>[...storage.keys()][i]??null;Object.defineProperty(context.localStorage,'length',{get:()=>storage.size});
 vm.createContext(context);
 for(const compiled of appScripts)compiled.runInContext(context);
 return {doc,window,timers,intervals,storage,get:selector=>doc.querySelector(selector),saved:()=>JSON.parse(storage.get('starting-work-v2')),flushRender(){const entries=[...timers].filter(([,v])=>v.ms===0);for(const [id,v] of entries){timers.delete(id);v.fn();}if([...timers.values()].some(v=>v.ms===0))this.flushRender();}};
}
module.exports={appFixture};
