import { json, readSnapshot, readHeaders, validDate } from "../_shared.js";
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "D1 绑定 DB 尚未配置" }, 503);
  const params = new URL(request.url).searchParams;
  const rawPage = params.get("page") || "1", rawLimit = params.get("limit") || "10";
  const page = Number(rawPage), limit = Number(rawLimit);
  if (!/^\d+$/.test(rawPage) || !Number.isSafeInteger(page) || page < 1 || page > 1000000 ||
      !/^\d+$/.test(rawLimit) || ![10, 20, 50].includes(limit))
    return json({ error: "page 必须为正整数，limit 可选 10、20、50" }, 400);
  const from = params.get("from"), to = params.get("to");
  if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to))
    return json({ error: "请填写有效日期，且起始日期不能晚于结束日期" }, 400);
  try {
    const snapshot = await readSnapshot(env);
    if (!snapshot) return json({ error: "尚无历史记录" }, 503, { "Retry-After": "30" });
    const conditions = [], values = [];
    if (from) { conditions.push("date >= ?"); values.push(from); }
    if (to) { conditions.push("date <= ?"); values.push(to); }
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    // COUNT and LIMIT execute in one D1 transaction so a concurrent push cannot shift this response.
    const [count, rows] = await env.DB.batch([
      env.DB.prepare(`SELECT COUNT(*) AS total FROM monitor_days${where}`).bind(...values),
      env.DB.prepare(`SELECT payload FROM monitor_days${where} ORDER BY date DESC LIMIT ? OFFSET ?`)
        .bind(...values, limit, (page - 1) * limit),
    ]);
    const total = Number(count.results[0]?.total || 0);
    const items = rows.results.map(row => {
      const day = JSON.parse(row.payload);
      return { ...day, isToday: day.date === snapshot.payload.today.date };
    });
    return json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)),
      stale: snapshot.stale, snapshotSavedAt: snapshot.receivedAt }, 200, readHeaders(snapshot));
  } catch { return json({ error: "历史记录暂时不可用，请稍后重试" }, 503, { "Retry-After": "30" }); }
}
