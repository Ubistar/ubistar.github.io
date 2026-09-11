import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ensureSchema, readSnapshot, saveSnapshot } from '../cloudflare/functions/_shared.js';
import { onRequestGet as dashboard } from '../cloudflare/functions/v1/dashboard.js';
import { onRequestGet as history } from '../cloudflare/functions/v1/history.js';
import { onRequestPost as ingest } from '../cloudflare/functions/v1/ingest.js';

// Exercise the production SQL against real SQLite. This adapter supplies the D1 method signatures.
function database() {
  const sql = new DatabaseSync(':memory:');
  const db = { sql, prepare(query) {
    const statement = { query, values: [], bind(...values) { return {...this,values}; },
      async first() { return sql.prepare(query).get(...this.values) || null; },
      async run() { return sql.prepare(query).run(...this.values); } };
    return statement;
  }, async batch(statements) {
    sql.exec('BEGIN');
    try {
      const results=statements.map(s=>{const p=sql.prepare(s.query);if(p.columns().length)return {results:p.all(...s.values)};p.run(...s.values);return {results:[]};});
      sql.exec('COMMIT');return results;
    } catch(error) {sql.exec('ROLLBACK');throw error;}
  }}; return db;
}
function fixture(count=70) {
  const now=Date.now(); const days=Array.from({length:count},(_,i)=>({date:new Date(now-i*86400000).toISOString().slice(0,10),liveSeconds:7200+i,lazySeconds:72000,sessionCount:1,firstLiveAt:now,report:`第 ${i} 天的真实结构测试报告`,rating:'合格',isToday:i===0}));
  return {room:{id:'1863473244',title:'测试用直播间'},live:false,verified:true,stale:false,lastCheckedAt:now,today:days[0],week:{liveSeconds:10000,attendanceRate:50},history:days,currentStatusSeconds:90};
}
function request(path) {return new Request(`https://example.test/v1/history${path}`);}
async function legacy(db,payload) {
  await ensureSchema(db);db.sql.prepare('INSERT INTO monitor_snapshots VALUES (1,?,?,?)').run(JSON.stringify(payload),Date.now(),payload.lastCheckedAt);
}

test('migrates all legacy history once, overview stays at seven days, and pagination covers every day exactly once',async()=>{
  const DB=database(), original=fixture(73);await legacy(DB,original);
  const overview=await (await dashboard({env:{DB}})).json();
  assert.equal(overview.history.length,7);assert.equal(overview.historyTotal,73);assert.equal(overview.archiveVersion,2);
  const found=[];
  for(let page=1;page<=8;page++){const response=await history({env:{DB},request:request(`?page=${page}&limit=10`)});assert.equal(response.status,200);const data=await response.json();found.push(...data.items.map(x=>x.date));assert.equal(data.total,73);assert.ok(data.items.length<=10);}
  assert.deepEqual(found,original.history.map(x=>x.date));assert.equal(new Set(found).size,73);
  assert.equal((await readSnapshot({DB})).payload.historyTotal,73);
});
test('inclusive date filters, allowed page sizes, invalid dates, empty result, and injection',async()=>{
  const DB=database(), p=fixture();await legacy(DB,p);await readSnapshot({DB});
  const from=p.history[20].date,to=p.history[10].date;
  const data=await (await history({env:{DB},request:request(`?from=${from}&to=${to}&limit=20`)})).json();
  assert.equal(data.total,11);assert.equal(data.items[0].date,to);assert.equal(data.items.at(-1).date,from);
  for(const query of ['?limit=999','?page=-1','?page=1.5','?from=2026-02-30','?from=2026-09-01&to=2025-01-01',"?from='OR%201=1--"]){assert.equal((await history({env:{DB},request:request(query)})).status,400,query);}
  const empty=await (await history({env:{DB},request:request('?to=2000-01-01')})).json();assert.equal(empty.total,0);assert.deepEqual(empty.items,[]);
  const plan=DB.sql.prepare('EXPLAIN QUERY PLAN SELECT payload FROM monitor_days WHERE date >= ? AND date <= ? ORDER BY date DESC LIMIT 10').all(from,to);
  assert.ok(plan.some(x=>x.detail.includes('USING INDEX')));
});
test('partial future snapshots retain old archive, older pushes cannot overwrite newer observations',async()=>{
  const DB=database(), p=fixture(20);await legacy(DB,p);await readSnapshot({DB});
  const newer={...p,lastCheckedAt:p.lastCheckedAt+1000,history:[{...p.history[0],report:'updated'}]};
  await saveSnapshot(DB,newer,Date.now());await saveSnapshot(DB,p,Date.now());
  const data=await (await history({env:{DB},request:request('?limit=20')})).json();
  assert.equal(data.total,20);assert.equal(data.items[0].report,'updated');
});
test('archive and snapshot roll back together when snapshot write fails',async()=>{
  const DB=database(), p=fixture(20);await legacy(DB,p);await readSnapshot({DB});
  DB.sql.exec("CREATE TRIGGER reject_update BEFORE UPDATE ON monitor_snapshots BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  await assert.rejects(saveSnapshot(DB,{...p,lastCheckedAt:p.lastCheckedAt+1000,history:[{...p.history[0],report:'should roll back'}]},Date.now()));
  const row=DB.sql.prepare('SELECT payload FROM monitor_days ORDER BY date DESC LIMIT 1').get();assert.equal(JSON.parse(row.payload).report,p.history[0].report);
});
test('staleness checks both source observation and reception time',async()=>{
  const DB=database(),p=fixture();p.lastCheckedAt=Date.now()-240000;await legacy(DB,p);
  assert.equal((await readSnapshot({DB})).stale,true);
});
test('ingest authorization, malformed data, and upgrade before a partial first push',async()=>{
  const DB=database(),p=fixture(50);await legacy(DB,p);
  const env={DB,INGEST_TOKEN:'test-only-token'};
  const post=(body,auth='Bearer test-only-token')=>ingest({env,request:new Request('https://example.test/v1/ingest',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body})});
  assert.equal((await post(JSON.stringify(p),'Bearer wrong')).status,401);
  assert.equal((await post('invalid')).status,400);
  assert.equal((await post(JSON.stringify({...p,history:[{date:'invalid'}]}))).status,400);
  const partial={...p,history:p.history.slice(0,3)};assert.equal((await post(JSON.stringify(partial))).status,200);
  assert.equal((await readSnapshot({DB})).payload.historyTotal,50);
});
test('ten-year fixture keeps public response size bounded',async()=>{
  const DB=database(),p=fixture(3650);await legacy(DB,p);
  const response=await dashboard({env:{DB}});const text=await response.text();
  assert.ok(Buffer.byteLength(text)<6000);assert.ok(Buffer.byteLength(text)<Buffer.byteLength(JSON.stringify(p))/50);
  const page=await (await history({env:{DB},request:request('?page=365&limit=10')})).json();assert.equal(page.items.length,10);assert.equal(page.total,3650);
});
