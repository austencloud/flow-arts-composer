import type { PulseIntent } from "./effects-config";

export interface PulsePalette {
  readonly id: PulseIntent["palette"];
  readonly ring: string;      // primary ring color
  readonly fade: string;      // trailing fade color
  readonly emissive?: boolean; // uses lighter blend
  readonly hueShift?: boolean; // shifts hue per-ring-age
}

const PALETTE_REGISTRY: Record<string, PulsePalette> = {
  sonar: { id: "sonar", ring: "#38bdf8", fade: "#0c4a6e" },
  ripple: { id: "ripple", ring: "#93c5fd", fade: "#bfdbfe" },
  aurora: { id: "aurora", ring: "#a855f7", fade: "#22d3ee", hueShift: true },
  neon: { id: "neon", ring: "#f0abfc", fade: "#fb923c", emissive: true },
  ember: { id: "ember", ring: "#ff6000", fade: "#ffcc00", emissive: true },
  void: { id: "void", ring: "#404060", fade: "#101020" },
};

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  const sector = Math.floor(h * 6);
  if (sector === 0 || sector === 6) { r = c; g = x; }
  else if (sector === 1) { r = x; g = c; }
  else if (sector === 2) { g = c; b = x; }
  else if (sector === 3) { g = x; b = c; }
  else if (sector === 4) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function deriveCustomPalette(hex: string): PulsePalette {
  const { h, s, l } = hexToHsl(hex);
  return {
    id: "custom",
    ring: hex,
    fade: hslToHex(h, clamp01(s), clamp01(l - 0.2)),
  };
}

export function resolvePulsePalette(intent: PulseIntent): PulsePalette {
  if (intent.palette === "custom") return deriveCustomPalette(intent.customColor);
  return PALETTE_REGISTRY[intent.palette] ?? PALETTE_REGISTRY.sonar!;
}

/** Color fields the ring resolvers read; both resolved param shapes carry them. */
interface PulseColorSource {
  colorMode: PulseIntent["colorMode"];
  colorPalette: readonly string[];
  resolvedPalette: PulsePalette;
}

/**
 * The ring color for one tip. Solid draws the selected palette's ring; Prop
 * follows the tip's own prop color; Palette deals the multicolor list across
 * tips; Rainbow walks the hue wheel over time, offset per tip.
 */
export function resolvePulseRingColor(
  params: PulseColorSource,
  tipColor: string,
  slot: number,
  clock: number
): string {
  switch (params.colorMode) {
    case "prop-matched":
      return tipColor || params.resolvedPalette.ring;
    case "rainbow":
      return hslToHex(((((clock * 60 + slot * 53) % 360) + 360) % 360) / 360, 0.85, 0.62);
    case "palette": {
      const list = params.colorPalette;
      return list.length > 0 ? list[slot % list.length]! : params.resolvedPalette.ring;
    }
    default:
      return params.resolvedPalette.ring;
  }
}

/**
 * The trailing wake color behind a ring. Solid uses the palette's own fade;
 * every other mode darkens the ring color so each hand keeps its hue.
 */
export function resolvePulseWakeColor(params: PulseColorSource, ring: string): string {
  if (params.colorMode === "solid") return params.resolvedPalette.fade;
  if (!/^#[0-9a-f]{6}$/i.test(ring)) return params.resolvedPalette.fade;
  const { h, s, l } = hexToHsl(ring);
  return hslToHex(h, clamp01(s * 1.1), clamp01(l * 0.45));
}
