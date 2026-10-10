/**
 * Plain-open prop-follow policy (spec 2026-08-23-viewer3d-intro-presets).
 *
 * A PLAIN 3D open (no saved preset applied) restores structure — performer
 * count, formation, camera, effects — but props follow the CURRENT app prop.
 * A PRESET-SOURCED open (applyScene3DLook ran) restores everything verbatim.
 *
 * Pure functions; the runes state consumes them at hydrate time.
 */
import type { GridJoin } from "@tka/tka-types";

/** Structural mirror of viewer-3d-state's StoredPerformerSettings. */
export interface PlainOpenPerformerSettings {
  prop: string | null;
  effortId: string | null;
  effect: string | null;
  staffLengthCm: number | null;
  gridJoin?: GridJoin | null;
}

export function resolvePlainOpenPerformerSettings(
  settings: PlainOpenPerformerSettings | undefined,
  presetSourced: boolean
): PlainOpenPerformerSettings | undefined {
  if (!settings) return undefined;
  if (presetSourced) return settings;
  return {
    ...settings,
    // Prop identity and its size override follow the app on plain opens.
    prop: null,
    staffLengthCm: null,
  };
}

export function resolveInitialDefaultProp(args: {
  presetSourced: boolean;
  appProp: string | null | undefined;
  persistedProp: string;
}): string {
  if (!args.presetSourced && args.appProp) return args.appProp;
  return args.persistedProp;
}
