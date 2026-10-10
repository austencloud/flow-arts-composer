import { describe, expect, it } from "vitest";
import {
  BROWSE_NAV_SCHEMA_VERSION,
  buildBrowsePath,
  migratePersistedBrowseNavigation,
  normalizeBrowsePrimary,
  resolveBrowsePathname,
} from "#lib/shared/browse/navigation/browse-route-resolver.js";

describe("Browse route resolver", () => {
  it.each([
    ["/browse", "/browse/explore/sequences", "explore", "sequences"],
    ["/browse/gallery", "/browse/explore/sequences", "explore", "sequences"],
    [
      "/browse/discover",
      "/browse/explore/collections",
      "explore",
      "collections",
    ],
    [
      "/browse/community",
      "/browse/explore/collections",
      "explore",
      "collections",
    ],
    ["/browse/library", "/browse/you/sequences", "you", "sequences"],
  ])("canonicalizes %s", (incoming, canonical, primary, section) => {
    const route = resolveBrowsePathname(incoming);
    expect(route).toMatchObject({
      canonicalPath: canonical,
      isLegacy: true,
      location: { primary, section },
    });
  });

  it("keeps public collection identity in the route", () => {
    const route = resolveBrowsePathname(
      "/browse/explore/collections/sky%40flow/collection%2F42"
    );
    expect(route?.location).toEqual({
      primary: "explore",
      section: "collections",
      view: "detail",
      ownerId: "sky@flow",
      contextId: "collection/42",
    });
    expect(buildBrowsePath(route!.location)).toBe(
      "/browse/explore/collections/sky%40flow/collection%2F42"
    );
  });

  it.each([
    "/browse/library/printed-card-id",
    "/browse/collections/printed-card-id",
    "/browse/you/collections/printed-card-id",
  ])("preserves a personal collection deep link from %s", (incoming) => {
    expect(resolveBrowsePathname(incoming)).toMatchObject({
      canonicalPath: "/browse/you/collections/printed-card-id",
      location: {
        primary: "you",
        section: "collections",
        view: "detail",
        contextId: "printed-card-id",
      },
    });
  });

  it("moves Hall of Shame to its specialized route", () => {
    expect(
      resolveBrowsePathname("/browse/hall-of-shame")?.externalRedirect
    ).toBe("/hall-of-shame");
  });

  it("keeps old in-app navigation intents working during the migration", () => {
    expect(normalizeBrowsePrimary("library")).toBe("you");
    expect(normalizeBrowsePrimary("gallery")).toBe("explore");
    expect(normalizeBrowsePrimary("collections")).toBe("explore");
  });

  it("migrates the ambiguous old collections value from its full shape", () => {
    const migrated = migratePersistedBrowseNavigation({
      history: [
        { tab: "collections", view: "list" },
        { tab: "collections", view: "detail", contextId: "owned-42" },
        { tab: "community", view: "list" },
      ],
      currentIndex: 1,
    });

    expect(migrated).toEqual({
      schemaVersion: BROWSE_NAV_SCHEMA_VERSION,
      history: [
        { primary: "explore", section: "collections", view: "list" },
        {
          primary: "you",
          section: "collections",
          view: "detail",
          contextId: "owned-42",
          filter: undefined,
        },
        { primary: "explore", section: "collections", view: "list" },
      ],
      currentIndex: 1,
    });
  });
  // Explore > Visuals shows every artifact type on one wall, so the type
  // segment is a deep-link filter rather than a required part of the route.
  describe("Explore > Visuals type segment", () => {
    it("resolves the bare visuals list with no type filter", () => {
      const resolved = resolveBrowsePathname("/browse/explore/visuals");
      expect(resolved.location).toEqual({
        primary: "explore",
        section: "visuals",
        view: "list",
        contextId: undefined,
      });
      expect(resolved.location.visualType).toBeUndefined();
    });

    it("keeps a named type as a filter", () => {
      const resolved = resolveBrowsePathname("/browse/explore/visuals/mandalas");
      expect(resolved.location).toMatchObject({
        primary: "explore",
        section: "visuals",
        view: "list",
        visualType: "mandalas",
      });
    });

    it("reads an untyped detail id directly under /visuals", () => {
      const resolved = resolveBrowsePathname(
        "/browse/explore/visuals/8ec63a11-3076-4a3c-8b55-a9e372b1c59e"
      );
      expect(resolved.location).toEqual({
        primary: "explore",
        section: "visuals",
        view: "detail",
        contextId: "8ec63a11-3076-4a3c-8b55-a9e372b1c59e",
      });
    });

    it("reads a typed detail id after the type segment", () => {
      const resolved = resolveBrowsePathname(
        "/browse/explore/visuals/tunnels/tunnel-9"
      );
      expect(resolved.location).toMatchObject({
        view: "detail",
        visualType: "tunnels",
        contextId: "tunnel-9",
      });
    });

    it("round-trips every visuals shape through buildBrowsePath", () => {
      expect(
        buildBrowsePath({ primary: "explore", section: "visuals", view: "list" })
      ).toBe("/browse/explore/visuals");
      expect(
        buildBrowsePath({
          primary: "explore",
          section: "visuals",
          view: "list",
          visualType: "mandalas",
        })
      ).toBe("/browse/explore/visuals/mandalas");
      expect(
        buildBrowsePath({
          primary: "explore",
          section: "visuals",
          view: "detail",
          contextId: "abc-1",
        })
      ).toBe("/browse/explore/visuals/abc-1");
      expect(
        buildBrowsePath({
          primary: "explore",
          section: "visuals",
          view: "detail",
          visualType: "tunnels",
          contextId: "abc-1",
        })
      ).toBe("/browse/explore/visuals/tunnels/abc-1");
    });
  });
});
