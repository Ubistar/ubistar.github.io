import { json, readSnapshot, readHeaders } from '../_shared.js';

export async function onRequestGet({ request, env }) {
  const days = Number(new URL(request.url).searchParams.get('days') || 30);
  if (![7,30,90].includes(days)) return json({error:'统计范围可选 7、30、90 天'},400);
  if (!env.DB) return json({error:'数据服务暂不可用'},503);
  try {
    const snapshot=await readSnapshot(env);
    if (!snapshot) return json({error:'尚无统计记录'},503);
    const to=snapshot.payload.today.date;
    const from=new Date(Date.parse(`${to}T00:00:00Z`)-(days-1)*86400000).toISOString().slice(0,10);
    const [series, totals]=await env.DB.batch([
      env.DB.prepare('SELECT payload FROM monitor_days WHERE date >= ? AND date <= ? ORDER BY date').bind(from,to),
      env.DB.prepare(`SELECT COUNT(*) AS days, MIN(date) AS firstDate, MAX(date) AS lastDate,
        SUM(CASE WHEN json_extract(payload,'$.liveSeconds') > 0 THEN 1 ELSE 0 END) AS activeDays,
        SUM(json_extract(payload,'$.liveSeconds')) AS liveSeconds
        FROM monitor_days`),
    ]);
    const items=series.results.map(({payload})=>{const d=JSON.parse(payload);return {
      date:d.date,liveSeconds:d.liveSeconds,lazySeconds:d.lazySeconds,monitoredSeconds:d.monitoredSeconds,
      sessionCount:d.sessionCount,firstLiveAt:d.firstLiveAt,lastLiveAt:d.lastLiveAt,
      reconstructed:Boolean(d.reconstructed),isToday:d.date===to};});
    return json({days,from,to,items,allTime:totals.results[0],stale:snapshot.stale,
      snapshotSavedAt:snapshot.receivedAt},200,readHeaders(snapshot));
  } catch { return json({error:'统计暂时不可用，请稍后重试'},503); }
}
