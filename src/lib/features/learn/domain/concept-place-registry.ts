import {
  getConceptById,
  getConceptsByLevel,
  type KnowledgeConcept,
  type MajorLevel,
} from "@tka/domain";
import type { GameId } from "../play/domain/arcade-types";

export interface LessonReference {
  lessonId: string;
  label: string;
  coverage: "focused" | "partial";
}

export interface GuideReference {
  slug: string;
  label: string;
  coverage: "focused" | "partial";
}

export interface DestinationReference {
  href: string;
  label: string;
}

export interface PracticeReference {
  gameId: GameId;
  label: string;
  reviewStatus: "candidate" | "approved";
}

interface ConceptResourceBinding {
  lessonIds: LessonReference[];
  guideRefs: GuideReference[];
  exploration: DestinationReference | null;
  practice: PracticeReference[];
  applications: DestinationReference[];
}

export interface LearnConceptPlace extends ConceptResourceBinding {
  id: string;
  tkaLevel: MajorLevel;
  concept: KnowledgeConcept;
  prerequisites: string[];
}

const EMPTY_BINDING: ConceptResourceBinding = {
  lessonIds: [],
  guideRefs: [],
  exploration: null,
  practice: [],
  applications: [],
};

/**
 * Relationships only. The referenced lesson, Guide, game, Atlas, and Composer
 * remain the owners of their content and behavior.
 */
export const CONCEPT_RESOURCE_BINDINGS: Readonly<
  Partial<Record<string, ConceptResourceBinding>>
> = {
  "1.1": {
    lessonIds: [
      { lessonId: "grid", label: "The Grid lesson", coverage: "focused" },
    ],
    guideRefs: [{ slug: "the-grid", label: "The Grid", coverage: "focused" }],
    exploration: null,
    practice: [],
    applications: [],
  },
  "1.2": {
    lessonIds: [
      {
        lessonId: "hand-positions",
        label: "Hand Positions lesson",
        coverage: "focused",
      },
    ],
    guideRefs: [
      {
        slug: "hand-positions",
        label: "Hand Positions",
        coverage: "focused",
      },
    ],
    exploration: null,
    practice: [],
    applications: [],
  },
  "1.3": {
    lessonIds: [
      {
        lessonId: "hand-motions-intro",
        label: "Hand Motions lesson",
        coverage: "focused",
      },
      {
        lessonId: "timing-and-direction",
        label: "Timing and Direction lesson",
        coverage: "focused",
      },
      {
        lessonId: "reading-choreo-cards",
        label: "Reading a Choreo Card lesson",
        coverage: "focused",
      },
    ],
    guideRefs: [
      {
        slug: "hand-motions",
        label: "Hand Motions",
        coverage: "focused",
      },
    ],
    exploration: null,
    practice: [
      {
        gameId: "trace-paths",
        label: "Trace Paths",
        reviewStatus: "candidate",
      },
    ],
    applications: [],
  },
  "1.4": {
    lessonIds: [
      {
        lessonId: "rotation-direction",
        label: "Rotation Direction lesson",
        coverage: "focused",
      },
    ],
    guideRefs: [
      {
        slug: "staff-motions",
        label: "Staff Motions",
        coverage: "partial",
      },
    ],
    exploration: null,
    practice: [],
    applications: [],
  },
  "1.5": {
    lessonIds: [
      {
        lessonId: "type1-abc-ghi",
        label: "Type 1 letters lesson",
        coverage: "partial",
      },
    ],
    guideRefs: [
      { slug: "base-letters", label: "Base Letters", coverage: "partial" },
      { slug: "codex", label: "Letter Codex", coverage: "focused" },
    ],
    exploration: {
      href: "/atlas?board=atlas#cat-letter",
      label: "Open the Letter Atlas",
    },
    practice: [
      {
        gameId: "pictograph-to-letter",
        label: "Name That Pictograph",
        reviewStatus: "candidate",
      },
      {
        gameId: "letter-to-pictograph",
        label: "Picture This",
        reviewStatus: "candidate",
      },
    ],
    applications: [{ href: "/create", label: "Open Composer" }],
  },
  "1.6": {
    lessonIds: [],
    guideRefs: [
      {
        slug: "staff-positions",
        label: "Staff Positions",
        coverage: "partial",
      },
    ],
    exploration: null,
    practice: [],
    applications: [],
  },
};

function toPlace(concept: KnowledgeConcept): LearnConceptPlace {
  const resources = CONCEPT_RESOURCE_BINDINGS[concept.id] ?? EMPTY_BINDING;
  return {
    id: concept.id,
    tkaLevel: concept.level,
    concept,
    prerequisites: [...concept.prerequisites],
    lessonIds: [...resources.lessonIds],
    guideRefs: [...resources.guideRefs],
    exploration: resources.exploration,
    practice: [...resources.practice],
    applications: [...resources.applications],
  };
}

export function getConceptPlace(id: string): LearnConceptPlace | undefined {
  const concept = getConceptById(id);
  return concept ? toPlace(concept) : undefined;
}

export function getConceptPlaceIdForLesson(lessonId: string): string | null {
  for (const [placeId, binding] of Object.entries(CONCEPT_RESOURCE_BINDINGS)) {
    if (binding?.lessonIds.some((lesson) => lesson.lessonId === lessonId)) {
      return placeId;
    }
  }
  return null;
}

export function getConceptPlacesByLevel(
  level: MajorLevel
): LearnConceptPlace[] {
  return getConceptsByLevel(level).map(toPlace);
}

export function getApprovedPractice(
  place: LearnConceptPlace
): PracticeReference[] {
  return place.practice.filter(
    (reference) => reference.reviewStatus === "approved"
  );
}
