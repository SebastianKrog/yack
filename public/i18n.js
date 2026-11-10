(function(root){
  'use strict';
  const commonJS=typeof module!=='undefined'&&module.exports;
  const english=commonJS?require('./translations.js'):root.YackEnglish;
  const storageKey='yack-language';
  const supported=new Set(['en','da']);

  function detect(languages=[]){
    for(const value of languages){
      const language=String(value).toLowerCase().split(/[-_]/)[0];
      if(supported.has(language))return language;
    }
    return 'en';
  }
  function preference(){
    try{
      const value=root.localStorage.getItem(storageKey);
      return supported.has(value)?value:'auto';
    }catch{return 'auto';}
  }
  const selected=commonJS?'da':preference();
  const language=selected==='auto'?detect(root.navigator?.languages?.length?root.navigator.languages:[root.navigator?.language]):selected;
  const locale=language==='da'?'da-DK':'en-GB';

  function translate(source,target,...values){
    if(typeof source!=='string')return source;
    const key=source.trim();
    if(!key)return source;
    const message=target==='en'&&Object.hasOwn(english,key)?english[key]:key;
    const start=source.indexOf(key);
    const translated=values.length?message.replace(/\{(\d+)\}/g,(part,index)=>index<values.length?String(values[index]):part):message;
    return source.slice(0,start)+translated+source.slice(start+key.length);
  }
  const t=(source,...values)=>translate(source,language,...values);

  function translateStatic(node){
    if(node.nodeType===3){
      const translated=t(node.nodeValue);
      if(translated!==node.nodeValue)node.nodeValue=translated;
      return;
    }
    if(node.nodeType!==1||/^(SCRIPT|STYLE)$/i.test(node.tagName))return;
    for(const attr of ['aria-label','title','placeholder','alt','content']){
      const source=node.getAttribute(attr);
      if(source!=null){
        const translated=t(source);
        if(translated!==source)node.setAttribute(attr,translated);
      }
    }
    for(const child of node.childNodes)translateStatic(child);
  }
  function applyDocument(doc){
    doc.documentElement.lang=language;
    translateStatic(doc.documentElement);
    const picker=doc.querySelector('#yack-language');
    if(!picker)return;
    picker.value=selected;
    picker.addEventListener('change',()=>{
      if(!['auto','en','da'].includes(picker.value))return;
      try{root.localStorage.setItem(storageKey,picker.value);}
      catch{
        picker.value=selected;
        doc.querySelector('#yack-language-message').textContent=t('Sproget kunne ikke gemmes på denne enhed.');
        return;
      }
      root.location.reload();
    });
  }
  function historyLabel(label){
    const restored=/^Gendannet fra v(\d+)$/.exec(label);
    if(restored)return t('Gendannet fra v{0}',restored[1]);
    const imported='Importeret: ';
    if(label.startsWith(imported))return t('Importeret: {0}',historyLabel(label.slice(imported.length)));
    return t(label);
  }
  const api={t,translate,detect,locale,language,historyLabel};
  if(commonJS)module.exports=api;
  else {
    root.YackI18n=api;
    applyDocument(root.document||document);
  }
})(typeof window!=='undefined'?window:globalThis);
