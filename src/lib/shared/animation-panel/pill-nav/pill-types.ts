import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";

/**
 * Pill-nav contract for AnimationPanel.
 *
 * PILL_ORDER is the single source of truth for which pills exist and
 * the order they render. PillId is derived from it so the two cannot
 * drift - adding a pill in only one place is a compile error.
 */

export const PILL_ORDER = [
  "grid",
  "layers",
  "props",
  "effects",
  // Sidebar-only composite of effort + playback. Both are motion behavior —
  // how fast each step runs and what shape the hands travel — so one page can
  // carry them under one honest name. The individual ids survive for the
  // mobile dock, which shows one tray at a time and cannot take the merged
  // height. Display is deliberately NOT part of this: what the canvas draws is
  // a separate concept, and folding it in put visibility toggles under a
  // heading that claimed they were motion.
  "motion",
  "effort",
  "playback",
  "display",
  "export",
] as const;

export type PillId = (typeof PILL_ORDER)[number];

export interface PillSpec {
  id: PillId;
  /** Uppercase short label (≤8 chars), e.g. "EFFECTS". */
  label: string;
  /** FontAwesome class, e.g. "fa-wand-magic-sparkles". Optional - Effort uses a color dot instead. */
  icon?: string;
  /** Live prop artwork for the Props destination. Takes precedence over icon. */
  propType?: PropType;
  fanAppearance?: FanAppearance;
  /** Live one-line summary of the section's current state, ≤24 chars (truncated with ellipsis if longer). */
  summary: string;
  /** Optional accent color override. Effort sets this to its color so the active glow matches. */
  accentColor?: string;
}

/**
 * Build the ordered PillSpec array from a PillId-keyed partial record.
 * Only pills present in the record are included in the output.
 * Ordering follows `order` (defaults to PILL_ORDER). A consumer that wants a
 * different rail order — e.g. surfacing Effects first — passes its own order
 * built from PILL_ORDER's ids, so the two still cannot drift on membership.
 */
/** The two sections the sidebar's Motion page merges. */
export const MOTION_PARTS = ["effort", "playback"] as const;

/**
 * The rail's membership, which changes at runtime: every sidebar merges the
 * two motion sections into one page, so two surfaces side by side always agree
 * on what the panel contains. The mobile dock keeps them as separate trays,
 * where one tall merged tray would not fit. Display rides along unmerged in
 * both modes — it is its own concept and gets its own pill everywhere.
 */
export function animationPillOrder(motionMerged: boolean): readonly PillId[] {
  return motionMerged
    ? (["effects", "props", "motion", "display", "export"] as const)
    : (["effects", "props", ...MOTION_PARTS, "display", "export"] as const);
}

/**
 * Map a remembered or currently-active pill onto one the rail actually offers.
 *
 * Both directions matter, because membership changes while the panel is
 * mounted — a shell that flips sidebar/bottom on resize, a rail that crosses
 * the merge width, or a pill persisted before the Motion page existed. Callers
 * resolve at render time rather than correcting afterwards, so a section the
 * rail no longer offers is never rendered even for one frame.
 */
export function resolveActivePill(
  active: PillId | null,
  availableIds: readonly PillId[]
): PillId | null {
  if (!active) return null;
  if (availableIds.includes(active)) return active;
  const parts = MOTION_PARTS as readonly PillId[];
  // Merging sends the parts to Motion; unmerging sends Motion back to the
  // first part the rail offers. A part the host leaves out (Playback beside a
  // canvas with its own transport) goes to the part that is left. A remembered
  // "display" needs neither hop — it is a member of the rail in both modes.
  if (parts.includes(active)) {
    if (availableIds.includes("motion")) return "motion";
    return (
      availableIds.find((id) => parts.includes(id)) ?? availableIds[0] ?? null
    );
  }
  if (active === "motion") {
    return (
      availableIds.find((id) => parts.includes(id)) ?? availableIds[0] ?? null
    );
  }
  return availableIds.includes("effects")
    ? "effects"
    : (availableIds[0] ?? null);
}

export function buildPillSpecs(
  specs: Partial<Record<PillId, Omit<PillSpec, "id">>>,
  order: readonly PillId[] = PILL_ORDER
): PillSpec[] {
  return order.filter((id) => id in specs).map((id) => ({ id, ...specs[id]! }));
}
