import { json, readSnapshot } from "./_shared.js";

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false, stale: true, error: "D1 绑定 DB 尚未配置" }, 503);
  const snapshot = await readSnapshot(env);
  return json({
    ok: Boolean(snapshot),
    stale: snapshot?.stale ?? true,
    lastReceivedAt: snapshot?.receivedAt ?? null,
    sourceCheckedAt: snapshot?.sourceCheckedAt ?? null,
  }, snapshot ? 200 : 503);
}
