(function(root){
  'use strict';
  function flightFrames(y,vy,height){return Math.max(1,(-vy+Math.sqrt(vy*vy+2*.24*(height+40-y)))/.24);}
  function create({layer,reducedMotion}){
    const live=new Set();
    function clear(){for(const particle of live)particle.remove();live.clear();}
    function burst({x,y,vx,vy,count,colors}){
      if(reducedMotion.matches)return;
      const fragment=document.createDocumentFragment?.();
      for(let i=0;i<count;i++){
        const downward=vy>0;
        const spread=(Math.random()-.5)*(downward?1.05:.36),speed=(downward?1.35:.82)+Math.random()*(downward?.5:.36);
        const px=(vx*Math.cos(spread)-vy*Math.sin(spread))*speed,py=(vx*Math.sin(spread)+vy*Math.cos(spread))*speed;
        const short=Math.random()<.32,full=flightFrames(y,py,root.innerHeight),frames=short?Math.min(full,42+Math.random()*36):full;
        const particle=document.createElement('i');particle.className=`confetti-piece${short?' quick':''}`;
        const angle=Math.random()*360,spin=(Math.random()-.5)*14,size=3+Math.random()*5;
        particle.style.setProperty('--duration',`${frames/60}s`);particle.style.width=`${size}px`;particle.style.height=`${size*.65}px`;particle.style.backgroundColor=colors[Math.random()*colors.length|0];
        for(let step=0;step<=8;step++){
          const age=frames*step/8;
          particle.style.setProperty(`--x${step}`,`${x+px*age}px`);
          particle.style.setProperty(`--y${step}`,`${y+py*age+.5*.24*age*age}px`);
          particle.style.setProperty(`--r${step}`,`${angle+spin*age}deg`);
        }
        live.add(particle);
        particle.addEventListener('animationend',event=>{if(event.target===particle&&event.animationName==='confetti-flight'){particle.remove();live.delete(particle);}});
        if(fragment)fragment.append(particle);else layer.append(particle);
      }
      if(fragment)layer.append(fragment);
    }
    return {burst,clear};
  }
  const api={create,flightFrames};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MorningConfetti=api;
})(typeof window!=='undefined'?window:globalThis);
