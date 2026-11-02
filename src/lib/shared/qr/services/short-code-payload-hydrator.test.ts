// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { deriveLettersForSequence } from "#lib/shared/navigation/services/letter-deriver.js";
import type { ShortCodeData } from "./types";
import {
  decodeWordShortCodePayload,
  hydrateSelfContainedShortCodePayload,
  shortCodeImportedWord,
} from "./short-code-payload-hydrator";

const ENCODED_B2ZM =
  "s~r1:sm:f2938653:q1:HYPQN1Z0M/2Q 5Q:66VH93T9PYLH504WU/L92IGQSUG54HJCJQILD2JEQS+MO:9YE1U33FNO5*Q$ZMWDNXZ9PI5B32+80QLL8PR";

function record(overrides: Partial<ShortCodeData> = {}): ShortCodeData {
  return {
    sequence: "Λ-γYΘγΛ-γYΘγ",
    payloadWord: "Λ-γYΘγΛ-γYΘγ",
    encoded: ENCODED_B2ZM,
    createdAt: "2026-07-30T00:00:00.000Z",
    createdBy: "test",
    scanCount: 0,
    ...overrides,
  };
}

describe("short-code payload hydrator", () => {
  it("decodes the normalized blob and stamps record identity", async () => {
    const sequence = await decodeWordShortCodePayload("B2ZM", record());

    expect(sequence?.id).toBe("B2ZM");
    expect(sequence?.word).toBe("Λ-γYΘγΛ-γYΘγ");
    expect(sequence?.name).toBe("Λ-γYΘγΛ-γYΘγ");
    expect(sequence?.steps).toHaveLength(10);
  });

  it("plays a saved sequence under its document id, not the code", async () => {
    // A performance attached to the sequence is keyed by this id; stamping the
    // code here made every short-code visit show and upload under "B2ZM".
    const saved = await hydrateSelfContainedShortCodePayload(
      "B2ZM",
      record({ sequenceId: "Λ-γYΘγ", ownerId: "owner-1" })
    );
    expect(saved?.id).toBe("Λ-γYΘγ");
    expect(saved?.ownerId).toBe("owner-1");

    const unsaved = await hydrateSelfContainedShortCodePayload(
      "B2ZM",
      record()
    );
    expect(unsaved?.id).toBe("B2ZM");
  });

  it("never treats an encoded legacy alias as a human word", () => {
    expect(
      shortCodeImportedWord(
        record({
          payloadWord: undefined,
          sequenceName: undefined,
          sequence: "iiSS|N,E:S,W|N,S",
        })
      )
    ).toBe("");
  });

  it("returns null instead of leaking a malformed payload downstream", async () => {
    await expect(
      decodeWordShortCodePayload("BAD1", record({ encoded: "not-a-sequence" }))
    ).resolves.toBeNull();
  });

  it("letters the steps from a strict payload word, matching the motion lookup", async () => {
    // The compact blob carries no letters. Deriving them meant fetching and
    // parsing every pictograph dataframe on the phone; the schema-2 word must
    // give the very letters that lookup would, step for step.
    const fromWord = await decodeWordShortCodePayload(
      "B2ZM",
      record({ payloadSchemaVersion: 2 })
    );
    const unlettered = await decodeWordShortCodePayload("B2ZM", record());
    expect(unlettered?.steps.every((step) => step.letter === null)).toBe(true);

    const root = resolve(__dirname, "../../../../..");
    const read = (file: string) =>
      readFileSync(resolve(root, "static/data/pictographs", file), "utf8");
    Object.assign(window, {
      csvData: {
        diamondData: read("DiamondPictographDataframe.csv"),
        boxData: read("BoxPictographDataframe.csv"),
        skewedData: read("SkewedPictographDataframe.csv"),
      },
    });
    const derived = await deriveLettersForSequence(unlettered!);

    expect(fromWord?.steps.map((step) => step.letter)).toEqual(
      derived.steps.map((step) => step.letter)
    );
    expect(fromWord?.steps.map((step) => step.letter).join("")).toBe(
      "Λ-γYΘγΛ-γYΘγ"
    );
  });

  it("leaves the steps unlettered when the word cannot be trusted", async () => {
    const legacy = await decodeWordShortCodePayload("B2ZM", record());
    const short = await decodeWordShortCodePayload(
      "B2ZM",
      record({ payloadSchemaVersion: 2, payloadWord: "Λ-γYΘγ" })
    );
    const unknown = await decodeWordShortCodePayload(
      "B2ZM",
      record({ payloadSchemaVersion: 2, payloadWord: "Λ-γYΘγΛ-γYΘ%" })
    );
    for (const sequence of [legacy, short, unknown]) {
      expect(sequence?.steps.every((step) => step.letter === null)).toBe(true);
    }
  });
});
