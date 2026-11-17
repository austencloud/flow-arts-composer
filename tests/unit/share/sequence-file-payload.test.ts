import { beforeAll, describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  decodeSequence,
  decodeSequenceFromQR,
  encodeSequence,
} from "#lib/shared/navigation/services/sequence-encoder.js";
import {
  buildSequenceFilePayload,
  describeSequenceFile,
  parseSequenceFilePayload,
  serializeSequenceFilePayload,
} from "#lib/shared/share/domain/sequence-file-payload.js";
import realRecords from "../../fixtures/shortcode-payloads/real-records.json";

const RECORDS = realRecords as unknown as Record<
  string,
  { encoded: string; sequenceData: Record<string, unknown> }
>;

const MOTION_FIELDS = [
  "motionType",
  "rotationDirection",
  "startLocation",
  "endLocation",
  "turns",
  "startOrientation",
  "endOrientation",
  "propType",
] as const;

function motionsOf(sequence: SequenceData) {
  const pick = (motion: MotionData | undefined) =>
    motion
      ? Object.fromEntries(MOTION_FIELDS.map((field) => [field, motion[field]]))
      : null;
  return [
    sequence.startPlacement ?? sequence.startingPlacement,
    ...sequence.steps,
  ].map((step) => ({
    left: pick(step?.motions?.left),
    right: pick(step?.motions?.right),
  }));
}

let realSequence: SequenceData;
beforeAll(async () => {
  // HFWmmG: a real 17-step production card, opened from its printed QR payload.
  realSequence = {
    ...(await decodeSequenceFromQR(RECORDS.HFWmmG!.encoded)),
    id: "doc-123",
    ownerId: "user-456",
    word: "ΦΨ-ΦΨ-",
  } as SequenceData;
});

describe("sequence file payload", () => {
  it("builds, parses and decodes a real sequence back to the same motions", () => {
    expect(realSequence.steps.length).toBeGreaterThan(8);
    const text = serializeSequenceFilePayload(
      buildSequenceFilePayload(realSequence)
    );
    const parsed = parseSequenceFilePayload(text);
    expect(parsed).not.toBeNull();
    expect(motionsOf(parsed!.sequence)).toEqual(motionsOf(realSequence));
    // Exactly what the flat encoding already guarantees, no more and no less.
    expect(motionsOf(parsed!.sequence)).toEqual(
      motionsOf(decodeSequence(encodeSequence(realSequence)))
    );
  });

  it("writes exactly the allowed keys and nothing about a person or document", () => {
    const withLink = buildSequenceFilePayload(realSequence, {
      link: "https://tka.run/AB12",
    });
    const required = [
      "app",
      "encoding",
      "format",
      "link",
      "notation",
      "sequence",
      "version",
      "word",
    ];
    // `letters` is the one optional key: present only when a step has a letter.
    const allowed = [...required, "letters"];
    expect(Object.keys(withLink).filter((key) => !allowed.includes(key))).toEqual([]);
    expect(required.filter((key) => !(key in withLink))).toEqual([]);
    const without = buildSequenceFilePayload(realSequence);
    expect(Object.keys(without)).not.toContain("link");
    const json = serializeSequenceFilePayload(withLink);
    for (const forbidden of [
      "userId",
      "email",
      "ownerId",
      '"id"',
      "doc-123",
      "user-456",
    ]) {
      expect(json).not.toContain(forbidden);
    }
    expect(withLink.word).toBe("ΦΨ-");
  });

  it("reads a newer version, ignores unknown fields, drops a bad link", () => {
    const base = buildSequenceFilePayload(realSequence);
    const parsed = parseSequenceFilePayload(
      JSON.stringify({
        ...base,
        version: 7,
        future: { x: 1 },
        link: "not a url",
      })
    );
    expect(parsed?.payload.version).toBe(7);
    expect(parsed?.payload).not.toHaveProperty("future");
    expect(parsed?.payload).not.toHaveProperty("link");
  });

  it("refuses an unknown encoding or a foreign format", () => {
    const base = buildSequenceFilePayload(realSequence);
    expect(
      parseSequenceFilePayload(JSON.stringify({ ...base, encoding: "other" }))
    ).toBeNull();
    expect(
      parseSequenceFilePayload(JSON.stringify({ ...base, format: "x" }))
    ).toBeNull();
    expect(parseSequenceFilePayload("{not json")).toBeNull();
  });

  it("describes the file in one plain sentence without calling the app TKA", () => {
    const text = describeSequenceFile(
      { word: "ΦΨ-", link: "https://tka.run/AB12" },
      "picture"
    );
    expect(text).toBe(
      "Sequence ΦΨ-. This picture carries its sequence and opens in Flow Arts Composer. https://tka.run/AB12"
    );
  });
});
