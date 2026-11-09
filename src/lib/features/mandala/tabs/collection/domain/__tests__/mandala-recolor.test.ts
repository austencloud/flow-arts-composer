import { describe, expect, it } from "vitest";
import type { CollectedMandala } from "../mandala-collection-types";
import { mandalaColorsPatch, sameMandalaColors } from "../mandala-recolor";
import { createMandalaPublicRevision } from "../mandala-public-revision";
import {
  createMandalaRevision,
  prepareMandalaRevision,
} from "../mandala-revision";

const gold = { left: "#d4af37", right: "#b8722c" };

async function savedMandala(): Promise<CollectedMandala> {
  return prepareMandalaRevision({
    id: "mandala-1",
    name: "Bloom",
    steps: [],
    variant: "both",
    leftPropType: "staff",
    rightPropType: "staff",
    createdAt: 123,
  });
}

async function recolor(
  mandala: CollectedMandala,
  colors: { left: string; right: string } | null
): Promise<CollectedMandala> {
  return prepareMandalaRevision(
    { ...mandala, ...mandalaColorsPatch(colors) },
    mandala
  );
}

describe("recoloring a saved mandala", () => {
  // The repository throws when these fields disagree, so a recolor that skipped
  // the restamp would fail only at save time, against the real database.
  it("leaves revision fields that describe the new payload", async () => {
    const gilded = await recolor(await savedMandala(), gold);
    const revision = await createMandalaRevision(gilded, 1);
    expect(revision.revisionId).toBe(gilded.currentRevisionId);
    expect(revision.contentDigest).toBe(gilded.currentContentDigest);
  });

  it("makes the public copy stale, because its content changed", async () => {
    const plain = await savedMandala();
    const gilded = await recolor(plain, gold);
    const before = await createMandalaPublicRevision(plain);
    const after = await createMandalaPublicRevision(gilded);
    expect(after.revisionId).not.toBe(before.revisionId);
  });

  // A public mandala must read as up to date again, and its poster address must
  // not move, once its owner goes back to the look that was published.
  it("returns to the original revision when the colors are cleared", async () => {
    const plain = await savedMandala();
    const restored = await recolor(await recolor(plain, gold), null);
    expect(restored.currentRevisionId).toBe(plain.currentRevisionId);
    expect(restored.currentContentDigest).toBe(plain.currentContentDigest);
    expect((await createMandalaPublicRevision(restored)).revisionId).toBe(
      (await createMandalaPublicRevision(plain)).revisionId
    );
  });

  it("treats a change of letter case as the same picture", async () => {
    const lower = await recolor(await savedMandala(), gold);
    const upper = await recolor(await savedMandala(), {
      left: gold.left.toUpperCase(),
      right: gold.right.toUpperCase(),
    });
    expect(upper.currentRevisionId).toBe(lower.currentRevisionId);
    expect(sameMandalaColors(upper.colors, gold)).toBe(true);
  });

  it("refuses a value that would later be dropped on load", () => {
    expect(() =>
      mandalaColorsPatch({ left: "red", right: gold.right })
    ).toThrow();
    expect(() =>
      mandalaColorsPatch({ left: "#123", right: gold.right })
    ).toThrow();
  });
});

describe("sameMandalaColors", () => {
  it("tells no colors apart from colors", () => {
    expect(sameMandalaColors(undefined, null)).toBe(true);
    expect(sameMandalaColors(gold, undefined)).toBe(false);
    expect(sameMandalaColors(gold, { ...gold, right: "#000000" })).toBe(false);
  });
});
