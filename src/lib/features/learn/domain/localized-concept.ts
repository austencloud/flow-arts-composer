import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
import type { LearnConcept } from "./types";

/** Localize displayed lesson metadata without changing curriculum identifiers. */
export function localizedConcept(
  concept: LearnConcept,
  field: "name" | "description"
): string {
  return tDynamic(`learn_concept_${concept.id.replaceAll("-", "_")}_${field}`);
}
