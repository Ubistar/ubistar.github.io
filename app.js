"use strict";

const API = "https://api.flyou.cc/v1/dashboard";
const ROOM_URL = "https://live.bilibili.com/1863473244";
const $ = (id) => document.getElementById(id);
let dashboard = null;
let now = Date.now();
let loading = false;

const pad = (n) => String(n).padStart(2, "0");
function clock(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${pad(Math.floor(value / 3600))}:${pad(Math.floor((value % 3600) / 60))}:${pad(value % 60)}`;
}
function duration(seconds, compact = false) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return compact ? `${hours}h ${pad(minutes)}m` : `${hours}小时${minutes ? ` ${minutes}分` : ""}`;
}
function time(value) {
  if (!value) return "—";
  const ms = Number(value) < 1e12 ? Number(value) * 1000 : Number(value);
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(ms));
}
function shortDate(value) {
  if (!value) return "—";
  const parts = String(value).split("-");
  return `${Number(parts[1])}/${Number(parts[2])}`;
}
function longDate(value) { return value ? String(value).replaceAll("-", ".") : "PENDING"; }
function ratingClass(value) {
  const text = String(value || "");
  return text.includes("合格") || text.includes("模范") || text.includes("交差") ? "rating ok" : text.includes("观察") || text.includes("待") ? "rating warn" : "rating";
}
function setRating(id, value) {
  const node = $(id); node.textContent = value || "待出具"; node.className = ratingClass(value);
}
function normalize(raw) {
  const today = raw.today || {};
  const week = raw.week || {};
  return {
    ...raw,
    live: Boolean(raw.live),
    verified: raw.verified !== false,
    stale: Boolean(raw.stale),
    lastCheckedAt: Number(raw.lastCheckedAt || raw.last_checked_at || Date.now()),
    lastSuccessAt: Number(raw.lastSuccessAt || raw.last_success_at || raw.lastCheckedAt || Date.now()),
    currentStatusSeconds: Number(raw.currentStatusSeconds || raw.current_status_seconds || 0),
    checkCount: Number(raw.checkCount || raw.check_count || 0),
    streakDays: Number(raw.streakDays || raw.streak_days || 0),
    room: raw.room || { title: "蠡歪直播间" },
    today: { liveSeconds: 0, lazySeconds: 0, sessionCount: 0, ...today },
    week: { attendanceRate: 0, liveSeconds: 0, lazySeconds: 0, activeDays: 0, ...week },
    history: Array.isArray(raw.history) ? raw.history : []
  };
}
function liveDelta() {
  if (!dashboard || dashboard.stale) return 0;
  return Math.max(0, Math.floor((now - dashboard.lastCheckedAt) / 1000));
}
function drawClock() {
  if (!dashboard) return;
  const delta = liveDelta();
  $("statusClock").textContent = clock(dashboard.currentStatusSeconds + delta);
  $("todayLive").textContent = duration(dashboard.today.liveSeconds + (dashboard.live ? delta : 0));
  $("todayLazy").textContent = duration(dashboard.today.lazySeconds + (!dashboard.live ? delta : 0));
}
function renderChart(history) {
  const days = history.slice(0, 7).reverse();
  if (!days.length) { $("chart").innerHTML = '<div class="empty">正在建立第一份出勤记录</div>'; return; }
  const max = Math.max(1, ...days.map((d) => Number(d.monitoredSeconds || d.liveSeconds + d.lazySeconds || 0)));
  $("chart").innerHTML = days.map((day) => {
    const live = Number(day.liveSeconds || 0), lazy = Number(day.lazySeconds || 0);
    const liveHeight = Math.max(live ? 1 : 0, live / max * 100);
    const lazyHeight = Math.max(lazy ? 1 : 0, lazy / max * 100);
    return `<div class="bar-group"><div class="bar-stack" title="${day.date}：开播 ${duration(live, true)} / 偷懒 ${duration(lazy, true)}"><div class="bar lazy" style="height:${lazyHeight}%"></div><div class="bar live" style="height:${liveHeight}%"></div></div><strong>${(live / 3600).toFixed(1)}h</strong><span>${day.isToday ? "今天" : shortDate(day.date)}</span></div>`;
  }).join("");
}
function rowRating(day) { return `<span class="${ratingClass(day.rating)}">${day.rating || "待评价"}</span>`; }
function renderTables(history) {
  $("recentRows").innerHTML = history.length ? history.slice(0, 7).map((day) => `<tr><td>${day.isToday ? "今天" : shortDate(day.date)}</td><td>${duration(day.liveSeconds, true)}</td><td>${duration(day.lazySeconds, true)}</td><td>${rowRating(day)}</td></tr>`).join("") : '<tr><td colspan="4" class="empty-cell">等待云端数据</td></tr>';
  $("ledgerRows").innerHTML = history.length ? history.map((day) => `<tr><td><strong>${longDate(day.date)}</strong></td><td>${duration(day.liveSeconds)}</td><td>${duration(day.lazySeconds)}</td><td>${Number(day.sessionCount || 0)} 次</td><td>${time(day.firstLiveAt)}</td><td>${rowRating(day)}<p>${day.report || "本日记录已归档。"}</p></td></tr>`).join("") : '<tr><td colspan="6" class="empty-cell">监测记录即将从今天开始</td></tr>';
  $("archiveDays").textContent = history.length;
}
function render() {
  if (!dashboard) return;
  const d = dashboard, today = d.today, week = d.week;
  const frozen = d.stale || d.monitorSource === "cache";
  $("hero").classList.toggle("live", d.live);
  $("statusLine").className = frozen ? "status unknown" : d.live ? "status live" : "status";
  $("statusLine").querySelector("span").textContent = frozen ? "显示最后成功快照 · 计时已冻结" : d.live ? "当前正在直播" : "当前未开播";
  $("heroTitle").textContent = frozen ? (d.live ? "最后核验为上班" : "最后核验为偷懒") : d.live ? "煮啵正在上班" : "煮啵已偷懒";
  $("clockLabel").textContent = frozen ? "最后成功快照" : d.live ? "本次连续开播计时" : "本次连续旷工计时";
  $("heroCopy").textContent = frozen ? `状态核验于 ${time(d.lastSuccessAt)}，恢复同步前不会继续外推时长。` : d.live ? `抓到煮啵上班了！正在直播《${d.room.title || "直播间"}》，本次表现将如实记入台账。` : `直播间的灯还没亮。当前标题为《${d.room.title || "直播间"}》，旷工计时一秒不停。`;
  $("orbit").className = d.live ? "orbit live" : "orbit";
  $("orbit").querySelector("span").textContent = d.live ? "▶" : "▱";
  $("lastCheck").textContent = `● 最近检测 ${time(d.lastCheckedAt)}`;
  $("stamp").hidden = d.live;
  setRating("todayRating", today.rating || "待评价");
  $("todayVerdict").textContent = `“${today.report || "今日监察记录正在生成。"}”`;
  $("sessions").textContent = `${Number(today.sessionCount || 0)} 个直播时段`;
  $("lazyHint").textContent = d.live ? "当前暂停增长" : "仍在持续增加";
  $("attendance").textContent = `${Number(week.attendanceRate || 0)}%`;
  $("weekRating").textContent = week.rating || "正在统计";
  $("streak").textContent = `${d.streakDays}天`;
  setRating("dailyRating", today.rating || "待出具");
  $("dailyDate").textContent = `DAILY REPORT · ${longDate(today.date)}`;
  $("dailyReport").textContent = today.report || "今日监察记录正在生成。";
  $("reportLive").textContent = duration(today.liveSeconds);
  $("reportLazy").textContent = duration(today.lazySeconds);
  $("reportSessions").textContent = `${Number(today.sessionCount || 0)} 次`;
  $("firstLive").textContent = time(today.firstLiveAt);
  setRating("weeklyRating", week.rating || "待出具");
  $("weekDate").textContent = `WEEKLY REVIEW · ${week.weekStart ? `${shortDate(week.weekStart)}—${shortDate(week.weekEnd)}` : "PENDING"}`;
  $("weeklyReport").textContent = week.report || "一周数据正在积累，监察委员会暂不下结论。";
  $("weekLive").textContent = duration(week.liveSeconds);
  $("weekLazy").textContent = duration(week.lazySeconds);
  $("activeDays").textContent = `${Number(week.activeDays || 0)} 天`;
  $("ring").style.setProperty("--rate", `${Number(week.attendanceRate || 0) * 3.6}deg`);
  $("ring").querySelector("strong").textContent = `${Number(week.attendanceRate || 0)}%`;
  $("footerStatus").firstChild.textContent = `最近检测 ${time(d.lastCheckedAt)} · 成功检测 ${d.checkCount} 次 `;
  drawClock(); renderChart(d.history); renderTables(d.history);
}
async function load() {
  if (loading) return;
  loading = true; $("syncDot").classList.add("spinning");
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${API}?t=${Date.now()}`, { cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`数据接口返回 HTTP ${response.status}`);
    dashboard = normalize(await response.json());
    localStorage.setItem("liwai-last-dashboard", JSON.stringify(dashboard));
    $("notice").hidden = true; now = Date.now(); render();
  } catch (error) {
    const cached = localStorage.getItem("liwai-last-dashboard");
    if (cached && !dashboard) { try { dashboard = normalize(JSON.parse(cached)); dashboard.stale = true; render(); } catch {} }
    $("notice").hidden = false;
    $("noticeText").textContent = `${error?.message || "暂时无法连接数据桥"}。${dashboard ? "已保留本机最后一次成功数据。" : "Cloudflare 接口部署后将自动恢复。"}`;
  } finally { loading = false; $("syncDot").classList.remove("spinning"); }
}

document.querySelectorAll(".themes button").forEach((button) => button.addEventListener("click", () => {
  document.documentElement.dataset.theme = button.dataset.theme;
  localStorage.setItem("liwai-theme", button.dataset.theme);
  document.querySelectorAll(".themes button").forEach((item) => item.classList.toggle("active", item === button));
}));
const savedTheme = localStorage.getItem("liwai-theme") || "paper";
document.documentElement.dataset.theme = savedTheme;
document.querySelectorAll(".themes button").forEach((item) => item.classList.toggle("active", item.dataset.theme === savedTheme));
$("retry").addEventListener("click", load); $("refresh").addEventListener("click", load);
setInterval(() => { now = Date.now(); drawClock(); }, 1000);
setInterval(load, 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });
load();
