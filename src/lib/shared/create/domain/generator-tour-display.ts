import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";

export function generatorTourText(key: string, english: string): string {
  const translated = tDynamic(`create_tour_${key}`, { silent: true });
  return translated === `create_tour_${key}` ? english : translated;
}
