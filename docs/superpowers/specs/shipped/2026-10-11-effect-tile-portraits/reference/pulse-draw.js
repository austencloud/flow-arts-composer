import { W, H, ground, blob, hexToRgb } from './kit.js';

// pulse-palettes.ts registry (solid color mode: ring + fade).
export const PAL = {
  sonar:  { ring: '#38bdf8', fade: '#0c4a6e' },
  ripple: { ring: '#93c5fd', fade: '#bfdbfe' },
  aurora: { ring: '#a855f7', fade: '#22d3ee', hueShift: true },
  neon:   { ring: '#f0abfc', fade: '#fb923c', emissive: true },
  ember:  { ring: '#ff6000', fade: '#ffcc00', emissive: true },
  void:   { ring: '#404060', fade: '#101020' },
};
export const PRESETS = [
  { name: 'Sonar',     patch: { trigger: 'beat',       style: 'glow', palette: 'sonar',  intensity: 0.7,  reach: 0.7,  lifetime: 1.1, thickness: 0.3,  beatInterval: 1, velocityThreshold: 0.3,  velocityScale: 0.3,  asymmetry: 0,    chromatic: 0,   flash: 0.3, harmonics: 0.15, charge: 0.5 } },
  { name: 'Shockwave', patch: { trigger: 'velocity',   style: 'glow', palette: 'ember',  intensity: 0.6,  reach: 0.5,  lifetime: 1.3, thickness: 1.0,  beatInterval: 1, velocityThreshold: 0.55, velocityScale: 1.0,  asymmetry: 0.4,  chromatic: 0.4, flash: 1.0, harmonics: 0.25, charge: 0.6 } },
  { name: 'Heartbeat', patch: { trigger: 'beat',       style: 'glow', palette: 'neon',   intensity: 0.42, reach: 0.45, lifetime: 0.8, thickness: 0.45, beatInterval: 1, velocityThreshold: 0.3,  velocityScale: 0.5,  asymmetry: 0.15, chromatic: 0.1, flash: 0.6, harmonics: 0.4,  charge: 0.85 } },
  { name: 'Ripple',    patch: { trigger: 'continuous', style: 'glow', palette: 'ripple', intensity: 0.3,  reach: 0.75, lifetime: 1.2, thickness: 0.5,  beatInterval: 1, velocityThreshold: 0.3,  velocityScale: 0.35, asymmetry: 0,    chromatic: 0,   flash: 0,   harmonics: 0.65, charge: 0.6 } },
];

const TAU = Math.PI * 2;
// Tile staging. Radii use UNIT (stage unit -> tile px); strokes, bands and the
// flash use LINE, a fatter unit, so a 1.7 px front still reads at 304x114.
const UNIT = 0.8;
const LINE = UNIT * 2.4;
const BEAT = 1.0;                       // seconds per beat (1.0 speed = 60 BPM)
const FULL_ENERGY_TRAVEL = 640;         // stage units per beat = energy 1
const MOTION_SMOOTHING = 0.07, SWING_PROMINENCE = 0.08;
const DT = 1 / 60;
// Tile-only time stretch: rings live LIFE_BOOST times longer than the renderer's
// so two beats of history stay on the frame; shape and colour still follow p.
const LIFE_BOOST = 2.2;
// Seconds after the newest primary ring to freeze, per trigger: beat looks wait
// for the charge to build toward the next beat, velocity catches the flash.
const FREEZE_AFTER = { beat: 0.72, velocity: 0.2, continuous: 0.32 };
const INTENSITY_FLOOR = 0.55;           // tile-only: Ripple (0.3) and Heartbeat (0.42) would vanish at 304x114
const LEAD_SPANS = [0.35, 0.75, 1.2], GLINT_TURNS = [0, Math.PI / 2];
const WHITE = [255, 255, 255];

// The staff: its centre sweeps in from the lower left while it turns half a
// turn per beat, so each end's speed swells and dips once per beat.
const STAFF_HALF = 68;
const SWEEP = { x0: 140, y0: 200, cx: 340, cy: 175, x1: 560, y1: 100, seconds: 3.0 };
const OMEGA = Math.PI / BEAT;
function centreAt(t) { const u = Math.max(0, Math.min(1, t / SWEEP.seconds)), v = 1 - u; return { x: v * v * SWEEP.x0 + 2 * v * u * SWEEP.cx + u * u * SWEEP.x1, y: v * v * SWEEP.y0 + 2 * v * u * SWEEP.cy + u * u * SWEEP.y1 }; }
function tipsAt(t, phase0) {
  const c = centreAt(t), a = phase0 + OMEGA * t;
  return [
    { x: c.x + Math.cos(a) * STAFF_HALF, y: c.y + Math.sin(a) * STAFF_HALF, end: 0 },
    { x: c.x - Math.cos(a) * STAFF_HALF, y: c.y - Math.sin(a) * STAFF_HALF, end: 1 },
  ];
}

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const clamp01 = v => clamp(v, 0, 1);
function smoothstep(e0, e1, v) { const t = clamp((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function easeOutCubic(p) { const q = 1 - p; return 1 - q * q * q; }
function rgba(c, a) { return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${clamp01(a)})`; }
function mix(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }
function rgb255(hex) { return hexToRgb(hex).map(v => Math.round(v * 255)); }
function rotateHue(c, degrees) {
  const a = degrees * Math.PI / 180, cos = Math.cos(a), k = (1 - cos) / 3, s = Math.sqrt(1 / 3) * Math.sin(a);
  const m0 = cos + k, m1 = k - s, m2 = k + s;
  const ch = (x, y, z) => Math.max(0, Math.min(255, Math.round(x * m0 + y * m1 + z * m2)));
  return [ch(c[0], c[1], c[2]), ch(c[1], c[2], c[0]), ch(c[2], c[0], c[1])];
}

// pulse-rhythm.ts
function pulseAccentThreshold(v) { return 0.2 + 0.65 * clamp01(v); }
function pulseRingLife(beats, beatSeconds, amp = 1) { return clamp(beats * beatSeconds * (0.55 + 0.45 * amp), 0.2, 6); }
function pulseOvertoneGap(beatSeconds) { return clamp(0.13 * beatSeconds, 0.06, 0.45); }
function pulseCharge(phase) { const shape = smoothstep(0.45, 1, phase); return { shape, strength: shape * (1 - smoothstep(1.06, 1.3, phase)) }; }

class TipMotion {
  constructor() { this.vx = 0; this.vy = 0; this.energy = 0; this.peak = 0; this.previous = 0; this.rising = false; this.trough = 0; this.lastAccent = -Infinity; this.aboveSince = NaN; this.spawnDebt = 0; }
  feed(vx, vy, dt, beatSeconds) {
    const a = 1 - Math.exp(-dt / MOTION_SMOOTHING);
    this.vx += (vx - this.vx) * a; this.vy += (vy - this.vy) * a;
    this.previous = this.energy;
    this.energy = clamp01((Math.hypot(this.vx, this.vy) * beatSeconds) / FULL_ENERGY_TRAVEL);
  }
  accent(threshold, clock, beatSeconds) {
    const e = this.energy, prev = this.previous; let hit = false;
    if (e > prev + 1e-5) this.rising = true;
    else if (this.rising && e < prev - 1e-5) {
      this.rising = false;
      if (prev >= threshold && prev - this.trough >= SWING_PROMINENCE && clock - this.lastAccent >= Math.max(0.1, 0.3 * beatSeconds)) { hit = true; this.peak = prev; }
      this.trough = prev;
    }
    if (!this.rising) this.trough = Math.min(this.trough, e);
    if (e >= threshold) {
      if (!Number.isFinite(this.aboveSince)) this.aboveSince = clock;
      const quiet = clock - Math.max(this.aboveSince, this.lastAccent);
      if (!hit && quiet >= 0.75 * beatSeconds) { hit = true; this.peak = e; }
    } else this.aboveSince = NaN;
    if (hit) this.lastAccent = clock;
    return hit;
  }
  continuous(dt, beatSeconds) {
    this.spawnDebt += (dt * (1 + 3 * this.energy)) / beatSeconds;
    const owed = Math.floor(this.spawnDebt); this.spawnDebt -= owed;
    return Math.min(owed, 3);
  }
}

/** The renderer's ring state machine, run over the staged motion. */
class Sim {
  constructor(p, pal, phase0) {
    this.p = p; this.pal = pal; this.phase0 = phase0;
    this.params = { ...p, intensity: Math.max(p.intensity, INTENSITY_FLOOR), resolvedPalette: pal, maxRadius: 20 + p.reach * 180, ringWidth: p.style === 'stroke' ? 1 + p.thickness * 4 : 3 + p.thickness * 12 };
    this.rings = []; this.motion = [new TipMotion(), new TipMotion()]; this.last = [null, null];
    this.clock = -0.35; this.ringBeat = -1; this.primaryBirths = [];
    const ring = rgb255(pal.ring);
    this.colors = { ring, wake: rgb255(pal.fade), hot: mix(ring, WHITE, 0.72), warm: rotateHue(ring, 38), cool: rotateHue(ring, -38) };
  }
  step(dt) {
    this.clock += dt;
    const beat = Math.floor(this.clock / (BEAT * this.params.beatInterval));
    const ringBeat = beat !== this.ringBeat; this.ringBeat = beat;
    const tips = tipsAt(this.clock, this.phase0);
    for (const tip of tips) {
      const m = this.motion[tip.end], last = this.last[tip.end];
      if (last) m.feed((tip.x - last.x) / UNIT / dt, (tip.y - last.y) / UNIT / dt, dt, BEAT);
      this.last[tip.end] = { x: tip.x, y: tip.y };
      switch (this.p.trigger) {
        case 'beat': if (ringBeat) this.fire(tip, m, m.energy); break;
        case 'velocity': if (m.accent(pulseAccentThreshold(this.p.velocityThreshold), this.clock, BEAT)) this.fire(tip, m, m.peak); break;
        case 'continuous': {
          if (ringBeat) this.fire(tip, m, m.energy);
          const owed = m.continuous(dt, BEAT);
          for (let i = 0; i < owed; i++) this.spawn(tip, m, m.energy, 0.3 + 0.3 * m.energy, false, 0);
          break;
        }
      }
    }
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter(r => r.age < r.life);
  }
  fire(tip, m, energy) {
    this.spawn(tip, m, energy, 1, true, 0);
    this.primaryBirths.push(this.clock);
    const overtones = Math.round(this.p.harmonics * 3), gap = pulseOvertoneGap(BEAT);
    for (let i = 1; i <= overtones; i++) this.spawn(tip, m, energy, Math.max(0.2, 1 - i * 0.24), false, i * gap);
  }
  spawn(tip, m, energy, amp, primary, delay) {
    const life = pulseRingLife(this.p.lifetime, BEAT, amp) * LIFE_BOOST, carry = this.p.asymmetry * 0.85;
    this.rings.push({ x: tip.x, y: tip.y, vx: m.vx * UNIT * carry, vy: m.vy * UNIT * carry, drag: 0.14 * life, age: -delay, life, energy: clamp01(energy), amp, primary, heading: Math.atan2(m.vy, m.vx), ...this.colors });
  }
  phase() { return this.clock / (BEAT * this.params.beatInterval) - this.ringBeat; }
}

function drawRing(ctx, r, params, pal) {
  const p = r.age / r.life;
  const size = 1 - params.velocityScale * (1 - r.energy);
  const emissive = pal.emissive ? 1.15 : 1;
  const A = params.intensity * emissive * r.amp * (0.6 + 0.4 * size) * smoothstep(0, 0.035, p) * Math.pow(1 - p, 1.5);
  if (A < 0.004) return;
  const reach = params.maxRadius * UNIT * (0.4 + 0.6 * size) * (0.3 + 0.7 * r.amp);
  const R = 2 * UNIT + (reach - 2 * UNIT) * easeOutCubic(p);
  const drift = r.drag * (1 - Math.exp(-r.age / r.drag));
  const cx = r.x + r.vx * drift, cy = r.y + r.vy * drift;
  const body = pal.hueShift ? mix(r.ring, r.wake, p) : r.ring;
  const front = mix(r.hot, body, smoothstep(0.05, 0.55, p));
  const frontWidth = Math.max(1, (1 + 2.4 * params.thickness) * LINE * (1 - 0.45 * p));

  if (params.style === 'glow') {
    const band = params.ringWidth * LINE * (0.9 + 0.9 * p);
    const inner = Math.max(0, R - band * 2.4), outer = R + band * 0.45;
    const at = (R - inner) / (outer - inner);
    const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    g.addColorStop(0, rgba(r.wake, 0));
    g.addColorStop(at * 0.55, rgba(r.wake, A * 0.3));
    g.addColorStop(at * 0.9, rgba(body, A * 0.55));
    g.addColorStop(at, rgba(body, A * 0.8));
    g.addColorStop(at + (1 - at) * 0.5, rgba(body, A * 0.16));
    g.addColorStop(1, rgba(body, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, outer, 0, TAU);
    if (inner > 0.5) { ctx.moveTo(cx + inner, cy); ctx.arc(cx, cy, inner, 0, TAU); }
    ctx.fill('evenodd');
    ctx.lineWidth = frontWidth; ctx.strokeStyle = rgba(front, Math.min(1, A * 1.15));
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  } else {
    ctx.lineWidth = Math.max(1, params.ringWidth * LINE * (1 - 0.4 * p)); ctx.strokeStyle = rgba(body, Math.min(1, A));
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.lineWidth = Math.max(0.75, frontWidth * 0.5); ctx.strokeStyle = rgba(front, Math.min(1, A * 0.8));
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  }
  const lead = params.asymmetry * (0.15 + 0.85 * r.energy) * r.amp;
  if (lead > 0.04 && r.energy > 0.05) {
    ctx.lineWidth = frontWidth * 1.8; ctx.strokeStyle = rgba(r.hot, Math.min(1, A * lead * 0.4));
    for (const span of LEAD_SPANS) { ctx.beginPath(); ctx.arc(cx, cy, R, r.heading - span, r.heading + span); ctx.stroke(); }
  }
  const chroma = params.chromatic * (0.35 + 0.65 * r.energy);
  if (chroma > 0.03) {
    const off = (1.2 + 5 * p) * LINE * (0.5 + chroma), alpha = Math.min(1, A * chroma * 0.55);
    ctx.lineWidth = Math.max(1, frontWidth * 0.9);
    ctx.strokeStyle = rgba(r.warm, alpha); ctx.beginPath(); ctx.arc(cx, cy, R + off, 0, TAU); ctx.stroke();
    if (R - off > 1) { ctx.strokeStyle = rgba(r.cool, alpha); ctx.beginPath(); ctx.arc(cx, cy, R - off, 0, TAU); ctx.stroke(); }
  }
  if (r.primary && params.flash > 0.01) drawFlash(ctx, r, params, size);
}

function drawFlash(ctx, r, params, size) {
  const span = Math.min(Math.max(r.life * 0.16, 0.09), 0.4);
  if (r.age >= span) return;
  const k = r.age / span;
  const alpha = clamp01(params.flash * params.intensity * 1.5 * (1 - k) * (1 - k) * (0.6 + 0.4 * size));
  if (alpha < 0.004) return;
  const radius = (9 + 30 * params.flash) * LINE * 0.6 * (0.6 + 0.4 * size) * (0.7 + 0.5 * easeOutCubic(k));
  const g = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, radius);
  g.addColorStop(0, rgba(r.hot, alpha)); g.addColorStop(0.22, rgba(r.hot, alpha * 0.85)); g.addColorStop(0.55, rgba(r.ring, alpha * 0.4)); g.addColorStop(1, rgba(r.ring, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(r.x, r.y, radius, 0, TAU); ctx.fill();
  const glint = clamp01((params.flash - 0.3) / 0.7);
  if (glint <= 0) return;
  const length = radius * 2.6 * (1 - 0.5 * k);
  ctx.lineWidth = 1.3 * LINE;
  for (const turn of GLINT_TURNS) {
    const a = r.heading + turn, ux = Math.cos(a) * length, uy = Math.sin(a) * length;
    const lg = ctx.createLinearGradient(r.x - ux, r.y - uy, r.x + ux, r.y + uy);
    lg.addColorStop(0, rgba(r.hot, 0)); lg.addColorStop(0.5, rgba(r.hot, alpha * glint * 0.8)); lg.addColorStop(1, rgba(r.hot, 0));
    ctx.strokeStyle = lg; ctx.beginPath(); ctx.moveTo(r.x - ux, r.y - uy); ctx.lineTo(r.x + ux, r.y + uy); ctx.stroke();
  }
}

function drawCharge(ctx, tip, params, colors, charge) {
  const strength = charge.strength * params.charge * params.intensity;
  if (strength < 0.004) return;
  const shape = charge.shape;
  const closing = params.maxRadius * UNIT * 0.5 * (1 - shape * shape) + 3 * UNIT;
  ctx.lineWidth = (0.8 + 1.6 * shape) * LINE; ctx.strokeStyle = rgba(colors.ring, Math.min(1, strength * 0.7 * shape));
  ctx.beginPath(); ctx.arc(tip.x, tip.y, closing, 0, TAU); ctx.stroke();
  const core = (4 + 14 * shape) * LINE * 0.7;
  const hot = mix(colors.ring, WHITE, 0.7);
  const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, core);
  g.addColorStop(0, rgba(hot, Math.min(1, strength * 0.9))); g.addColorStop(0.35, rgba(colors.ring, Math.min(1, strength * 0.5))); g.addColorStop(1, rgba(colors.ring, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tip.x, tip.y, core, 0, TAU); ctx.fill();
}

/** Run the staged motion and freeze FREEZE_AFTER seconds past the newest primary ring. */
function simulate(p, pal, phase0) {
  const probe = new Sim(p, pal, phase0);
  const horizon = SWEEP.seconds, after = FREEZE_AFTER[p.trigger];
  while (probe.clock < horizon) probe.step(DT);
  const births = probe.primaryBirths.filter(t => t + after <= horizon);
  const freezeAt = births.length ? births[births.length - 1] + after : horizon;
  const sim = new Sim(p, pal, phase0);
  while (sim.clock + DT <= freezeAt + 1e-9) sim.step(DT);
  return sim;
}

export function draw(ctx, p, rand) {
  const pal = PAL[p.palette];
  const ring = hexToRgb(pal.ring);
  ground(ctx, [0.03, 0.03, 0.045]);
  blob(ctx, 380, 150, 360, 200, ring, pal.emissive ? 0.1 : 0.06 + 0.04 * p.intensity);

  const sim = simulate(p, pal, rand() * TAU);
  const layer = document.createElement('canvas'); layer.width = W; layer.height = H;
  const c = layer.getContext('2d');
  c.lineCap = 'round';
  c.globalCompositeOperation = 'lighter';
  const rings = sim.rings.filter(r => r.age > 0).sort((a, b) => b.age - a.age);
  for (const r of rings) drawRing(c, r, sim.params, pal);
  if (p.trigger === 'beat' && p.charge > 0.01) {
    const charge = pulseCharge(sim.phase());
    if (charge.strength > 0.004) for (const tip of tipsAt(sim.clock, sim.phase0)) drawCharge(c, tip, sim.params, sim.colors, charge);
  }
  // The staff itself: a faint bar between the two ring sources.
  const tips = tipsAt(sim.clock, sim.phase0);
  c.globalCompositeOperation = 'source-over';
  c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,255,255,0.16)';
  c.beginPath(); c.moveTo(tips[0].x, tips[0].y); c.lineTo(tips[1].x, tips[1].y); c.stroke();
  for (const t of tips) { c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.arc(t.x, t.y, 3.5, 0, TAU); c.fill(); }

  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(layer, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  return sim;
}
