/**
 * How the Type 1 Dual-Shifts guide page splits into screens. The same on
 * every window: one screen per mode in the record's order, each mode drawn
 * alone at the same size, then the sequence that switches between the two
 * Quarter modes. Screen 1 also carries the lede and the link to the Timing
 * and Direction page, which holds the six-mode key (2026-10-28, Austen: the
 * key leaves the guide; the guide links to the explainer).
 */
import {
  DUAL_SHIFT_MODES,
  type DualShiftModeId,
} from "#lib/shared/guide-topics/dual-shifts-topic.js";

export type DualShiftView =
  /** One mode's loop. */
  | { kind: "mode"; mode: DualShiftModeId }
  /** The Quarter-Opp / Quarter-Same switching sequence and the closing lines. */
  | { kind: "switching" };

export type DualShiftScreens = { views: DualShiftView[]; labels: string[] };

/** The switching sequence's pill. */
export const SWITCHING_SCREEN_LABEL = "Switching";

/**
 * The screens and each screen's pill label. `name` gives a mode's display
 * name (the page passes its translated name).
 */
export function dualShiftScreens(
  name: (id: DualShiftModeId) => string
): DualShiftScreens {
  const views: DualShiftView[] = [
    ...DUAL_SHIFT_MODES.map((m) => ({ kind: "mode" as const, mode: m.id })),
    { kind: "switching" },
  ];
  const labels = views.map((v) =>
    v.kind === "mode" ? name(v.mode) : SWITCHING_SCREEN_LABEL
  );
  return { views, labels };
}

/** The 1-based `?screen=` number of a mode's screen. */
export function dualShiftScreenNumber(id: DualShiftModeId): number {
  return (
    dualShiftScreens(String).views.findIndex(
      (v) => v.kind === "mode" && v.mode === id
    ) + 1
  );
}
