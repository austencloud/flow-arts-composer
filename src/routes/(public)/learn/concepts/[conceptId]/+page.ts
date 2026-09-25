import { getAvailableConcepts } from "$lib/features/learn/domain/concept-experience-registry";
import type { EntryGenerator } from "./$types";

// Prerender every published lesson, not only the ones the crawler happens to
// reach through links. Planned lessons without an experience stay unrendered.
export const entries: EntryGenerator = () =>
  getAvailableConcepts().map((concept) => ({ conceptId: concept.id }));
