/**
 * Promotion gate for the Explore > Visuals destination (Browse Phase 3).
 *
 * The publication infrastructure (You-side publish controls, moderation
 * queue, guest projection) ships unconditionally — those are private or
 * data-layer surfaces. The PUBLIC discovery destination is promoted
 * separately: until the Phase 0B gate calibration says otherwise, production
 * keeps the sequences|collections switcher and unpromoted visuals deep links
 * fall back to Explore > Sequences (the route resolver already parses the
 * full visuals vocabulary, so promotion is a display decision, not a routing
 * one).
 */
export function exploreVisualsVisible(): boolean {
  return import.meta.env.DEV === true;
}

export function browseDestinationPromoted(sectionId: string): boolean {
  return sectionId !== "visuals" || exploreVisualsVisible();
}
