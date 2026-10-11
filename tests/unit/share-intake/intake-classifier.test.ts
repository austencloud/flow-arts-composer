import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyIntake,
  extractCodeFromText,
} from "#lib/shared/share-intake/services/intake-classifier.js";

function png(name: string): File {
  return new File([new Uint8Array([1])], name, { type: "image/png" });
}

/** The decoder is injected, so no test here needs a canvas or the WASM. */
const decodeTo =
  (values: Record<string, string[]>) => async (file: File) =>
    values[file.name] ?? [];

describe("extractCodeFromText", () => {
  it("finds a tka.run url embedded in a sentence", () => {
    // extractScanCode alone returns null here: it requires the WHOLE string to
    // parse as a URL.
    expect(extractCodeFromText("Check this out https://tka.run/AB12").code).toBe("AB12");
  });

  it("keeps the surrounding sentence as residual text", () => {
    const result = extractCodeFromText("Check this out https://tka.run/AB12 nice");
    expect(result.code).toBe("AB12");
    expect(result.residual).toBe("Check this out nice");
  });

  it("strips trailing punctuation off a matched url", () => {
    expect(extractCodeFromText("see https://tka.run/AB12.").code).toBe("AB12");
    expect(extractCodeFromText("see (https://tka.run/AB12)").code).toBe("AB12");
  });

  it("handles a scheme-less www. url", () => {
    expect(extractCodeFromText("try www.tka.run/q/XY99 later").code).toBe("XY99");
  });

  it("still handles a bare whole-string code", () => {
    expect(extractCodeFromText("AB12").code).toBe("AB12");
  });

  it("ignores a non-TKA url and keeps the whole text", () => {
    const result = extractCodeFromText("look https://example.com/hello");
    expect(result.code).toBeNull();
    expect(result.residual).toBe("look https://example.com/hello");
  });
});

describe("classifyIntake", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies an image carrying a TKA card url as a card", async () => {
    const result = await classifyIntake(
      { files: [png("card.png")] },
      decodeTo({ "card.png": ["https://TKA.RUN/AB12"] })
    );
    expect(result.items[0]).toEqual({
      kind: "card",
      code: "AB12",
      file: expect.any(File),
    });
  });

  it("treats a non-TKA QR as an ordinary image, not a failure", async () => {
    const result = await classifyIntake(
      { files: [png("other.png")] },
      decodeTo({ "other.png": ["https://example.com/hello"] })
    );
    expect(result.items[0].kind).toBe("image");
    expect(result.problems).toHaveLength(0);
  });

  it("classifies an image with no QR as an image", async () => {
    const result = await classifyIntake({ files: [png("photo.png")] }, decodeTo({}));
    expect(result.items[0].kind).toBe("image");
  });

  it("classifies a mixed batch per item, not per batch", async () => {
    const result = await classifyIntake(
      { files: [png("card.png"), png("photo.png")] },
      decodeTo({ "card.png": ["https://tka.run/q/XY99"] })
    );
    expect(result.items.map((i) => i.kind)).toEqual(["card", "image"]);
  });

  it("marks a repeated code as duplicate, never as an image", async () => {
    // The first draft made this second file kind:"image", which sent a PHOTO
    // OF A CARD to a conversation.
    const result = await classifyIntake(
      { files: [png("a.png"), png("b.png")] },
      decodeTo({
        "a.png": ["https://tka.run/AB12"],
        "b.png": ["https://tka.run/AB12"],
      })
    );
    expect(result.items.map((i) => i.kind)).toEqual(["card", "duplicate"]);
  });

  it("extracts a TKA code from shared text", async () => {
    const result = await classifyIntake(
      { files: [], text: "https://tka.run/AB12" },
      decodeTo({})
    );
    expect(result.textCode).toBe("AB12");
    expect(result.residualText).toBeNull();
  });

  it("keeps the note alongside a code found in the same text", async () => {
    const result = await classifyIntake(
      { files: [], text: "try this https://tka.run/AB12" },
      decodeTo({})
    );
    expect(result.textCode).toBe("AB12");
    expect(result.residualText).toBe("try this");
  });

  it("keeps non-code text as residual message text", async () => {
    const result = await classifyIntake({ files: [], text: "check this out" }, decodeTo({}));
    expect(result.textCode).toBeNull();
    expect(result.residualText).toBe("check this out");
  });

  it("records decode-failed once and stops decoding when the FIRST decode throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const decode = vi.fn(async () => {
      throw new Error("wasm 404");
    });

    const result = await classifyIntake(
      { files: [png("a.png"), png("b.png"), png("c.png")] },
      decode
    );

    // A decoder that fails on the first image is the ZXing WASM failing to
    // load, which turns every shared card into a photo. Retrying it 20 more
    // times helps nobody and hides the cause.
    expect(decode).toHaveBeenCalledTimes(1);
    expect(result.problems).toEqual([
      { name: "", reason: "decode-failed", detail: "wasm 404" },
    ]);
    expect(result.items.map((i) => i.kind)).toEqual(["image", "image", "image"]);
    expect(error).toHaveBeenCalled();
  });

  it("records a per-file decode-failed after an earlier decode succeeded", async () => {
    const decode = vi.fn(async (file: File) => {
      if (file.name === "b.png") throw new Error("corrupt");
      return [];
    });

    const result = await classifyIntake(
      { files: [png("a.png"), png("b.png"), png("c.png")] },
      decode
    );

    expect(decode).toHaveBeenCalledTimes(3);
    expect(result.problems).toEqual([
      { name: "b.png", reason: "decode-failed", detail: "corrupt" },
    ]);
  });
});
