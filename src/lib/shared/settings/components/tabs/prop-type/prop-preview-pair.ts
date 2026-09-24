import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { PropPreset } from "../../../domain/app-settings";
import { heldProps } from "../../../domain/prop-presets";

/**
 * What a paired prop preview draws for a setup: which prop each hand holds and
 * which art is mirrored. Matches the picker tiles (PropGridButton): chirality
 * only mirrors the buugeng family, and the right bare hand is always the
 * mirror of the left.
 */
export function previewPair(setup: PropPreset): {
  left: PropType;
  right: PropType;
  leftFlipped: boolean;
  rightFlipped: boolean;
} {
  const held = heldProps(setup);
  return {
    ...held,
    rightFlipped: held.right === PropType.HAND || held.rightFlipped,
  };
}
