import { t } from "$lib/shared/i18n/i18n.svelte";
import type { TranslationKey } from "$lib/shared/i18n/i18n-types";

const labels: Record<string, TranslationKey> = {
  Warm: "settings_avatar_gradient_warm",
  Cool: "settings_avatar_gradient_cool",
  Vibrant: "settings_avatar_gradient_vibrant",
  Earth: "settings_avatar_gradient_earth",
  Dark: "settings_avatar_gradient_dark",
  Sunset: "settings_avatar_gradient_sunset",
  Ember: "settings_avatar_gradient_ember",
  Autumn: "settings_avatar_gradient_autumn",
  Coral: "settings_avatar_gradient_coral",
  Ocean: "settings_avatar_gradient_ocean",
  Twilight: "settings_avatar_gradient_twilight",
  Arctic: "settings_avatar_gradient_arctic",
  Mint: "settings_avatar_gradient_mint",
  Rainbow: "settings_avatar_gradient_rainbow",
  Neon: "settings_avatar_gradient_neon",
  Aurora: "settings_avatar_gradient_aurora",
  Cosmic: "settings_avatar_gradient_cosmic",
  Forest: "settings_avatar_gradient_forest",
  Blossom: "settings_avatar_gradient_blossom",
  Lavender: "settings_avatar_gradient_lavender",
  Sand: "settings_avatar_gradient_sand",
  Midnight: "settings_avatar_gradient_midnight",
  Void: "settings_avatar_gradient_void",
  Shadow: "settings_avatar_gradient_shadow",
  Obsidian: "settings_avatar_gradient_obsidian",
  Celestial: "settings_avatar_gradient_celestial",
};

export function avatarGradientLabel(name: string): string {
  const key = labels[name];
  return key ? t(key) : name;
}
