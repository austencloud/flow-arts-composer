import { hashDeckContent } from "#lib/shared/foundation/services/content-hasher.js";
import type {
  DeckRelease,
  DeckReleaseCard,
} from "../../domain/models/DeckRelease";

export function isGalleryRelease(release: DeckRelease): boolean {
  return release.recipe?.deckMode === "gallery";
}

export function isLoopRelease(release: DeckRelease): boolean {
  return release.recipe?.deckMode === "loop";
}

export function isHandPathRelease(release: DeckRelease): boolean {
  return Boolean(release.handPathCards);
}

export function isTnDRelease(release: DeckRelease): boolean {
  return (
    !isGalleryRelease(release) &&
    !isLoopRelease(release) &&
    !isHandPathRelease(release)
  );
}

export function extractReleasedSequenceIds(
  releases: DeckRelease[]
): Set<string> {
  const ids = new Set<string>();
  for (const release of releases) {
    for (const card of release.sequences ?? []) ids.add(card.sequenceId);
  }
  return ids;
}

export function findDuplicateRelease(
  cards: DeckReleaseCard[],
  releases: DeckRelease[]
): DeckRelease | null {
  const cardHash = hashDeckContent(cards);
  return (
    releases.find(
      (release) => hashDeckContent(release.sequences ?? []) === cardHash
    ) ?? null
  );
}
