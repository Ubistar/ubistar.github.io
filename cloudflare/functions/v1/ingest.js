import { ensureSchema, json, validDashboard, saveSnapshot, timestamp, readSnapshot } from "../_shared.js";

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
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 1_000_000) return json({ error: "Payload too large" }, 413);
    payload = JSON.parse(text);
  } catch {
    return json({ error: "请求体不是有效 JSON" }, 400);
  }
  if (!validDashboard(payload)) return json({ error: "监测快照格式不正确" }, 400);

  const now = Date.now();
  if (timestamp(payload.lastCheckedAt) > now + 60_000) return json({ error: "监测时间不能晚于当前时间" }, 400);
  try {
    await ensureSchema(env.DB);
    await readSnapshot(env);
    await saveSnapshot(env.DB, payload, now);
    return json({ ok: true, receivedAt: now, sourceCheckedAt: timestamp(payload.lastCheckedAt) });
  } catch { return json({ error: "快照保存失败，请重试" }, 503); }
}
