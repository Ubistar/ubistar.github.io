#!/usr/bin/env python3
"""One-off, stdlib-only recovery from Ubuntu SQLite. No daemon or local writes."""
import argparse
from datetime import datetime, time as day_time, timedelta
import json
from pathlib import Path
import shlex
import sqlite3
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Shanghai")
ROOM_ID = "1863473244"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward the existing write credential to another host.


def request_json(url, body=None, token=None):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if body is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(body, ensure_ascii=False).encode()
    with build_opener(NoRedirect).open(Request(url, data=body, headers=headers), timeout=30) as response:
        return json.load(response)


def load_config(path):
    result = {}
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if sep and key in ("CLOUDFLARE_INGEST_URL", "CLOUDFLARE_INGEST_TOKEN"):
            parts = shlex.split(value)
            if len(parts) != 1:
                raise ValueError("推送配置格式不正确")
            result[key] = parts[0]
    base = result["CLOUDFLARE_INGEST_URL"].rstrip("/")
    parsed = urlparse(base)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or
            parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/")):
        raise ValueError("推送地址须为现有 HTTPS 数据桥根地址")
    return base, result["CLOUDFLARE_INGEST_TOKEN"]


def rebuild_day(date, sessions, monitor_started):
    start = int(datetime.combine(date, day_time(), TZ).timestamp())
    stop = start + 86400
    covered_start = max(start, monitor_started)
    covered = max(0, stop - covered_start)
    overlaps = sorted((max(s, covered_start), min(e, stop)) for s, e in sessions
                      if e is not None and min(e, stop) > max(s, covered_start))
    # Merge overlapping intervals, so duplicate/reopened sessions never double-count time.
    merged = []
    for left, right in overlaps:
        if merged and left <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], right)
        else:
            merged.append([left, right])
    live = sum(right - left for left, right in merged)
    return {"date": date.isoformat(), "liveSeconds": live, "lazySeconds": covered - live,
            "monitoredSeconds": covered, "sessionCount": len(overlaps),
            "firstLiveAt": overlaps[0][0] * 1000 if overlaps else None,
            "lastLiveAt": max(right for _, right in overlaps) * 1000 if overlaps else None,
            "isToday": False, "rating": "历史重算",
            "report": "根据服务器保存的直播场次重新统计。未开播时长沿用旧版口径，"
                      "按监测起始日至当天结束的时间减去已记录直播时长计算；"
                      "未被记录的直播或监测中断无法从场次表还原。"}


def read_history(db_path, checked_at):
    # mode=ro refuses to create an empty database if the configured path is wrong.
    db = sqlite3.connect(Path(db_path).resolve().as_uri() + "?mode=ro", uri=True, timeout=15)
    try:
        db.execute("BEGIN")
        row = db.execute("SELECT monitor_started_at FROM monitor_state WHERE id=1").fetchone()
        if not row or not isinstance(row[0], int) or row[0] <= 0:
            raise ValueError("数据库缺少有效监测起点")
        started = row[0]
        sessions = db.execute("SELECT started_at, ended_at FROM live_sessions ORDER BY started_at").fetchall()
    finally:
        db.close()
    if any(not isinstance(s, int) or s <= 0 or
           (e is not None and (not isinstance(e, int) or e < s)) for s, e in sessions):
        raise ValueError("存在异常场次时间，已停止补传")
    if not sessions:
        raise ValueError("数据库没有直播场次，已停止补传")
    if sessions[0][0] < started:
        raise ValueError("监测起点晚于已存在的历史场次，需先核对起点")
    first = datetime.fromtimestamp(started, TZ).date()
    before = datetime.fromtimestamp(checked_at, TZ).date()
    if not 0 < (before - first).days <= 36600:
        raise ValueError("监测日期范围异常")
    days, skipped = [], []
    date = first
    while date < before:
        stop = int(datetime.combine(date + timedelta(days=1), day_time(), TZ).timestamp())
        # An unclosed old session has no reliable historical end. Leave it for diagnosis.
        if any(e is None and s < stop for s, e in sessions):
            skipped.append(date.isoformat())
        else:
            days.append(rebuild_day(date, sessions, started))
        date += timedelta(days=1)
    return days, skipped, sessions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="补传云端缺少的日期；默认仅检查")
    parser.add_argument("--db", default="/var/lib/liwai-monitor/monitor.db")
    parser.add_argument("--config", default="/etc/liwai-cloudflare-push.env")
    args = parser.parse_args()
    snapshot = request_json("http://127.0.0.1:9999/v1/dashboard")
    if snapshot.get("room", {}).get("id") != ROOM_ID:
        raise ValueError("本机接口直播间不匹配")
    checked_at = snapshot["lastCheckedAt"]
    if checked_at > 1e12:
        checked_at /= 1000
    if not 0 < checked_at <= time.time() + 60:
        raise ValueError("本机接口核验时间异常")
    days, skipped, sessions = read_history(args.db, checked_at)
    print(f"原始场次：{len(sessions)}；可重算已结束日期：{len(days)} 天")
    if days:
        print(f"日期范围：{days[0]['date']} 至 {days[-1]['date']}")
    if skipped:
        print("未结束场次涉及的日期暂不重算：" + ", ".join(skipped))
    print("8 月 11–23 日的重算结果（包含跨天场次）：")
    for day in days:
        if "2026-08-11" <= day["date"] <= "2026-08-23":
            print(day["date"], f"{day['liveSeconds']} 秒", f"{day['sessionCount']} 场")
    if not args.apply:
        print("只读检查完成；加 --apply 才会补传。")
        return
    base, token = load_config(args.config)
    inserted, total = 0, None
    for offset in range(0, len(days), 100):
        batch = days[offset:offset + 100]
        result = request_json(base + "/v1/backfill", {
            "roomId": ROOM_ID, "sourceCheckedAt": int(checked_at * 1000), "days": batch}, token)
        if result.get("ok") is not True or result.get("present") != len(batch):
            raise ValueError("云端未确认整批日期，停止后续补传；可以安全重试")
        inserted += result["inserted"]
        total = result["historyTotal"]
    if total is not None:
        print(f"补传完成：新增 {inserted} 天，云端现有 {total} 天。已有日期原值保留。")
    else:
        print("没有可安全补传的已结束日期。")


if __name__ == "__main__":
    try:
        main()
    except HTTPError as error:
        print(f"请求失败（HTTP {error.code}）。尚未完成；若是 404，请确认数据桥部署完成后重试。", file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        # Never print request objects, config contents, or the ingest credential.
        print(f"补传未完成：{type(error).__name__}。请核对本机服务、数据库及推送配置。", file=sys.stderr)
        sys.exit(1)
