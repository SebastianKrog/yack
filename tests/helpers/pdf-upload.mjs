// Exercise the shipped media code against the installed PDF.js, without a browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),packagePath=require.resolve('pdfjs-dist/package.json');
const canvas=require(require.resolve('@napi-rs/canvas',{paths:[packagePath]}));
// PDF.js requires its Node-compatible entry point in this test harness.
const lib=await import('pdfjs-dist/legacy/build/pdf.mjs');
const tasks=[],destroyed=[];let onLoad;
const pdf={...lib,GlobalWorkerOptions:lib.GlobalWorkerOptions,getDocument(options){lib.GlobalWorkerOptions.workerSrc=require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');const task=lib.getDocument(options),destroy=task.destroy.bind(task);task.destroy=()=>{const pending=destroy();destroyed.push(pending);return pending;};tasks.push(task);onLoad?.();return task;}};
const pdfModule=new vm.SyntheticModule(Object.keys(pdf),function(){for(const [key,value] of Object.entries(pdf))this.setExport(key,value);});await pdfModule.link(()=>{});await pdfModule.evaluate();
function fixturePDF(){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 450] /Resources << >> /Contents 5 0 R >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 450] /Resources << >> /Contents 5 0 R >>'];
 const drawing='0.3 0.5 0.4 rg 25 25 250 400 re f\n';objects.push(`<< /Length ${drawing.length} >>\nstream\n${drawing}endstream`);
 let text='%PDF-1.7\n',offsets=[0];objects.forEach((object,i)=>{offsets.push(text.length);text+=`${i+1} 0 obj\n${object}\nendobj\n`;});const xref=text.length;text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return new File([text],'two-pages.pdf',{type:'application/pdf'});
}
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.handlers={};this.attrs={};this.style={setProperty(){}};this.classList={add(){}};this.dataset={};}
 setAttribute(k,v){this.attrs[k]=v;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 insertBefore(node,before){this.children.splice(this.children.indexOf(before),0,node);}
 addEventListener(name,fn){(this.handlers[name]??=[]).push(fn);}
 showModal(){this.open=true;}
 close(){this.open=false;for(const fn of this.handlers.close||[])fn();}
 remove(){this.removed=true;}
}
const body=new Element('body'),stored=new Map();
const database={createObjectStore(){},transaction(){const transaction={objectStore(){return {get(id){const r={};queueMicrotask(()=>{r.result=stored.get(id);r.onsuccess();});return r;},put(row){stored.set(row.id,row);queueMicrotask(()=>transaction.oncomplete());}};}};return transaction;}};
const indexedDB={open(){const r={result:database};queueMicrotask(()=>r.onsuccess());return r;}};
const document={body,createElement(tag){if(tag!=='canvas')return new Element(tag);const element=canvas.createCanvas(1,1);element.setAttribute=()=>{};element.toBlob=fn=>fn(new Blob([element.toBuffer('image/jpeg')],{type:'image/jpeg'}));return element;}};
const window={YackI18n:require('../../public/i18n.js'),MorningMediaModel:require('../../public/media-model.js'),indexedDB};
const context=vm.createContext({window,document,indexedDB,Blob,Uint8Array,URL,crypto,console});
await new vm.Script(await fs.readFile(new URL('../../public/media.js',import.meta.url),'utf8'),{importModuleDynamically:()=>pdfModule}).runInContext(context);
const file=fixturePDF(),asset=await window.MorningMedia.importFile(file);
assert.equal(asset.pages,2);assert.equal(asset.width,300);assert.equal(asset.height,450);assert(stored.get(asset.id).preview.size>0);assert(tasks[0].destroyed);assert.equal(typeof (await tasks[0].promise).destroy,'undefined');
// The viewer must also clean up on close, including a close while loading.
await window.MorningMedia.viewer(asset);const dialog=body.children.at(-1);assert.equal(dialog.children.at(-1).children[1].textContent,'1 / 2');dialog.close();assert(dialog.removed);assert(tasks[1].destroyed);
onLoad=()=>body.children.at(-1).close();await window.MorningMedia.viewer(asset);onLoad=null;assert(body.children.at(-1).removed);assert(tasks[2].destroyed);
await assert.rejects(window.MorningMedia.importFile(new File(['not a PDF'],'bad.pdf',{type:'application/pdf'})),/PDF’en kunne ikke læses/);
assert(tasks.at(-1).destroyed);await Promise.all(destroyed);
console.log('PDF upload, preview, page count, viewer close and invalid-file cleanup passed.');
