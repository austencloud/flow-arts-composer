import type {
  ResolvedLanding,
  ResolvedTakeTiming,
  TakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";

export interface ShownLanding extends ResolvedLanding {
  sectionId: string;
}

/**
 * Every landing the timing lane draws, each once, under the part it falls in.
 * Each part also resolves the landings just past its edges, so the moves
 * across a cut run on; where the neighbour keeps the count, the neighbour
 * shows them. A landing a part had dragged past a cut into a part with a
 * count of its own stays with the part that holds the drag, since nothing
 * else draws it there.
 */
export function shownLandings(
  timing: TakeTiming,
  resolved: ResolvedTakeTiming | null
): ShownLanding[] {
  const sections = resolved?.sections ?? [];
  return sections.flatMap((section, index) => {
    const dragged = new Set(
      timing.sections
        .find((entry) => entry.id === section.id)
        ?.overrides.map((override) => override.position) ?? []
    );
    const sharesAfter = sections[index + 1]?.countsWithPrevious ?? false;
    return section.landings
      .filter((landing) => {
        const early = index > 0 && landing.seconds < section.startSeconds;
        const late =
          index < sections.length - 1 && landing.seconds >= section.endSeconds;
        if (!early && !late) return true;
        return (
          landing.pinned &&
          dragged.has(landing.position) &&
          !(early ? section.countsWithPrevious : sharesAfter)
        );
      })
      .map((landing) => ({ ...landing, sectionId: section.id }));
  });
}

/**
 * Where the lane shows landing `position` of the count `sectionId` belongs
 * to. A drag or a release can carry a landing across a cut, into the part on
 * the other side. Null when no part of that count shows it.
 */
export function shownLanding(
  timing: TakeTiming,
  resolved: ResolvedTakeTiming | null,
  sectionId: string,
  position: number
): { sectionId: string; position: number } | null {
  const sections = resolved?.sections ?? [];
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index < 0) return null;
  let from = index;
  while (from > 0 && sections[from]!.countsWithPrevious) from -= 1;
  let to = index;
  while (to + 1 < sections.length && sections[to + 1]!.countsWithPrevious) {
    to += 1;
  }
  const counted = new Set(
    sections.slice(from, to + 1).map((section) => section.id)
  );
  const shown = shownLandings(timing, resolved).find(
    (landing) =>
      counted.has(landing.sectionId) && landing.position === position
  );
  return shown ? { sectionId: shown.sectionId, position } : null;
}
