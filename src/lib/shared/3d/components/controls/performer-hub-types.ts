import type { PropBuild } from "@austencloud/scene-3d";
import type { CharacterId } from "$lib/shared/3d/domain/character-model";
import type { EffectType } from "$lib/shared/effects/domain/effects-config";
import type { EffortId } from "$lib/shared/effort/domain/effort-types";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

export type PerformerHubTab =
  | "prop"
  | "planes"
  | "effort"
  | "effects"
  | "character"
  | "sequence";

/**
 * One parameter change the hub would otherwise have written straight onto a
 * performer.
 *
 * `performerIndex` is null in All-Performers mode, which means every performer
 * in the current scope.
 */
export type PerformerHubEdit =
  | PerformerHubEditBase<"characterId", CharacterId>
  | PerformerHubEditBase<"prop", PropType>
  // Only the parts a control changed; the host merges them into each
  // performer's stored build so untouched parts keep following the scene.
  | PerformerHubEditBase<"propBuild", Partial<PropBuild>>
  | PerformerHubEditBase<"effort", EffortId>
  | PerformerHubEditBase<"staffLengthCm", number>
  | PerformerHubEditBase<"effect", EffectType>;

type PerformerHubEditBase<Field extends string, Value> = {
  /** Compatibility primary. null means an All scope for older hosts. */
  performerIndex: number | null;
  /** Ordered exact scope for hosts that support arbitrary multi-selection. */
  performerIndices?: readonly number[];
  field: Field;
  value: Value;
};

/**
 * A host that owns performer state itself.
 *
 * The Director's performers are a projection of its film document, so a
 * mutation written onto the manager is discarded the next time that document
 * applies. A host that supplies this sink receives the change instead and
 * decides how to persist it; the hub does not touch the manager for any field
 * the sink accepts. Returning false means the host rejected the edit and the
 * hub should leave its own state alone.
 */
export type PerformerEditSink = (edit: PerformerHubEdit) => boolean;
