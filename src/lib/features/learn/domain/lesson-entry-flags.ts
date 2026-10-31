import { conceptStageTarget } from "./concept-experience-registry";
import { conceptRestartFromUrl, conceptStageFromUrl } from "./concept-routes";

/** The slice of a lesson's persistence that entry flags write. */
export interface LessonEntryPersistence {
  reset(): void;
  saveStep(step: number): void;
  savePhaseData(key: string, value: unknown): void;
}

/**
 * Applies a lesson link's entry flags before the lesson creates its state.
 * `from-start` clears the saved place; `stage=<name>` moves it to that stage,
 * writing the lesson's current schema so the place reads as current. Found
 * moves, pairs and answers are left as they were. Both together: reset,
 * then the stage. An unknown name is ignored.
 */
export function applyLessonEntryFlags(
  url: URL,
  persistenceFor: (conceptId: string) => LessonEntryPersistence
): void {
  const restart = conceptRestartFromUrl(url);
  if (restart) persistenceFor(restart.conceptId).reset();

  const entry = conceptStageFromUrl(url);
  if (!entry) return;
  const target = conceptStageTarget(entry.conceptId, entry.stage);
  if (!target) return;
  const persistence = persistenceFor(entry.conceptId);
  persistence.saveStep(target.step);
  persistence.savePhaseData(target.schemaKey, target.schemaVersion);
}
