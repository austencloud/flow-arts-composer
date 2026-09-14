import type { Component } from "svelte";
import type { ExperienceViewMode, LearnConcept } from "./types";
import { TKA_CONCEPTS } from "./concepts";

interface ConceptExperienceProps {
  viewMode?: ExperienceViewMode;
  onComplete?: (nextConceptId?: string) => void;
  onBack?: () => void;
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
    conceptId: "hand-positions",
    guideSlug: "hand-positions",
    guideLabel: "Hand Positions",
    reviewStatus: "built",
    load: () =>
      import("../components/interactive/positions/PositionsConceptExperience.svelte"),
  }),
  experience({
    conceptId: "hand-motions-intro",
    guideSlug: "hand-motions",
    guideLabel: "Hand Motions",
    reviewStatus: "built",
    load: () =>
      import("../components/interactive/motions/MotionsConceptExperience.svelte"),
  }),
  experience({
    conceptId: "timing-and-direction",
    guideSlug: "hand-motions",
    guideLabel: "Hand Motions",
    reference: {
      href: "/timing-and-direction",
      label: "Timing and Direction",
    },
    reviewStatus: "built",
    load: () =>
      import("../components/interactive/motions/TimingDirectionConceptExperience.svelte"),
  }),
  experience({
    conceptId: "reading-choreo-cards",
    guideSlug: "hand-motions",
    guideLabel: "Hand Motions",
    reviewStatus: "built",
    load: () =>
      import("../components/interactive/cards/ReadingChoreoCardsConceptExperience.svelte"),
  }),
  experience({
    conceptId: "rotation-direction",
    guideSlug: "staff-motions",
    guideLabel: "Staff Motions: Prospin and Antispin",
    reviewStatus: "built",
    load: () =>
      import("../components/interactive/rotation/RotationDirectionConceptExperience.svelte"),
  }),
  experience({
    conceptId: "dual-shifts-alpha-beta",
    guideSlug: "hm-type1",
    guideLabel: "Type 1 Dual-Shifts: Alpha and Beta",
    reviewStatus: "built",
    load: () =>
      import("../components/interactive/foundations/DualShiftsConceptExperience.svelte"),
  }),
  experience({
    conceptId: "gamma-motion",
    guideSlug: "hm-gamma",
    guideLabel: "Gamma: Quarter-Opp and Quarter-Same",
    reviewStatus: "built",
    load: () =>
      import("../components/interactive/foundations/GammaMotionConceptExperience.svelte"),
  }),
  experience({
    conceptId: "staff-positions",
    guideSlug: "staff-positions",
    guideLabel: "Staff Positions and Rotations",
    reviewStatus: "built",
    load: () =>
      import("../components/interactive/staff/StaffConceptExperience.svelte"),
  }),
  experience({
    conceptId: "letter-codex-intro",
    guideSlug: "codex",
    guideLabel: "Codex",
    reviewStatus: "built",
    load: () =>
      import("../components/interactive/foundations/PictographAnatomyConceptExperience.svelte"),
  }),
  experience({
    conceptId: "type1-abc-ghi",
    guideSlug: "lt1-abc-ghi",
    guideLabel: "Type 1: ABC and GHI",
    reviewStatus: "built",
    load: () =>
      import("../components/interactive/letters/type1/Type1ConceptExperience.svelte"),
  }),
  experience({
    conceptId: "words-alpha-beta",
    guideSlug: "words",
    guideLabel: "Words",
    reviewStatus: "built",
    load: () =>
      import("../components/interactive/words/WordsConceptExperience.svelte"),
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
