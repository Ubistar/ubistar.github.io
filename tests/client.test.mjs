import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalize,current,dateCN,stale,duration,summarize,createClient,esc} from '../lib/data.js';
import {attachModuleInteractions} from '../lib/interaction.js';
const now=Date.now(),day={date:dateCN(now),liveSeconds:600,lazySeconds:3000};
const base={live:true,verified:true,lastCheckedAt:now-5000,currentStatusSeconds:3600,today:day,week:{},history:[],historyTotal:100};
test('overview cache is bounded and stale counters freeze without inventing missing durations',()=>{
  const d=normalize({...base,history:Array.from({length:90},(_,i)=>({date:dateCN(now-i*86400000)}))});
  assert.equal(d.history.length,7);assert.equal(current(d,false,now).status,3605);assert.equal(current(d,true,now).status,3600);
  assert.equal(stale(d,false,now+240000),true);assert.equal(duration(undefined),'—');assert.equal(duration(0),'0小时 00分');
  assert.equal(current({...d,today:{...d.today,date:'2000-01-01'}},false,now).live,600);
});
test('summaries distinguish missing days, incomplete today and real zero values',()=>{
  const s=summarize([{date:'2026-08-11',liveSeconds:1985,lazySeconds:84415},{date:'2026-08-12',liveSeconds:0,lazySeconds:86400},
    {date:'2026-08-13'},{date:'2026-09-14',liveSeconds:7200,lazySeconds:500,isToday:true}]);
  assert.equal(s.known,3);assert.equal(s.closed,2);assert.equal(s.average,992.5);assert.equal(s.best.date,'2026-08-11');assert.deepEqual(s.distribution,[1,1,0,0,0]);
  assert.equal(esc('<img src=x onerror="bad">'),'&lt;img src=x onerror=&quot;bad&quot;&gt;');
});
test('client starts no background requests, caches by bounded page and coalesces concurrent statistics',async()=>{
  const requests=[];const client=createClient(async url=>{requests.push(url);return {ok:true,json:async()=>({items:[]})};});assert.equal(requests.length,0);
  await client.get('overview');await client.get('overview');assert.equal(requests.length,1);
  await client.get('history?page=1&limit=10');await client.get('history?page=2&limit=10');assert.equal(requests.length,3);
  await Promise.all([client.get('insights?days=30'),client.get('insights?days=30')]);assert.equal(requests.length,4);
  await client.get('overview',{force:true});assert.equal(requests.length,5);
});
function interactions(){const handlers={},timers=new Map();let i=0,opens=0,toasts=0;const root={addEventListener(name,fn){handlers[name]=fn;}};
  const node={classList:{add(){},remove(){}},closest(selector){return selector==='[data-module]'?node:null;}};
  attachModuleInteractions(root,{open(){opens++;},toast(){toasts++;},setTimer(fn){timers.set(++i,fn);return i;},clearTimer(id){timers.delete(id);}});
  const event=(extra={})=>({target:node,pointerType:'touch',pointerId:1,clientX:10,clientY:10,button:0,preventDefault(){},...extra});
  return {handlers,event,get opens(){return opens;},get toasts(){return toasts;},fire(){for(const fn of [...timers.values()])fn();timers.clear();}};
}
test('touch long-press opens once, suppresses release click and scroll movement cancels it',()=>{
  const a=interactions();a.handlers.pointerdown(a.event());a.fire();a.handlers.click(a.event());assert.equal(a.opens,1);
  const b=interactions();b.handlers.pointerdown(b.event());b.handlers.pointermove(b.event({clientX:24}));b.fire();assert.equal(b.opens,0);
  const c=interactions();c.handlers.pointerdown(c.event());c.handlers.pointercancel(c.event());c.fire();assert.equal(c.opens,0);
  const d=interactions();d.handlers.pointerdown(d.event());d.handlers.scroll();d.fire();assert.equal(d.opens,0);
});
test('desktop click, keyboard entry and mobile short-tap feedback',()=>{
  const a=interactions();a.handlers.click(a.event({pointerType:'mouse'}));assert.equal(a.opens,1);
  const b=interactions();b.handlers.click(b.event());assert.equal(b.opens,0);assert.equal(b.toasts,1);
  const c=interactions();c.handlers.keydown(c.event({key:'Enter'}));assert.equal(c.opens,1);
});
test('all static application controls exist in the document',()=>{
  const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const [,id]of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(html.includes(`id="${id}"`),id);
});
