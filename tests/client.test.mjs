import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function harness({storageFails=false}={}) {
  const nodes=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>[x[1],{id:x[1],textContent:'',innerHTML:'',hidden:false,value:'',style:{},dataset:{},events:{},disabled:false,
    addEventListener(event,fn){this.events[event]=fn;},classList:{add(){},remove(){}},setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},showModal(){this.open=true;},close(){this.open=false;}}]));
  const document={hidden:false,events:{},getElementById(id){if(!nodes.has(id))throw Error(`Missing element ${id}`);return nodes.get(id);},querySelectorAll(selector){return selector==='.view'?[...nodes.values()].filter(n=>n.id.startsWith('view-')):[];},addEventListener(k,v){this.events[k]=v;}};
  const requests=[],intervals=[],events={},pending=[];
  const context=vm.createContext({console,Intl,URLSearchParams,AbortController,Date,Map,Set,Number,String,Math,JSON,Promise,document,location:{hash:''},window:{addEventListener(k,v){events[k]=v;}},
    localStorage:{getItem(){if(storageFails)throw Error('blocked');return null;},setItem(){if(storageFails)throw Error('blocked');},removeItem(){if(storageFails)throw Error('blocked');}},
    setInterval(fn,ms){intervals.push({fn,ms});},setTimeout(){return 1;},clearTimeout(){},
    fetch(url,options){requests.push({url,options});return new Promise((resolve,reject)=>pending.push({resolve,reject}));}});
  vm.runInContext(source,context);
  const data={archiveVersion:2,room:{title:'test'},live:false,verified:true,lastCheckedAt:Date.now()-5000,currentStatusSeconds:3600,today:{date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date()),liveSeconds:600,lazySeconds:3000},week:{},history:[],historyTotal:500};
  return {nodes,document,requests,intervals,events,pending,context,data,async settle(){await new Promise(setImmediate);await new Promise(setImmediate);},resolve(body){pending.shift().resolve({ok:true,json:async()=>body});}};
}
test('first visit fetches only overview; history is lazy and pages fetch bounded queries',async()=>{
  const h=harness();assert.equal(h.requests.length,1);assert.match(h.requests[0].url,/\/overview$/);h.resolve(h.data);await h.settle();
  h.context.location.hash='#history';h.events.hashchange();assert.equal(h.requests.length,2);assert.match(h.requests[1].url,/history\?page=1&limit=10$/);
  h.resolve({items:[{date:'2026-09-10',report:'x'}],page:1,pages:5,limit:10,total:50});await h.settle();
  assert.equal(h.nodes.get('nextPage').disabled,false);h.nodes.get('nextPage').events.click();assert.match(h.requests.at(-1).url,/page=2&limit=10/);
});
test('failed refresh freezes an existing live timer and local storage failures do not block data',async()=>{
  const h=harness({storageFails:true});h.resolve(h.data);await h.settle();assert.equal(h.nodes.get('statusClock').textContent,'01:00:05');
  h.nodes.get('refresh').events.click();h.pending.shift().reject(new Error('offline'));await h.settle();
  assert.equal(h.nodes.get('statusClock').textContent,'01:00:00');assert.equal(h.nodes.get('connection').textContent,'等待更新');assert.equal(h.nodes.get('notice').hidden,false);
});
test('hidden pages do not poll, and untrusted history text is escaped',async()=>{
  const h=harness();h.resolve(h.data);await h.settle();h.document.hidden=true;h.intervals.find(x=>x.ms===60000).fn();assert.equal(h.requests.length,1);
  h.document.hidden=false;h.context.location.hash='#history';h.events.hashchange();
  h.resolve({items:[{date:'2026-09-10',rating:'<img src=x onerror=alert(1)>'}],total:1,pages:1});await h.settle();
  const rows=h.nodes.get('historyRows').innerHTML;assert.ok(rows.includes('&lt;img'));assert.ok(!rows.includes('<img'));
});
test('late history response cannot replace a newer filter result',async()=>{
  const h=harness();h.resolve(h.data);await h.settle();h.context.location.hash='#history';h.events.hashchange();
  const old=h.pending.shift();h.nodes.get('dateFrom').value='2026-08-01';h.nodes.get('historyFilter').events.submit({preventDefault(){}});
  h.resolve({items:[{date:'2026-08-22'}],total:1,pages:1});await h.settle();
  old.resolve({ok:true,json:async()=>({items:[{date:'2020-01-01'}],total:1,pages:1})});await h.settle();
  assert.ok(h.nodes.get('historyRows').innerHTML.includes('2026-08-22'));assert.ok(!h.nodes.get('historyRows').innerHTML.includes('2020-01-01'));
});
