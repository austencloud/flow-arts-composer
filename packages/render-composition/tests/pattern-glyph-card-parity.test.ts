import { describe, expect, it } from "vitest";
import { layoutTurnGlyph, paintReversalGlyph, paintTurnGlyph, type TurnGlyphEntry } from "../src/pattern-glyphs.js";

// Baseline formulas copied from the previous card-back-bitmaps-percard.ts.
// Compare canvas operations, including floating-point coordinates and hatching.
function recordingContext() {
  const calls: unknown[] = [];
  const state = { fillStyle: "", strokeStyle: "", globalAlpha: 1, lineWidth: 0 };
  const methods = ["beginPath", "moveTo", "lineTo", "arcTo", "closePath", "save", "restore", "clip", "stroke", "fill", "arc"];
  const ctx = new Proxy(state as unknown as Record<string, unknown>, {
    get(target, key) {
      if (methods.includes(String(key))) return (...args: unknown[]) => calls.push([key, ...args, target.fillStyle, target.strokeStyle, target.globalAlpha, target.lineWidth]);
      return target[key as string];
    },
    set(target, key, value) { target[key as string] = value; calls.push(["set", key, value]); return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

function legacyTurn(ctx: CanvasRenderingContext2D, entries: readonly TurnGlyphEntry[], cqi: number) {
  const boxW = Math.round(10 * cqi);
  const boxH = Math.round(6 * cqi);
  const layout = layoutTurnGlyph(entries.length);
  const barW = layout.barW * cqi;
  const intraGap = layout.intraGap * cqi;
  const groupGap = layout.groupGap * cqi;
  const radius = layout.radius * cqi;
  let x = (boxW - layout.clusterW * cqi) / 2;
  function bar(w: number, h: number, color: string, isFloat: boolean) {
    const y = boxH - h;
    const rr = Math.min(radius, w / 2, h);
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr); ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr); ctx.lineTo(x + w, y + h); ctx.closePath();
    if (isFloat) {
      ctx.save(); ctx.clip(); ctx.globalAlpha = 0.7; ctx.strokeStyle = color;
      ctx.lineWidth = 0.4 * (w / 1.1);
      const step = 0.8 * (w / 1.1);
      for (let d = -h; d < w + h; d += step) {
        ctx.beginPath(); ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); ctx.stroke();
      }
      ctx.restore();
    } else { ctx.fillStyle = color; ctx.fill(); }
  }
  for (const entry of entries) {
    bar(barW, (entry.leftFloat ? 1.2 : entry.left === 0 ? 0.5 : entry.left * 1.8) * cqi, "#3498db", !!entry.leftFloat);
    x += barW + intraGap;
    bar(barW, (entry.rightFloat ? 1.2 : entry.right === 0 ? 0.5 : entry.right * 1.8) * cqi, "#e74c3c", !!entry.rightFloat);
    x += barW + groupGap;
  }
}

function legacyReversal(ctx: CanvasRenderingContext2D, sequence: string, period: number, cqi: number, muted: string) {
  const boxW = Math.round(10 * cqi), boxH = Math.round(6 * cqi);
  const symbols = sequence.slice(0, Math.min(8, period)).split("");
  const r = 0.9 * cqi, colGap = 0.6 * cqi, dotGap = 0.3 * cqi;
  const colW = r * 2, colH = r * 4 + dotGap;
  const rowW = symbols.length ? symbols.length * colW + (symbols.length - 1) * colGap : 0;
  let cx = (boxW - rowW) / 2 + r;
  const topCy = (boxH - colH) / 2 + r, botCy = topCy + r * 2 + dotGap;
  function dot(cy: number, color: string | null) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (color === null) { ctx.globalAlpha = 0.4; ctx.fillStyle = muted; }
    else ctx.fillStyle = color;
    ctx.fill(); ctx.restore();
  }
  for (const symbol of symbols) {
    dot(topCy, symbol === "P" || symbol === "R" ? "#e74c3c" : null);
    dot(botCy, symbol === "P" || symbol === "B" ? "#3498db" : null);
    cx += colW + colGap;
  }
}

describe("card pattern painter baseline", () => {
  it("keeps numeric, float, and long turn bars at the same canvas coordinates", () => {
    for (const entries of [
      [{ left: 0, right: 2 }],
      [{ left: 1, right: 3, leftFloat: true, rightFloat: true }],
      Array.from({ length: 8 }, (_, i) => ({ left: i % 4, right: (i + 2) % 4, leftFloat: i === 3 })),
    ]) {
      const cqi = 16.44, width = Math.round(10 * cqi), height = Math.round(6 * cqi);
      const old = recordingContext(), next = recordingContext();
      legacyTurn(old.ctx, entries, cqi);
      paintTurnGlyph(next.ctx, entries, { x: 0, y: 0, width, height }, {}, cqi);
      expect(next.calls).toEqual(old.calls);
    }
  });

  it("keeps full and empty reversal dots at the same canvas coordinates", () => {
    for (const [sequence, period] of [["PRB-", 4], ["PRB-PRB-", 8], ["P-", 1]] as const) {
      const cqi = 16.44, width = Math.round(10 * cqi), height = Math.round(6 * cqi);
      const old = recordingContext(), next = recordingContext();
      legacyReversal(old.ctx, sequence, period, cqi, "rgba(0, 0, 0, 0.55)");
      paintReversalGlyph(next.ctx, { sequence, period }, { x: 0, y: 0, width, height }, { muted: "rgba(0, 0, 0, 0.55)" }, false, cqi);
      expect(next.calls).toEqual(old.calls);
    }
  });
});
