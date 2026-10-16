import type { BrowseLocation } from "#lib/shared/browse/navigation/browse-route-resolver.js";
import { isFoundingId } from "../config/founding-collections.js";

export type WorkShelfId =
  | "drafts"
  | "collections"
  | "art"
  | "performances"
  | "core"
  | "shared";

export interface ForeignShelfItem {
  ownerId: string;
  collectionId: string;
  name: string;
  ownerName?: string;
}

/** The address owns the selected shelf, including browser back and direct links. */
export function shelfForLocation(location: BrowseLocation | null): WorkShelfId {
  if (location?.primary !== "you") return "collections";
  if (location.section === "drafts") return "drafts";
  if (location.section === "following") return "shared";
  if (location.section === "visuals") return "art";
  if (location.section === "videos") return "performances";
  if (location.section === "collections" && location.view === "detail") {
    if (location.ownerId) return "shared";
    if (location.contextId && isFoundingId(location.contextId)) return "core";
    if (location.contextId?.startsWith("art_")) return "art";
  }
  return "collections";
}

export function locationForShelf(
  shelf: WorkShelfId,
  followed?: ForeignShelfItem,
  shared?: ForeignShelfItem
): BrowseLocation {
  switch (shelf) {
    case "drafts":
      return { primary: "you", section: "drafts", view: "list" };
    case "collections":
      return { primary: "you", section: "sequences", view: "list" };
    case "art":
      return {
        primary: "you",
        section: "visuals",
        view: "list",
        visualType: "tunnels",
      };
    case "performances":
      return { primary: "you", section: "videos", view: "list" };
    case "core":
      return {
        primary: "you",
        section: "collections",
        view: "detail",
        contextId: "founding_tka-1",
      };
    case "shared": {
      const item = followed ?? shared;
      return item
        ? {
            primary: "you",
            section: "collections",
            view: "detail",
            ownerId: item.ownerId,
            contextId: item.collectionId,
            filter: {
              type: "collectionName",
              value: item.name,
              displayName: item.ownerName,
            },
          }
        : { primary: "you", section: "following", view: "list" };
    }
  }
}
