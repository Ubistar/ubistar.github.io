import { json, readSnapshot, readHeaders } from "../_shared.js";
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "D1 绑定 DB 尚未配置" }, 503);
  try {
    const snapshot = await readSnapshot(env);
    if (!snapshot) return json({ error: "尚未收到监测节点的第一份快照" }, 503, { "Retry-After": "30" });
    return json(snapshot.payload, 200, readHeaders(snapshot));
  } catch { return json({ error: "监测数据暂时不可用，请稍后重试" }, 503, { "Retry-After": "30" }); }
}
