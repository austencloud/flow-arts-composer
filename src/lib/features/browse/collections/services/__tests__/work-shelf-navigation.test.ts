import { describe, expect, it } from "vitest";
import {
  buildBrowsePath,
  resolveBrowsePathname,
} from "#lib/shared/browse/navigation/browse-route-resolver.js";
import {
  locationForShelf,
  parentListForCollection,
  shelfForLocation,
} from "../work-shelf-navigation.js";

describe("You shelf navigation", () => {
  it("keeps the rail aligned with detail routes restored from history or links", () => {
    const locations = [
      ["/browse/you/sequences", "collections"],
      ["/browse/you/drafts", "drafts"],
      ["/browse/you/visuals/mandalas", "art"],
      ["/browse/you/videos", "performances"],
      ["/browse/you/collections/art_tunnels", "art"],
      ["/browse/you/collections/art_scenes", "art"],
      ["/browse/you/collections/art_mandala", "art"],
      ["/browse/you/collections/video_performances", "performances"],
      ["/browse/you/collections/founding_tka-1", "core"],
      ["/browse/you/collections/owner/collection", "shared"],
      ["/browse/you/following", "shared"],
    ] as const;
    for (const [path, shelf] of locations) {
      expect(shelfForLocation(resolveBrowsePathname(path)!.location)).toBe(
        shelf
      );
    }
  });

  it("gives each shelf a matching detail destination", () => {
    expect(buildBrowsePath(locationForShelf("collections"))).toBe(
      "/browse/you/sequences"
    );
    expect(buildBrowsePath(locationForShelf("art"))).toBe(
      "/browse/you/visuals/tunnels"
    );
    expect(buildBrowsePath(locationForShelf("performances"))).toBe(
      "/browse/you/videos"
    );
    expect(buildBrowsePath(locationForShelf("core"))).toBe(
      "/browse/you/collections/founding_tka-1"
    );
    expect(buildBrowsePath(locationForShelf("shared"))).toBe(
      "/browse/you/following"
    );
  });

  it("opens a followed collection first and retains shared access as fallback", () => {
    const followed = { ownerId: "followed", collectionId: "one", name: "One" };
    const shared = { ownerId: "shared", collectionId: "two", name: "Two" };
    expect(buildBrowsePath(locationForShelf("shared", followed, shared))).toBe(
      "/browse/you/collections/followed/one"
    );
    expect(buildBrowsePath(locationForShelf("shared", undefined, shared))).toBe(
      "/browse/you/collections/shared/two"
    );
  });

  it("returns direct collection links to their fixed parent list", () => {
    for (const [detailPath, parentPath] of [
      ["/browse/you/collections/owned", "/browse/you/collections"],
      ["/browse/you/collections/founding_tka-1", "/browse/you/collections"],
      ["/browse/you/collections/other/shared", "/browse/you/following"],
    ] as const) {
      const detail = resolveBrowsePathname(detailPath)!.location;
      expect(buildBrowsePath(parentListForCollection(detail))).toBe(parentPath);
    }
  });
});
