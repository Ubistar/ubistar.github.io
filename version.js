// A visitor preference; switching pages never changes the shared database.
(() => {
  const key = 'liwai-ui-version';
  const legacy = document.documentElement.dataset.ui === 'legacy';
  const url = new URL(location.href);
  const save = value => { try { localStorage.setItem(key, value); } catch {} };
  if (url.searchParams.get('ui') === 'modern') {
    save('modern');
    url.searchParams.delete('ui');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } else if (!legacy) {
    try { if (localStorage.getItem(key) === 'legacy') location.replace('/legacy/'); } catch {}
  }
  if (legacy) save('legacy');
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-ui-switch]');
    if (!link || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    save(link.dataset.uiSwitch);
    if (link.dataset.uiSwitch === 'legacy') {
      try { localStorage.setItem('liwai-theme', 'paper'); } catch {}
    }
  });
})();
