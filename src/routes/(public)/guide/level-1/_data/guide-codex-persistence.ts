// Pure serialize/restore for the guide Codex page's durable view prefs.
// The page itself (GuideCodexPage.svelte) is the printable sheet - there is no
// letter/grid-mode selection anymore (that lived in the retired Explorer-style
// layout). What persists now is just the reader's two live controls: which
// prop family renders across the whole sheet, and which layers are visible.
// Kept separate from the $state factory (guide-codex-state.svelte.ts) so it's
// unit-testable without a Svelte runtime.

import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

export const GUIDE_CODEX_STORAGE_KEY = "guide-codex-view-prefs";
const GUIDE_CODEX_PREFS_VERSION = 4;

/** A turn count applied uniformly to every cell - 0 by default (the canonical
 *  base codex; letters.json bakes in 1, which the codex normalizes away).
 *  "fl" is float, matching the option picker's turns model. */
export type GuideCodexTurns = number | "fl";

/** Clamp/validate a restored turn value to the same range the steppers allow. */
export function normalizeGuideCodexTurns(v: unknown): GuideCodexTurns {
  if (v === "fl") return "fl";
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.max(0, Math.min(3, v));
  }
  return 0;
}

/** Prop families that actually render in the codex - see prop-type.ts. */
export const GUIDE_CODEX_PROP_TYPES = [
  PropType.STAFF,
  PropType.CLUB,
  PropType.BUUGENG,
  PropType.TRIAD,
  PropType.FAN,
  PropType.MINIHOOP,
  PropType.HAND,
] as const;

export interface GuideCodexVisibility {
  showGlyph: boolean;
  showGrid: boolean;
  showTKA: boolean;
  showPlacements: boolean;
  showReversals: boolean;
  showNonRadialPoints: boolean;
}

export interface GuideCodexPrefs {
  version: number;
  propType: PropType;
  visibility: GuideCodexVisibility;
  leftTurns: GuideCodexTurns;
  rightTurns: GuideCodexTurns;
}

/** Matches the printed sheet's hardcoded defaults exactly (grid + TKA glyph
 *  visible; the elemental/TnD glyph, positions, reversals and non-radial
 *  markers hidden) - so switching into the reader shows the identical sheet
 *  before the user touches a single control. */
export function defaultGuideCodexVisibility(): GuideCodexVisibility {
  return {
    showGlyph: false,
    showGrid: true,
    showTKA: true,
    showPlacements: false,
    showReversals: false,
    showNonRadialPoints: false,
  };
}

export function defaultGuideCodexPrefs(): GuideCodexPrefs {
  return {
    version: GUIDE_CODEX_PREFS_VERSION,
    propType: PropType.STAFF,
    visibility: defaultGuideCodexVisibility(),
    leftTurns: 0,
    rightTurns: 0,
  };
}

export function serializeGuideCodexPrefs(prefs: GuideCodexPrefs): string {
  return JSON.stringify({ ...prefs, version: GUIDE_CODEX_PREFS_VERSION });
}

export function restoreGuideCodexPrefs(raw: string | null): GuideCodexPrefs {
  if (!raw) return defaultGuideCodexPrefs();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultGuideCodexPrefs();
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    ![3, GUIDE_CODEX_PREFS_VERSION].includes(
      (parsed as { version?: number }).version ?? -1
    )
  ) {
    return defaultGuideCodexPrefs();
  }
  const p = parsed as Partial<GuideCodexPrefs> & {
    blueTurns?: GuideCodexTurns;
    redTurns?: GuideCodexTurns;
  };
  const d = defaultGuideCodexPrefs();
  const propType = (GUIDE_CODEX_PROP_TYPES as readonly PropType[]).includes(
    p.propType as PropType
  )
    ? (p.propType as PropType)
    : d.propType;
  return {
    version: GUIDE_CODEX_PREFS_VERSION,
    propType,
    visibility: { ...d.visibility, ...(p.visibility ?? {}) },
    leftTurns: normalizeGuideCodexTurns(p.leftTurns ?? p.blueTurns),
    rightTurns: normalizeGuideCodexTurns(p.rightTurns ?? p.redTurns),
  };
}
