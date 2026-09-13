import test from 'node:test';
import assert from 'node:assert/strict';
import {database,fixture,legacy} from './archive.test.mjs';
import {onRequestGet} from '../cloudflare/functions/v1/insights.js';
import {readSnapshot} from '../cloudflare/functions/_shared.js';
test('insights are bounded, preserve missing dates and zero values, and never rewrite saved daily data',async()=>{
  const DB=database(),data=fixture(80);data.history.splice(2,1);data.history[3].liveSeconds=0;
  await legacy(DB,data);await readSnapshot({DB});const before=DB.sql.prepare('SELECT * FROM monitor_days ORDER BY date').all();
  const result=await onRequestGet({env:{DB},request:new Request('https://example.test/v1/insights?days=30')});
  const body=await result.json();assert.equal(result.status,200);assert.equal(body.items.length,29);assert.equal(body.allTime.days,79);assert.equal(body.items.filter(d=>d.liveSeconds===0).length,1);
  assert.deepEqual(DB.sql.prepare('SELECT * FROM monitor_days ORDER BY date').all(),before);
  assert.equal((await onRequestGet({env:{DB},request:new Request('https://example.test/v1/insights?days=10000')})).status,400);
});
