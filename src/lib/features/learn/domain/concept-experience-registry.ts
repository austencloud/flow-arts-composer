import type { Component } from "svelte";
import type { ExperienceViewMode, LearnConcept } from "./types";
import { TKA_CONCEPTS } from "./concepts";

interface ConceptExperienceProps {
  viewMode?: ExperienceViewMode;
  readingOpen?: boolean;
  onComplete?: (nextConceptId?: string) => void;
  onBack?: () => void;
  /** Go back to the lesson before this one, on the same live board. */
  onPrevious?: (conceptId: string) => void;
  /** The lesson the learner just came from, when they moved between two. */
  arrivedFrom?: string | null;
}

export type ConceptExperienceComponent = Component<ConceptExperienceProps>;

export interface ConceptExperienceDefinition {
  conceptId: string;
  guideSlug: string;
  guideLabel: string;
  reference?: { href: string; label: string };
  reviewStatus: "confirmed" | "built";
  load: () => Promise<{ default: ConceptExperienceComponent }>;
}

function experience(
  definition: ConceptExperienceDefinition
): ConceptExperienceDefinition {
  return definition;
}

/**
 * The lessons a learner can actually open today. Curriculum planning still
 * lives in concepts.ts, but this registry is the product truth for published
 * experiences. Cards, routes, and the lesson renderer all read this one list,
 * so a future lesson cannot appear available before its component exists.
 *
 * Only lessons Austen is confident in stay here. Timing and Direction,
 * Rotation Direction, Dual-Shifts, Gamma, Pictograph Anatomy, Type 1,
 * Reading a Choreo Card, Staff Placements and Words keep their components
 * in the codebase but are withdrawn until each is rebuilt to that standard. Re-adding an entry
 * republishes the lesson, its route, its Guide link and its sitemap entry.
 */
export const CONCEPT_EXPERIENCES = [
  experience({
    conceptId: "grid",
    guideSlug: "the-grid",
    guideLabel: "The Grid",
    reviewStatus: "confirmed",
    load: () =>
      import("../components/interactive/GridConceptExperience.svelte"),
  }),
  experience({
    conceptId: "hand-placements",
    guideSlug: "hand-placements",
    guideLabel: "Hand Placements",
    reviewStatus: "built",
    load: () =>
      import("../components/interactive/placements/PlacementsConceptExperience.svelte"),
  }),
  experience({
    conceptId: "hand-motions-intro",
    guideSlug: "hand-motions",
    guideLabel: "Hand Motions",
    reviewStatus: "built",
    load: () =>
      import("../components/interactive/motions/MotionsConceptExperience.svelte"),
  }),
] as const satisfies readonly ConceptExperienceDefinition[];

const byConceptId = new Map(
  CONCEPT_EXPERIENCES.map((definition) => [definition.conceptId, definition])
);

export function getConceptExperience(
  conceptId: string
): ConceptExperienceDefinition | undefined {
  return byConceptId.get(conceptId);
}

export function getConceptExperienceForGuideSlug(
  guideSlug: string
): ConceptExperienceDefinition | undefined {
  // A focused lesson can share its written reference with a broader lesson.
  // The Guide still opens the first, broader experience for that topic.
  return CONCEPT_EXPERIENCES.find((entry) => entry.guideSlug === guideSlug);
}

export function isConceptExperienceAvailable(conceptId: string): boolean {
  return byConceptId.has(conceptId);
}

export function getAvailableConcepts(): LearnConcept[] {
  return TKA_CONCEPTS.filter((concept) => byConceptId.has(concept.id));
}

const loadedExperiences = new Map<string, ConceptExperienceComponent>();
const pendingExperiences = new Map<
  string,
  Promise<ConceptExperienceComponent | undefined>
>();

/**
 * The lesson component if it has already loaded. Moving from one lesson to
 * the next renders in the same frame when the next one was preloaded, so the
 * learner never sees a loading gap between lessons.
 */
export function getLoadedConceptExperience(
  conceptId: string
): ConceptExperienceComponent | undefined {
  return loadedExperiences.get(conceptId);
}

export function loadConceptExperience(
  conceptId: string
): Promise<ConceptExperienceComponent | undefined> {
  const loaded = loadedExperiences.get(conceptId);
  if (loaded) return Promise.resolve(loaded);
  const pending = pendingExperiences.get(conceptId);
  if (pending) return pending;
  const definition = byConceptId.get(conceptId);
  if (!definition) return Promise.resolve(undefined);
  const request = definition
    .load()
    .then((module) => {
      loadedExperiences.set(conceptId, module.default);
      return module.default;
    })
    .finally(() => pendingExperiences.delete(conceptId));
  pendingExperiences.set(conceptId, request);
  return request;
}

/** The published lesson that follows this one, in curriculum order. */
export function getNextConceptExperience(
  conceptId: string
): ConceptExperienceDefinition | undefined {
  const index = CONCEPT_EXPERIENCES.findIndex(
    (entry) => entry.conceptId === conceptId
  );
  return index < 0 ? undefined : CONCEPT_EXPERIENCES[index + 1];
}
