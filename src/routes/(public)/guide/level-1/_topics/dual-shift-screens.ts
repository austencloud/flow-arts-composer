/**
 * How the Type 1 Dual-Shifts guide page splits into screens. The same on
 * every window: one screen per mode in the record's order, each mode drawn
 * alone at the same size. Screen 1 also carries the lede and the link to the
 * Timing and Direction page, which holds the six-mode key (2026-10-28,
 * Austen: the key leaves the guide; the guide links to the explainer). The
 * sequence that switched between the two Quarter modes left the web page on
 * 2026-10-31 for a later sequencing page; the print sheet keeps it.
 */
import {
  DUAL_SHIFT_MODES,
  type DualShiftModeId,
} from "#lib/shared/guide-topics/dual-shifts-topic.js";

/** One mode's loop. */
export type DualShiftView = { kind: "mode"; mode: DualShiftModeId };

export type DualShiftScreens = { views: DualShiftView[]; labels: string[] };

/**
 * The screens and each screen's pill label. `name` gives a mode's display
 * name (the page passes its translated name).
 */
export function dualShiftScreens(
  name: (id: DualShiftModeId) => string
): DualShiftScreens {
  const views: DualShiftView[] = DUAL_SHIFT_MODES.map((m) => ({
    kind: "mode" as const,
    mode: m.id,
  }));
  return { views, labels: views.map((v) => name(v.mode)) };
}

/** The 1-based `?screen=` number of a mode's screen. */
export function dualShiftScreenNumber(id: DualShiftModeId): number {
  return dualShiftScreens(String).views.findIndex((v) => v.mode === id) + 1;
}
