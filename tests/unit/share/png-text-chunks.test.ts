import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import {
  insertPngTextChunks,
  readPngTextChunks,
} from "#lib/shared/share/services/png-text-chunks.js";

/** Written by Pillow, not by us: an independent iTXt/tEXt writer. */
const PILLOW_FIXTURE = new Uint8Array(
  readFileSync(resolve(process.cwd(), "tests/unit/share/pillow-itxt.png"))
);

function makePng(): Uint8Array {
  const png = new PNG({ width: 3, height: 2 });
  for (let i = 0; i < png.data.length; i++) png.data[i] = (i * 37) % 256;
  return new Uint8Array(PNG.sync.write(png));
}

describe("readPngTextChunks", () => {
  it("reads iTXt (UTF-8) and tEXt (Latin-1) written by Pillow", () => {
    const chunks = readPngTextChunks(PILLOW_FIXTURE);
    expect(chunks["Description"]).toBe(
      "Sequence FΨΩ-. Written by Pillow, not by the app."
    );
    expect(chunks["Software"]).toBe("Pillow fixture");
    expect(JSON.parse(chunks["flow-arts-sequence"]!)).toMatchObject({
      format: "flow-arts-sequence",
      word: "FΨΩ-",
    });
  });

  it("does not throw on a truncated PNG", () => {
    const truncated = PILLOW_FIXTURE.subarray(0, PILLOW_FIXTURE.length - 40);
    expect(() => readPngTextChunks(truncated)).not.toThrow();
    expect(() =>
      readPngTextChunks(PILLOW_FIXTURE.subarray(0, 10))
    ).not.toThrow();
  });
});

describe("insertPngTextChunks", () => {
  it("round-trips Greek letters and leaves the pixels identical", () => {
    const original = makePng();
    const written = insertPngTextChunks(original, {
      "flow-arts-sequence": '{"word":"ΦΨΛ-"}',
      Description: "Sequence ΦΨΛ-.",
    });

    expect(readPngTextChunks(written)).toEqual({
      "flow-arts-sequence": '{"word":"ΦΨΛ-"}',
      Description: "Sequence ΦΨΛ-.",
    });

    // pngjs verifies every chunk CRC while decoding.
    const before = PNG.sync.read(Buffer.from(original));
    const after = PNG.sync.read(Buffer.from(written));
    expect(after.width).toBe(before.width);
    expect(Buffer.compare(after.data, before.data)).toBe(0);
  });

  it("puts the text chunks directly after IHDR", () => {
    const written = insertPngTextChunks(makePng(), { Software: "x" });
    // signature (8) + IHDR (12 + 13) = 33; the next chunk type sits at 37.
    expect(new TextDecoder().decode(written.subarray(37, 41))).toBe("iTXt");
  });

  it("replaces an existing chunk with the same keyword", () => {
    const replaced = insertPngTextChunks(PILLOW_FIXTURE, {
      Software: "Flow Arts Composer",
    });
    const chunks = readPngTextChunks(replaced);
    expect(chunks["Software"]).toBe("Flow Arts Composer");
    expect(chunks["Description"]).toContain("Written by Pillow");

    const again = insertPngTextChunks(replaced, { Software: "second" });
    const occurrences =
      new TextDecoder("latin1").decode(again).split("Software").length - 1;
    expect(occurrences).toBe(1);
  });

  it("returns bytes that are not a PNG untouched", () => {
    const notPng = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
    expect(insertPngTextChunks(notPng, { a: "b" })).toBe(notPng);
  });

  it("returns a truncated PNG untouched instead of throwing", () => {
    const truncated = makePng().subarray(0, 40);
    expect(insertPngTextChunks(truncated, { a: "b" })).toBe(truncated);
  });
});
