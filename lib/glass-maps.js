// Adapted from xiaojiaenen/liquid-glass (MIT). See THIRD_PARTY_NOTICES.md.
const SurfaceEquations = {
  convex_squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 1 / 4),
  flat: (x) => x,
  concave: (x) => 1 - Math.pow(1 - Math.pow(1 - x, 4), 1 / 4),
  pill: (x) => Math.sin(x * Math.PI / 2)
};
function calculateDisplacementMap1D(gt, bw, sf, ri, s = 128) {
  const e = 1 / ri;
  const r = [];
  for (let i = 0; i < s; i++) {
    const x = i / s;
    const y = sf(x);
    const dx = x < 1 ? 1e-4 : -1e-4;
    const d = (sf(Math.max(0, Math.min(1, x + dx))) - y) / dx;
    const m = Math.sqrt(d * d + 1);
    const n = [-d / m, -1 / m];
    const dt = n[1];
    const k = 1 - e * e * (1 - dt * dt);
    if (k < 0) {
      r.push(0);
    } else {
      const rf = [
        -(e * dt + Math.sqrt(k)) * n[0],
        e - (e * dt + Math.sqrt(k)) * n[1]
      ];
      r.push(rf[0] * ((y * bw + gt) / rf[1]));
    }
  }
  return r;
}
function calculateDisplacementMap2D(cw, ch, ow, oh, rad, bw, md, pMap) {
  const img = new ImageData(cw, ch);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 128;
    img.data[i + 1] = 128;
    img.data[i + 3] = 255;
  }
  const rSq = rad * rad;
  const rp1Sq = (rad + 1) ** 2;
  const rmBwSq = Math.max(0, rad - bw) ** 2;
  const wB = ow - rad * 2;
  const hB = oh - rad * 2;
  const oX = (cw - ow) / 2;
  const oY = (ch - oh) / 2;
  for (let y1 = 0; y1 < oh; y1++) {
    for (let x1 = 0; x1 < ow; x1++) {
      const idx = ((oY + y1) * cw + oX + x1) * 4;
      const x = x1 < rad ? x1 - rad : x1 >= ow - rad ? x1 - rad - wB : 0;
      const y = y1 < rad ? y1 - rad : y1 >= oh - rad ? y1 - rad - hB : 0;
      const dSq = x * x + y * y;
      if (dSq <= rp1Sq && dSq >= rmBwSq) {
        const dist = Math.sqrt(dSq);
        const op = dSq < rSq ? 1 : 1 - (dist - rad) / (Math.sqrt(rp1Sq) - rad);
        const bIdx = Math.floor(
          Math.max(0, Math.min(1, (rad - dist) / bw)) * pMap.length
        );
        const dVal = pMap[Math.max(0, Math.min(bIdx, pMap.length - 1))] || 0;
        const dX = md > 0 ? -(dist > 0 ? x / dist : 0) * dVal / md : 0;
        const dY = md > 0 ? -(dist > 0 ? y / dist : 0) * dVal / md : 0;
        img.data[idx] = Math.max(0, Math.min(255, 128 + dX * 127 * op));
        img.data[idx + 1] = Math.max(0, Math.min(255, 128 + dY * 127 * op));
      }
    }
  }
  return img;
}
function calculateSpecularHighlight(ow, oh, rad, _bw, angleDeg, rimWidth) {
  const img = new ImageData(ow, oh);
  const a = angleDeg * Math.PI / 180;
  const sVec = [Math.cos(a), Math.sin(a)];
  const rSq = rad * rad;
  const rp1Sq = (rad + 1) ** 2;
  const rmSSq = Math.max(0, (rad - rimWidth) ** 2);
  for (let y1 = 0; y1 < oh; y1++) {
    for (let x1 = 0; x1 < ow; x1++) {
      const x = x1 < rad ? x1 - rad : x1 >= ow - rad ? x1 - rad - (ow - rad * 2) : 0;
      const y = y1 < rad ? y1 - rad : y1 >= oh - rad ? y1 - rad - (oh - rad * 2) : 0;
      const dSq = x * x + y * y;
      if (dSq <= rp1Sq && dSq >= rmSSq) {
        const dist = Math.sqrt(dSq);
        const op = dSq < rSq ? 1 : 1 - (dist - rad) / (Math.sqrt(rp1Sq) - rad);
        const dp = Math.abs(
          (dist > 0 ? x / dist : 0) * sVec[0] + (dist > 0 ? -y / dist : 0) * sVec[1]
        );
        const cf = dp * Math.sqrt(1 - (1 - Math.max(0, Math.min(1, (rad - dist) / rimWidth))) ** 2);
        const c = Math.min(255, 255 * cf);
        const idx = (y1 * ow + x1) * 4;
        img.data[idx] = img.data[idx + 1] = img.data[idx + 2] = c;
        img.data[idx + 3] = Math.min(255, c * cf * op);
      }
    }
  }
  return img;
}
function imageDataToDataURL(img) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").putImageData(img, 0, 0);
  return c.toDataURL();
}
function generateLiquidGlassMaps(opts) {
  const {
    width,
    height,
    radius,
    bezelWidth = 30,
    glassThickness = 150,
    refractiveIndex = 1.5,
    specularAngleDeg = 60,
    specularRimWidth = 1.5,
    profile = "convex_squircle"
  } = opts;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const rad = Math.min(radius, Math.min(w, h) / 2);
  const surfaceFn = SurfaceEquations[profile];
  const pMap = calculateDisplacementMap1D(
    glassThickness,
    bezelWidth,
    surfaceFn,
    refractiveIndex
  );
  const maxDisplacement = Math.max(...pMap.map(Math.abs)) || 1;
  const dispImg = calculateDisplacementMap2D(
    w,
    h,
    w,
    h,
    rad,
    bezelWidth,
    maxDisplacement,
    pMap
  );
  const specImg = calculateSpecularHighlight(
    w,
    h,
    rad,
    bezelWidth,
    specularAngleDeg,
    specularRimWidth
  );
  return {
    displacementUrl: imageDataToDataURL(dispImg),
    specularUrl: imageDataToDataURL(specImg),
    maxDisplacement,
    width: w,
    height: h
  };
}
export {
  generateLiquidGlassMaps
};
