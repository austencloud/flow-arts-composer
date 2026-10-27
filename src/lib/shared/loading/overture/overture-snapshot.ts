/**
 * The Overture's warm-boot scene: the sequence the user was working on,
 * compacted so the boot worker can trace it without the geometry calculator.
 *
 * Written after `ready` (idle) and again on pagehide, never during boot;
 * read by the inline boot script as a raw string (src/app.html via
 * overture-boot.js) and validated in the worker. The calculator is imported
 * here, so callers load this module lazily.
 *
 * Design: docs/superpowers/specs/2026-10-26-boot-overture-design.md
 */
import type {
  MandalaPaths,
  MandalaPoint,
  SVGPathData,
} from "#lib/shared/mandala/domain/mandala-types.js";
import { calculate } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import type { StepLike } from "#lib/shared/mandala/services/types.js";
import {
  simplifyRepeatedWord,
  splitIntoLetterUnits,
} from "#lib/shared/foundation/utils/word-simplifier.js";
import { isVisibleMotion } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  cumulativeLengths,
  isOvertureScene,
  type OverturePoint,
  type OvertureScene,
} from "./overture-trace";

export const OVERTURE_SNAPSHOT_KEY = "tka-overture";
export const OVERTURE_POINTS_PER_BEAT = 24;

export type OvertureSnapshot = OvertureScene & { at: number };

/** What the writer needs from a sequence. */
export interface OvertureSource {
  word?: string;
  steps?: readonly StepLike[];
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** `count` points spaced evenly by arc length along one beat, ends kept. */
function resampleBeat(
  points: readonly MandalaPoint[],
  count: number
): OverturePoint[] {
  const pts: OverturePoint[] = points.map((p) => [p.x, p.y]);
  const cum = cumulativeLengths(pts);
  const total = cum[cum.length - 1]!;
  const out: OverturePoint[] = [];
  let j = 1;
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1);
    while (j < pts.length - 1 && cum[j]! < target) j++;
    const seg = cum[j]! - cum[j - 1]!;
    const f =
      seg > 0 ? Math.min(1, Math.max(0, (target - cum[j - 1]!) / seg)) : 0;
    const a = pts[j - 1]!;
    const b = pts[j]!;
    out.push([
      round1(a[0] + (b[0] - a[0]) * f),
      round1(a[1] + (b[1] - a[1]) * f),
    ]);
  }
  out[0] = [round1(pts[0]![0]), round1(pts[0]![1])];
  out[count - 1] = [
    round1(pts[pts.length - 1]![0]),
    round1(pts[pts.length - 1]![1]),
  ];
  return out;
}

/**
 * One tip path as a single polyline: each beat resampled to 24 points by arc
 * length, adjacent beats sharing their junction point, so every beat has the
 * same number of segments (the trace reads beat timing from that).
 */
function compactPath(path: SVGPathData, beats: number): OverturePoint[] | null {
  if (!path.beats || path.beats.length !== beats) return null;
  const out: OverturePoint[] = [];
  for (let b = 0; b < beats; b++) {
    const beat = path.beats[b]!;
    if (beat.length < 2) return null;
    const sampled = resampleBeat(beat, OVERTURE_POINTS_PER_BEAT);
    out.push(...(b === 0 ? sampled : sampled.slice(1)));
  }
  return out;
}

/** Compacts calculator paths; null when any path lacks its per-beat points. */
export function compactPaths(
  paths: MandalaPaths,
  beats: number
): { left: OverturePoint[][]; right: OverturePoint[][] } | null {
  const left: OverturePoint[][] = [];
  const right: OverturePoint[][] = [];
  for (const path of paths.left) {
    const compact = compactPath(path, beats);
    if (!compact) return null;
    left.push(compact);
  }
  for (const path of paths.right) {
    const compact = compactPath(path, beats);
    if (!compact) return null;
    right.push(compact);
  }
  return left.length + right.length > 0 ? { left, right } : null;
}

/**
 * Beats in the repeating unit: the simplified word's length, kept only when
 * the letters really repeat with that period (a mirrored word like ABBA
 * simplifies to AB but does not repeat it).
 */
export function repeatingUnit(
  word: string,
  letters: readonly string[]
): number {
  const beats = letters.length;
  const simplified = simplifyRepeatedWord(word);
  if (!simplified || simplified === word) return beats;
  const unit = splitIntoLetterUnits(simplified).length;
  if (unit < 1 || unit >= beats || beats % unit !== 0) return beats;
  return letters.every((letter, i) => letter === letters[i % unit])
    ? unit
    : beats;
}

/** A sequence through the real calculator to a compact scene, or null. */
export function buildOvertureScene(
  source: OvertureSource,
  id?: string
): OvertureScene | null {
  const steps = (source.steps ?? []).filter(
    (s) => isVisibleMotion(s.motions?.left) || isVisibleMotion(s.motions?.right)
  );
  if (steps.length === 0) return null;
  const compact = compactPaths(calculate(source.steps ?? []), steps.length);
  if (!compact) return null;
  const letters = steps.map((s) =>
    String((s as { letter?: unknown }).letter ?? "")
  );
  const word = source.word || letters.join("");
  const scene: OvertureScene = {
    v: 1,
    ...(id ? { id } : {}),
    word,
    letters,
    unit: repeatingUnit(word, letters),
    beats: steps.length,
    left: compact.left,
    right: compact.right,
  };
  return isOvertureScene(scene) ? scene : null;
}

/** The stored snapshot, or null when absent, malformed or another version. */
export function readOvertureSnapshot(
  raw?: string | null
): OvertureSnapshot | null {
  try {
    const text =
      raw === undefined ? localStorage.getItem(OVERTURE_SNAPSHOT_KEY) : raw;
    if (!text) return null;
    const parsed: unknown = JSON.parse(text);
    if (!isOvertureScene(parsed)) return null;
    const at = (parsed as { at?: unknown }).at;
    return { ...parsed, at: typeof at === "number" ? at : 0 };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The writer
// ---------------------------------------------------------------------------

const CREATE_MODES = ["construct", "generate", "assemble", "spell"] as const;
const MIN_CREATE_BEATS = 4;

let viewed: OvertureSource | null = null;
// What the last write came from, so a repeat (idle, then pagehide) is free.
let lastWritten = "";

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++)
    h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return h;
}

/**
 * Create's working sequence, read from the copies Create itself persists
 * (`tka-<mode>-sequence-state-v1`, see dexie-persistence-service.ts): the
 * most recently saved mode with at least four beats.
 */
function createSequence(): OvertureSource | null {
  let best: { at: number; source: OvertureSource } | null = null;
  for (const mode of CREATE_MODES) {
    try {
      const raw = localStorage.getItem(`tka-${mode}-sequence-state-v1`);
      if (!raw) continue;
      const state = JSON.parse(raw) as {
        timestamp?: number;
        currentSequence?: { word?: string; steps?: StepLike[] } | null;
      };
      const sequence = state.currentSequence;
      const steps = sequence?.steps;
      if (!Array.isArray(steps) || steps.length < MIN_CREATE_BEATS) continue;
      const at = typeof state.timestamp === "number" ? state.timestamp : 0;
      if (!best || at > best.at)
        best = { at, source: { word: sequence?.word, steps } };
    } catch {
      /* A damaged copy is Create's to discard; skip it here. */
    }
  }
  return best?.source ?? null;
}

/** The sequence viewer reports what it opened; it stands in when Create has none. */
export function noteViewedSequence(source: OvertureSource): void {
  viewed = source;
}

/**
 * Stores the scene for the next boot's Overture. Create's working sequence
 * wins; otherwise the sequence last opened in the viewer this session;
 * otherwise nothing is written and any existing snapshot stays.
 */
export function writeOvertureSnapshot(source?: OvertureSource): boolean {
  try {
    const chosen = source ?? createSequence() ?? viewed;
    if (!chosen?.steps?.length) return false;
    const key = `${chosen.word ?? ""}|${hash(JSON.stringify(chosen.steps))}`;
    if (key === lastWritten) return true;
    const scene = buildOvertureScene(chosen);
    if (!scene) return false;
    localStorage.setItem(
      OVERTURE_SNAPSHOT_KEY,
      JSON.stringify({ ...scene, at: Date.now() })
    );
    lastWritten = key;
    return true;
  } catch {
    return false;
  }
}

let pagehideBound = false;

/**
 * Writes on idle now and again when the page is hidden, so an edit made this
 * session is what the next boot traces. Safe to call repeatedly.
 */
export function scheduleOvertureSnapshot(): void {
  if (typeof window === "undefined") return;
  const run = () => {
    writeOvertureSnapshot();
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 2000);
  }
  if (!pagehideBound) {
    pagehideBound = true;
    window.addEventListener("pagehide", run);
  }
}
