import { W, H, ground, blob, hexToRgb, css } from './kit.js';
import { traceForward, traceBackward } from './silk-kit.js?v=2';

// Shared with silk: the animal palette registry is the silk one.
export const PAL = {
  satin:     { id: 'satin',     body: '#c0c0d0', edge: '#ffffff' },
  velvet:    { id: 'velvet',    body: '#600018', edge: '#ff2040' },
  ethereal:  { id: 'ethereal',  body: '#c080ff', bodyAlt: '#80c0ff', edge: '#80d0ff', edgeAlt: '#ff80c0', hueShift: true },
  shadow:    { id: 'shadow',    body: '#101020', edge: '#404060' },
  gold_leaf: { id: 'gold_leaf', body: '#a07000', edge: '#ffd700' },
  ember:     { id: 'ember',     body: '#ff6000', edge: '#ffcc00', emissive: true },
};
export const PRESETS = [
  { name: 'Wisp',        patch: { creature: 'snake',       palette: 'ethereal',  intensity: 0.42, width: 0.18, bodyLength: 0.36, slither: 0.48 } },
  { name: 'Whisper',     patch: { creature: 'snake',       palette: 'shadow',    intensity: 0.52, width: 0.24, bodyLength: 0.48, slither: 0.16 } },
  { name: 'Serpent',     patch: { creature: 'snake',       palette: 'velvet',    intensity: 0.7,  width: 0.4,  bodyLength: 0.66, slither: 0.34 } },
  { name: 'Ember Drake', patch: { creature: 'dragon',      palette: 'ember',     intensity: 0.68, width: 0.44, bodyLength: 0.56, slither: 0.32 } },
  { name: 'Gilt Wyrm',   patch: { creature: 'dragon',      palette: 'gold_leaf', intensity: 0.72, width: 0.34, bodyLength: 0.75, slither: 0.18 } },
  { name: 'Inchworm',    patch: { creature: 'caterpillar', palette: 'ethereal',  intensity: 0.68, width: 0.52, bodyLength: 0.3,  slither: 0.46 } },
];

const TAU = Math.PI * 2;
// Tile boosts: the renderer's widths are sized for a full stage; the tile is
// seen at 304x114, so bodies get thicker (SCALE) while the fixed body length
// is stretched only enough for the long presets to close the coil.
export const SCALE = 2.8;          // width, head, ornaments, wave amplitude
const LENGTH_SCALE = 1.35;         // body length
const SEGMENTS = 56;               // renderer segmentCount
const WAVENUMBER = 0.045, SLITHER_SPEED = 3.2, WHISKER_NODES = 6, AURA_STRIDE = 8;
const TIME = 2.35;                 // frozen wave clock
// Tile visibility: the renderer scales width and alpha by intensity; at tile
// size a 0.42 wisp would be a thread, so intensity gets a floor of 0.62
// (presets above it are untouched).
const vis = i => Math.max(i, 0.62);
const TONGUE_PHASE = 0.27;         // of the 0.5 s flick: tongue nearly fully out

// The figure the head has drawn, newest first: a lead-in from the upper right
// into a coil the body wraps around, the tail leaving to the left. Short
// creatures make a hook, medium ones a C, the longest close the loop and the
// neck passes over the coil.
export const DEFAULT_KNOTS = (() => {
  const k = [[612, 72], [548, 50], [478, 60], [422, 102]];
  const cx = 456, cy = 170, r = 58;
  for (let a = 150; a <= 150 + 360 + 10; a += 45) {
    const t = a * Math.PI / 180;
    k.push([cx + r * Math.cos(t), cy - r * Math.sin(t)]);
  }
  k.push([330, 172], [250, 206], [178, 190], [128, 130]);
  return k;
})();

function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return css([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t], 1);
}

/** Renderer body half-width profile. u = 0 head → 1 tail. */
function bodyWidth(u, creature) {
  if (creature === 'caterpillar') {
    if (u < 0.08) return 0.62 + (u / 0.08) * 0.38;
    const t = (u - 0.08) / 0.92;
    return Math.max(0, Math.sqrt(1 - t * t * t * t));
  }
  if (u < 0.06) return 0.35 + (u / 0.06) * 0.65;
  const t = (u - 0.06) / 0.94;
  return Math.max(0, 1 - t * t);
}

/** Dense Catmull-Rom polyline through the knots, newest first. */
function densePath(knots) {
  const pts = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const p0 = knots[Math.max(0, i - 1)], p1 = knots[i], p2 = knots[i + 1], p3 = knots[Math.min(knots.length - 1, i + 2)];
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      pts.push({
        x: 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        y: 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      });
    }
  }
  pts.push({ x: knots[knots.length - 1][0], y: knots[knots.length - 1][1] });
  return pts;
}

/** Renderer resample: chain points spaced segLen apart along the newest-first path. */
function resampleAlongPath(path, chain, segLen) {
  const N = chain.length;
  chain[0] = { x: path[0].x, y: path[0].y };
  let seg = 0, walked = 0, target = segLen;
  for (let i = 1; i < N; i++, target += segLen) {
    let placed = false;
    while (seg < path.length - 1) {
      const a = path[seg], b = path[seg + 1];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > 0 && walked + d >= target) { const t = (target - walked) / d; chain[i] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; placed = true; break; }
      walked += d; seg++;
    }
    if (!placed) {
      const last = path[path.length - 1], before = path[path.length - 2] ?? path[0];
      let dx = last.x - before.x, dy = last.y - before.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const over = target - walked; chain[i] = { x: last.x + dx * over, y: last.y + dy * over };
    }
  }
}

/** Renderer whisker lag chains, replayed along the path so they trail the way they would in motion. */
function whiskersAlong(path, headR) {
  const segLenW = headR * 0.55;
  const pair = [[], []];
  for (let w = 0; w < 2; w++) for (let i = 0; i < WHISKER_NODES; i++) pair[w].push({ x: path[path.length - 1].x, y: path[path.length - 1].y });
  for (let k = path.length - 2; k >= 0; k--) {
    const head = path[k], prev = path[k + 1];
    let hx = head.x - prev.x, hy = head.y - prev.y; const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
    const perpX = -hy, perpY = hx;
    for (let w = 0; w < 2; w++) {
      const side = w === 0 ? -1 : 1, whisk = pair[w];
      whisk[0].x = head.x + hx * headR * 1.0 + perpX * side * headR * 0.5;
      whisk[0].y = head.y + hy * headR * 1.0 + perpY * side * headR * 0.5;
      for (let i = 1; i < WHISKER_NODES; i++) {
        const p = whisk[i - 1], c = whisk[i];
        const dx = c.x - p.x, dy = c.y - p.y, d = Math.hypot(dx, dy);
        if (d > 0.0001) { const kk = segLenW / d; c.x = p.x + dx * kk; c.y = p.y + dy * kk; }
        else { c.x = p.x - hx * segLenW; c.y = p.y - hy * segLenW; }
      }
    }
  }
  return pair;
}

function geometry(p, chain, scale) {
  const N = chain.length;
  const build = p.creature === 'caterpillar' ? 1.55 : p.creature === 'dragon' ? 1.15 : 1;
  const baseHalf = (2.5 + p.width * 13) * scale * vis(p.intensity) * build;
  // The coil is staged at renderer scale while widths are boosted, so the
  // wave amplitude takes only half the boost or the tail kinks on the loop.
  const ampPx = p.slither * 20 * (1 + (scale - 1) * 0.5);
  const s = [0];
  for (let i = 1; i < N; i++) s[i] = s[i - 1] + Math.hypot(chain[i].x - chain[i - 1].x, chain[i].y - chain[i - 1].y);
  const cx = [], cy = [];
  for (let i = 0; i < N; i++) {
    const prev = chain[Math.max(0, i - 1)], next = chain[Math.min(N - 1, i + 1)];
    let tx = next.x - prev.x, ty = next.y - prev.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const ramp = Math.pow(i / (N - 1), 1.3);
    const phase = WAVENUMBER * s[i] - SLITHER_SPEED * TIME;
    const wave = (Math.sin(phase) + 0.22 * Math.sin(phase * 2.1 + 0.7)) * ampPx * ramp;
    cx[i] = chain[i].x + -ty * wave; cy[i] = chain[i].y + tx * wave;
  }
  const leftX = [], leftY = [], rightX = [], rightY = [], nx = [], ny = [], hw = [];
  const litX = [], litY = [], shadeX = [], shadeY = [];
  for (let i = 0; i < N; i++) {
    let tx = cx[Math.min(N - 1, i + 1)] - cx[Math.max(0, i - 1)], ty = cy[Math.min(N - 1, i + 1)] - cy[Math.max(0, i - 1)];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const half = baseHalf * bodyWidth(i / (N - 1), p.creature);
    nx[i] = -ty; ny[i] = tx; hw[i] = half;
    leftX[i] = cx[i] + nx[i] * half; leftY[i] = cy[i] + ny[i] * half;
    rightX[i] = cx[i] - nx[i] * half; rightY[i] = cy[i] - ny[i] * half;
    litX[i] = cx[i] + nx[i] * half * 0.42; litY[i] = cy[i] + ny[i] * half * 0.42;
    shadeX[i] = cx[i] - nx[i] * half * 0.5; shadeY[i] = cy[i] - ny[i] * half * 0.5;
  }
  return { N, baseHalf, cx, cy, nx, ny, hw, leftX, leftY, rightX, rightY, litX, litY, shadeX, shadeY };
}

/** First self-crossing of the centreline: segment indices (i, j) and the point. */
function findCrossing(cx, cy) {
  const N = cx.length;
  for (let i = 0; i < N - 1; i++) {
    for (let j = i + 4; j < N - 1; j++) {
      const ax = cx[i], ay = cy[i], bx = cx[i + 1], by = cy[i + 1], cxx = cx[j], cyy = cy[j], dx = cx[j + 1], dy = cy[j + 1];
      const den = (bx - ax) * (dy - cyy) - (by - ay) * (dx - cxx);
      if (Math.abs(den) < 1e-6) continue;
      const t = ((cxx - ax) * (dy - cyy) - (cyy - ay) * (dx - cxx)) / den;
      const u = ((cxx - ax) * (by - ay) - (cyy - ay) * (bx - ax)) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { i, j, x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
    }
  }
  return null;
}

/** Body layers (ornaments under the fill, shadow, fill, cylinder shading, chevrons, sheen) over chain range [a, b]. */
function drawBody(ctx, p, pal, g, a, b, scale) {
  const { N, baseHalf, cx, cy, nx, ny, hw, leftX, leftY, rightX, rightY, litX, litY, shadeX, shadeY } = g;
  const I = vis(p.intensity);
  const outline = () => { ctx.beginPath(); traceForward(ctx, leftX, leftY, a, b, N); traceBackward(ctx, rightX, rightY, a, b, N); ctx.closePath(); };

  if (p.creature === 'caterpillar') drawLegs(ctx, p, pal, g, a, b);
  if (p.creature === 'dragon') drawCrest(ctx, p, pal, g, a, b);

  if (pal.emissive) {
    ctx.globalAlpha = 0.1 * I;
    for (let i = a; i <= b; i += AURA_STRIDE) {
      const r = hw[i] * 2.2 + 1.5 * scale;
      const grad = ctx.createRadialGradient(cx[i], cy[i], 0, cx[i], cy[i], r);
      grad.addColorStop(0, pal.edge); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(cx[i], cy[i], r, 0, TAU); ctx.fillStyle = grad; ctx.fill();
    }
  } else {
    ctx.save(); ctx.translate(2.5 * scale, 3.5 * scale); ctx.globalAlpha = 0.22 * I; ctx.fillStyle = '#000';
    outline(); ctx.fill(); ctx.restore();
  }
  ctx.globalAlpha = 0.94 * I;
  if (pal.hueShift && pal.bodyAlt) {
    const grad = ctx.createLinearGradient(cx[0], cy[0], cx[N - 1], cy[N - 1]);
    grad.addColorStop(0, pal.body); grad.addColorStop(1, pal.bodyAlt); ctx.fillStyle = grad;
  } else ctx.fillStyle = pal.body;
  outline(); ctx.fill();

  ctx.save(); outline(); ctx.clip();
  ctx.globalAlpha = 0.34 * I; ctx.strokeStyle = mixHex(pal.body, '#000000', 0.62); ctx.lineWidth = baseHalf * 1.1;
  ctx.beginPath(); traceForward(ctx, shadeX, shadeY, a, b, N); ctx.stroke();
  ctx.globalAlpha = 0.22 * I; ctx.strokeStyle = mixHex(pal.body, '#ffffff', 0.55); ctx.lineWidth = baseHalf * 0.7;
  ctx.beginPath(); traceForward(ctx, litX, litY, a, b, N); ctx.stroke();
  if (p.creature !== 'caterpillar') {
    ctx.globalAlpha = 0.14 * I; ctx.strokeStyle = mixHex(pal.edge, '#ffffff', 0.2); ctx.lineWidth = Math.max(0.6, baseHalf * 0.16);
    for (let i = Math.max(2, a); i < Math.min(N - 2, b + 1); i += 2) {
      const h = hw[i]; if (h < 1) continue;
      ctx.beginPath();
      ctx.moveTo(cx[i] + nx[i] * h * 0.9, cy[i] + ny[i] * h * 0.9);
      ctx.quadraticCurveTo(cx[i - 1], cy[i - 1], cx[i] - nx[i] * h * 0.9, cy[i] - ny[i] * h * 0.9);
      ctx.stroke();
    }
  }
  ctx.restore();

  const sheen = ctx.createLinearGradient(cx[0], cy[0], cx[N - 1], cy[N - 1]);
  const sheenColor = mixHex(pal.edge, '#ffffff', 0.35);
  sheen.addColorStop(0, sheenColor); sheen.addColorStop(0.7, sheenColor); sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = 0.4 * I; ctx.strokeStyle = sheen; ctx.lineWidth = Math.max(0.8, baseHalf * 0.2);
  ctx.beginPath(); traceForward(ctx, leftX, leftY, a, b, N); ctx.stroke();

  if (p.creature === 'caterpillar') drawBands(ctx, p, pal, g, a, b);
}

function drawCreature(ctx, p, chain, path, scale) {
  const pal = PAL[p.palette];
  const g = geometry(p, chain, scale);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  drawBody(ctx, p, pal, g, 0, g.N - 1, scale);

  // Where the neck passes over the coil, redraw that patch in depth order:
  // the coil first, then the neck on top. Clipping to a disc around the
  // crossing keeps every edge outside it identical to the single pass.
  const x = findCrossing(g.cx, g.cy);
  if (x) {
    const mid = Math.round((x.i + x.j) / 2);
    const R = Math.max(g.hw[x.i], g.hw[x.j]) * 3.2 + 6 * scale;
    ctx.save();
    ctx.beginPath(); ctx.arc(x.x, x.y, R, 0, TAU); ctx.clip();
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; ctx.fillStyle = '#000';
    ctx.fillRect(x.x - R - 1, x.y - R - 1, R * 2 + 2, R * 2 + 2);
    ctx.globalCompositeOperation = 'source-over';
    drawBody(ctx, p, pal, g, mid, g.N - 1, scale);
    drawBody(ctx, p, pal, g, 0, mid, scale);
    ctx.restore();
  }

  if (p.creature === 'dragon') drawWhiskers(ctx, p, pal, chain, path, g.baseHalf, scale);
  drawHead(ctx, p, pal, g, scale);
  ctx.globalAlpha = 1;
}

function drawCrest(ctx, p, pal, { N, cx, cy, nx, ny, hw }, a, b) {
  ctx.globalAlpha = 0.9 * vis(p.intensity); ctx.fillStyle = pal.edge;
  const stride = Math.max(2, Math.round(N / 14));
  for (let i = stride; i < N - 2; i += stride) {
    if (i < a || i > b) continue;
    const h = hw[i]; if (h < 1) continue;
    const spikeH = h * 1.3;
    ctx.beginPath();
    ctx.moveTo(cx[i - 1] + nx[i - 1] * hw[i - 1], cy[i - 1] + ny[i - 1] * hw[i - 1]);
    ctx.lineTo(cx[i] + nx[i] * (h + spikeH), cy[i] + ny[i] * (h + spikeH));
    ctx.lineTo(cx[i + 1] + nx[i + 1] * hw[i + 1], cy[i + 1] + ny[i + 1] * hw[i + 1]);
    ctx.closePath(); ctx.fill();
  }
}

function drawLegs(ctx, p, pal, { N, cx, cy, nx, ny, hw }, a, b) {
  ctx.globalAlpha = 0.85 * vis(p.intensity); ctx.strokeStyle = pal.edge; ctx.lineCap = 'round';
  const stride = Math.max(2, Math.round(N / 11));
  for (let i = stride; i < N - 2; i += stride) {
    if (i < a || i > b) continue;
    const h = hw[i]; if (h < 1.5) continue;
    const legLen = h * 0.9, swing = Math.sin(TIME * 6 + i * 0.9) * 0.35;
    ctx.lineWidth = Math.max(1, h * 0.22);
    const tx = cx[Math.min(N - 1, i + 1)] - cx[Math.max(0, i - 1)], ty = cy[Math.min(N - 1, i + 1)] - cy[Math.max(0, i - 1)], tl = Math.hypot(tx, ty) || 1;
    for (const side of [-1, 1]) {
      const bx = cx[i] + nx[i] * side * h, by = cy[i] + ny[i] * side * h;
      ctx.beginPath(); ctx.moveTo(bx, by);
      ctx.lineTo(bx + nx[i] * side * legLen + (tx / tl) * legLen * swing, by + ny[i] * side * legLen + (ty / tl) * legLen * swing);
      ctx.stroke();
    }
  }
}

function drawBands(ctx, p, pal, { N, cx, cy, nx, ny, hw }, a, b) {
  ctx.globalAlpha = 0.28 * vis(p.intensity); ctx.strokeStyle = pal.edge; ctx.lineCap = 'round';
  const stride = Math.max(2, Math.round(N / 11));
  for (let i = stride; i < N - 2; i += stride) {
    if (i < a || i > b) continue;
    const h = hw[i]; if (h < 1) continue;
    ctx.lineWidth = Math.max(1, h * 0.4);
    ctx.beginPath(); ctx.moveTo(cx[i] + nx[i] * h, cy[i] + ny[i] * h); ctx.lineTo(cx[i] - nx[i] * h, cy[i] - ny[i] * h); ctx.stroke();
  }
}

function drawWhiskers(ctx, p, pal, chain, path, baseHalf, scale) {
  const headR = baseHalf * 1.5 + 2 * scale;
  const pair = whiskersAlong(path, headR);
  ctx.globalAlpha = 0.85 * vis(p.intensity); ctx.strokeStyle = pal.edge; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, headR * 0.16);
  for (const whisk of pair) {
    ctx.beginPath(); ctx.moveTo(whisk[0].x, whisk[0].y);
    for (let i = 1; i < WHISKER_NODES; i++) ctx.lineTo(whisk[i].x, whisk[i].y);
    ctx.stroke();
  }
}

function drawHead(ctx, p, pal, { cx, cy, baseHalf }, scale) {
  const I = vis(p.intensity);
  let hx = cx[0] - cx[1], hy = cy[0] - cy[1]; const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
  const perpX = -hy, perpY = hx;
  const headR = baseHalf * 1.15 + 1.2 * scale;
  const headCx = cx[0] + hx * headR * 0.25, headCy = cy[0] + hy * headR * 0.25;

  if (p.creature === 'dragon') {
    ctx.globalAlpha = 0.95 * I; ctx.strokeStyle = pal.edge; ctx.lineCap = 'round'; ctx.lineWidth = headR * 0.5;
    for (const side of [-1, 1]) {
      const bx = headCx - hx * headR * 0.3 + perpX * side * headR * 0.55, by = headCy - hy * headR * 0.3 + perpY * side * headR * 0.55;
      const mx = bx - hx * headR * 0.7 + perpX * side * headR * 0.2, my = by - hy * headR * 0.7 + perpY * side * headR * 0.2;
      const ex = bx - hx * headR * 1.5 + perpX * side * headR * 0.7, ey = by - hy * headR * 1.5 + perpY * side * headR * 0.7;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
    }
  }
  if (p.creature === 'caterpillar') {
    ctx.globalAlpha = 0.9 * I; ctx.strokeStyle = pal.edge; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, headR * 0.18);
    for (const side of [-1, 1]) {
      const bx = headCx + hx * headR * 0.4 + perpX * side * headR * 0.35, by = headCy + hy * headR * 0.4 + perpY * side * headR * 0.35;
      const ex = bx + hx * headR * 1.1 + perpX * side * headR * 0.6, ey = by + hy * headR * 1.1 + perpY * side * headR * 0.6;
      const cxp = bx + hx * headR * 0.6 + perpX * side * headR * 0.9, cyp = by + hy * headR * 0.6 + perpY * side * headR * 0.9;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cxp, cyp, ex, ey); ctx.stroke();
      ctx.fillStyle = pal.edge; ctx.beginPath(); ctx.arc(ex, ey, Math.max(1.2, headR * 0.16), 0, TAU); ctx.fill();
    }
  }
  const heading = Math.atan2(hy, hx);
  ctx.globalAlpha = 0.96 * I;
  ctx.save(); ctx.translate(headCx, headCy); ctx.rotate(heading);
  ctx.fillStyle = pal.body; ctx.beginPath(); ctx.ellipse(0, 0, headR * 1.45, headR * 0.92, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.3 * I; ctx.fillStyle = mixHex(pal.body, '#000000', 0.6);
  ctx.beginPath(); ctx.ellipse(-headR * 0.05, headR * 0.36, headR * 1.15, headR * 0.5, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.26 * I; ctx.fillStyle = mixHex(pal.edge, '#ffffff', 0.4);
  ctx.beginPath(); ctx.ellipse(headR * 0.18, -headR * 0.34, headR * 0.75, headR * 0.28, 0, 0, TAU); ctx.fill();
  ctx.restore();

  ctx.globalAlpha = 1;
  const eyeFwd = headR * 0.5, eyePerp = headR * 0.46, eyeR = headR * (p.creature === 'caterpillar' ? 0.24 : 0.2);
  const irisColor = p.creature === 'dragon' ? mixHex(pal.edge, '#ffd27f', 0.5) : mixHex(pal.edge, '#ffffff', 0.25);
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(headCx + hx * eyeFwd + perpX * side * eyePerp, headCy + hy * eyeFwd + perpY * side * eyePerp); ctx.rotate(heading);
    ctx.fillStyle = mixHex(pal.body, '#000000', 0.75); ctx.beginPath(); ctx.ellipse(0, 0, eyeR * 1.5, eyeR * 1.0, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = irisColor; ctx.beginPath(); ctx.ellipse(eyeR * 0.12, 0, eyeR * 1.0, eyeR * 0.66, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0a0a0f'; ctx.beginPath();
    if (p.creature === 'caterpillar') ctx.ellipse(eyeR * 0.15, 0, eyeR * 0.38, eyeR * 0.38, 0, 0, TAU);
    else ctx.ellipse(eyeR * 0.15, 0, eyeR * 0.16, eyeR * 0.58, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(eyeR * 0.55, -eyeR * 0.3, Math.max(0.5, eyeR * 0.18), 0, TAU); ctx.fill();
    ctx.restore();
  }
  if (p.creature === 'snake') {
    const ext = Math.sin((TONGUE_PHASE / 0.5) * Math.PI) * headR * 2.0;
    const rootX = headCx + hx * headR * 1.15, rootY = headCy + hy * headR * 1.15;
    const forkX = rootX + hx * ext * 0.65, forkY = rootY + hy * ext * 0.65;
    const tipX = rootX + hx * ext, tipY = rootY + hy * ext, spread = headR * 0.4;
    ctx.globalAlpha = 0.95 * I; ctx.strokeStyle = '#e0306a'; ctx.lineWidth = Math.max(1.2, headR * 0.18); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(rootX, rootY); ctx.lineTo(forkX, forkY);
    ctx.moveTo(forkX, forkY); ctx.lineTo(tipX + perpX * spread, tipY + perpY * spread);
    ctx.moveTo(forkX, forkY); ctx.lineTo(tipX - perpX * spread, tipY - perpY * spread);
    ctx.stroke();
  }
}

/** Stage the creature: body resampled along the figure, then centered in the frame. */
function stage(p, knots) {
  const path = densePath(knots);
  const bodyLen = (160 + p.bodyLength * 440) * LENGTH_SCALE;
  const chain = new Array(SEGMENTS);
  resampleAlongPath(path, chain, bodyLen / (SEGMENTS - 1));
  let acc = 0, cut = path.length;
  for (let i = 1; i < path.length; i++) { acc += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y); if (acc > bodyLen) { cut = i + 1; break; } }
  path.length = Math.min(path.length, cut);
  const g = geometry(p, chain, SCALE);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < g.N; i++) {
    minX = Math.min(minX, g.leftX[i], g.rightX[i]); maxX = Math.max(maxX, g.leftX[i], g.rightX[i]);
    minY = Math.min(minY, g.leftY[i], g.rightY[i]); maxY = Math.max(maxY, g.leftY[i], g.rightY[i]);
  }
  const dx = W / 2 - (minX + maxX) / 2, dy = H / 2 - (minY + maxY) / 2;
  // Fit: zoom the whole figure (widths included) so a short hook does not
  // sit as a small mark in a wide frame; capped so creatures still differ.
  const zoom = Math.min(1.45, (H * 0.8) / (maxY - minY), (W * 0.9) / (maxX - minX));
  const fit = q => { q.x = W / 2 + (q.x + dx - W / 2) * zoom; q.y = H / 2 + (q.y + dy - H / 2) * zoom; };
  for (const c of chain) fit(c);
  for (const q of path) fit(q);
  return { chain, path, zoom };
}

export function draw(ctx, p, rand, knots = DEFAULT_KNOTS) {
  const pal = PAL[p.palette];
  const body = hexToRgb(pal.body), edge = hexToRgb(pal.edge);
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const dark = !pal.emissive && lum(body) < 0.08;
  ground(ctx, dark ? [0.3, 0.29, 0.34] : [0.03, 0.03, 0.045]);
  if (dark) blob(ctx, 380, 120, 400, 220, [0.68, 0.66, 0.74], 0.8);
  else blob(ctx, 360, 140, 360, 200, edge, pal.emissive ? 0.14 : 0.06 + 0.04 * p.intensity);

  const { chain, path, zoom } = stage(p, knots);
  const layer = document.createElement('canvas'); layer.width = W; layer.height = H;
  const lctx = layer.getContext('2d');
  drawCreature(lctx, p, chain, path, SCALE * zoom);
  ctx.globalCompositeOperation = pal.emissive ? 'lighter' : 'source-over';
  ctx.drawImage(layer, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
