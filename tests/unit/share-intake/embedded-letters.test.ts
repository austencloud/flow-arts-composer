/**
 * A file shared into the app through Android's share sheet shows the letters
 * the file carried, like the menu row's open does. The card code it is filed
 * under has no letter column, so the classifier notes the letters and the card
 * opener puts them back.
 */
import { describe, expect, it, vi } from "vitest";
import { PNG } from "pngjs";
import { decodeSequenceFromQR } from "#lib/shared/navigation/services/sequence-encoder.js";
import { classifyIntake } from "#lib/shared/share-intake/services/intake-classifier.js";
import { applyEmbeddedLetters } from "#lib/shared/share-intake/services/embedded-letters.js";
import { parseSequenceFilePayload } from "#lib/shared/share/domain/sequence-file-payload.js";
import { embedSequenceInCardPng } from "#lib/shared/share/services/sequence-file-embedder.js";
import fixture from "../share/fixtures/kthetaye-file.json";

function plainPng(): Blob {
  const png = new PNG({ width: 4, height: 4 });
  png.data.fill(200);
  return new Blob([new Uint8Array(PNG.sync.write(png)) as BlobPart], {
    type: "image/png",
  });
}

const lettered = parseSequenceFilePayload(
  JSON.stringify({
    format: "flow-arts-sequence",
    version: 1,
    app: "Flow Arts Composer",
    notation: "The Kinetic Alphabet",
    word: fixture.word,
    encoding: "flow-arts-flat",
    sequence: fixture.sequence,
    letters: fixture.letters,
  })
)!.sequence;

describe("share intake keeps a file's letters", () => {
  it("opens a shared card file with the letters the file carried", async () => {
    const card = await embedSequenceInCardPng(plainPng(), lettered);
    const file = new File([await card.arrayBuffer()], "card.png", {
      type: "image/png",
    });
    const result = await classifyIntake({ files: [file] }, vi.fn(async () => []));
    const code = (result.items[0] as { code: string }).code;

    // What the router hands the card opener: the sequence decoded from the code.
    const fromCode = await decodeSequenceFromQR(code);
    expect(fromCode.steps.every((step) => step.letter === null)).toBe(true);
    const opened = applyEmbeddedLetters(code, fromCode);
    expect(opened.steps.map((step) => step.letter)).toEqual(fixture.letters);

    // Used once: a later open of the same code derives as before.
    expect(applyEmbeddedLetters(code, fromCode)).toBe(fromCode);
  });
});
