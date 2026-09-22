import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { EffortTimeline } from "$lib/shared/effort/domain/effort-timeline-types";
import type { PresentationIntent } from "./presentation-intent";

export interface CreatorIntent {
  /** Prop pair the creator recorded for presentation. Optional: an intent may
   * carry only an effort timeline. Absent means "no prop intent recorded" —
   * never substitute a default here; display falls back to viewer context. */
  readonly propConfig?: {
    readonly leftPropType: PropType;
    readonly rightPropType: PropType;
    readonly catDogMode: boolean;
  };
  readonly effortTimeline?: EffortTimeline | null;
  /**
   * Visual presentation the creator saved with. Three states:
   *   undefined  never recorded (legacy or private working save)
   *   null       creator chose the default look explicitly
   *   object     recorded snapshot
   * Absent and null both render neutral. Only absent triggers publish-moment
   * capture. Never substitute viewer settings here.
   */
  readonly presentation?: PresentationIntent | null;
}
