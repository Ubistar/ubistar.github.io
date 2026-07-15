import { ensureSchema, json, validDashboard } from "../_shared.js";

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "D1 绑定 DB 尚未配置" }, 503);
  if (!env.INGEST_TOKEN) return json({ error: "INGEST_TOKEN 尚未配置" }, 503);
  if (request.headers.get("Authorization") !== `Bearer ${env.INGEST_TOKEN}`) {
    return json({ error: "Unauthorized" }, 401);
  }
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 1_000_000) return json({ error: "Payload too large" }, 413);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "请求体不是有效 JSON" }, 400);
  }
  if (!validDashboard(payload)) return json({ error: "监测快照格式不正确" }, 400);

  const now = Date.now();
  await ensureSchema(env.DB);
  await env.DB.prepare(`INSERT INTO monitor_snapshots
    (id, payload, received_at, source_checked_at) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload=excluded.payload,
      received_at=excluded.received_at,
      source_checked_at=excluded.source_checked_at`)
    .bind(JSON.stringify(payload), now, payload.lastCheckedAt)
    .run();
  return json({ ok: true, receivedAt: now, sourceCheckedAt: payload.lastCheckedAt });
}
