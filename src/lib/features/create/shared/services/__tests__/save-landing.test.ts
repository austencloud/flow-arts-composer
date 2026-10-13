import { describe, expect, it } from "vitest";
import { resolveSaveLanding } from "../save-landing";

describe("resolveSaveLanding", () => {
  it("lands a loose save on the All shelf and reveals the sequence", () => {
    const landing = resolveSaveLanding({
      sequenceId: "seq-1",
      filedCollections: [],
    });
    expect(landing.intent).toEqual({
      kind: "own-library",
      revealSequenceId: "seq-1",
    });
    expect(landing.messageKey).toBe("create_save_saved_to_your_library");
    expect(landing.actionKey).toBe("create_save_go_to_library");
  });

  it("lands a filed save on the collection it went into", () => {
    const landing = resolveSaveLanding({
      sequenceId: "seq-1",
      filedCollections: [{ id: "col-a", name: "Warmups" }],
    });
    expect(landing.intent).toEqual({
      kind: "collection-detail",
      collectionId: "col-a",
      collectionName: "Warmups",
      revealSequenceId: "seq-1",
    });
    expect(landing.messageKey).toBe("create_save_saved_to_collection");
    expect(landing.messageParams).toEqual({ name: "Warmups", count: 0 });
    expect(landing.actionParams).toEqual({ name: "Warmups" });
  });

  it("names the first collection and counts the rest when several were chosen", () => {
    const landing = resolveSaveLanding({
      sequenceId: "seq-1",
      filedCollections: [
        { id: "col-a", name: "Warmups" },
        { id: "col-b", name: "Show set" },
        { id: "col-c", name: "Drills" },
      ],
    });
    expect(landing.intent).toMatchObject({ collectionId: "col-a" });
    expect(landing.messageKey).toBe("create_save_saved_to_collections");
    expect(landing.messageParams).toEqual({ name: "Warmups", count: 2 });
  });
});
