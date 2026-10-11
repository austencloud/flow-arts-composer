import { describe, expect, it } from "vitest";
import { createCollectionDetailIntent } from "#lib/features/browse/state/pending-browse-intent.svelte.js";
import { resolveCollectionMessageRole } from "#lib/shared/inbox/domain/collection-message-access.js";

describe("collection message access", () => {
  it("replaces the sent role with the current grant role", () => {
    expect(resolveCollectionMessageRole({ role: "editor" }, "viewer")).toBe(
      "editor"
    );
  });

  it("keeps the sent role only while the current grant is unresolved", () => {
    expect(resolveCollectionMessageRole(undefined, "editor")).toBe("editor");
    expect(resolveCollectionMessageRole(null, "editor")).toBeNull();
  });

  it("opens an owner's sent card as their own collection", () => {
    expect(
      createCollectionDetailIntent({
        collectionId: "collection-1",
        collectionName: "Poi Legal",
        ownerId: "owner-1",
        viewerId: "owner-1",
      })
    ).toEqual({
      kind: "collection-detail",
      collectionId: "collection-1",
      collectionName: "Poi Legal",
    });
  });

  it("opens a recipient's card against the owner's live collection", () => {
    expect(
      createCollectionDetailIntent({
        collectionId: "collection-1",
        collectionName: "Poi Legal",
        ownerId: "owner-1",
        viewerId: "recipient-1",
      })
    ).toEqual({
      kind: "collection-detail",
      collectionId: "collection-1",
      collectionName: "Poi Legal",
      foreignOwnerId: "owner-1",
    });
  });
});
