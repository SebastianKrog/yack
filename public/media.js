(function(root){
  'use strict';
  const {t:translateUI}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
  const M=root.MorningMediaModel,urls=new Map();let database,pdfLibrary;
  function uuid(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
  function db(){return database??=new Promise((resolve,reject)=>{const r=indexedDB.open('yack-media',1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error(translateUI("Filen kunne ikke gemmes på denne enhed.")));});}
  async function local(id){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('files').objectStore('files').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function put(row){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('files','readwrite');t.objectStore('files').put(row);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}
  function url(blob,id){if(!urls.has(id))urls.set(id,URL.createObjectURL(blob));return urls.get(id);}
  async function pdf(){if(!pdfLibrary)pdfLibrary=import('/vendor/pdfjs/pdf.mjs').then(lib=>{lib.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';return lib;});return pdfLibrary;}
  async function documentPDF(blob){const lib=await pdf(),task=lib.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,enableXfa:false,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'});try{return await task.promise;}catch(error){await task.destroy().catch(()=>{});throw error;}}
  async function renderPage(doc,pageNumber,canvas,width=1400){const page=await doc.getPage(pageNumber),natural=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2,width/natural.width)});canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;page.cleanup();return natural;}
  function canvasBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error(translateUI("Forhåndsvisningen kunne ikke laves."))),'image/jpeg',.88));}
  async function importFile(file){
    if(!file||!M.types.includes(file.type))throw new Error(translateUI("Vælg et billede (JPG, PNG, WebP, GIF eller AVIF) eller en PDF."));
    if(!file.size||file.size>M.limit)throw new Error(translateUI("Filen må højst fylde 20 MB."));
    const canvas=document.createElement('canvas');let width,height,pages=1;
    if(file.type==='application/pdf'){
      let doc;try{doc=await documentPDF(file);pages=doc.numPages;const v=await renderPage(doc,1,canvas);width=v.width;height=v.height;}catch{throw new Error(translateUI("PDF’en kunne ikke læses. Brug en gyldig PDF uden adgangskode."));}finally{await doc?.loadingTask.destroy();}
    }else{
      let bitmap;try{bitmap=await createImageBitmap(file);width=bitmap.width;height=bitmap.height;if(width*height>100000000)throw new Error();const scale=Math.min(1,1600/Math.max(width,height));canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);}catch{throw new Error(translateUI("Billedet kunne ikke læses, eller det er for stort."));}finally{bitmap?.close();}
    }
    const asset={id:uuid(),name:file.name.slice(0,240)||translateUI("Billede"),type:file.type,size:file.size,width,height,pages};
    if(!M.validAsset(asset))throw new Error(translateUI("Filen har et format eller en størrelse, der ikke understøttes."));
    await put({id:asset.id,asset,original:file,preview:await canvasBlob(canvas),uploaded:{}});return asset;
  }
  async function blob(asset,variant='preview'){
    let row=await local(asset.id);if(row?.[variant])return row[variant];
    const response=await fetch(`/api/media?id=${encodeURIComponent(asset.id)}&variant=${variant}`,{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw new Error(response.status===401?translateUI("Log ind på profilen for at hente filen."):translateUI("Filen er ikke tilgængelig på denne enhed endnu."));
    const data=await response.blob();row={...row,id:asset.id,asset,[variant]:data};await put(row);return data;
  }
  async function syncAssets(state,owner,generation){
    if(!owner)return true;let complete=true;const assets=new Map((state.tasks||[]).filter(t=>t.writing?.mode==='media'&&M.validAsset(t.writing.asset)).map(t=>[t.writing.asset.id,t.writing.asset]));
    for(const asset of assets.values()){
      try{const row=await local(asset.id);if(!row?.original||!row.preview||row.uploaded?.[owner]===generation)continue;
        const body=new FormData();body.append('asset',JSON.stringify(asset));body.append('file',row.original,asset.name);body.append('preview',row.preview,'preview.jpg');
        const result=await fetch(`/api/media?generation=${generation}`,{method:'POST',body,credentials:'same-origin',signal:AbortSignal.timeout(60000)});if(!result.ok){complete=false;continue;}
        row.uploaded={...row.uploaded,[owner]:generation};await put(row);
      }catch{complete=false;/* Keep the local original; the next normal sync retries the upload. */}
    }return complete;
  }
  function mount(container,config,{compact=false,interactive=true}={}){
    const asset=config?.asset;if(!M.validAsset(asset))return;
    container.dataset.mediaType=asset.type==='application/pdf'?'pdf':'image';
    container.classList.add('media-preview');container.dataset.mat=asset.type==='application/pdf'?'none':M.border(config);container.style.setProperty('--media-ratio',M.ratio(config));container.style.setProperty('--image-ratio',asset.width/asset.height);const edge=asset.type==='application/pdf'?0:Math.min(asset.width,asset.height)*({none:0,small:.045,large:.12}[M.border(config)]);container.style.setProperty('--mat-size',`${edge/(asset.width+edge*2)*100}%`);
    const stack=document.createElement('div');stack.className='media-paper-stack';if(asset.pages>1){stack.classList.add('has-pages');stack.dataset.pages=String(asset.pages);}
    const frame=document.createElement(interactive?'button':'div');if(interactive){frame.type='button';frame.setAttribute('aria-label',translateUI("Åbn {0}", asset.name));frame.addEventListener('click',()=>viewer(asset));}frame.className='media-frame';
    const image=document.createElement('img');image.alt=compact?'':asset.name;image.draggable=false;image.decoding='async';frame.append(image);stack.append(frame);container.append(stack);
    if(asset.type==='application/pdf')image.addEventListener('load',()=>{try{const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,32,32);container.style.setProperty('--media-paper-color',M.paperColor(ctx.getImageData(0,0,32,32)));}catch{/* White paper remains the fallback if sampling is unavailable. */}});
    const message=document.createElement('span');message.className='media-loading';message.textContent=translateUI("Henter fil …");message.setAttribute('role','status');frame.append(message);
    blob(asset).then(data=>{if(!container.isConnected)return;image.src=url(data,asset.id+':preview');message.remove();}).catch(error=>{message.textContent=error.message;});
    if(asset.pages>1&&!compact){const count=document.createElement('span');count.className='media-page-count';count.textContent=`${asset.pages} sider`;container.append(count);}
  }
  async function viewer(asset){
    const dialog=document.createElement('dialog');dialog.className='media-viewer';dialog.setAttribute('aria-label',asset.name);
    const header=document.createElement('header'),title=document.createElement('span'),close=document.createElement('button');title.textContent=asset.name;close.type='button';close.className='quiet-button media-viewer-close';close.setAttribute('aria-label',translateUI("Luk fil"));close.innerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 4 Q14 16 27 28 M28 5 Q18 15 4 27"/></svg>';close.addEventListener('click',()=>dialog.close());header.append(title,close);
    const body=document.createElement('div');body.className='media-viewer-body';const status=document.createElement('p');status.textContent=translateUI("Henter fil …");body.append(status);dialog.append(header,body);document.body.append(dialog);let doc,closed=false,page=1;
    dialog.addEventListener('close',()=>{closed=true;doc?.loadingTask.destroy().catch(()=>{});dialog.remove();},{once:true});dialog.showModal();
    try{
      const original=await blob(asset,'original');if(closed)return;
      const download=document.createElement('a');download.href=url(original,asset.id+':original');download.download=asset.name;download.textContent=translateUI("Hent fil");download.className='quiet-button';header.insertBefore(download,close);
      if(asset.type!=='application/pdf'){const img=document.createElement('img');img.src=download.href;img.alt=asset.name;body.replaceChildren(img);return;}
      doc=await documentPDF(original);if(closed){await doc.loadingTask.destroy();return;}
      const canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',asset.name);body.replaceChildren(canvas);
      const nav=document.createElement('nav'),prev=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');nav.className='media-pages';prev.type=next.type='button';prev.textContent='←';next.textContent='→';prev.setAttribute('aria-label',translateUI("Forrige side"));next.setAttribute('aria-label',translateUI("Næste side"));nav.append(prev,label,next);dialog.append(nav);
      async function draw(){prev.disabled=next.disabled=true;label.textContent=`${page} / ${doc.numPages}`;await renderPage(doc,page,canvas,1800);if(closed)return;prev.disabled=page===1;next.disabled=page===doc.numPages;}
      prev.addEventListener('click',()=>{page--;draw().catch(()=>{});});next.addEventListener('click',()=>{page++;draw().catch(()=>{});});await draw();
    }catch(error){if(!closed){status.textContent=error.message;body.replaceChildren(status);}}
  }
  function picker(config,onChange){
    const zone=document.createElement('div');zone.className='media-drop-zone';const choose=document.createElement('button');choose.type='button';choose.className='quiet-button media-choose';choose.textContent=config?.asset?translateUI("Skift billede eller PDF"):translateUI("Slip et billede eller en PDF her");
    const input=document.createElement('input');input.type='file';input.accept=M.types.join(',');input.hidden=true;input.setAttribute('aria-label',translateUI("Vælg billede eller PDF"));
    const hint=document.createElement('small');hint.textContent=translateUI("eller klik for at vælge · højst 20 MB");const message=document.createElement('p');message.className='form-message';message.setAttribute('role','status');zone.append(choose,hint,input,message);
    async function load(files){if(files.length!==1){message.textContent=translateUI("Vælg én fil ad gangen.");return;}choose.disabled=true;zone.setAttribute('aria-busy','true');message.textContent=translateUI("Gør filen klar …");try{const asset=await importFile(files[0]);await onChange(asset);message.textContent='';}catch(error){message.textContent=error.message;}finally{choose.disabled=false;zone.removeAttribute('aria-busy');input.value='';}}
    choose.addEventListener('click',()=>input.click());input.addEventListener('change',()=>{if(input.files.length)load(input.files);});
    let depth=0;zone.addEventListener('dragenter',event=>{event.preventDefault();depth++;zone.classList.add('is-over');});zone.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';});zone.addEventListener('dragleave',()=>{if(--depth<=0)zone.classList.remove('is-over');});zone.addEventListener('drop',event=>{event.preventDefault();event.stopPropagation();depth=0;zone.classList.remove('is-over');if(event.dataTransfer.files.length)load(event.dataTransfer.files);});
    if(config?.asset){const preview=document.createElement('div');preview.className='media-picker-preview';mount(preview,config);zone.prepend(preview);}return zone;
  }
  async function clearLocal(){if(!root.indexedDB)return;const d=await db();await new Promise((resolve,reject)=>{const t=d.transaction('files','readwrite');t.objectStore('files').clear();t.oncomplete=resolve;t.onerror=()=>reject(t.error);});for(const value of urls.values())URL.revokeObjectURL(value);urls.clear();}
  root.MorningMedia={clearLocal,importFile,mount,picker,viewer,syncAssets};
})(window);
