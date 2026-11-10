(function(root) {
  'use strict';
  const svgNS='http://www.w3.org/2000/svg';
  let maskID=0;
  function pressure(seed,length) {
    const count=Math.max(4,Math.ceil(length/35)),anchors=[];
    for(let i=0;i<=count;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;anchors.push(.86+seed/4294967296*.28);}
    return t=>{
      t=Math.max(0,Math.min(1,t));const pos=t*count,i=Math.min(count-1,Math.floor(pos)),u=pos-i,smooth=u*u*(3-2*u);
      const value=anchors[i]+(anchors[i+1]-anchors[i])*smooth;
      return value*(.8+.2*Math.min(1,t/.025,(1-t)/.025));
    };
  }
  function outline(points,width,seed,length) {
    const pen=pressure(seed,length),left=[],right=[];
    const at=i=>points[Math.max(0,Math.min(points.length-1,i))];
    for(let i=0;i<points.length;i++){
      const p=points[i],a=at(i-1),b=at(i+1),dx=b.x-a.x,dy=b.y-a.y,span=Math.hypot(dx,dy)||1;
      const radius=width*pen(i/(points.length-1))/2,nx=-dy/span,ny=dx/span;
      left.push({x:p.x+nx*radius,y:p.y+ny*radius});right.push({x:p.x-nx*radius,y:p.y-ny*radius});
    }
    const pair=p=>`${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
    const first=points[0],last=points.at(-1),start=at(1),end=at(points.length-2);
    const startSpan=Math.hypot(start.x-first.x,start.y-first.y)||1,endSpan=Math.hypot(last.x-end.x,last.y-end.y)||1;
    const startRadius=width*pen(0)/2,endRadius=width*pen(1)/2;
    const capEnd={x:last.x+(last.x-end.x)/endSpan*endRadius*2,y:last.y+(last.y-end.y)/endSpan*endRadius*2};
    const capStart={x:first.x-(start.x-first.x)/startSpan*startRadius*2,y:first.y-(start.y-first.y)/startSpan*startRadius*2};
    return `M${pair(left[0])} ${left.slice(1).map(p=>'L'+pair(p)).join(' ')} Q${pair(capEnd)} ${pair(right.at(-1))} ${right.slice(0,-1).reverse().map(p=>'L'+pair(p)).join(' ')} Q${pair(capStart)} ${pair(left[0])} Z`;
  }
  // Sample our generated M/L/Q/C/S curves once in linear work. Firefox's native
  // getPointAtLength flattens the entire path again for every requested point.
  const geometryCache=new Map();
  function sample(d){
    if(geometryCache.has(d))return geometryCache.get(d);
    const tokens=String(d||'').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)||[];
    const vertices=[];let i=0,command,point={x:0,y:0},control=null,start=null;
    const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y),mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
    const read=()=>{if(i+1>=tokens.length||/[a-df-z]/i.test(tokens[i])||/[a-df-z]/i.test(tokens[i+1]))throw Error('Invalid curve');const x=Number(tokens[i++]),y=Number(tokens[i++]);if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Invalid point');return {x,y};};
    function flatten(points,depth=0){
      const polygon=points.slice(1).reduce((n,p,j)=>n+distance(points[j],p),0);
      if(depth>=12||polygon-distance(points[0],points.at(-1))<=.02){vertices.push(points.at(-1));return;}
      const left=[points[0]],right=[points.at(-1)];let row=points;
      while(row.length>1){row=row.slice(1).map((p,j)=>mid(row[j],p));left.push(row[0]);right.unshift(row.at(-1));}
      flatten(left,depth+1);flatten(right,depth+1);
    }
    try{while(i<tokens.length){
      if(/^[a-z]$/i.test(tokens[i]))command=tokens[i++];
      if(command==='M'){point=read();if(vertices.length)return null;vertices.push(point);start=point;control=null;command='L';}
      else if(command==='L'){point=read();vertices.push(point);control=null;}
      else if(command==='Q'){const a=read(),end=read();flatten([point,a,end]);point=end;control=null;}
      else if(command==='C'||command==='S'){const a=command==='C'?read():control?{x:2*point.x-control.x,y:2*point.y-control.y}:point,b=read(),end=read();flatten([point,a,b,end]);point=end;control=b;}
      else if(command==='Z'){vertices.push(start);point=start;control=null;command=null;}
      else return null;
    }}catch{return null;}
    if(vertices.length<2)return null;
    const lengths=[0];for(let j=1;j<vertices.length;j++)lengths.push(lengths[j-1]+distance(vertices[j-1],vertices[j]));
    const length=lengths.at(-1);if(!Number.isFinite(length)||length<=0)return null;
    const count=Math.max(8,Math.min(1800,Math.ceil(length/1.5))),points=[];let segment=1;
    for(let j=0;j<=count;j++){
      const along=length*j/count;while(segment<vertices.length-1&&lengths[segment]<along)segment++;
      const a=vertices[segment-1],b=vertices[segment],t=(along-lengths[segment-1])/(lengths[segment]-lengths[segment-1]||1);
      points.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
    }
    const result={points,length};if(geometryCache.size>=64)geometryCache.delete(geometryCache.keys().next().value);geometryCache.set(d,result);return result;
  }
  function apply(path,{width,color,seed}) {
    if(!path.parentNode)return path;
    const geometry=sample(path.getAttribute('d'));if(!geometry)return path;
    const {points,length}=geometry;
    const doc=path.ownerDocument,make=tag=>doc.createElementNS(svgNS,tag);
    const group=make('g'),defs=make('defs'),mask=make('mask'),body=make('path'),id=`pen-pressure-${++maskID}`;
    const pad=width*2+3;
    const minX=Math.min(...points.map(p=>p.x))-pad,maxX=Math.max(...points.map(p=>p.x))+pad;
    const minY=Math.min(...points.map(p=>p.y))-pad,maxY=Math.max(...points.map(p=>p.y))+pad;
    mask.setAttribute('id',id);mask.setAttribute('maskUnits','userSpaceOnUse');mask.setAttribute('maskContentUnits','userSpaceOnUse');
    for(const [key,value] of Object.entries({x:minX,y:minY,width:maxX-minX,height:maxY-minY}))mask.setAttribute(key,String(value));
    mask.style.maskType='luminance';
    body.setAttribute('d',outline(points,width,seed,length));body.setAttribute('mask',`url(#${id})`);
    Object.assign(body.style,{fill:color,stroke:'none',strokeDasharray:'none',strokeDashoffset:'0',transition:'none'});
    path.parentNode.insertBefore(group,path);
    Object.assign(path.style,{fill:'none',stroke:'#fff',strokeWidth:String(width*1.3+2),strokeLinecap:'round',strokeLinejoin:'round'});
    mask.append(path);defs.append(mask);group.append(defs,body);
    return group;
  }
  const api={pressure,outline,sample,apply};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.MorningInk=api;
})(typeof window!=='undefined'?window:globalThis);
