export const ROOM_ID = "1863473244";
export const STALE_AFTER_MS = 180_000;
export const ARCHIVE_VERSION = 2;

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  }});
}
export function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validDashboard(value) {
  return Boolean(value && typeof value === "object" && value.room?.id === ROOM_ID &&
    typeof value.live === "boolean" && Number.isFinite(value.lastCheckedAt) && value.lastCheckedAt > 0 &&
    value.today && value.week && Array.isArray(value.history) && value.history.every(day => day && validDate(day.date)));
}
export function timestamp(value) {
  const n = Number(value) || 0;
  return n > 0 && n < 1e12 ? n * 1000 : n;
}
export async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS monitor_snapshots (
      id INTEGER PRIMARY KEY, payload TEXT NOT NULL,
      received_at INTEGER NOT NULL, source_checked_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS monitor_days (
      date TEXT PRIMARY KEY, payload TEXT NOT NULL, source_checked_at INTEGER NOT NULL
    )`),
  ]);
}
// The archive and compact snapshot commit together; an interrupted migration cannot lose history.
export async function saveSnapshot(db, payload, receivedAt) {
  const checkedAt = timestamp(payload.lastCheckedAt);
  const days = [...new Map(payload.history.map(day => [day.date, { ...day, isToday: day.date === payload.today.date }])).values()]
    .sort((a, b) => b.date.localeCompare(a.date));
  const overview = { ...payload, archiveVersion: ARCHIVE_VERSION, lastCheckedAt: checkedAt,
    history: days.slice(0, 7) };
  return db.batch([
    db.prepare(`INSERT INTO monitor_days (date, payload, source_checked_at)
      SELECT json_extract(value, '$.date'), value, ? FROM json_each(?)
      WHERE ? >= COALESCE((SELECT source_checked_at FROM monitor_snapshots WHERE id=1), 0)
      ON CONFLICT(date) DO UPDATE SET payload=excluded.payload, source_checked_at=excluded.source_checked_at
      WHERE excluded.source_checked_at >= monitor_days.source_checked_at
      AND excluded.payload != monitor_days.payload`).bind(checkedAt, JSON.stringify(days), checkedAt),
    db.prepare(`INSERT INTO monitor_snapshots (id, payload, received_at, source_checked_at)
      VALUES (1, json_set(?, '$.historyTotal', (SELECT COUNT(*) FROM monitor_days)), ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, received_at=excluded.received_at,
      source_checked_at=excluded.source_checked_at
      WHERE excluded.source_checked_at >= monitor_snapshots.source_checked_at`)
      .bind(JSON.stringify(overview), receivedAt, checkedAt),
  ]);
}
export async function readSnapshot(env) {
  let row;
  try {
    row = await env.DB.prepare("SELECT payload, received_at, source_checked_at FROM monitor_snapshots WHERE id=1").first();
  } catch (error) {
    if (/no such table/i.test(String(error))) return null;
    throw error;
  }
  if (!row) return null;
  let payload;
  try { payload = JSON.parse(row.payload); } catch { return null; }
  if (!validDashboard(payload)) return null;
  // On upgrade, archive the old complete snapshot before replacing it with a bounded overview.
  if (payload.archiveVersion !== ARCHIVE_VERSION) {
    await ensureSchema(env.DB);
    await saveSnapshot(env.DB, payload, row.received_at);
    row = await env.DB.prepare("SELECT payload, received_at, source_checked_at FROM monitor_snapshots WHERE id=1").first();
    payload = JSON.parse(row.payload);
  }
  const checkedAt = timestamp(row.source_checked_at);
  const stale = Boolean(payload.stale) || payload.verified === false ||
    Date.now() - row.received_at > STALE_AFTER_MS || Date.now() - checkedAt > STALE_AFTER_MS;
  return {
    payload: { ...payload, stale, monitorSource: "cloudflare", snapshotSavedAt: row.received_at,
      upstreamError: stale ? "监测数据暂未更新，当前显示最后一次核验结果。" : null },
    receivedAt: row.received_at, sourceCheckedAt: checkedAt, stale,
  };
}
export function readHeaders(snapshot) {
  // Short shared/browser caching is bounded below the 3-minute stale threshold.
  return { "Cache-Control": "public, max-age=15, s-maxage=15",
    "X-Monitor-Source": "cloudflare-d1", "X-Archive-Version": String(ARCHIVE_VERSION) };
}
