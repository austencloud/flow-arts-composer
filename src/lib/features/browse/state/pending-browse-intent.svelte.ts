/**
 * Pending Browse Intent
 *
 * A handoff INTO Browse from another module, expressed as intent rather than
 * as a URL. Browse is a keep-alive module panel: its gallery sub-screen lives
 * in component state and sessionStorage, and nothing in that path reads query
 * params — so a caller cannot say "open Browse showing X" by navigating to a
 * link. This is the seam that lets it, matching the existing
 * `pending-sequence.svelte.ts` pattern.
 *
 * The profile's Archive doorway is the first caller. It promises a count above
 * a button, so where that button lands is not cosmetic: the destination has to
 * hold the same pool the count was read from.
 *
 * Set the intent BEFORE switching modules. Browse consumes it reactively (not
 * in `onMount`) because it stays mounted across module switches, so a second
 * handoff would otherwise be silently dropped.
 */

/** Another creator's published work: the community gallery, OWNER-filtered. */
export type CreatorGalleryIntent = {
  kind: "creator-gallery";
  /** The engine's OWNER filter matches on `ownerDisplayName`, not on uid. */
  ownerName: string;
};

/** Your own library: Browse > Library > the All shelf, whose pool is
 *  `getSequences()` — the same call the profile Archive counts. */
export type OwnLibraryIntent = {
  kind: "own-library";
  /** A sequence the destination should scroll to and mark once it is in the
   *  grid — the one the user just saved. */
  revealSequenceId?: string;
};

/** One of the Library's three Art shelves (tunnels / 3D scenes / mandalas),
 *  which mount inside the Library detail pane rather than at a route. */
export type ArtShelfIntent = {
  kind: "art-shelf";
  /** An id from `MyCollectionsPanel`'s ART_DETAIL: art_tunnels | art_scenes |
   *  art_mandala. */
  shelfId: string;
  label: string;
};

/** A message or another module opening one exact Library collection. */
export type CollectionDetailIntent = {
  kind: "collection-detail";
  collectionId: string;
  collectionName: string;
  /** Present only when the collection belongs to someone else. */
  foreignOwnerId?: string;
  /** A sequence the destination should scroll to and mark once it is in the
   *  grid — the one the user just filed here. */
  revealSequenceId?: string;
};

/** One published visual in Explore > Visuals — e.g. a creator-profile tile
 *  opening the public detail view. Callers gate on `exploreVisualsVisible()`;
 *  Browse resolves the location either way (unpromoted deep links fall back
 *  per the route resolver). */
export type ExploreVisualDetailIntent = {
  kind: "explore-visual-detail";
  visualType: "tunnels" | "mandalas" | "scenes";
  artifactId: string;
};

export type BrowseIntent =
  | CreatorGalleryIntent
  | OwnLibraryIntent
  | ArtShelfIntent
  | CollectionDetailIntent
  | ExploreVisualDetailIntent;

export function createCollectionDetailIntent(input: {
  collectionId: string;
  collectionName: string;
  ownerId: string;
  viewerId?: string;
}): CollectionDetailIntent {
  return {
    kind: "collection-detail",
    collectionId: input.collectionId,
    collectionName: input.collectionName,
    ...(input.viewerId !== input.ownerId && {
      foreignOwnerId: input.ownerId,
    }),
  };
}

let pending = $state<BrowseIntent | null>(null);

export function setPendingBrowseIntent(intent: BrowseIntent): void {
  pending = intent;
}

/** Reactive read that does NOT clear — for a consumer that wants to act inside
 *  an effect and clear on its own terms. */
export function peekPendingBrowseIntent(): BrowseIntent | null {
  return pending;
}

export function clearPendingBrowseIntent(): void {
  pending = null;
}

// A reveal outlives the intent. Browse clears the intent the moment it
// routes, but the destination view mounts (or its pool fills) a frame or more
// later, so the sequence to reveal waits here until that view consumes it.
// Views do NOT clear it on destroy: the library view that is already mounted
// (Browse is keep-alive) can pick the reveal up and then be remounted by the
// routing, and the remounted view must still find it. The age guard retires
// a reveal no view ever acted on instead.
const REVEAL_MAX_AGE_MS = 15_000;
let pendingReveal = $state<{ id: string; at: number } | null>(null);

export function setPendingLibraryReveal(sequenceId: string): void {
  pendingReveal = { id: sequenceId, at: Date.now() };
}

/** Reactive read that does NOT clear — the view clears once it has acted. */
export function peekPendingLibraryReveal(): string | null {
  if (!pendingReveal) return null;
  if (Date.now() - pendingReveal.at > REVEAL_MAX_AGE_MS) return null;
  return pendingReveal.id;
}

export function clearPendingLibraryReveal(sequenceId?: string): void {
  if (sequenceId === undefined || pendingReveal?.id === sequenceId) {
    pendingReveal = null;
  }
}
