import { error } from "@sveltejs/kit";
import {
  getAvailableConcepts,
  isConceptExperienceAvailable,
} from "#lib/features/learn/domain/concept-experience-registry.js";
import type { EntryGenerator, PageLoad } from "./$types";

// Prerender every published lesson, not only the ones the crawler happens to
// reach through links. Planned lessons without an experience stay unrendered.
export const entries: EntryGenerator = () =>
  getAvailableConcepts().map((concept) => ({ conceptId: concept.id }));

// A lesson URL is public only while its experience is in the published registry.
// Saved links to removed or still-planned lessons must not render course content
// under a lesson-specific URL.
export const load: PageLoad = ({ params }) => {
  if (!isConceptExperienceAvailable(params.conceptId)) {
    error(404, "Lesson not found");
  }
  return {};
};
