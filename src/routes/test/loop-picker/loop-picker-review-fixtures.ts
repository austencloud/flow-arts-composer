import type { LOOPOption } from "$lib/features/create/shared/services/loop-validator";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";

// These match LOOPValidator's production labels and descriptions. Keeping the
// review routes on one fixture set prevents a compact drawer from being judged
// against shorter placeholder copy than the real picker has to carry.
function option(
  loopType: LOOPType,
  name: string,
  description: string
): LOOPOption {
  return { loopType, name, description, icon: "" };
}

export const LOOP_REVIEW_OPTIONS = {
  swapped: option(LOOPType.SWAPPED, "Swapped", "Swaps left and right props"),
  inverted: option(LOOPType.INVERTED, "Inverted", "Inverts motion directions"),
  swappedInverted: option(
    LOOPType.SWAPPED_INVERTED,
    "Swapped / Inverted",
    "Swaps colors with inverted motion"
  ),
  rewound: option(
    LOOPType.STRICT_REWOUND,
    "Rewound",
    "Appends reversed sequence to double length"
  ),
  rotated: option(
    LOOPType.ROTATED,
    "Rotated",
    "Rotates placements around the grid"
  ),
  mirrored: option(
    LOOPType.MIRRORED,
    "Mirrored",
    "Mirrors placements vertically"
  ),
} satisfies Record<string, LOOPOption>;

export const COMPACT_LOOP_REVIEW_OPTIONS = [
  LOOP_REVIEW_OPTIONS.swapped,
  LOOP_REVIEW_OPTIONS.inverted,
  LOOP_REVIEW_OPTIONS.swappedInverted,
  LOOP_REVIEW_OPTIONS.rewound,
];
