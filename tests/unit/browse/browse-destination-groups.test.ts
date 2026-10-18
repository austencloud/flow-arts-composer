import { describe, expect, it } from "vitest";
import {
  BROWSE_GROUPS,
  BROWSE_TABS,
} from "#lib/shared/navigation/config/tab-definitions.js";
import { normalizeSectionId } from "#lib/shared/navigation/config/module-definitions.js";
import { isTabAccessible } from "#lib/shared/auth/domain/guest-access-config.js";
import {
  browseDestinationForLocation,
  browseLocationForDestination,
  buildBrowsePath,
  resolveBrowsePathname,
  type BrowseDestination,
} from "#lib/shared/browse/navigation/browse-route-resolver.js";

describe("Browse destination groups", () => {
  it("keeps every visible destination in one of the two ordered groups", () => {
    expect(BROWSE_GROUPS.map((group) => group.id)).toEqual([
      "community",
      "library",
    ]);
    expect(
      BROWSE_TABS.filter((tab) => tab.groupId === "community").map(
        (tab) => tab.id
      )
    ).toEqual(["sequences", "collections", "visuals"]);
    expect(
      BROWSE_TABS.filter((tab) => tab.groupId === "library").map(
        (tab) => tab.id
      )
    ).toEqual(["drafts", "saved", "your-visuals", "your-videos", "following"]);
    expect(
      BROWSE_TABS.every((tab) =>
        BROWSE_GROUPS.some((group) => group.id === tab.groupId)
      )
    ).toBe(true);
  });

  it.each([
    ["sequences", "/browse/explore/sequences"],
    ["collections", "/browse/explore/collections"],
    ["visuals", "/browse/explore/visuals"],
    ["drafts", "/browse/you/drafts"],
    ["saved", "/browse/you/sequences"],
    ["your-visuals", "/browse/you/visuals/tunnels"],
    ["your-videos", "/browse/you/videos"],
    ["following", "/browse/you/following"],
  ] as const)("routes %s to its shelf", (destination, path) => {
    const location = browseLocationForDestination(
      destination as BrowseDestination
    );
    expect(buildBrowsePath(location)).toBe(path);
    expect(
      browseDestinationForLocation(resolveBrowsePathname(path)!.location)
    ).toBe(destination);
    expect(isTabAccessible("browse", destination, "guest")).toBe(true);
  });

  it("keeps old You bookmarks and collection detail routes on Saved work", () => {
    expect(normalizeSectionId("browse", "you")).toBe("saved");
    expect(normalizeSectionId("browse", "library")).toBe("saved");
    expect(
      browseDestinationForLocation(
        resolveBrowsePathname("/browse/you/collections/owner/id")!.location
      )
    ).toBe("saved");
  });
});
