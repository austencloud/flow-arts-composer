import { W, H, lcg, ground, blob, hexToRgb, css } from './kit.js';
import { resolveSilk2DWidthEnvelope, smoothSilk2DPath, resolveSilk2DMaterialColors, resolveSilk2DMaximumLength, resolveSilk2DSampleSpacing, traceCentripetalForward, traceCentripetalBackward } from './silk-kit.js';

const PAL = {
  satin:     { id: 'satin',     body: '#c0c0d0', edge: '#ffffff' },
  velvet:    { id: 'velvet',    body: '#600018', edge: '#ff2040' },
  ethereal:  { id: 'ethereal',  body: '#c080ff', bodyAlt: '#80c0ff', edge: '#80d0ff', edgeAlt: '#ff80c0', hueShift: true },
  shadow:    { id: 'shadow',    body: '#101020', edge: '#404060' },
  gold_leaf: { id: 'gold_leaf', body: '#a07000', edge: '#ffd700' },
  ember:     { id: 'ember',     body: '#ff6000', edge: '#ffcc00', emissive: true },
};
const PROFILES = {
  satin:     { bodyAlpha: 0.9,  glowAlpha: 0.02,  edgeAlpha: 0.14, foldStrength: 0.24, sheenAlpha: 0.21, sheenWidth: 1.35 },
  velvet:    { bodyAlpha: 0.94, glowAlpha: 0.018, edgeAlpha: 0.22, foldStrength: 0.3,  sheenAlpha: 0.08, sheenWidth: 0.9 },
  ethereal:  { bodyAlpha: 0.62, glowAlpha: 0.12,  edgeAlpha: 0.38, foldStrength: 0.22, sheenAlpha: 0.18, sheenWidth: 0.68 },
  shadow:    { bodyAlpha: 0.72, glowAlpha: 0.01,  edgeAlpha: 0.24, foldStrength: 0.34, sheenAlpha: 0.05, sheenWidth: 0.82 },
  gold_leaf: { bodyAlpha: 0.96, glowAlpha: 0.03,  edgeAlpha: 0.34, foldStrength: 0.32, sheenAlpha: 0.3,  sheenWidth: 0.64 },
  ember:     { bodyAlpha: 0.8,  glowAlpha: 0.18,  edgeAlpha: 0.38, foldStrength: 0.24, sheenAlpha: 0.22, sheenWidth: 0.7 },
};
export const PRESETS = [
  { name: 'Classic',  patch: { palette: 'satin',     intensity: 0.5,  width: 0.5, duration: 0.5, flutter: 0.3, tautness: 0.5 } },
  { name: 'Streamer', patch: { palette: 'ethereal',  intensity: 0.55, width: 0.7, duration: 0.8, flutter: 0.7, tautness: 0.3 } },
  { name: 'Whip',     patch: { palette: 'shadow',    intensity: 0.6,  width: 0.4, duration: 0.3, flutter: 0.1, tautness: 0.9 } },
  { name: 'Royal',    patch: { palette: 'gold_leaf', intensity: 0.6,  width: 0.7, duration: 0.6, flutter: 0.2, tautness: 0.4 } },
  { name: 'Inferno',  patch: { palette: 'ember',     intensity: 0.65, width: 0.5, duration: 0.5, flutter: 0.4, tautness: 0.7 } },
  { name: 'Phantom',  patch: { palette: 'shadow',    intensity: 0.3,  width: 0.6, duration: 0.9, flutter: 0.5, tautness: 0.2 } },
];

const TAU = Math.PI * 2;
const SCALE = 2;
const PROP_COLOR = '#2e3192';     // the hand's prop color; satin is 82% this
const TIME = 3.7;                 // frozen wave clock
const AURA_STRIDE = 8;
const clamp01 = v => Math.max(0, Math.min(1, v));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function smoothstep(e0, e1, v) { const t = clamp01((v - e0) / (e1 - e0)); return t * t * (3 - 2 * t); }
function signedTurn(x, y, i) { if (i <= 0 || i >= x.length - 1) return 0; let ax = x[i] - x[i - 1], ay = y[i] - y[i - 1], bx = x[i + 1] - x[i], by = y[i + 1] - y[i]; const al = Math.hypot(ax, ay), bl = Math.hypot(bx, by); if (al < 0.001 || bl < 0.001) return 0; ax /= al; ay /= al; bx /= bl; by /= bl; return ax * by - ay * bx; }
function mixHex(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return css([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t], 1); }

// The sweep: free tail lower-left, prop (head) upper-right.
export const DEFAULT_KNOTS = [[380, 150], [430, 110], [400, 60], [320, 60], [270, 120], [290, 200], [380, 240], [500, 225], [600, 160], [660, 80], [690, 40]];
function catmull(i, t, KNOTS) {
  const p0 = KNOTS[Math.max(0, i - 1)], p1 = KNOTS[i], p2 = KNOTS[Math.min(KNOTS.length - 1, i + 1)], p3 = KNOTS[Math.min(KNOTS.length - 1, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) };
}

/** Record the sweep as the renderer would: one sample every spacing, then keep only the length duration allows. */
function recordTrail(p, KNOTS = DEFAULT_KNOTS, fullLength = false) {
  const fine = [];
  for (let i = 0; i < KNOTS.length - 1; i++) for (let k = 0; k < 60; k++) fine.push(catmull(i, k / 60, KNOTS));
  fine.push(catmull(KNOTS.length - 2, 1, KNOTS));
  const spacing = resolveSilk2DSampleSpacing(SCALE);
  const samples = []; let acc = 0, dist = 0;
  for (let i = 1; i < fine.length; i++) {
    const d = Math.hypot(fine[i].x - fine[i - 1].x, fine[i].y - fine[i - 1].y); acc += d;
    if (acc >= spacing || samples.length === 0) { acc = 0; dist += spacing; samples.push({ x: fine[i].x, y: fine[i].y, pathDistance: dist, speed: 0 }); }
  }
  // Tip speed as recorded (world units/s over 60·scale): slow leaving the tail, fast at the head.
  samples.forEach((s, i) => { s.speed = 3.0 * (0.15 + 0.85 * Math.pow(i / (samples.length - 1), 1.4)); });
  // Duration sets how much of the gesture the tail reaches: 60% at the shortest, all of it at the longest.
  const total = samples[samples.length - 1].pathDistance - samples[0].pathDistance;
  const maxLen = fullLength ? Infinity : total * (0.6 + 0.4 * p.duration);
  while (samples.length > 2 && samples[samples.length - 1].pathDistance - samples[0].pathDistance > maxLen) samples.shift();
  return fullLength ? samples : samples.slice(-96);
}

function drawRibbon(ctx, p, samples, phase) {
  const palette = PAL[p.palette], profile = PROFILES[p.palette];
  const params = { ...p, baseHalfWidth: 5 + p.width * 25, lifetimeSeconds: 0.5 + p.duration * 3.5, motionReferenceSpeed: 3.0 };
  const n = samples.length; if (n < 3) return;
  const basePath = smoothSilk2DPath(samples.map(s => ({ x: s.x, y: s.y })));
  const leftX = [], leftY = [], rightX = [], rightY = [], spineX = [], spineY = [], halfWidths = [], sheenAcross = [], shadowAcross = [];
  let lastTx = 1, lastTy = 0, maxHalfWidth = 1;
  for (let i = 0; i < n; i++) {
    const sample = samples[i];
    const pi = Math.max(0, i - 2), ni = Math.min(n - 1, i + 2);
    let tx = basePath.x[ni] - basePath.x[pi], ty = basePath.y[ni] - basePath.y[pi]; const tl = Math.hypot(tx, ty);
    if (tl > 0.001) { tx /= tl; ty /= tl; lastTx = tx; lastTy = ty; } else { tx = lastTx; ty = lastTy; }
    const px = -ty, py = tx;
    const speedFraction = clamp01(sample.speed / params.motionReferenceSpeed);
    const positionFraction = i / (n - 1);
    const freeEnd = Math.pow(1 - positionFraction, 0.72);
    const tautWidth = 1 - speedFraction * params.tautness * 0.58;
    const widthEnvelope = resolveSilk2DWidthEnvelope(positionFraction);
    const turn = clamp(signedTurn(basePath.x, basePath.y, i), -0.45, 0.45);
    const flutterEnergy = (0.3 + speedFraction * 0.7) * (1 - params.tautness * 0.42);
    const flutterAmplitude = params.flutter * SCALE * (8 + flutterEnergy * 32);
    const pathCoordinate = sample.pathDistance / SCALE;
    const waveA = Math.sin(pathCoordinate * 0.018 - TIME * (0.38 + speedFraction * 0.5) + phase);
    const waveB = Math.sin(pathCoordinate * 0.0085 + TIME * 0.19 + phase * 1.7);
    const centerFlutter = (waveA + waveB * 0.42) * flutterAmplitude * freeEnd * (0.3 + smoothstep(0, 0.1, positionFraction) * 0.7) + turn * params.flutter * 7 * SCALE * freeEnd;
    const gravitySag = params.baseHalfWidth * SCALE * (0.16 + params.flutter * 2.4) * (1 - params.tautness * 0.55) * Math.pow(freeEnd, 1.45);
    const foldWave = Math.sin(pathCoordinate * 0.026 + TIME * 0.28 + phase * 1.31);
    const minimumHalfWidth = (0.04 + smoothstep(0, 0.16, positionFraction) * 0.5) * SCALE;
    const widthBillow = 1 + (waveA * 0.7 + waveB * 0.3) * params.flutter * (0.18 + freeEnd * 0.2);
    const clothVolume = 1.16 + params.flutter * 0.28;
    const halfWidth = Math.max(minimumHalfWidth, params.baseHalfWidth * SCALE * params.intensity * tautWidth * widthEnvelope * widthBillow * clothVolume);
    halfWidths[i] = halfWidth; maxHalfWidth = Math.max(maxHalfWidth, halfWidth);
    const fold = foldWave * halfWidth * params.flutter * 0.52 * freeEnd * profile.foldStrength;
    const lw = Math.max(minimumHalfWidth, halfWidth + fold), rw = Math.max(minimumHalfWidth, halfWidth - fold);
    sheenAcross[i] = clamp(0.64 + foldWave * params.flutter * 0.22 + turn * 0.18, 0.42, 0.82);
    shadowAcross[i] = clamp(0.27 - foldWave * params.flutter * 0.18 - turn * 0.12, 0.12, 0.46);
    spineX[i] = basePath.x[i] + px * centerFlutter; spineY[i] = basePath.y[i] + py * centerFlutter + gravitySag;
    leftX[i] = spineX[i] + px * lw; leftY[i] = spineY[i] + py * lw; rightX[i] = spineX[i] - px * rw; rightY[i] = spineY[i] - py * rw;
  }
  const leftEdge = smoothSilk2DPath(leftX.map((x, i) => ({ x, y: leftY[i] })));
  const rightEdge = smoothSilk2DPath(rightX.map((x, i) => ({ x, y: rightY[i] })));
  const across = (arr) => smoothSilk2DPath(arr.map((a, i) => ({ x: rightEdge.x[i] + (leftEdge.x[i] - rightEdge.x[i]) * a, y: rightEdge.y[i] + (leftEdge.y[i] - rightEdge.y[i]) * a })));
  const sheenPath = across(sheenAcross), shadowPath = across(shadowAcross);
  const rep = resolveSilk2DMaterialColors(palette, PROP_COLOR, 0.55);
  const ribbonAlpha = Math.sqrt(params.intensity);

  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (palette.emissive) ctx.globalCompositeOperation = 'lighter';
  if (profile.glowAlpha > 0) {
    ctx.globalAlpha = profile.glowAlpha * ribbonAlpha; ctx.strokeStyle = rep.body; ctx.lineWidth = maxHalfWidth * (palette.emissive ? 2.8 : 2.15);
    ctx.beginPath(); traceCentripetalForward(ctx, spineX, spineY, 0, n - 1, n); ctx.stroke();
  }
  if (palette.emissive) {
    ctx.globalAlpha = ribbonAlpha * 0.12;
    for (let i = 0; i < n; i += AURA_STRIDE) { const r = halfWidths[i] * 3.2; const g = ctx.createRadialGradient(spineX[i], spineY[i], 0, spineX[i], spineY[i], r); g.addColorStop(0, rep.edge); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.beginPath(); ctx.arc(spineX[i], spineY[i], r, 0, TAU); ctx.fillStyle = g; ctx.fill(); }
  }
  ctx.globalAlpha = ribbonAlpha * profile.bodyAlpha; ctx.fillStyle = rep.body;
  ctx.beginPath(); traceCentripetalForward(ctx, leftEdge.x, leftEdge.y, 0, n - 1, n); traceCentripetalBackward(ctx, rightEdge.x, rightEdge.y, 0, n - 1, n); ctx.closePath(); ctx.fill();
  ctx.save();
  ctx.beginPath(); traceCentripetalForward(ctx, leftEdge.x, leftEdge.y, 0, n - 1, n); traceCentripetalBackward(ctx, rightEdge.x, rightEdge.y, 0, n - 1, n); ctx.closePath(); ctx.clip();
  ctx.filter = `blur(${Math.max(0.9, SCALE * 1.45)}px)`;
  ctx.globalAlpha = ribbonAlpha * (0.075 + profile.foldStrength * 0.26) * 1.6; ctx.strokeStyle = rep.shadow; ctx.lineWidth = Math.max(0.9 * SCALE, maxHalfWidth * 1.06);
  ctx.beginPath(); traceCentripetalForward(ctx, shadowPath.x, shadowPath.y, 0, n - 1, n); ctx.stroke();
  ctx.globalAlpha = ribbonAlpha * profile.sheenAlpha * 1.5; ctx.strokeStyle = mixHex(rep.body, rep.edge, 0.5); ctx.lineWidth = Math.max(0.8 * SCALE, maxHalfWidth * profile.sheenWidth);
  ctx.beginPath(); traceCentripetalForward(ctx, sheenPath.x, sheenPath.y, 0, n - 1, n); ctx.stroke();
  ctx.restore();
  let edgeStyle = rep.edge;
  if (palette.hueShift) { const g = ctx.createLinearGradient(spineX[0], spineY[0], spineX[n - 1], spineY[n - 1]); g.addColorStop(0, resolveSilk2DMaterialColors(palette, PROP_COLOR, 0).edge); g.addColorStop(0.5, rep.edge); g.addColorStop(1, resolveSilk2DMaterialColors(palette, PROP_COLOR, 1).edge); edgeStyle = g; }
  ctx.globalAlpha = ribbonAlpha * profile.edgeAlpha * 0.55; ctx.strokeStyle = rep.shadow; ctx.lineWidth = 0.65 * SCALE;
  ctx.beginPath(); traceCentripetalForward(ctx, rightEdge.x, rightEdge.y, 0, n - 1, n); ctx.stroke();
  ctx.globalAlpha = Math.min(1, ribbonAlpha * profile.edgeAlpha * 1.5); ctx.strokeStyle = edgeStyle; ctx.lineWidth = 0.7 * SCALE;
  ctx.beginPath(); traceCentripetalForward(ctx, leftEdge.x, leftEdge.y, 0, n - 1, n); ctx.stroke();
  ctx.restore();
}

export function draw(ctx, p, rand, knots = DEFAULT_KNOTS, fullLength = false) {
  const palette = PAL[p.palette];
  const body = hexToRgb(palette.body);
  const dark = 0.2126 * body[0] + 0.7152 * body[1] + 0.0722 * body[2] < 0.1 && !palette.emissive;
  ground(ctx, dark ? [0.3, 0.29, 0.34] : [0.03, 0.03, 0.045]);
  if (dark) blob(ctx, 380, 120, 400, 220, [0.68, 0.66, 0.74], 0.8);
  else blob(ctx, 400, 130, 340, 180, hexToRgb(palette.edge), palette.emissive ? 0.16 : 0.06 + 0.04 * p.intensity);
  const samples = recordTrail(p, knots, fullLength);
  drawRibbon(ctx, p, samples, rand() * TAU);
}

