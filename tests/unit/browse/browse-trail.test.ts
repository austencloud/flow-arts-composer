import { describe, expect, it } from "vitest";
import {
  browseBackCrumb,
  buildBrowseTrail,
} from "#lib/shared/browse/navigation/browse-trail.js";
import type { BrowseLocation } from "#lib/shared/browse/navigation/browse-route-resolver.js";

const labels = (trail: ReturnType<typeof buildBrowseTrail>) =>
  trail.map((crumb) => crumb.label);

describe("Browse trail", () => {
  it("shows only Browse on the home screen, with nothing to go back to", () => {
    const trail = buildBrowseTrail({
      location: { primary: "explore", section: "sequences", view: "list" },
      homeOpen: true,
    });
    expect(labels(trail)).toEqual(["Browse"]);
    expect(trail[0]?.target).toBeNull();
    expect(browseBackCrumb(trail)).toBeNull();
  });

  it.each<[BrowseLocation, string[]]>([
    [
      { primary: "explore", section: "sequences", view: "list" },
      ["Browse", "Community", "Sequences"],
    ],
    [
      { primary: "explore", section: "collections", view: "list" },
      ["Browse", "Community", "Collections"],
    ],
    [
      { primary: "you", section: "sequences", view: "list" },
      ["Browse", "Your library", "Saved work"],
    ],
    [
      { primary: "you", section: "collections", view: "list" },
      ["Browse", "Your library", "Saved work"],
    ],
    [
      { primary: "you", section: "drafts", view: "list" },
      ["Browse", "Your library", "Drafts"],
    ],
    [
      { primary: "you", section: "following", view: "list" },
      ["Browse", "Your library", "Following"],
    ],
    [
      { primary: "you", section: "videos", view: "list" },
      ["Browse", "Your library", "Your videos"],
    ],
  ])("names a list screen %j", (location, expected) => {
    const trail = buildBrowseTrail({ location, homeOpen: false });
    expect(labels(trail)).toEqual(expected);
    expect(trail.at(-1)?.target).toBeNull();
    const group = location.primary === "you" ? "library" : "community";
    expect(browseBackCrumb(trail)?.id).toBe(`group:${group}`);
  });

  it("goes back from a list to Browse home scrolled to its group", () => {
    const trail = buildBrowseTrail({
      location: { primary: "you", section: "following", view: "list" },
      homeOpen: false,
    });
    expect(browseBackCrumb(trail)?.target).toEqual({
      kind: "home",
      group: "library",
    });
  });

  it("adds the visual type under Visuals and goes back to Visuals", () => {
    const trail = buildBrowseTrail({
      location: {
        primary: "explore",
        section: "visuals",
        view: "list",
        visualType: "tunnels",
      },
      homeOpen: false,
    });
    expect(labels(trail)).toEqual([
      "Browse",
      "Community",
      "Visuals",
      "Tunnels",
    ]);
    expect(browseBackCrumb(trail)?.target).toEqual({
      kind: "location",
      location: { primary: "explore", section: "visuals", view: "list" },
    });
  });

  it("names your visuals type under Your visuals", () => {
    const trail = buildBrowseTrail({
      location: {
        primary: "you",
        section: "visuals",
        view: "list",
        visualType: "mandalas",
        contextId: "art_mandala",
      },
      homeOpen: false,
    });
    expect(labels(trail)).toEqual([
      "Browse",
      "Your library",
      "Your visuals",
      "Mandalas",
    ]);
  });

  it("ends a public collection with its name and goes back to Collections", () => {
    const trail = buildBrowseTrail({
      location: {
        primary: "explore",
        section: "collections",
        view: "detail",
        ownerId: "owner",
        contextId: "c1",
      },
      homeOpen: false,
      leafLabel: "Zan's Diamond",
    });
    expect(labels(trail)).toEqual([
      "Browse",
      "Community",
      "Collections",
      "Zan's Diamond",
    ]);
    expect(browseBackCrumb(trail)?.target).toEqual({
      kind: "location",
      location: { primary: "explore", section: "collections", view: "list" },
    });
  });

  it("goes back from your own collection to the collections list", () => {
    const trail = buildBrowseTrail({
      location: {
        primary: "you",
        section: "collections",
        view: "detail",
        contextId: "abc",
      },
      homeOpen: false,
      leafLabel: "Poi variations",
    });
    expect(labels(trail)).toEqual([
      "Browse",
      "Your library",
      "Saved work",
      "Poi variations",
    ]);
    expect(browseBackCrumb(trail)?.target).toEqual({
      kind: "location",
      location: { primary: "you", section: "collections", view: "list" },
    });
  });

  it("seeds a loading leaf from the route's collection name and reserves the slot", () => {
    const location: BrowseLocation = {
      primary: "explore",
      section: "collections",
      view: "detail",
      ownerId: "owner",
      contextId: "c1",
      filter: { type: "collectionName", value: "8-step caps" },
    };
    expect(
      labels(buildBrowseTrail({ location, homeOpen: false, leafLabel: null }))
    ).toEqual(["Browse", "Community", "Collections", "8-step caps"]);
    const bare = buildBrowseTrail({
      location: { ...location, filter: undefined },
      homeOpen: false,
      leafLabel: null,
    });
    expect(bare.at(-1)).toMatchObject({ id: "leaf", label: "", target: null });
  });
});
