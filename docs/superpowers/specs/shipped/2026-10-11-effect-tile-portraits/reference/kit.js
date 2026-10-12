// Shared tile paint kit — the prototype of the module Fire/Coal/Bloom would share.
// Every tile is 720x270, dark ground, additive light. Nothing keyed off preset id.
export const W = 720, H = 270;

export function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function css(c, a = 1) {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
}
export function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export const WHITE = [1, 1, 1];

export function ground(ctx, tint = [0.04, 0.03, 0.05]) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, css(tint.map(v => v * 1.6)));
  g.addColorStop(1, css(tint.map(v => v * 0.5)));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

/** One soft light blob — the atom every tile is built from. */
export function blob(ctx, x, y, rx, ry, color, alpha) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, css(color, alpha));
  g.addColorStop(0.45, css(color, alpha * 0.42));
  g.addColorStop(1, css(color, 0));
  ctx.fillStyle = g; ctx.fillRect(-rx, -rx, rx * 2, rx * 2); ctx.restore();
}

/** Glow stroke: wide colored halo under a hot white core (the zap strokeBolt contract). */
export function glowStroke(ctx, pts, width, color, glow, alpha, coreColor = '#fff', strokeStyle = color) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const trace = () => { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); };
  ctx.shadowBlur = glow; ctx.shadowColor = color;
  ctx.strokeStyle = strokeStyle; ctx.globalAlpha = alpha * 0.6; ctx.lineWidth = width * 2; trace(); ctx.stroke();
  ctx.shadowBlur = glow * 0.4;
  ctx.strokeStyle = coreColor; ctx.globalAlpha = alpha; ctx.lineWidth = width; trace(); ctx.stroke();
  ctx.restore();
}

/** Radiant terminal at a prop tip: white heart, colored skirt. */
export function terminal(ctx, x, y, r, color, alpha = 1) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.3, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}

/** Mount a tile: draws at 720x270, shown at the picker size and at full size. */
export function mount(root, title, note, draw) {
  const card = document.createElement('div'); card.className = 'card';
  card.innerHTML = `<h3>${title}</h3><p class="note">${note}</p><div class="row"></div>`;
  const row = card.querySelector('.row');
  for (const cls of ['small', 'large']) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.className = cls;
    row.appendChild(c); draw(c.getContext('2d'));
  }
  root.appendChild(card);
}
