import type { PropBuild } from "@austencloud/scene-3d";
import type { GridJoin } from "@tka/tka-types";
import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
import type { EffectType } from "#lib/shared/effects/domain/effects-config.js";
import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

export type PerformerHubTab =
  | "prop"
  | "grid"
  | "planes"
  | "effort"
  | "effects"
  | "character"
  | "sequence";

/**
 * The seven performer tools, in the order the scene rail shows them. Each one
 * opens the performer panel on that tool; the phone sheet shows the same list
 * as tabs along its bottom edge.
 */
export const PERFORMER_TOOLS: readonly {
  id: PerformerHubTab;
  label: string;
  icon: string;
}[] = [
  { id: "character", label: "Character", icon: "fa-user" },
  { id: "sequence", label: "Sequence", icon: "fa-film" },
  { id: "prop", label: "Prop", icon: "fa-shapes" },
  { id: "grid", label: "Grid", icon: "fa-braille" },
  { id: "planes", label: "Planes", icon: "fa-layer-group" },
  { id: "effort", label: "Effort", icon: "fa-gauge-high" },
  { id: "effects", label: "Effects", icon: "fa-wand-sparkles" },
];

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
  | PerformerHubEditBase<"gridJoin", GridJoin | null | undefined>
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
