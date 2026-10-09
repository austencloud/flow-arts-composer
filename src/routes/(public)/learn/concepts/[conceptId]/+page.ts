import { error } from "@sveltejs/kit";
import { getAvailableConcepts } from "$lib/features/learn/domain/concept-experience-registry";
import { getConceptById } from "$lib/features/learn/domain/concepts";
import type { EntryGenerator, PageLoad } from "./$types";

// Prerender every published lesson, not only the ones the crawler happens to
// reach through links. Planned lessons without an experience stay unrendered.
export const entries: EntryGenerator = () =>
  getAvailableConcepts().map((concept) => ({ conceptId: concept.id }));

// A concept id that exists nowhere in the course is a missing page, not the
// lesson index under a stray URL. A planned concept without an experience
// still resolves: the course falls back to its index for it.
export const load: PageLoad = ({ params }) => {
  if (!getConceptById(params.conceptId)) {
    error(404, "Lesson not found");
  }
  return {};
};
