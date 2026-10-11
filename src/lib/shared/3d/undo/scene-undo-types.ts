import type { EffectsConfig } from "#lib/shared/effects/domain/effects-config.js";
import type { Scene3DRenderConfig } from "../scene-features/state/scene-3d-render-state.svelte";
import type { FormationPreset } from "@austencloud/scene-3d";
import type { Plane } from "@austencloud/scene-3d";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
import type { EffectType } from "#lib/shared/effects/domain/effects-config.js";
import type { BackgroundType } from "@austencloud/backgrounds";
import type { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { SceneId } from "#lib/features/lab/tabs/scene-lab/domain/scene-lab-types.js";
import type { CosmicVariant } from "#lib/features/lab/tabs/scene-lab/services/scene-lab-persistence.js";
import type { PlaneMode } from "@austencloud/scene-3d";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { GridJoin } from "@tka/tka-types";
import type { CharacterId } from "../domain/character-model";

// Operation Types

export type SceneUndoOperationType =
  // Performer
  | "spawn-performer"
  | "remove-performer"
  | "apply-formation"
  | "spatial-edit"
  | "change-character"
  | "change-sequence"
  | "change-grid-join"
  | "change-prop"
  | "change-prop-build"
  | "change-staff-length"
  | "change-effort"
  // Effects
  | "toggle-effect"
  | "update-effect-config"
  | "apply-effect-preset"
  | "restore-custom-effect"
  | "reset-effect-default"
  | "reset-all-effects"
  | "set-active-effect"
  | "toggle-motion"
  // Scene
  | "change-environment"
  | "change-grid-mode"
  // Planes
  | "toggle-plane-visibility"
  | "set-hand-plane"
  | "set-beat-plane-override"
  | "toggle-grid-labels"
  // Visibility
  | "toggle-ui-visibility"
  // Defaults cascade
  | "change-default-prop"
  | "change-default-effort"
  | "change-default-effects"
  | "change-default-planes"
  | "reset-all-overrides"
  // Scene Lab
  | "change-scene-lab-scene"
  | "update-scene-lab-config"
  | "change-cosmic-variant";

// Snapshot Domains

export interface ViewerDomainSnapshot {
  performers: PerformerPositionSnapshot[];
  selectedPerformerIndex: number | null;
  /** Ordered edit scope. Optional only for snapshots created before multi-select. */
  selectedPerformerIndices?: number[];
  activeFormation: FormationPreset | "manual" | "custom";
}

export interface PerformerPositionSnapshot {
  id: string;
  position: { x: number; z: number };
  facingAngle: number;
  customLeftPlane: Plane;
  customRightPlane: Plane;
}

export interface PerformerDomainSnapshot {
  index: number;
  selectedPerformerIndex: number | null;
  characterId: CharacterId;
  displayName: string | null;
  loadedSequence: SequenceData | null;
  settings: {
    prop: PropType | null;
    effortId: EffortId | null;
    effect: EffectType | null;
    handEffects: { left: EffectType; right: EffectType } | null;
    staffLengthCm: number | null;
    propBuild: Partial<import("@austencloud/scene-3d").PropBuild> | null;
    gridJoin?: GridJoin | null;
  };
  planes: {
    customLeftPlane: Plane | null;
    customRightPlane: Plane | null;
    planeMode: PlaneMode | null;
    beatPlaneOverrides: Map<number, { left?: Plane; right?: Plane }>;
  };
}

export interface SceneDomainSnapshot {
  backgroundType: BackgroundType;
  gridMode: GridMode;
}

export interface VisibilityDomainSnapshot {
  visiblePlanes: Set<Plane>;
  showGridLabels: boolean;
}

export interface DefaultsDomainSnapshot {
  prop: PropType;
  effortId: EffortId;
  planeMode: PlaneMode;
  customLeftPlane: Plane;
  customRightPlane: Plane;
}

export interface SceneLabDomainSnapshot {
  sceneId: SceneId;
  cosmicVariant: CosmicVariant;
  configs: Record<string, unknown>;
}

// Composite Snapshot

export interface SceneUndoSnapshot {
  viewer?: ViewerDomainSnapshot;
  performer?: PerformerDomainSnapshot;
  effects?: EffectsConfig;
  motion?: Scene3DRenderConfig;
  scene?: SceneDomainSnapshot;
  visibility?: VisibilityDomainSnapshot;
  defaults?: DefaultsDomainSnapshot;
  sceneLab?: SceneLabDomainSnapshot;
}

// Undo Entry

export interface SceneUndoEntry {
  id: string;
  type: SceneUndoOperationType;
  timestamp: number;
  description: string;
  beforeState: SceneUndoSnapshot;
  afterState?: SceneUndoSnapshot;
  coalescingKey?: string;
  customRestore?: {
    undo: () => void;
    redo: () => void;
  };
}
