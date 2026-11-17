// @vitest-environment jsdom
/**
 * A reopened file shows the letters its picture shows.
 *
 * The flat text has no letter column, and a float saved without its prefloat
 * direction reads back as a different letter: the real KΘY-E card reopened as
 * LΘY-F. The file now carries the letters, the parser puts them back, and the
 * hydrator keeps a letter that is already set.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { hydrateSequence } from "#lib/shared/navigation/services/sequence-hydrator.js";
import {
  buildSequenceFilePayload,
  parseSequenceFilePayload,
  serializeSequenceFilePayload,
  SEQUENCE_FILE_FORMAT,
  SEQUENCE_FILE_ENCODING,
} from "#lib/shared/share/domain/sequence-file-payload.js";
import fixture from "./fixtures/kthetaye-file.json";

/** The letter deriver fetches the pictograph dataframes from `static/`. */
function serveStaticCsvOverFetch(): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = resolve(process.cwd(), "static", String(input).replace(/^\//, ""));
    const body = readFileSync(path, "utf8");
    return { ok: true, status: 200, text: async () => body } as Response;
  }) as typeof fetch;
}

function fileText(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: SEQUENCE_FILE_FORMAT,
    version: 1,
    app: "Flow Arts Composer",
    notation: "The Kinetic Alphabet",
    word: fixture.word,
    encoding: SEQUENCE_FILE_ENCODING,
    sequence: fixture.sequence,
    ...extra,
  });
}

async function reopen(text: string): Promise<SequenceData> {
  const parsed = parseSequenceFilePayload(text);
  expect(parsed).not.toBeNull();
  return hydrateSequence(parsed!.sequence, { loopDetector: null });
}

describe("sequence file letters", () => {
  beforeAll(serveStaticCsvOverFetch);

  it("reopens the real KΘY-E card with its own letters and word", async () => {
    const hydrated = await reopen(fileText({ letters: fixture.letters }));
    expect(hydrated.steps.map((step) => step.letter)).toEqual(fixture.letters);
    expect(hydrated.word).toBe("KΘY-EKΘY-EKΘY-EKΘY-E");
  });

  it("writes the letters it was given and reads them back", async () => {
    const lettered = await reopen(fileText({ letters: fixture.letters }));
    const text = serializeSequenceFilePayload(buildSequenceFilePayload(lettered));
    expect(JSON.parse(text).letters).toEqual(fixture.letters);
    const again = await reopen(text);
    expect(again.steps.map((step) => step.letter)).toEqual(fixture.letters);
  });

  it("applies nothing when the count does not match the steps", async () => {
    const parsed = parseSequenceFilePayload(
      fileText({ letters: fixture.letters.slice(1) })
    );
    expect(parsed!.sequence.steps.every((step) => step.letter === null)).toBe(true);
  });

  it("drops a bad letters value without failing the file", () => {
    const parsed = parseSequenceFilePayload(fileText({ letters: "KΘY-E" }));
    expect(parsed).not.toBeNull();
    expect(parsed!.payload).not.toHaveProperty("letters");
  });

  it("leaves the key out when no step has a letter", () => {
    const parsed = parseSequenceFilePayload(fileText());
    const payload = buildSequenceFilePayload(parsed!.sequence);
    expect(payload).not.toHaveProperty("letters");
  });
});
