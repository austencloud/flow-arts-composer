// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  fromFirestoreFields,
  hashPrivateValue,
  readFirestoreBoolean,
  readFirestoreInteger,
  readFirestoreString,
  toFirestoreFields,
  type FirestoreDocument,
} from "./firestore-rest";

describe("Firestore REST value mapping", () => {
  it("maps nested application data into Firestore REST envelopes", () => {
    expect(
      toFirestoreFields({
        name: "Deck 7",
        count: 3,
        ratio: 1.5,
        active: true,
        absent: null,
        createdAt: new Date("2026-07-27T12:00:00.000Z"),
        tags: ["print", "serialized"],
        provenance: { eventId: null, era: "serialized-v1" },
        skipped: undefined,
      })
    ).toEqual({
      name: { stringValue: "Deck 7" },
      count: { integerValue: "3" },
      ratio: { doubleValue: 1.5 },
      active: { booleanValue: true },
      absent: { nullValue: null },
      createdAt: { timestampValue: "2026-07-27T12:00:00.000Z" },
      tags: {
        arrayValue: {
          values: [{ stringValue: "print" }, { stringValue: "serialized" }],
        },
      },
      provenance: {
        mapValue: {
          fields: {
            eventId: { nullValue: null },
            era: { stringValue: "serialized-v1" },
          },
        },
      },
    });
  });

  it("reads typed scalar fields without coercing the wrong envelope", () => {
    const document: FirestoreDocument = {
      name: "projects/test/databases/(default)/documents/example/one",
      fields: {
        label: { stringValue: "ABCD" },
        count: { integerValue: "12" },
        enabled: { booleanValue: true },
      },
    };

    expect(readFirestoreString(document, "label")).toBe("ABCD");
    expect(readFirestoreString(document, "count")).toBeNull();
    expect(readFirestoreInteger(document, "count")).toBe(12);
    expect(readFirestoreInteger(document, "label")).toBeNull();
    expect(readFirestoreBoolean(document, "enabled")).toBe(true);
    expect(readFirestoreBoolean(document, "label")).toBeNull();
  });

  it("decodes complete nested REST documents into serializable application data", () => {
    expect(
      fromFirestoreFields({
        sequence: { stringValue: "B2ZM" },
        scanCount: { integerValue: "12" },
        ratio: { doubleValue: 1.5 },
        createdAt: { timestampValue: "2026-07-27T12:00:00.000Z" },
        enabled: { booleanValue: true },
        optional: { nullValue: null },
        tags: {
          arrayValue: {
            values: [{ stringValue: "scan" }, { integerValue: "2" }],
          },
        },
        sequenceData: {
          mapValue: {
            fields: {
              word: { stringValue: "B2ZM" },
              props: { arrayValue: {} },
            },
          },
        },
        origin: {
          geoPointValue: { latitude: 41.8781, longitude: -87.6298 },
        },
      })
    ).toEqual({
      sequence: "B2ZM",
      scanCount: 12,
      ratio: 1.5,
      createdAt: "2026-07-27T12:00:00.000Z",
      enabled: true,
      optional: null,
      tags: ["scan", 2],
      sequenceData: { word: "B2ZM", props: [] },
      origin: { latitude: 41.8781, longitude: -87.6298 },
    });
  });

  it("preserves integers that JavaScript cannot represent exactly", () => {
    expect(
      fromFirestoreFields({
        exactId: { integerValue: "9007199254740993" },
      })
    ).toEqual({ exactId: "9007199254740993" });
  });

  it("hashes private identifiers deterministically without retaining the input", async () => {
    const first = await hashPrivateValue("device-1");
    const second = await hashPrivateValue("device-1");

    expect(first).toBe(second);
    expect(first).not.toContain("device-1");
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
