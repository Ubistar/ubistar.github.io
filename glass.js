/* Optical layers are separate from labels: only the backdrop is refracted. */
(() => {
  'use strict';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const reducedTransparency = matchMedia('(prefers-reduced-transparency: reduce)');
  const nav = document.querySelector('.segmented');
  const lens = nav?.querySelector('.nav-lens');
  const links = nav ? [...nav.querySelectorAll('[data-view]')] : [];
  function moveLens() {
    const active = links.find(link => link.getAttribute('aria-current') === 'page');
    if (!active || !lens) return;
    lens.style.width = `${active.offsetWidth}px`;
    lens.style.transform = `translateX(${active.offsetLeft - parseFloat(getComputedStyle(lens).left)}px)`;
  }
  const navObserver = nav ? new ResizeObserver(moveLens) : null;
  navObserver?.observe(nav);
  window.addEventListener('hashchange', () => requestAnimationFrame(moveLens));
  moveLens();

  // Chromium implements SVG URL backdrop filters; other engines retain CSS blur and the same glass edges.
  const refract = /Chrome|Chromium|Edg\//.test(navigator.userAgent) && CSS.supports('backdrop-filter', 'url("#glass")');
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.cssText = 'position:fixed;pointer-events:none;overflow:hidden;';
  const defs = document.createElementNS(namespace, 'defs'); svg.append(defs); document.body.append(svg);
  let counter = 0;
  const entries = [];

  function makeMap(width, height, radius, edge) {
    // A rounded-rectangle normal field bends the sampled backdrop toward the curved perimeter.
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); const field = context.createImageData(width, height);
    const halfX = width / 2, halfY = height / 2;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const px = x - halfX, py = y - halfY;
        const qx = Math.abs(px) - halfX + radius, qy = Math.abs(py) - halfY + radius;
        const ox = Math.max(qx, 0), oy = Math.max(qy, 0), length = Math.hypot(ox, oy);
        const distance = length + Math.min(Math.max(qx, qy), 0) - radius;
        let nx = 0, ny = 0;
        if (length > .001) { nx = ox / length * Math.sign(px); ny = oy / length * Math.sign(py); }
        else if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py);
        const t = Math.max(0, Math.min(1, -distance / edge));
        const curve = distance <= 0 ? Math.pow(1 - t, 2) * .46 : 0;
        const index = (y * width + x) * 4;
        field.data[index] = Math.round(128 + nx * curve * 255);
        field.data[index + 1] = Math.round(128 + ny * curve * 255);
        field.data[index + 2] = 128; field.data[index + 3] = 255;
      }
    }
    context.putImageData(field, 0, 0); return canvas.toDataURL();
  }
  function configure(entry) {
    const {element, layer, filter, map, displacement} = entry;
    if (!filter || reducedTransparency.matches) { layer.style.backdropFilter = ''; return; }
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    // Maps are created on size changes, never during pointer movement or every animation frame.
    const width = Math.ceil(bounds.width), height = Math.ceil(bounds.height);
    const radius = Math.min(parseFloat(getComputedStyle(element).borderRadius) || 28, height / 2, width / 2);
    if (entry.width === width && entry.height === height) return;
    entry.width = width; entry.height = height;
    filter.setAttribute('width', String(width)); filter.setAttribute('height', String(height));
    map.setAttribute('width', String(width)); map.setAttribute('height', String(height));
    map.setAttribute('href', makeMap(width, height, radius, Math.min(18, height * .27)));
    displacement.setAttribute('scale', String(Math.min(30, height * .45)));
    layer.style.backdropFilter = `url("#${filter.id}") saturate(1.25)`;
  }
  for (const element of document.querySelectorAll('.glass')) {
    if (element.tagName === 'DIALOG' || element.id === 'connection') continue;
    const layer = document.createElement('span'); layer.className = 'glass-optics'; layer.setAttribute('aria-hidden', 'true');
    element.prepend(layer);
    const entry = {element, layer};
    if (refract) {
      const filter = document.createElementNS(namespace, 'filter'); filter.id = `liquid-lens-${++counter}`;
      filter.setAttribute('filterUnits', 'userSpaceOnUse'); filter.setAttribute('primitiveUnits', 'userSpaceOnUse');
      filter.setAttribute('x', '0'); filter.setAttribute('y', '0'); filter.setAttribute('color-interpolation-filters', 'sRGB');
      const blur = document.createElementNS(namespace, 'feGaussianBlur'); blur.setAttribute('in', 'SourceGraphic'); blur.setAttribute('stdDeviation', element === nav ? '1.8' : '1'); blur.setAttribute('result', 'soft-backdrop');
      const map = document.createElementNS(namespace, 'feImage'); map.setAttribute('result', 'normal-field'); map.setAttribute('preserveAspectRatio', 'none');
      const displacement = document.createElementNS(namespace, 'feDisplacementMap');
      displacement.setAttribute('in', 'soft-backdrop'); displacement.setAttribute('in2', 'normal-field');
      displacement.setAttribute('xChannelSelector', 'R'); displacement.setAttribute('yChannelSelector', 'G');
      filter.append(blur, map, displacement); defs.append(filter); Object.assign(entry, {filter,map,displacement});
    }
    entries.push(entry);
    const observer = new ResizeObserver(() => configure(entry)); observer.observe(element);
    element.addEventListener('pointermove', event => {
      if (reducedMotion.matches || event.pointerType === 'touch') return;
      const rect = element.getBoundingClientRect();
      element.style.setProperty('--light-x', `${(event.clientX - rect.left) / rect.width * 100}%`);
      element.style.setProperty('--light-y', `${(event.clientY - rect.top) / rect.height * 100}%`);
    }, {passive:true});
    element.addEventListener('pointerleave', () => {element.style.removeProperty('--light-x'); element.style.removeProperty('--light-y');});
    configure(entry);
  }
  reducedTransparency.addEventListener('change', () => entries.forEach(entry => {entry.width = 0; configure(entry);}));
})();
