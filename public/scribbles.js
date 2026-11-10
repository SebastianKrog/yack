(function(root){
  'use strict';
  function paths(svg){return svg?Array.from(svg.querySelectorAll('path')).filter(path=>path.getAttribute('pathLength')==='1'):[];}
  function stages(node,{defer=false,xorChoice=null,reverse=false,noCheck=false}={}){
    const result=[],add=(svg,kind,duration)=>paths(svg).forEach(path=>result.push({path,kind,duration}));
    if(defer)add(node.querySelector(node.classList.contains('xor-task')?'.xor-group-defer-strike':'.defer-strike'),'defer',1000);
    else{
      if(xorChoice!==null){const options=node.querySelectorAll('.xor-option');add(options[xorChoice].querySelector('.strike'),'red',450);add(options[1-xorChoice].querySelector('.defer-strike'),'defer',1000);}
      else add(node.querySelector('.strike'),'red',450);
      if(!noCheck){const check=paths(node.querySelector('.check'));if(check.length)result.push({paths:check,kind:'check',duration:260});}
    }
    return reverse&&result.length?[{paths:result.flatMap(stage=>stage.paths||[stage.path]),kind:'reverse',duration:260,reverse:true}]:result;
  }
  function create({sound,reducedMotion}){
    const queue=[];let current=null,stageTimer,kickTimer,animations=[],stopSound;
    const stagePaths=stage=>stage.paths||[stage.path];
    function reveal(path,value){path.style.transition='none';path.style.strokeDashoffset=String(value);}
    function cleanup(job){job.node.classList.add('strokes-finished');job.node.classList.remove('scribbling');for(const stage of job.stages)for(const path of stagePaths(stage)){path.style.transition='';path.style.strokeDashoffset='';}}
    function next(){
      if(current||!queue.length)return;
      current=queue.shift();let index=0;
      function advance(){
        if(!current)return;
        if(index===current.stages.length){const finished=current;current=null;cleanup(finished);finished.done?.();next();return;}
        const stage=current.stages[index++],instant=reducedMotion.matches&&!sound.isAvailable();
        if(instant){stagePaths(stage).forEach(path=>reveal(path,stage.reverse?1:0));advance();return;}
        stopSound=sound.scribble(stage.duration/1000,stage.kind,stage.reverse);
        stagePaths(stage).forEach(path=>{
          if(!reducedMotion.matches&&typeof path.animate==='function')animations.push(path.animate([{strokeDashoffset:stage.reverse?0:1},{strokeDashoffset:stage.reverse?1:0}],{duration:stage.duration,easing:'cubic-bezier(.4,.05,.3,1)',fill:'forwards'}));
          else reveal(path,stage.reverse?1:0);
        });
        stageTimer=setTimeout(()=>{stagePaths(stage).forEach(path=>reveal(path,stage.reverse?1:0));animations.forEach(animation=>animation.cancel());animations=[];stopSound?.();stopSound=null;advance();},stage.duration);
      }
      advance();
    }
    function enqueue(node,steps,done){
      node.classList.remove('strokes-finished');node.classList.add('scribbling');steps.forEach(stage=>stagePaths(stage).forEach(path=>reveal(path,stage.reverse?0:1)));
      queue.push({node,stages:steps,done});
      // Let state classes settle before drawing. One queue for the entire checklist.
      if(reducedMotion.matches&&!sound.isAvailable())next();else{clearTimeout(kickTimer);kickTimer=setTimeout(next,0);}
    }
    function cancelAll(){clearTimeout(kickTimer);clearTimeout(stageTimer);animations.forEach(animation=>animation.cancel());animations=[];stopSound?.();stopSound=null;if(current)cleanup(current);current=null;queue.splice(0).forEach(cleanup);}
    return {enqueue,cancelAll};
  }
  const api={create,stages};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MorningScribbles=api;
})(typeof window!=='undefined'?window:globalThis);
