import { describe, expect, it } from "vitest";
import {
  groupMembersByOwner,
  nextGalleryOwnerIds,
} from "#lib/shared/library/domain/models/collection.js";

/**
 * Visitors load each member of a public collection from its owner's public
 * mirror. A wrong owner here doesn't error: the member silently vanishes from
 * the visitor's grid, or the wrong person's same-word sequence shows instead.
 */
describe("gallery owner bookkeeping", () => {
  it("groups members under the person whose mirror holds them", () => {
    const groups = groupMembersByOwner(
      {
        sequenceIds: ["mine", "saved", "contributed"],
        galleryOwnerIds: { saved: "someone", contributed: "ignored" },
        sequenceOwnerIds: { contributed: "collaborator" },
      },
      "owner"
    );

    expect([...groups]).toEqual([
      ["owner", ["mine"]],
      ["someone", ["saved"]],
      ["collaborator", ["contributed"]],
    ]);
  });

  it("records only other people, and reports no change as null", () => {
    expect(
      nextGalleryOwnerIds(undefined, "owner", { mine: "owner" })
    ).toBeNull();
    expect(
      nextGalleryOwnerIds({ saved: "someone" }, "owner", { saved: "someone" })
    ).toBeNull();
    expect(
      nextGalleryOwnerIds({ saved: "someone" }, "owner", {
        mine: "owner",
        other: "another",
      })
    ).toEqual({ saved: "someone", other: "another" });
  });

  it("drops removed members and leaves an untouched map alone", () => {
    expect(
      nextGalleryOwnerIds({ saved: "someone", kept: "x" }, "owner", {}, [
        "saved",
      ])
    ).toEqual({ kept: "x" });
    expect(nextGalleryOwnerIds(undefined, "owner", {}, ["mine"])).toBeNull();
  });
});
