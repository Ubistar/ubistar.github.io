import { json, readSnapshot } from "../_shared.js";

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "D1 绑定 DB 尚未配置" }, 503);
  const snapshot = await readSnapshot(env);
  if (!snapshot) return json({ error: "尚未收到大陆监测节点的第一份快照" }, 503, { "Retry-After": "30" });
  return json(snapshot.payload, 200, { "X-Monitor-Source": "cloudflare-d1" });
}
