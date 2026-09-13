// Keep the July bulletin UI while reading the repaired permanent day archive.
// Overview polling must never replace the complete archive with its seven days.
(() => {
  const base = 'https://api.flyou.cc/v1', key = 'liwai-bulletin-archive-v1';
  const days = new Map();
  let fullReadAt = 0;
  const valid = row => row && /^\d{4}-\d{2}-\d{2}$/.test(row.date);
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    for (const row of saved?.items || []) if (valid(row)) days.set(row.date, row);
    fullReadAt = Number(saved?.fullReadAt) || 0;
  } catch {}
  async function get(path) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${base}/${path}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw Error(`数据接口返回 HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  window.LiwaiHistory = {
    async load() {
      const overview = await get('overview');
      const recent = (overview.history || []).filter(valid);
      let error = '';
      // Only fetch the archive when incomplete or after thirty minutes.
      const known = new Set([...days.keys(), ...recent.map(row => row.date)]);
      if (known.size < Number(overview.historyTotal) || !fullReadAt || Date.now() - fullReadAt > 1800000) {
        try {
          let page = 1, pages = 1;
          do {
            const result = await get(`history?page=${page}&limit=50`);
            if (!Array.isArray(result.items) || !Number.isInteger(result.pages) || result.pages < 0) throw Error('历史归档响应不完整');
            for (const row of result.items) if (valid(row)) days.set(row.date, row);
            pages = result.pages;
            page++;
          } while (page <= pages);
          fullReadAt = Date.now();
        } catch (e) { error = e.message || '历史归档读取失败'; }
      }
      // The latest overview wins for recent days if a paged cache was older.
      for (const row of recent) days.set(row.date, row);
      const rows = [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
      try { localStorage.setItem(key, JSON.stringify({ items: rows, fullReadAt })); } catch {}
      return { ...overview, history: rows.map(row => ({ ...row, isToday: row.date === overview.today.date })),
        historyError: error, historyIncomplete: rows.length < Number(overview.historyTotal) };
    }
  };
})();
