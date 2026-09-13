/**
 * Viewer URL state codec — owns the param names and the headline/blob split
 * for full-state viewer links.
 * Spec: docs/superpowers/specs/2026-08-30-viewer-url-addressable-state-design.md
 *
 * Headline params (`pane`, `split`, `fx`, `cols`) are canonical for their
 * fields; the compressed `s` blob carries everything else and never
 * duplicates a headline value. `?v=` (sequence identity) is NOT owned here.
 */
import {
  compressForURL,
  decompressFromURL,
} from "$lib/shared/navigation/services/sequence-codec";
// The param names live in their own dependency-free module so the root layout's
// url-parameter-policy can read them without pulling this codec's fflate
// compression stack onto every route's hydration path. Re-exported below so
// existing importers keep working.
import { VIEWER_STATE_PARAM_NAMES } from "./viewer-url-state-params";

export type SliceId = "vw" | "fx" | "an" | "ex" | "t3" | "cd" | "tn" | "ps";
export type SlicePayloads = Partial<Record<SliceId, unknown>>;

const BLOB_SLICE_IDS: readonly SliceId[] = ["fx", "an", "ex", "t3", "cd", "tn", "ps"];

export { VIEWER_STATE_PARAM_NAMES };

export interface ViewerUrlParamPatch {
  set: Record<string, string>;
  remove: string[];
}

interface VwPayload {
  mode?: string;
  split?: { leftPane: string; rightPane: string };
}
interface FxPayload {
  active?: string;
  tuning?: Record<string, unknown>;
}
interface CdPayload {
  cols?: number;
  rest?: Record<string, unknown>;
}

export function encodeViewerStateParams(slices: SlicePayloads): ViewerUrlParamPatch {
  const set: Record<string, string> = {};
  const blob: Record<string, unknown> = {};

  const vw = slices.vw as VwPayload | undefined;
  if (vw?.mode) set.pane = vw.mode;
  if (vw?.split) set.split = `${vw.split.leftPane},${vw.split.rightPane}`;

  const fx = slices.fx as FxPayload | undefined;
  if (fx?.active) set.fx = fx.active;
  if (fx?.tuning && Object.keys(fx.tuning).length > 0) blob.fx = fx.tuning;

  const cd = slices.cd as CdPayload | undefined;
  if (cd?.cols != null) set.cols = String(cd.cols);
  if (cd?.rest && Object.keys(cd.rest).length > 0) blob.cd = cd.rest;

  for (const id of BLOB_SLICE_IDS) {
    if (id === "fx" || id === "cd") continue;
    const payload = slices[id];
    if (payload != null) blob[id] = payload;
  }

  if (Object.keys(blob).length > 0) {
    set.s = compressForURL(JSON.stringify({ sv: 1, ...blob }));
  }

  const remove = VIEWER_STATE_PARAM_NAMES.filter((name) => !(name in set));
  return { set, remove };
}

export function decodeViewerStateParams(params: URLSearchParams): SlicePayloads {
  const slices: SlicePayloads = {};

  let blob: Record<string, unknown> = {};
  const s = params.get("s");
  if (s) {
    try {
      const parsed = JSON.parse(decompressFromURL(s)) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") blob = parsed;
    } catch {
      // Corrupt blob: tolerated per spec — headline params still apply.
    }
  }

  const vw: VwPayload = {};
  const vm = params.get("pane");
  if (vm) vw.mode = vm;
  const split = params.get("split");
  if (split) {
    const [leftPane, rightPane] = split.split(",");
    if (leftPane && rightPane) vw.split = { leftPane, rightPane };
  }
  if (Object.keys(vw).length > 0) slices.vw = vw;

  const fx: FxPayload = {};
  const active = params.get("fx");
  if (active) fx.active = active;
  if (blob.fx && typeof blob.fx === "object") {
    fx.tuning = blob.fx as Record<string, unknown>;
  }
  if (Object.keys(fx).length > 0) slices.fx = fx;

  const cd: CdPayload = {};
  const cols = Number(params.get("cols"));
  if (Number.isInteger(cols) && cols > 0) cd.cols = cols;
  if (blob.cd && typeof blob.cd === "object") {
    cd.rest = blob.cd as Record<string, unknown>;
  }
  if (Object.keys(cd).length > 0) slices.cd = cd;

  for (const id of BLOB_SLICE_IDS) {
    if (id === "fx" || id === "cd") continue;
    if (blob[id] != null) slices[id] = blob[id];
  }

  return slices;
}

/** Structural equality; `undefined` properties are treated as absent. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const aKeys = Object.keys(a as object).filter(
    (k) => (a as Record<string, unknown>)[k] !== undefined
  );
  const bKeys = Object.keys(b as object).filter(
    (k) => (b as Record<string, unknown>)[k] !== undefined
  );
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
  );
}
