(function(root){
  'use strict';
  const types=['image/jpeg','image/png','image/webp','image/gif','image/avif','application/pdf'];
  const borders=['none','small','large'],limit=20*1024*1024;
  function validAsset(a){return !!(a&&/^[a-f0-9-]{36}$/.test(a.id)&&typeof a.name==='string'&&a.name.length>0&&a.name.length<=240&&types.includes(a.type)&&Number.isInteger(a.size)&&a.size>0&&a.size<=limit&&Number.isFinite(a.width)&&a.width>=1&&a.width<=100000&&Number.isFinite(a.height)&&a.height>=1&&a.height<=100000&&Number.isInteger(a.pages)&&a.pages>=1&&a.pages<=10000&&(a.type==='application/pdf'||a.pages===1));}
  function border(config){return borders.includes(config?.mat)?config.mat:'small';}
  function ratio(config){const a=config?.asset;if(!validAsset(a))return 1;const p=a.type==='application/pdf'?0:({none:0,small:.045,large:.12}[border(config)]),edge=Math.min(a.width,a.height)*p;return (a.width+edge*2)/(a.height+edge*2);}
  function paperColor({data,width,height}){
    const groups=new Map();
    function sample(x,y){const i=(y*width+x)*4;if(data[i+3]<240)return;const rgb=[data[i],data[i+1],data[i+2]],key=rgb.map(v=>Math.round(v/16)).join(',');let group=groups.get(key);if(!group){group={count:0,total:[0,0,0]};groups.set(key,group);}group.count++;rgb.forEach((v,j)=>group.total[j]+=v);}
    for(let x=1;x<width-1;x++){sample(x,1);sample(x,height-2);}for(let y=2;y<height-2;y++){sample(1,y);sample(width-2,y);}
    const dominant=[...groups.values()].sort((a,b)=>b.count-a.count)[0];return dominant?'#'+dominant.total.map(v=>Math.round(v/dominant.count).toString(16).padStart(2,'0')).join(''):'#ffffff';
  }
  const api={paperColor,validAsset,types,borders,limit,border,ratio};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MorningMediaModel=api;
})(typeof window!=='undefined'?window:globalThis);
