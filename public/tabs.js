(function(root){
  'use strict';
  const tabs=new Map(),paths={editor:'/edit',trophies:'/trophies',profile:'/profile'};
  let current=null,started=false;
  function apply(name){
    current=name;for(const [id,tab] of tabs)if(id!==name)tab.close();
    const tab=tabs.get(name);if(tab&&!tab.isOpen())tab.open();
    if(root.Event&&root.dispatchEvent)root.dispatchEvent(new root.Event('yackviewchange'));
  }
  function navigate(name){
    const path=paths[name]||'/';
    if(root.location&&root.history&&root.location.pathname!==path)root.history.pushState(null,'',path+root.location.search+root.location.hash);
    apply(name);
  }
  function show(name){if(tabs.has(name))navigate(name);}
  function close(name){if(current===name)navigate(null);else tabs.get(name)?.close();}
  function toggle(name){const tab=tabs.get(name);if(tab?.isOpen())close(name);else show(name);}
  function restore(){const path=root.location?.pathname.replace(/\/+$/,'')||'/';apply(Object.keys(paths).find(name=>paths[name]===path&&tabs.has(name))||null);}
  function start(){if(started)return;started=true;root.addEventListener?.('popstate',restore);restore();}
  root.MorningTabs={hasModal:()=>Array.from(document.querySelectorAll('dialog')).some(node=>node.open&&node.matches(':modal')),register:(name,tab)=>tabs.set(name,tab),show,close,toggle,start};
})(window);
