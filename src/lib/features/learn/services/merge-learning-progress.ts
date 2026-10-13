import type {
  ConceptProgress,
  ConceptStatus,
  LearningProgress,
} from "../domain/types";
import { TKA_CONCEPTS } from "../domain/concepts";

const rank: Record<ConceptStatus, number> = {
  locked: 0,
  available: 1,
  "in-progress": 2,
  completed: 3,
};

export const LEGACY_CONCEPT_ID_ALIASES: Readonly<Record<string, string>> = {
  "hand-positions": "hand-placements",
  "staff-positions": "staff-placements",
};

const time = (date?: Date) => date?.getTime() ?? 0;
const later = (a?: Date, b?: Date) => (time(a) >= time(b) ? a : b);
const earlier = (a?: Date, b?: Date) =>
  !a ? b : !b ? a : time(a) <= time(b) ? a : b;

function mergeConcept(a: ConceptProgress, b: ConceptProgress): ConceptProgress {
  const latest = time(a.updatedAt) >= time(b.updatedAt) ? a : b;
  const status = rank[a.status] >= rank[b.status] ? a.status : b.status;
  const correctAnswers = Math.max(a.correctAnswers, b.correctAnswers);
  const incorrectAnswers = Math.max(a.incorrectAnswers, b.incorrectAnswers);
  const totalAttempts = Math.max(
    a.totalAttempts,
    b.totalAttempts,
    correctAnswers + incorrectAnswers
  );
  return {
    ...latest,
    status,
    percentComplete:
      status === "completed"
        ? 100
        : Math.max(a.percentComplete, b.percentComplete),
    correctAnswers,
    incorrectAnswers,
    totalAttempts,
    accuracy: totalAttempts ? (correctAnswers / totalAttempts) * 100 : 0,
    currentStreak: latest.currentStreak,
    bestStreak: Math.max(a.bestStreak, b.bestStreak),
    timeSpentSeconds: Math.max(a.timeSpentSeconds, b.timeSpentSeconds),
    startedAt: earlier(a.startedAt, b.startedAt),
    completedAt: earlier(a.completedAt, b.completedAt),
    lastPracticedAt: later(a.lastPracticedAt, b.lastPracticedAt),
    updatedAt: later(a.updatedAt, b.updatedAt),
  };
}

/** Make the saved document agree with its lesson records and legacy IDs. */
export function normalizeLearningProgress(
  progress: LearningProgress
): LearningProgress {
  const concepts = new Map(progress.concepts);
  const completedConcepts = new Set(progress.completedConcepts);
  for (const [legacyId, currentId] of Object.entries(
    LEGACY_CONCEPT_ID_ALIASES
  )) {
    if (completedConcepts.delete(legacyId)) completedConcepts.add(currentId);
    const legacy = concepts.get(legacyId);
    if (legacy) {
      const canonical = { ...legacy, conceptId: currentId };
      const current = concepts.get(currentId);
      concepts.set(
        currentId,
        current ? mergeConcept(current, canonical) : canonical
      );
      concepts.delete(legacyId);
    }
  }
  for (const [id, record] of concepts)
    if (record.status === "completed") completedConcepts.add(id);
  for (const id of completedConcepts) {
    const record = concepts.get(id);
    if (record)
      concepts.set(id, {
        ...record,
        status: "completed",
        percentComplete: 100,
      });
    else
      concepts.set(id, {
        conceptId: id,
        status: "completed",
        percentComplete: 100,
        correctAnswers: 0,
        incorrectAnswers: 0,
        totalAttempts: 0,
        accuracy: 0,
        currentStreak: 0,
        bestStreak: 0,
        timeSpentSeconds: 0,
      });
  }
  const badges = new Set(progress.badges);
  for (const [category, badge] of [
    ["foundation", "foundation-master"],
    ["letters", "letter-master"],
    ["combinations", "combination-master"],
    ["advanced", "advanced-master"],
  ] as const) {
    if (
      TKA_CONCEPTS.filter((concept) => concept.category === category).every(
        (concept) => completedConcepts.has(concept.id)
      )
    )
      badges.add(badge);
  }
  for (const [threshold, badge] of [
    [5, "first-five"],
    [10, "halfway-there"],
    [20, "almost-there"],
    [28, "tka-master"],
  ] as const)
    if (completedConcepts.size >= threshold) badges.add(badge);
  const bestStreak = Math.max(
    0,
    ...[...concepts.values()].map((record) => record.bestStreak)
  );
  for (const [threshold, badge] of [
    [10, "streak-10"],
    [25, "streak-25"],
    [50, "streak-50"],
  ] as const)
    if (bestStreak >= threshold) badges.add(badge);
  return {
    ...progress,
    concepts,
    completedConcepts,
    currentConceptId: progress.currentConceptId
      ? (LEGACY_CONCEPT_ID_ALIASES[progress.currentConceptId] ??
        progress.currentConceptId)
      : undefined,
    overallProgress: (completedConcepts.size / TKA_CONCEPTS.length) * 100,
    totalCorrect: Math.max(
      progress.totalCorrect,
      [...concepts.values()].reduce(
        (sum, record) => sum + record.correctAnswers,
        0
      )
    ),
    totalTimeSpent: Math.max(
      progress.totalTimeSpent,
      [...concepts.values()].reduce(
        (sum, record) => sum + record.timeSpentSeconds,
        0
      )
    ),
    badges: [...badges],
  };
}

/** Merge independent lessons without letting a pre-reset device restore old progress. */
export function mergeLearningProgress(
  a: LearningProgress,
  b: LearningProgress
): LearningProgress {
  const aReset = time(a.resetAt);
  const bReset = time(b.resetAt);
  if (aReset !== bReset) return aReset > bReset ? a : b;

  const concepts = new Map(a.concepts);
  for (const [id, record] of b.concepts) {
    const existing = concepts.get(id);
    concepts.set(id, existing ? mergeConcept(existing, record) : { ...record });
  }
  const completedConcepts = new Set([
    ...a.completedConcepts,
    ...b.completedConcepts,
  ]);
  for (const [id, record] of concepts) {
    if (record.status === "completed") completedConcepts.add(id);
  }
  const aVisit = a.currentConceptId
    ? time(a.currentConceptVisitedAt) || time(a.lastUpdated)
    : 0;
  const bVisit = b.currentConceptId
    ? time(b.currentConceptVisitedAt) || time(b.lastUpdated)
    : 0;
  const recent = aVisit >= bVisit ? a : b;
  // Legacy snapshots may only have aggregate counters; max preserves them.
  // Parallel attempts on the same lesson cannot be counted exactly without
  // individual attempt IDs, so per-lesson counters converge to their maximum.
  const totalCorrect = Math.max(
    a.totalCorrect,
    b.totalCorrect,
    [...concepts.values()].reduce(
      (sum, record) => sum + record.correctAnswers,
      0
    )
  );
  const totalTimeSpent = Math.max(
    a.totalTimeSpent,
    b.totalTimeSpent,
    [...concepts.values()].reduce(
      (sum, record) => sum + record.timeSpentSeconds,
      0
    )
  );
  return {
    ...recent,
    concepts,
    completedConcepts,
    currentConceptId: recent.currentConceptId,
    currentConceptVisitedAt: recent.currentConceptVisitedAt,
    resetAt: a.resetAt ?? b.resetAt,
    totalCorrect,
    totalTimeSpent,
    badges: [...new Set([...a.badges, ...b.badges])],
    lastUpdated: later(a.lastUpdated, b.lastUpdated) ?? new Date(),
  };
}

/** Whether a remote snapshot still needs any part of the merged local state. */
export function hasUnsharedProgress(
  merged: LearningProgress,
  remote: LearningProgress
): boolean {
  if (
    time(merged.resetAt) !== time(remote.resetAt) ||
    merged.currentConceptId !== remote.currentConceptId ||
    time(merged.currentConceptVisitedAt) !==
      time(remote.currentConceptVisitedAt) ||
    merged.completedConcepts.size !== remote.completedConcepts.size ||
    merged.concepts.size !== remote.concepts.size
  )
    return true;
  for (const id of merged.completedConcepts)
    if (!remote.completedConcepts.has(id)) return true;
  for (const [id, record] of merged.concepts) {
    const saved = remote.concepts.get(id);
    const canonical = (value: ConceptProgress) =>
      JSON.stringify(
        Object.entries(value)
          .filter(([, field]) => field !== undefined && field !== null)
          .sort(([a], [b]) => a.localeCompare(b))
      );
    if (!saved || canonical(record) !== canonical(saved)) return true;
  }
  return (
    merged.overallProgress !== remote.overallProgress ||
    merged.totalCorrect !== remote.totalCorrect ||
    merged.totalTimeSpent !== remote.totalTimeSpent ||
    merged.badges.some((badge) => !remote.badges.includes(badge))
  );
}
