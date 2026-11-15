/**
 * Practice view preferences (Svelte 5 Runes), persisted to localStorage.
 * Deliberately separate from TempoPracticeConfig (the ramp orchestrator's config):
 * these are view-only knobs for the strip-based practice stage.
 */

export type SplitPreset = "lane-heavy" | "balanced" | "canvas-heavy";

/** Canvas flex fraction (0..1) per preset; the lane takes the remainder. */
export const SPLIT_PRESETS: { value: SplitPreset; label: string; canvasFraction: number }[] = [
  { value: "lane-heavy", label: "Lane", canvasFraction: 0.38 },
  { value: "balanced", label: "Balanced", canvasFraction: 0.55 },
  { value: "canvas-heavy", label: "Canvas", canvasFraction: 0.72 },
];

/** Read-ahead depth (moves visible ahead) → StepStrip cell size (px). Sized up
 *  from the landing's 72px so the practice strip reads from across a room — a
 *  wide side-by-side column has room for big cells, and even depth 3 stays
 *  legible. Smaller depth = bigger cells = fewer moves ahead. */
export const READ_AHEAD_TO_CELL_SIZE: Record<number, number> = { 1: 120, 2: 96, 3: 72 };

export function cellSizeForReadAhead(depth: number): number {
  const clamped = Math.min(3, Math.max(1, Math.round(depth)));
  return READ_AHEAD_TO_CELL_SIZE[clamped]!;
}

export function canvasFractionFor(preset: SplitPreset): number {
  return SPLIT_PRESETS.find((p) => p.value === preset)?.canvasFraction ?? 0.38;
}

const STORAGE_KEY = "tka-practice-view";

interface PersistedPrefs {
  splitPreset: SplitPreset;
  readAheadDepth: number;
  metronomeEnabled: boolean;
  mirrorEnabled: boolean;
  /** The first-time coach lines have played on this device. */
  coachSeen: boolean;
}

function load(): PersistedPrefs {
  const fallback: PersistedPrefs = { splitPreset: "lane-heavy", readAheadDepth: 2, metronomeEnabled: false, mirrorEnabled: false, coachSeen: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedPrefs>;
    const depth = parsed.readAheadDepth;
    return {
      splitPreset: parsed.splitPreset ?? fallback.splitPreset,
      readAheadDepth: depth === 1 || depth === 2 || depth === 3 ? depth : fallback.readAheadDepth,
      metronomeEnabled: parsed.metronomeEnabled ?? fallback.metronomeEnabled,
      mirrorEnabled: parsed.mirrorEnabled ?? fallback.mirrorEnabled,
      coachSeen: parsed.coachSeen === true,
    };
  } catch {
    return fallback;
  }
}

/** One instance per practice surface. Default lane-heavy, read-ahead 2. */
export function createPracticeViewPrefs() {
  const initial = load();
  let splitPreset = $state<SplitPreset>(initial.splitPreset);
  let readAheadDepth = $state<number>(initial.readAheadDepth);
  let metronomeEnabled = $state<boolean>(initial.metronomeEnabled);
  let mirrorEnabled = $state<boolean>(initial.mirrorEnabled);
  let coachSeen = $state<boolean>(initial.coachSeen);

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ splitPreset, readAheadDepth, metronomeEnabled, mirrorEnabled, coachSeen }));
    } catch {
      // ignore storage errors
    }
  }

  return {
    get splitPreset() { return splitPreset; },
    get readAheadDepth() { return readAheadDepth; },
    get canvasFraction() { return canvasFractionFor(splitPreset); },
    get cellSize() { return cellSizeForReadAhead(readAheadDepth); },
    get metronomeEnabled() { return metronomeEnabled; },
    get mirrorEnabled() { return mirrorEnabled; },
    get coachSeen() { return coachSeen; },
    setSplitPreset(p: SplitPreset) { splitPreset = p; persist(); },
    setReadAheadDepth(d: number) { readAheadDepth = Math.min(3, Math.max(1, Math.round(d))); persist(); },
    setMetronomeEnabled(v: boolean) { metronomeEnabled = v; persist(); },
    setMirrorEnabled(v: boolean) { mirrorEnabled = v; persist(); },
    setCoachSeen(v: boolean) { coachSeen = v; persist(); },
  };
}

export type PracticeViewPrefs = ReturnType<typeof createPracticeViewPrefs>;
