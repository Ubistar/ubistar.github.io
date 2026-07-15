export const ROOM_ID = "1863473244";
export const STALE_AFTER_MS = 180_000;

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

export function validDashboard(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.room?.id === ROOM_ID &&
    typeof value.live === "boolean" &&
    typeof value.lastCheckedAt === "number" &&
    value.today &&
    value.week &&
    Array.isArray(value.history),
  );
}

export async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS monitor_snapshots (
    id INTEGER PRIMARY KEY,
    payload TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    source_checked_at INTEGER NOT NULL
  )`).run();
}

export async function readSnapshot(env) {
  let row;
  try {
    row = await env.DB.prepare(
      "SELECT payload, received_at, source_checked_at FROM monitor_snapshots WHERE id=1",
    ).first();
  } catch {
    return null;
  }
  if (!row) return null;
  try {
    const payload = JSON.parse(row.payload);
    if (!validDashboard(payload)) return null;
    const stale = Boolean(payload.stale) || Date.now() - row.received_at > STALE_AFTER_MS;
    return {
      payload: {
        ...payload,
        stale,
        monitorSource: "cloudflare",
        snapshotSavedAt: row.received_at,
        upstreamError: stale
          ? "大陆监测节点超过 3 分钟未推送；当前显示最后一次真实快照，计时已冻结"
          : null,
      },
      receivedAt: row.received_at,
      sourceCheckedAt: row.source_checked_at,
      stale,
    };
  } catch {
    return null;
  }
}
