import { describe, it, expect } from "vitest";
import {
  createDefaultStickerUnit,
  createDefaultStickerSheet,
  type MandalaPrimitiveRef,
} from "#lib/features/sticker-lab/domain/sticker-types.js";

const testRef: MandalaPrimitiveRef = {
  shapeHash: "shape-abc",
  ultraHash: "shape-abc",
  identityKind: "geometry-v1",
  representativeSequenceId: "sequence-abc",
  displayName: "Alpha",
};

describe("createDefaultStickerUnit", () => {
  it("sets primitiveRef from input", () => {
    const unit = createDefaultStickerUnit({ primitiveRef: testRef });
    expect(unit.primitiveRef).toEqual(testRef);
  });

  it("defaults variant to full", () => {
    const unit = createDefaultStickerUnit({ primitiveRef: testRef });
    expect(unit.variant).toBe("full");
  });

  it("defaults background to transparent", () => {
    const unit = createDefaultStickerUnit({ primitiveRef: testRef });
    expect(unit.background).toBe("transparent");
  });

  it("defaults copies to 1", () => {
    const unit = createDefaultStickerUnit({ primitiveRef: testRef });
    expect(unit.copies).toBe(1);
  });

  it("defaults size to 3in-round and presentation to pure", () => {
    const unit = createDefaultStickerUnit({ primitiveRef: testRef });
    expect(unit.size).toBe("3in-round");
    expect(unit.presentation).toBe("pure");
  });

  it("does not set deprecated sourceLoop field on newly-created units", () => {
    const unit = createDefaultStickerUnit({ primitiveRef: testRef });
    expect(unit.sourceLoop).toBeUndefined();
  });

  it("accepts variant / background / copies overrides", () => {
    const unit = createDefaultStickerUnit({
      primitiveRef: testRef,
      variant: "left",
      background: "white",
      copies: 5,
    });
    expect(unit.variant).toBe("left");
    expect(unit.background).toBe("white");
    expect(unit.copies).toBe(5);
  });

  it("generates an id with the sticker- prefix", () => {
    const unit = createDefaultStickerUnit({ primitiveRef: testRef });
    expect(unit.id).toMatch(/^sticker-[a-z0-9]+$/);
  });
});

describe("createDefaultStickerSheet", () => {
  it("creates a sheet with an empty sticker array", () => {
    const sheet = createDefaultStickerSheet();
    expect(sheet.stickers).toHaveLength(0);
  });

  it("defaults sheetSize to 8.5x11 and name to 'My Sheet'", () => {
    const sheet = createDefaultStickerSheet();
    expect(sheet.sheetSize).toBe("8.5x11");
    expect(sheet.name).toBe("My Sheet");
  });

  it("initializes createdAt and updatedAt to the current time", () => {
    const before = Date.now();
    const sheet = createDefaultStickerSheet();
    const after = Date.now();
    expect(sheet.createdAt).toBeGreaterThanOrEqual(before);
    expect(sheet.createdAt).toBeLessThanOrEqual(after);
    expect(sheet.updatedAt).toBe(sheet.createdAt);
  });
});
