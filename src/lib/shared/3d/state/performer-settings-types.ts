import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { Plane, PlaneMode, type PropBuild } from "@austencloud/scene-3d";
import type { EffectType } from "#lib/shared/effects/domain/effects-config.js";
import type { GridJoin } from "@tka/tka-types";

export interface DefaultPerformerSettings {
  prop: PropType;
  effortId: EffortId;
  planeMode: PlaneMode;
  customLeftPlane: Plane;
  customRightPlane: Plane;
}

export interface PerformerSettings {
  effortId: EffortId | null;
  prop: PropType | null;
  /**
   * Single active per-performer effect (the canonical EffectType, one at a
   * time). `null` = inherit the global default (config.tipEffectMap wildcard);
   * `"none"` = explicitly off; any other EffectType = that effect.
   */
  effect: EffectType | null;
  /**
   * One effect per hand, when the two differ. `null` means both hands take
   * `effect` above, which is the ordinary case and the only one that existed
   * before per-hand effects. The renderer already resolves an effect per prop
   * (`resolveEffect(propIndex, ...)`), so this only has to reach the tip map
   * that `Viewer3DScene` builds; left is prop 0, right is prop 1.
   */
  handEffects: { left: EffectType; right: EffectType } | null;
  staffLengthCm: number | null;
  propBuild: Partial<PropBuild> | null;
  /** Undefined follows the score; null explicitly uses one shared grid. */
  gridJoin?: GridJoin | null;
}

export type CascadeCategory = "prop" | "propBuild" | "effects" | "effort" | "planes";

export interface OverrideState {
  prop: boolean;
  propBuild: boolean;
  effects: boolean;
  effort: boolean;
  planes: boolean;
}

export function makeDefaultPerformerSettings(): PerformerSettings {
  return {
    effortId: null,
    prop: null,
    effect: null,
    handEffects: null,
    staffLengthCm: null,
    propBuild: null,
  };
}

/**
 * Standalone defaults for call sites that don't have a viewer-level defaults provider.
 * Used by museum, village, and other standalone avatar consumers.
 * Task 3 of the settings cascade plan wires up the viewer-level defaults;
 * this provides the same values as a fallback for standalone usage.
 */
export function makeStandaloneDefaults(): DefaultPerformerSettings {
  return {
    prop: PropType.STAFF,
    effortId: "linear" as EffortId,
    planeMode: PlaneMode.WALL,
    customLeftPlane: Plane.WALL,
    customRightPlane: Plane.WALL,
  };
}
