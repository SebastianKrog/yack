(function(root){
  'use strict';
  const timezone='Europe/Copenhagen';
  function dateKey(value){if(typeof value!=='string')return null;const match=value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);if(!match)return null;const key=`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`,date=new Date(key+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===key?key:null;}
  function today(now=new Date()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);return ['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-');}
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const timeKey=value=>typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const minutes=time=>Number(time.slice(0,2))*60+Number(time.slice(3));
  function planDate(preset,day){
    const date=new Date(day+'T12:00:00Z');
    const weekday=date.getUTCDay();
    const offset=preset==='tomorrow'?1:preset==='weekend'&&weekday!==0?6-weekday:0;
    date.setUTCDate(date.getUTCDate()+offset);
    return date.toISOString().slice(0,10);
  }
  function waitingForTime(reminder,minute){
    return reminder.time!==undefined&&(minute??minutes(clock.format(new Date())))<minutes(reminder.time);
  }
  function validMeta(value){return !!(value&&typeof value.date==='string'&&dateKey(value.date)===value.date&&Number.isFinite(value.createdAt)&&value.createdAt>=0&&Number.isFinite(value.updatedAt)&&value.updatedAt>=0&&(value.time===undefined||timeKey(value.time))&&(value.dayOnly===undefined||typeof value.dayOnly==='boolean')&&(value.cancelledAt===undefined||Number.isFinite(value.cancelledAt)&&value.cancelledAt>=0)&&(value.requestHash===undefined||typeof value.requestHash==='string'&&/^[a-f0-9]{64}$/.test(value.requestHash)));}
  function meta(value){if(!validMeta(value))return null;return {date:value.date,createdAt:value.createdAt,updatedAt:value.updatedAt,...(value.time!==undefined?{time:value.time}:{}),...(value.dayOnly!==undefined?{dayOnly:value.dayOnly}:{}),...(value.cancelledAt!==undefined?{cancelledAt:value.cancelledAt}:{}),...(value.requestHash?{requestHash:value.requestHash}:{})};}
  function validId(value){return typeof value==='string'&&/^reminder-[a-zA-Z0-9_-]{8,100}$/.test(value);}
  function status(task,day){
    const reminder=task.reminder,key=dateKey(day);
    if(reminder.cancelledAt!==undefined)return 'cancelled';
    if(task.checked)return 'completed';
    if(task.deferred)return 'deferred';
    if(reminder.date<key)return reminder.dayOnly?'expired':'overdue';
    return reminder.date>key||waitingForTime(reminder)?'upcoming':'due';
  }
  function onDay(task,day,minute){
    const key=dateKey(day),reminder=task.reminder;
    if(!key||!validMeta(reminder)||reminder.cancelledAt!==undefined||reminder.date>key)return false;
    if(reminder.dayOnly&&reminder.date!==key)return false;
    if(task.checked)return dateKey(task.checkedDay)===key;
    if(task.deferred)return dateKey(task.deferredDay)===key;
    return reminder.date<key||!waitingForTime(reminder,minute);
  }
  function definition(task){
    const E=typeof module!=='undefined'&&module.exports?require('./emphasis.js'):root.MorningEmphasis;
    const emphasis=E.safe(task.emphasis);
    return {id:task.id,text:task.text,parentId:null,parentChoice:null,boxSeed:task.boxSeed,reminder:meta(task.reminder),...(emphasis?{emphasis}:{})};
  }
  const api={timezone,dateKey,today,timeKey,planDate,validMeta,meta,validId,status,onDay,definition};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MorningReminders=api;
})(typeof window!=='undefined'?window:globalThis);
