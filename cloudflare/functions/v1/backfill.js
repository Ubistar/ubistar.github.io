import { ensureSchema, json, readSnapshot, ROOM_ID, timestamp, validDate } from "../_shared.js";
export { onRequestOptions } from "./ingest.js";

function validDay(day, before) {
  if (!day || !validDate(day.date) || day.date >= before) return false;
  for (const key of ["liveSeconds", "lazySeconds", "monitoredSeconds", "sessionCount"]) {
    if (!Number.isSafeInteger(day[key]) || day[key] < 0) return false;
  }
  return day.monitoredSeconds <= 86400 &&
    day.liveSeconds + day.lazySeconds === day.monitoredSeconds &&
    typeof day.report === "string" && typeof day.rating === "string";
}

// A repair can insert absent dates, but cannot replace any existing daily record
// or make the live monitor appear fresh. Repeating a completed batch is safe.
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.INGEST_TOKEN) return json({ error: "数据桥未配置完成" }, 503);
  if (request.headers.get("Authorization") !== `Bearer ${env.INGEST_TOKEN}`)
    return json({ error: "Unauthorized" }, 401);
  if (Number(request.headers.get("Content-Length") || 0) > 1_000_000)
    return json({ error: "Payload too large" }, 413);
  let body;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 1_000_000)
      return json({ error: "Payload too large" }, 413);
    body = JSON.parse(text);
  } catch { return json({ error: "请求体不是有效 JSON" }, 400); }
  const checkedAt = timestamp(body?.sourceCheckedAt);
  if (body?.roomId !== ROOM_ID || !Number.isSafeInteger(checkedAt) ||
      checkedAt <= 0 || checkedAt > Date.now() + 60_000)
    return json({ error: "来源直播间或核验时间不正确" }, 400);
  const before = new Date(checkedAt + 8 * 3600_000).toISOString().slice(0, 10);
  if (!Array.isArray(body.days) || !body.days.length || body.days.length > 100 ||
      !body.days.every(day => validDay(day, before)) ||
      new Set(body.days.map(day => day.date)).size !== body.days.length)
    return json({ error: "每批需为 1–100 个不重复的已结束日期，且时长完整有效" }, 400);
  // Keep the same canonical day shape as ordinary monitoring snapshots.
  const days = body.days.map(day => ({ date: day.date, liveSeconds: day.liveSeconds,
    lazySeconds: day.lazySeconds, monitoredSeconds: day.monitoredSeconds,
    sessionCount: day.sessionCount,
    firstLiveAt: Number.isSafeInteger(day.firstLiveAt) ? day.firstLiveAt : null,
    lastLiveAt: Number.isSafeInteger(day.lastLiveAt) ? day.lastLiveAt : null,
    rating: day.rating, report: day.report, isToday: false,
    reconstructed: true, reconstructionSource: "ubuntu-live-sessions" }));
  try {
    await ensureSchema(env.DB);
    if (!await readSnapshot(env)) return json({ error: "请先恢复常规定时推送" }, 503);
    const [inserted, , counts] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO monitor_days (date, payload, source_checked_at)
        SELECT json_extract(value, '$.date'), value, ? FROM json_each(?) WHERE 1
        ON CONFLICT(date) DO NOTHING`).bind(checkedAt, JSON.stringify(days)),
      env.DB.prepare(`UPDATE monitor_snapshots SET payload=json_set(payload, '$.historyTotal',
        (SELECT COUNT(*) FROM monitor_days)) WHERE id=1`),
      env.DB.prepare(`SELECT COUNT(*) AS historyTotal,
        (SELECT COUNT(*) FROM monitor_days WHERE date IN
          (SELECT json_extract(value, '$.date') FROM json_each(?))) AS present
        FROM monitor_days`).bind(JSON.stringify(days)),
    ]);
    return json({ ok: true, submitted: days.length, inserted: Number(inserted.meta.changes),
      present: Number(counts.results[0].present), historyTotal: Number(counts.results[0].historyTotal) });
  } catch { return json({ error: "历史补传失败，可安全重试" }, 503); }
}
