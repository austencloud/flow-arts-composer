import { t } from "$lib/shared/i18n/i18n.svelte.js";
import { LOOPComponent } from "$lib/features/create/generate/shared/domain/constants/loop-components";

const LABELS = {
  [LOOPComponent.ROTATED]: "generator_loop_rotated",
  [LOOPComponent.MIRRORED]: "create_deep_reflection",
  [LOOPComponent.FLIPPED]: "generator_loop_flipped",
  [LOOPComponent.SWAPPED]: "generator_loop_swapped",
  [LOOPComponent.INVERTED]: "generator_loop_inverted",
  [LOOPComponent.REWOUND]: "generator_loop_rewound",
} as const;

const DESCRIPTIONS = {
  [LOOPComponent.ROTATED]: "create_deep_loop_rotated_description",
  [LOOPComponent.MIRRORED]: "create_deep_loop_mirrored_description",
  [LOOPComponent.FLIPPED]: "create_deep_loop_flipped_description",
  [LOOPComponent.SWAPPED]: "create_deep_loop_swapped_description",
  [LOOPComponent.INVERTED]: "create_deep_loop_inverted_description",
  [LOOPComponent.REWOUND]: "create_deep_loop_rewound_description",
} as const;

export function loopComponentLabel(component: LOOPComponent): string {
  const key = LABELS[component as keyof typeof LABELS];
  return key ? t(key) : component;
}

export function loopComponentDescription(component: LOOPComponent): string {
  const key = DESCRIPTIONS[component as keyof typeof DESCRIPTIONS];
  return key ? t(key) : component;
}
