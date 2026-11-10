(function(root) {
  'use strict';
  const tags={'*':['em'],'**':['strong'],'***':['strong','em'],'_':['u']};
  function parse(source) {
    const markers=Array.from(source.matchAll(/\*+|_+/g)),nodes=[];
    let cursor=0;
    for(const marker of markers) {
      const start=marker.index,delimiter=marker[0],content=start+delimiter.length;
      if(start<cursor||!Object.hasOwn(tags,delimiter)||!source[content]||/\s/.test(source[content]))continue;
      // Keep underscores within filenames and ordinary words literal.
      if(delimiter==='_'&&/[\p{L}\p{N}]/u.test(source[start-1]||''))continue;
      const close=markers.find(m=>m.index>=content&&m[0]===delimiter&&!/\s/.test(source[m.index-1])&&(delimiter!=='_'||!/[\p{L}\p{N}]/u.test(source[m.index+1]||'')));
      if(!close)continue;
      if(start>cursor)nodes.push({type:'text',text:source.slice(cursor,start)});
      nodes.push(...tags[delimiter].reduceRight((children,type)=>[{type,children}],parse(source.slice(content,close.index))));
      cursor=close.index+delimiter.length;
    }
    if(cursor<source.length)nodes.push({type:'text',text:source.slice(cursor)});
    return nodes;
  }
  function plain(source) {
    const flatten=nodes=>nodes.map(n=>n.type==='text'?n.text:flatten(n.children)).join('');
    return flatten(parse(source));
  }
  function render(element,source) {
    const doc=element.ownerDocument;
    const build=node=>{
      if(node.type==='text')return doc.createTextNode(node.text);
      const el=doc.createElement(node.type);el.append(...node.children.map(build));return el;
    };
    element.replaceChildren(...parse(source).map(build));
    element.dataset.source=source;
  }
  function lines(rects) {
    const result=[];
    for(const rect of Array.from(rects).filter(r=>r.width>0&&r.height>0).sort((a,b)=>a.top-b.top||a.left-b.left)) {
      const center=rect.top+rect.height/2;
      const line=result.find(r=>Math.abs(r.top+r.height/2-center)<Math.min(r.height,rect.height)*.45);
      if(line){
        line.left=Math.min(line.left,rect.left);line.right=Math.max(line.right,rect.right);
        line.top=Math.min(line.top,rect.top);line.bottom=Math.max(line.bottom,rect.bottom);
        line.width=line.right-line.left;line.height=line.bottom-line.top;
      } else result.push({left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height});
    }
    return result;
  }
  const api={parse,plain,render,lines};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.MorningFormatting=api;
})(typeof window!=='undefined'?window:globalThis);
