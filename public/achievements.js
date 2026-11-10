(function(root) {
  'use strict';
  const {t:translateUI}=typeof module!=='undefined'&&module.exports?require('./i18n.js'):window.YackI18n;
  const tasks=typeof module!=='undefined'&&module.exports?require('./tasks.js'):root.MorningTasks;
  const stats=typeof module!=='undefined'&&module.exports?require('./stats.js'):root.MorningStats;
  // Definitions are data. Future custom achievements can use these same rules.
  const definitions = [
    {id:'daily-first',tier:'bronze',title:translateUI("Så er vi i gang!"),description:translateUI("Gennemfør dagens første opgave"),trophy:{plaque:'START'},scope:'day',rule:{type:'completed-count',target:1}},
    {id:'daily-five',tier:'silver',title:translateUI("Fem første, flot!"),description:translateUI("Gennemfør fem opgaver i dag"),trophy:{plaque:'5'},scope:'day',rule:{type:'completed-count',target:5}},
    {id:'daily-all',tier:'gold',title:translateUI("Fuld plade!"),description:translateUI("Gennemfør alle dagens opgaver"),trophy:{plaque:translateUI("ALLE")},scope:'day',rule:{type:'all-tasks'}},
    {id:'daily-defer-first',tier:'bronze',title:translateUI("Det kan vente!"),description:translateUI("Udskyd en opgave i dag"),trophy:{plaque:translateUI("SENERE")},scope:'day',rule:{type:'deferred-count',target:1}},
    {id:'daily-note-created',tier:'bronze',title:translateUI("Ned på papir!"),description:translateUI("Opret dagens første note"),trophy:{plaque:'NOTE'},scope:'day',rule:{type:'notes-created',target:1}},
    {id:'daily-note-completed',tier:'silver',title:translateUI("Det var den note!"),description:translateUI("Gør dagens første note færdig"),trophy:{plaque:translateUI("FÆRDIG")},scope:'day',rule:{type:'notes-completed',target:1}},
    {id:'daily-overflow',tier:'silver',title:translateUI("Plads til mere!"),description:translateUI("Fyld listen, så en opgave ryger ud"),trophy:{plaque:translateUI("PLADS")},scope:'day',rule:{type:'overflow-count',target:1}},
    {id:'daily-cleanup',tier:'bronze',title:translateUI("Så blev der ryddet op!"),description:translateUI("Arkivér to noter i dag"),trophy:{plaque:translateUI("RYD OP")},scope:'day',rule:{type:'notes-archived',target:2}},
    {id:'weekly-return',tier:'bronze',title:translateUI("Velkommen tilbage!"),description:translateUI("Åbn siden på to dage i denne uge"),trophy:{plaque:'2 DAGE'},scope:'week',rule:{type:'visit-days',target:2}},
    {id:'weekly-five',tier:'silver',title:translateUI("Sikke en god uge!"),description:translateUI("Åbn siden på fem dage i denne uge"),trophy:{plaque:'5 DAGE'},scope:'week',rule:{type:'visit-days',target:5}},
    {id:'weekly-seven',tier:'gold',title:translateUI("Hele ugen rundt!"),description:translateUI("Åbn siden på alle ugens syv dage"),trophy:{plaque:'7 DAGE'},scope:'week',rule:{type:'visit-days',target:7}}
  ];
  const rules = {
    'visit-days':(state,rule)=>({current:stats.weekDays(state),target:Math.max(1,rule.target||1)}),
    'notes-created':(state,rule)=>({current:Math.max(state.tasks.filter(t=>t.writingAnswer?.length&&(!t.permanentNote||t.noteCreatedDay===state.day)).length,stats.normalize(state.stats)[stats.dateKey(state.day)]?.notes||0),target:rule.target||1}),
    'notes-completed':(state,rule)=>({current:state.tasks.filter(t=>tasks.noteComplete(t)&&(!t.permanentNote||t.noteCompletedDay===state.day)).length,target:rule.target||1}),
    'overflow-count':(state,rule)=>({current:tasks.overflowTasks(state).length,target:rule.target||1}),
    'notes-archived':(state,rule)=>({current:state.tasks.filter(t=>t.noteArchived&&(!t.permanentNote||t.noteArchivedDay===state.day)).length,target:rule.target||2}),
    'completed-count':(state,rule)=>({current:tasks.achievementTasks(state).filter(t=>t.checked).length,target:Math.max(1,rule.target||1)}),
    'all-tasks':state=>{const applicable=tasks.achievementTasks(state,true).filter(t=>!t.permanentNote);return {current:applicable.filter(t=>t.checked).length,target:applicable.length};},
    // Only explicitly deferred tasks count; descendants inherit no stored flag.
    'deferred-count':(state,rule)=>({current:state.tasks.reduce((count,t)=>count+(!t.permanentNote&&(!t.reminder||tasks.scheduled(state,t))&&t.deferred?1:0)+(t.writing?.asTasks!==false?t.writingItems||[]:[]).filter(item=>item.deferred&&(!t.permanentNote||item.deferredDay===state.day)).length,0),target:Math.max(1,rule.target||1)})
  };
  function daily(state) {
    if(!state.dailyAchievements||state.dailyAchievements.day!==state.day)state.dailyAchievements={day:state.day,earned:{}};
    if(!state.dailyAchievements.earned||typeof state.dailyAchievements.earned!=='object')state.dailyAchievements.earned={};
    return state.dailyAchievements;
  }
  function progress(state,defs=definitions) {
    const records=daily(state);state.weeklyAchievements=stats.weeklyAwards(state.weeklyAchievements,state.day);
    return defs.filter(d=>typeof d.id==='string'&&['day','week'].includes(d.scope)&&Object.prototype.hasOwnProperty.call(rules,d.rule?.type)).map(def=>{
      const measure=rules[def.rule.type](state,def.rule);
      const met=measure.target>0&&measure.current>=measure.target;
      const earned=Object.prototype.hasOwnProperty.call(def.scope==='week'?state.weeklyAchievements.earned:records.earned,def.id);
      return {...def,tier:['bronze','silver','gold'].includes(def.tier)?def.tier:'bronze',...measure,met,earned,ratio:earned?1:measure.target>0?Math.min(1,measure.current/measure.target):0};
    });
  }
  function claim(state,defs=definitions,now=Date.now()) {
    const unlocked=progress(state,defs).filter(p=>p.met&&!p.earned);
    const records=daily(state);
    unlocked.forEach(p=>{Object.defineProperty(p.scope==='week'?state.weeklyAchievements.earned:records.earned,p.id,{value:now,enumerable:true,writable:true,configurable:true});});
    stats.record(state,'trophies',unlocked.filter(p=>p.scope==='day').length);
    stats.recordWeeklyTrophies(state,unlocked.filter(p=>p.scope==='week'));
    return unlocked;
  }
  const api={definitions,rules,progress,claim};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.MorningAchievements=api;
})(typeof window!=='undefined'?window:globalThis);
