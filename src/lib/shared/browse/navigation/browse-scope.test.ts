import { describe, expect, it } from "vitest";
import {
  locationForScope,
  scopeForLocation,
  scopeKey,
  type BrowseScope,
} from "./browse-scope.js";

describe("browse scope", () => {
  it("maps the sequence grids to their scope", () => {
    expect(
      scopeForLocation({
        primary: "explore",
        section: "sequences",
        view: "list",
      })
    ).toEqual({ kind: "everyone" });
    expect(
      scopeForLocation({ primary: "you", section: "sequences", view: "list" })
    ).toEqual({ kind: "saved" });
    expect(
      scopeForLocation({ primary: "you", section: "drafts", view: "list" })
    ).toEqual({ kind: "drafts" });
  });

  it("has no scope on pages that are not a sequence grid", () => {
    expect(
      scopeForLocation({ primary: "you", section: "collections", view: "list" })
    ).toBeNull();
    expect(
      scopeForLocation({
        primary: "explore",
        section: "collections",
        view: "list",
      })
    ).toBeNull();
    expect(
      scopeForLocation({ primary: "you", section: "following", view: "list" })
    ).toBeNull();
    // Art and video shelves sit under collections but hold no sequences.
    expect(
      scopeForLocation({
        primary: "you",
        section: "collections",
        view: "detail",
        contextId: "art_films",
      })
    ).toBeNull();
  });

  it("round-trips collection scopes, own and foreign and public", () => {
    const scopes: BrowseScope[] = [
      { kind: "collection", id: "abc", name: "Zan's Diamond" },
      {
        kind: "collection",
        id: "abc",
        ownerId: "u2",
        name: "Shared",
        ownerName: "Kim",
      },
      {
        kind: "collection",
        id: "pub",
        ownerId: "u3",
        name: "Public",
        community: true,
      },
      { kind: "everyone" },
      { kind: "saved" },
      { kind: "drafts" },
    ];
    for (const scope of scopes) {
      expect(scopeForLocation(locationForScope(scope))).toEqual(scope);
    }
  });

  it("keys a foreign collection apart from an own one with the same id", () => {
    expect(scopeKey({ kind: "collection", id: "abc" })).not.toBe(
      scopeKey({ kind: "collection", id: "abc", ownerId: "u2" })
    );
  });
});
