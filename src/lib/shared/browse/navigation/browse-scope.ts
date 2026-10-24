// One grid, many scopes. Every Browse page that shows a sequence grid is the
// same search over a different pool: everyone's sequences, your saved
// library, this device's drafts, or one collection. This file maps a Browse
// location to that scope and back, so the scope bar and the grid agree on
// where you are without each page deciding for itself.

import type { BrowseLocation } from "./browse-route-resolver.js";

export type BrowseScope =
  | { kind: "everyone" }
  | { kind: "saved" }
  | { kind: "drafts" }
  | {
      kind: "collection";
      id: string;
      /** Set for a collection someone else owns (shared, followed, public). */
      ownerId?: string;
      name?: string;
      ownerName?: string;
      /** Opened from Explore's public collections rather than your shelf. */
      community?: boolean;
    };

// Shelves that live under collections but hold art or videos, not sequences.
const NON_SEQUENCE_SHELVES = new Set([
  "art_tunnels",
  "art_mandala",
  "art_scenes",
  "art_films",
  "video_performances",
]);

function collectionLabels(loc: BrowseLocation) {
  if (loc.filter?.type !== "collectionName") return {};
  return { name: loc.filter.value, ownerName: loc.filter.displayName };
}

/** The scope a location searches, or null when the page is not a sequence
 * grid (collection lists, visuals, videos, following). */
export function scopeForLocation(loc: BrowseLocation): BrowseScope | null {
  if (loc.primary === "explore") {
    if (loc.section === "sequences") return { kind: "everyone" };
    if (
      loc.section === "collections" &&
      loc.view === "detail" &&
      loc.contextId
    ) {
      return {
        kind: "collection",
        id: loc.contextId,
        ownerId: loc.ownerId,
        ...collectionLabels(loc),
        community: true,
      };
    }
    return null;
  }

  if (loc.section === "sequences") return { kind: "saved" };
  if (loc.section === "drafts") return { kind: "drafts" };
  if (
    loc.section === "collections" &&
    loc.view === "detail" &&
    loc.contextId &&
    !NON_SEQUENCE_SHELVES.has(loc.contextId)
  ) {
    return {
      kind: "collection",
      id: loc.contextId,
      ownerId: loc.ownerId,
      ...collectionLabels(loc),
    };
  }
  return null;
}

/** Stable identity for comparing scopes and keying chips. */
export function scopeKey(scope: BrowseScope): string {
  if (scope.kind !== "collection") return scope.kind;
  return scope.ownerId
    ? `collection:${scope.ownerId}:${scope.id}`
    : `collection:${scope.id}`;
}

/** The location that opens a scope. */
export function locationForScope(scope: BrowseScope): BrowseLocation {
  switch (scope.kind) {
    case "everyone":
      return { primary: "explore", section: "sequences", view: "list" };
    case "saved":
      return { primary: "you", section: "sequences", view: "list" };
    case "drafts":
      return { primary: "you", section: "drafts", view: "list" };
    case "collection": {
      const filter = scope.name
        ? {
            type: "collectionName",
            value: scope.name,
            ...(scope.ownerName ? { displayName: scope.ownerName } : {}),
          }
        : undefined;
      return {
        primary: scope.community ? "explore" : "you",
        section: "collections",
        view: "detail",
        contextId: scope.id,
        ...(scope.ownerId ? { ownerId: scope.ownerId } : {}),
        ...(filter ? { filter } : {}),
      };
    }
  }
}
