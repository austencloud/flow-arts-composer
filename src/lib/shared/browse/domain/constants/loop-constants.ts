/**
 * LOOP Component Constants
 * Defines the available LOOP transformation types with their display metadata
 */

import {
  LOOPComponent,
  type LOOPComponentInfo,
} from "#lib/shared/foundation/domain/models/generation/generate-models.js";

/**
 * Complete list of LOOP components with their display metadata
 * Used for UI rendering and user selection
 * Note: Descriptions are handled by LOOPExplanationTextGenerator service
 * Icons are Font Awesome icon names (without fa- prefix)
 * Colors and icons match LOOPIconStrip.svelte (the canonical mapping)
 */
export const LOOP_COMPONENTS: readonly LOOPComponentInfo[] = [
  {
    component: LOOPComponent.ROTATED,
    label: "Rotated",
    shortLabel: "Rotated",
    description: "Rotate around the grid center",
    icon: "rotate",
    color: "#36c3ff",
  },
  {
    component: LOOPComponent.MIRRORED,
    label: "Mirrored",
    shortLabel: "Mirrored",
    description: "Flip left-to-right like a mirror",
    icon: "left-right",
    color: "#6F2DA8",
  },
  {
    component: LOOPComponent.FLIPPED,
    label: "Flipped",
    shortLabel: "Flipped",
    description: "Flip top-to-bottom",
    icon: "up-down",
    color: "#6F2DA8",
  },
  {
    component: LOOPComponent.SWAPPED,
    label: "Swapped",
    shortLabel: "Swapped",
    description: "Exchange which hand does what",
    icon: "shuffle",
    color: "#2ecc71",
  },
  {
    component: LOOPComponent.INVERTED,
    label: "Inverted",
    shortLabel: "Inverted",
    description: "Transform motions to their opposites",
    icon: "adjust",
    color: "#eb7d00",
  },
  {
    component: LOOPComponent.REWOUND,
    label: "Rewound",
    shortLabel: "Rewound",
    description: "Play the sequence backward",
    icon: "backward",
    color: "#00bcd4",
  },
] as const;

/**
 * Lookup map: LOOPComponent -> LOOPComponentInfo
 * Useful for resolving icon/color from a component enum value
 */
export const LOOP_COMPONENT_MAP: ReadonlyMap<LOOPComponent, LOOPComponentInfo> =
  new Map(LOOP_COMPONENTS.map((info) => [info.component, info]));
