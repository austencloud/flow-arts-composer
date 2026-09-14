import { describe, expect, it } from "vitest";
import { buildSequenceSharePayload } from "$lib/shared/inbox/domain/build-sequence-share-payload";
import type { SequenceShareSource } from "$lib/shared/inbox/domain/models/sequence-share-payload";

function source(overrides: Partial<SequenceShareSource>): SequenceShareSource {
  return {
    id: "seq-1",
    word: "KΨ-EΦ-",
    name: "KΨ-EΦ-",
    steps: [],
    metadata: {},
    ...overrides,
  } as SequenceShareSource;
}

describe("buildSequenceSharePayload", () => {
  it("credits the owner, never the legacy tool attribution", () => {
    // `author` on old records is the tool that wrote them ("TKA Explore"),
    // which the send sheet used to print as "by TKA Explore".
    expect(
      buildSequenceSharePayload(source({ author: "TKA Explore" })).sequenceAuthor
    ).toBeUndefined();
    expect(
      buildSequenceSharePayload(
        source({ author: "TKA Explore", ownerDisplayName: "Austen Cloud" })
      ).sequenceAuthor
    ).toBe("Austen Cloud");
  });
});
