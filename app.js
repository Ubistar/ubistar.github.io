"use strict";
const API_BASE = "https://api.flyou.cc/v1";
const CACHE_KEY = "liwai-overview-v2";
const STALE_AFTER = 180000;
const $ = id => document.getElementById(id);
const state = { dashboard: null, loading: false, failed: false, lastFetch: 0, view: "overview",
  history: { page: 1, limit: 10, from: "", to: "", total: 0, pages: 1, items: [], loaded: false, loading: false, request: 0, controller: null, cache: new Map() } };
const number = value => Math.max(0, Number(value) || 0);
const pad = value => String(value).padStart(2, "0");
const stamp = value => { const n = number(value); return n && n < 1e12 ? n * 1000 : n; };
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function duration(value) { const n = Math.floor(number(value)); return `${Math.floor(n / 3600)}小时 ${pad(Math.floor(n % 3600 / 60))}分`; }
function clock(value) { const n = Math.floor(number(value)); return `${pad(Math.floor(n / 3600))}:${pad(Math.floor(n % 3600 / 60))}:${pad(n % 60)}`; }
function time(value, full = false) {
  const ms = stamp(value); if (!ms || !Number.isFinite(ms)) return "—";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", ...(full ? {month:"2-digit",day:"2-digit"} : {}), hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23" }).format(ms);
}
function dateCN(ms = Date.now()) { return new Intl.DateTimeFormat("sv-SE", { timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit" }).format(ms); }
function normalize(raw) {
  if (!raw || typeof raw.live !== "boolean" || !raw.today || !raw.week || !stamp(raw.lastCheckedAt || raw.last_checked_at)) throw new Error("收到的监测数据不完整");
  // Only retain a bounded overview, including when upgrading from a previously cached legacy response.
  const history = (Array.isArray(raw.history) ? raw.history : []).filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date)).sort((a,b) => b.date.localeCompare(a.date));
  return { live: raw.live, verified: raw.verified !== false, stale: Boolean(raw.stale),
    lastCheckedAt: stamp(raw.lastCheckedAt || raw.last_checked_at),
    lastSuccessAt: stamp(raw.lastSuccessAt || raw.last_success_at || raw.lastCheckedAt),
    snapshotSavedAt: stamp(raw.snapshotSavedAt), currentStatusSeconds: number(raw.currentStatusSeconds ?? raw.current_status_seconds),
    checkCount: number(raw.checkCount ?? raw.check_count), streakDays: number(raw.streakDays ?? raw.streak_days),
    room: raw.room || {}, today: raw.today, week: raw.week, history: history.slice(0,7), historyTotal: number(raw.historyTotal ?? history.length), archiveVersion: number(raw.archiveVersion) };
}
function frozen() {
  const d = state.dashboard;
  return !d || state.failed || d.stale || !d.verified || Date.now() - d.lastCheckedAt > STALE_AFTER ||
    (d.snapshotSavedAt && Date.now() - d.snapshotSavedAt > STALE_AFTER);
}
function rating(node, value) {
  const text = String(value || "待评价"); node.textContent = text;
  node.dataset.tone = /不合格|旷工|谴责|偷懒|失职/.test(text) ? "bad" : /合格|模范|交差|勤奋/.test(text) ? "good" : "neutral";
}
function message(text = "") { $("notice").hidden = !text; $("noticeText").textContent = text; }
function drawClock() {
  const d = state.dashboard; if (!d) return;
  const stopped = frozen();
  const delta = stopped ? 0 : Math.max(0, Math.floor((Date.now() - d.lastCheckedAt) / 1000));
  // Never extrapolate yesterday's daily counters across the Beijing midnight boundary.
  const dailyDelta = d.today.date === dateCN() ? delta : 0;
  const live = number(d.today.liveSeconds) + (d.live ? dailyDelta : 0);
  const lazy = number(d.today.lazySeconds) + (d.live ? 0 : dailyDelta);
  $("statusClock").textContent = clock(number(d.currentStatusSeconds) + delta);
  $("todayLive").textContent = duration(live); $("todayLazy").textContent = duration(lazy);
  $("liveTrack").style.width = `${Math.min(100, live / 864)}%`; $("lazyTrack").style.width = `${Math.min(100, lazy / 864)}%`;
  $("connection").dataset.state = stopped ? "stale" : "ok";
  $("connection").textContent = stopped ? "等待更新" : "监测正常";
  $("statusCard").dataset.state = stopped ? "unknown" : d.live ? "live" : "offline";
  $("statusLabel").textContent = stopped ? "最后核验状态" : d.live ? "正在直播" : "尚未开播";
  $("heroTitle").textContent = stopped ? (d.live ? "上次核验时正在直播" : "上次核验时未开播") : d.live ? "煮啵正在上班" : "煮啵正在休息";
  $("clockLabel").textContent = stopped ? "上次记录的持续时间 · 已暂停计时" : d.live ? "本次连续开播" : "本次连续未开播";
  $("lazyHint").textContent = stopped ? "显示最近记录" : d.live ? "当前暂停增长" : "当前持续增加";
  if (stopped && !state.loading && !state.failed) message("监测数据暂未更新，显示最后一次核验结果，计时已暂停。");
}
function renderChart(days) {
  const end = state.dashboard?.today?.date;
  if (!days.length || !end) { $("chart").innerHTML = '<p class="empty">暂无出勤记录</p>'; return; }
  const byDate = new Map(days.map(d => [d.date,d]));
  const anchor = new Date(`${end}T12:00:00+08:00`).getTime();
  const dates = Array.from({length:7}, (_,i) => dateCN(anchor - (6-i) * 86400000));
  $("chart").innerHTML = dates.map(date => {
    const day = byDate.get(date), live = number(day?.liveSeconds), lazy = number(day?.lazySeconds);
    const scale = Math.max(86400, live + lazy);
    const label = `${date}，${day ? `开播${duration(live)}，偷懒${duration(lazy)}` : "暂无监测记录"}`;
    return `<div class="bar-group" tabindex="0" role="img" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}"><div class="bar-space"><div class="bar-stack"><div class="bar lazy" style="height:${lazy/scale*100}%"></div><div class="bar live" style="height:${live/scale*100}%"></div></div></div><span class="bar-date">${date === dateCN() ? "今天" : date.slice(5).replace("-","/")}</span></div>`;
  }).join("");
}
function render() {
  const d = state.dashboard; if (!d) return;
  const t = d.today, w = d.week;
  $("heroCopy").textContent = `直播间：${d.room.title || "蠡歪直播间"}`;
  $("roomAction").innerHTML = `${d.live ? "去看直播" : "去直播间催播"} <span aria-hidden="true">↗</span>`;
  $("lastCheck").textContent = `最近核验 ${time(d.lastCheckedAt,true)}`;
  $("sessions").textContent = `${number(t.sessionCount)} 个直播时段`;
  $("attendance").textContent = `${number(w.attendanceRate)}%`;
  $("weekRating").textContent = String(w.rating || "本周统计中");
  $("streak").textContent = `${d.streakDays} 天`;
  rating($("todayRating"),t.rating); rating($("dailyRating"),t.rating); rating($("weeklyRating"),w.rating);
  $("todayVerdict").textContent = t.report || "今日记录持续更新中。";
  $("briefDate").textContent = t.date || "—";
  $("briefFirstLive").textContent = time(t.firstLiveAt);
  $("archiveDays").textContent = `${d.historyTotal} 天`;
  $("dailyDate").textContent = t.date || "—";
  $("dailyReport").textContent = t.report || "今日记录持续更新中。";
  $("reportLive").textContent = duration(t.liveSeconds); $("reportLazy").textContent = duration(t.lazySeconds);
  $("reportSessions").textContent = `${number(t.sessionCount)} 次`; $("firstLive").textContent = time(t.firstLiveAt);
  $("weekDate").textContent = w.weekStart ? `${w.weekStart} — ${w.weekEnd || "现在"}` : "本周";
  $("weeklyReport").textContent = w.report || "本周记录持续更新中。";
  $("weekLive").textContent = duration(w.liveSeconds); $("weekLazy").textContent = duration(w.lazySeconds);
  $("activeDays").textContent = `${number(w.activeDays)} 天`; $("weekAttendance").textContent = `${number(w.attendanceRate)}%`;
  $("footerStatus").textContent = `最近核验 ${time(d.lastCheckedAt,true)} · 累计检测 ${d.checkCount.toLocaleString("zh-CN")} 次`;
  renderChart(d.history); drawClock();
}
async function requestJSON(path, signal) {
  const response = await fetch(`${API_BASE}/${path}`, { headers:{Accept:"application/json"}, signal });
  let data; try { data = await response.json(); } catch { throw new Error("数据服务暂时不可用"); }
  if (!response.ok) throw new Error(data.error || `数据请求失败（${response.status}）`);
  return data;
}
async function loadOverview(force = false) {
  if (state.loading || (!force && Date.now() - state.lastFetch < 30000)) return;
  state.loading = true; $("refresh").classList.add("is-loading"); $("refresh").disabled = true;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),10000);
  try {
    const raw = await requestJSON("overview",controller.signal);
    // The new route cannot download a legacy full-history response during staggered deployment.
    if (number(raw.archiveVersion) < 2) throw new Error("新版数据接口正在部署，请稍后重试");
    state.dashboard = normalize(raw); state.failed = false; state.lastFetch = Date.now();
    try { localStorage.setItem(CACHE_KEY,JSON.stringify(state.dashboard)); localStorage.removeItem("liwai-last-dashboard"); } catch {}
    message(); render();
  } catch (error) {
    state.failed = true; state.lastFetch = Date.now();
    message(`${error.name === "AbortError" ? "数据请求超时" : error.message}。${state.dashboard ? "保留最近记录，计时已暂停。" : "稍后将自动重试。"}`);
    if (state.dashboard) render(); else { $("connection").textContent = "连接未完成"; $("connection").dataset.state = "stale"; }
  } finally { clearTimeout(timeout); state.loading = false; $("refresh").classList.remove("is-loading"); $("refresh").disabled = false; }
}
function historyKey() {
  const h = state.history, params = new URLSearchParams({page:String(h.page),limit:String(h.limit)});
  if (h.from) params.set("from",h.from); if (h.to) params.set("to",h.to); return params.toString();
}
function historyMessage(text = "") { $("historyMessage").hidden = !text; $("historyMessage").textContent = text; }
function pagination() {
  const h = state.history;
  $("prevPage").disabled = h.loading || !h.loaded || h.page <= 1;
  $("nextPage").disabled = h.loading || !h.loaded || h.page >= h.pages;
  $("pageNumber").textContent = `${h.page} / ${h.pages}`;
}
function renderHistory(data) {
  const h = state.history;
  h.items = data.items; h.total = data.total; h.pages = data.pages; h.loaded = true;
  $("historyTotal").textContent = `共 ${h.total} 天记录`;
  $("historyRows").innerHTML = h.items.length ? h.items.map((d,i) => `<tr><td>${escapeHTML(d.date)}${d.isToday ? ' <span class="rating">今日</span>' : ""}</td><td class="live-value">${duration(d.liveSeconds)}</td><td>${duration(d.lazySeconds)}</td><td>${number(d.sessionCount)} 次</td><td>${time(d.firstLiveAt)}</td><td><span class="rating">${escapeHTML(d.rating || "待评价")}</span></td><td><button class="detail-button" data-index="${i}" aria-label="查看 ${escapeHTML(d.date)} 详情">详情 ↗</button></td></tr>`).join("") : '<tr><td colspan="7" class="empty-cell">所选日期范围内没有记录</td></tr>';
  $("pageSummary").textContent = h.total ? `第 ${(h.page-1)*h.limit+1}–${Math.min(h.page*h.limit,h.total)} 条，共 ${h.total} 条` : "暂无符合条件的记录";
  historyMessage(data.stale || (data.snapshotSavedAt && Date.now()-stamp(data.snapshotSavedAt)>STALE_AFTER) ? "监测同步暂有延迟，以下为已保存记录。" : "");
  pagination();
}
async function loadHistory(force = false) {
  const h = state.history;
  h.controller?.abort(); const sequence = ++h.request;
  const key = historyKey(), cached = h.cache.get(key);
  if (!force && cached && Date.now()-cached.at < 60000) { h.loading=false; renderHistory(cached.data); return; }
  h.loading = true; h.loaded = false; h.items = []; pagination(); historyMessage();
  $("historyRows").innerHTML = '<tr><td colspan="7" class="empty-cell">正在读取这一页的记录…</td></tr>';
  $("pageSummary").textContent = "正在加载…";
  h.controller = new AbortController(); const controller = h.controller;
  const timeout = setTimeout(() => controller.abort(),10000);
  try {
    const data = await requestJSON(`history?${key}`,controller.signal);
    if (sequence !== h.request) return;
    if (!Array.isArray(data.items) || data.items.length > h.limit || !Number.isInteger(data.total) || !Number.isInteger(data.pages)) throw new Error("历史接口响应格式不正确");
    if (h.page > data.pages) { h.page = data.pages; return loadHistory(force); }
    h.cache.set(key,{data,at:Date.now()}); if(h.cache.size>12) h.cache.delete(h.cache.keys().next().value);
    renderHistory(data);
  } catch (error) {
    if(sequence !== h.request) return;
    historyMessage(`${error.name === "AbortError" ? "历史记录请求超时" : error.message}。点击“查询”可重试。`);
    $("historyRows").innerHTML = '<tr><td colspan="7" class="empty-cell">这一页未能加载</td></tr>';
    $("pageSummary").textContent = "加载失败";
  } finally { clearTimeout(timeout); if(sequence===h.request) { h.loading=false; pagination(); } }
}
function openDay(index) {
  const d = state.history.items[index]; if(!d) return;
  $("dialogDate").textContent=d.date; rating($("dialogRating"),d.rating); $("dialogReport").textContent=d.report || "本日暂无文字报告。";
  $("dialogStats").innerHTML = [["开播时长",duration(d.liveSeconds)],["偷懒时长",duration(d.lazySeconds)],["开播次数",`${number(d.sessionCount)} 次`],["首次开播",time(d.firstLiveAt)]].map(([k,v])=>`<div><dt>${k}</dt><dd>${escapeHTML(v)}</dd></div>`).join("");
  $("dayDialog").showModal();
}
function navigate() {
  const view = location.hash.slice(1); state.view = ["overview","reports","history"].includes(view) ? view : "overview";
  document.querySelectorAll(".view").forEach(node=>node.hidden=node.id!==`view-${state.view}`);
  document.querySelectorAll("[data-view]").forEach(node=>{ if(node.dataset.view===state.view) node.setAttribute("aria-current","page"); else node.removeAttribute("aria-current"); });
  if(state.view==="history") loadHistory();
}
$("historyFilter").addEventListener("submit",event=>{
  event.preventDefault();
  if($("dateFrom").value && $("dateTo").value && $("dateFrom").value>$("dateTo").value) { historyMessage("起始日期不能晚于结束日期。"); return; }
  Object.assign(state.history,{page:1,from:$("dateFrom").value,to:$("dateTo").value}); loadHistory(true);
});
$("resetFilter").addEventListener("click",()=>{ $("dateFrom").value=""; $("dateTo").value=""; Object.assign(state.history,{page:1,from:"",to:""}); loadHistory(); });
$("pageSize").addEventListener("change",()=>{ state.history.limit=Number($("pageSize").value); state.history.page=1; loadHistory(); });
$("prevPage").addEventListener("click",()=>{ if(state.history.page>1&&!state.history.loading) { state.history.page--;loadHistory(); } });
$("nextPage").addEventListener("click",()=>{ if(state.history.page<state.history.pages&&!state.history.loading) {state.history.page++;loadHistory();} });
$("historyRows").addEventListener("click",event=>{const button=event.target.closest("[data-index]");if(button)openDay(Number(button.dataset.index));});
$("closeDialog").addEventListener("click",()=>$("dayDialog").close());
$("dayDialog").addEventListener("click",event=>{if(event.target===$("dayDialog")){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
$("refresh").addEventListener("click",()=>{loadOverview(true);if(state.view==="history")loadHistory(true);});
$("retry").addEventListener("click",()=>loadOverview(true));
window.addEventListener("hashchange",navigate);
document.addEventListener("visibilitychange",()=>{if(!document.hidden){loadOverview();if(state.view==="history")loadHistory();}});
function updateDate() { $("localDate").textContent=`北京时间 · ${new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",month:"long",day:"numeric",weekday:"long"}).format(Date.now())}`; }
try { const saved=localStorage.getItem(CACHE_KEY);if(saved){state.dashboard=normalize(JSON.parse(saved));state.failed=true;render();message("正在更新最近记录…");} localStorage.removeItem("liwai-theme"); } catch {}
updateDate();navigate();loadOverview(true);
setInterval(()=>{if(!document.hidden)drawClock();},1000);
setInterval(()=>{if(!document.hidden){updateDate();loadOverview();}},60000);
