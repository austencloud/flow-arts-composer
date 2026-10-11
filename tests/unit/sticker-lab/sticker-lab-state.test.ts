import { describe, expect, it, vi } from "vitest";
import { createStickerLabState } from "#lib/features/sticker-lab/state/sticker-lab-state.svelte.js";
import type { IStickerPrimitiveMigrator } from "#lib/features/sticker-lab/services/contracts/IStickerPrimitiveMigrator.js";
import type { IStickerSheetRepository } from "#lib/features/sticker-lab/services/contracts/IStickerSheetRepository.js";
import {
  createDefaultStickerSheet,
  type MandalaPrimitiveRef,
  type StickerSheet,
} from "#lib/features/sticker-lab/domain/sticker-types.js";

function mockRepo(
  initial: StickerSheet | null = null
): IStickerSheetRepository {
  let stored = initial;
  return {
    load: vi.fn(() => stored),
    save: vi.fn((sheet) => {
      stored = sheet;
    }),
    clear: vi.fn(() => {
      stored = null;
    }),
  };
}

function mockMigrator(
  resolved: MandalaPrimitiveRef | null = null
): IStickerPrimitiveMigrator {
  return {
    resolveGeometryIdentity: vi.fn().mockResolvedValue(resolved),
  };
}

function createState(repository: IStickerSheetRepository) {
  return createStickerLabState(repository, mockMigrator());
}

const refA: MandalaPrimitiveRef = {
  shapeHash: "shape-a",
  ultraHash: "orbit-a",
  identityKind: "geometry-v1",
  representativeSequenceId: "sequence-a",
  displayName: "Shape A",
};

const refB: MandalaPrimitiveRef = {
  shapeHash: "shape-b",
  ultraHash: "orbit-b",
  identityKind: "geometry-v1",
  representativeSequenceId: "sequence-b",
  displayName: "Shape B",
};

describe("sticker-lab state", () => {
  it("creates a fresh sheet when repository is empty", () => {
    const state = createState(mockRepo());
    expect(state.sheet.stickers).toEqual([]);
    expect(state.sheet.sheetSize).toBe("8.5x11");
  });

  it("loads an existing sheet from the repository", () => {
    const sheet: StickerSheet = {
      id: "sheet-1",
      name: "Loaded",
      sheetSize: "13x19",
      stickers: [],
      createdAt: 1,
      updatedAt: 2,
    };
    expect(createState(mockRepo(sheet)).sheet.id).toBe("sheet-1");
  });

  it("deduplicates geometric shapes and increments copies", () => {
    const state = createState(mockRepo());
    state.addPrimitive(refA);
    state.addPrimitive(refA);
    expect(state.sheet.stickers).toHaveLength(1);
    expect(state.sheet.stickers[0]).toMatchObject({ copies: 2 });
  });

  it("keeps different geometric shapes separate", () => {
    const state = createState(mockRepo());
    state.addPrimitive(refA);
    state.addPrimitive(refB);
    expect(state.sheet.stickers).toHaveLength(2);
  });

  it("clamps copies to the supported range", () => {
    const state = createState(mockRepo());
    state.addPrimitive(refA);
    const id = state.sheet.stickers[0]!.id;
    state.setCopies(id, 0);
    expect(state.sheet.stickers[0]!.copies).toBe(1);
    state.setCopies(id, 999);
    state.addPrimitive(refA);
    expect(state.sheet.stickers[0]!.copies).toBe(50);
  });

  it("updates variant, background, and sheet size", () => {
    const state = createState(mockRepo());
    state.addPrimitive(refA);
    const id = state.sheet.stickers[0]!.id;
    state.setVariant(id, "left");
    state.setBackground(id, "radial-gradient");
    state.setSheetSize("13x19");
    expect(state.sheet.stickers[0]).toMatchObject({
      variant: "left",
      background: "radial-gradient",
    });
    expect(state.sheet.sheetSize).toBe("13x19");
  });

  it("removes stickers and clears the saved sheet", () => {
    const repository = mockRepo();
    const state = createState(repository);
    state.addPrimitive(refA);
    state.removeSticker(state.sheet.stickers[0]!.id);
    expect(state.sheet.stickers).toHaveLength(0);
    state.addPrimitive(refA);
    state.clearSheet();
    expect(state.sheet.stickers).toEqual([]);
    expect(repository.clear).toHaveBeenCalled();
  });

  it("persists every ordinary mutation", () => {
    const repository = mockRepo();
    const state = createState(repository);
    state.addPrimitive(refA);
    expect(repository.save).toHaveBeenCalled();
  });

  it("upgrades legacy identity without changing sticker settings", async () => {
    const legacyRef: MandalaPrimitiveRef = {
      shapeHash: "sequence-old",
      ultraHash: "sequence-old",
      identityKind: "sequence-proxy-v1",
      representativeSequenceId: "sequence-old",
      displayName: "OLD",
    };
    const sheet: StickerSheet = {
      ...createDefaultStickerSheet(),
      stickers: [
        {
          id: "sticker-old",
          primitiveRef: legacyRef,
          variant: "right",
          size: "3in-round",
          background: "white",
          copies: 4,
          presentation: "pure",
        },
      ],
    };
    const resolved = { ...refA, displayName: "OLD" };
    const repository = mockRepo(sheet);
    const state = createStickerLabState(repository, mockMigrator(resolved));

    await state.migrateLegacyPrimitiveIdentities();

    expect(state.sheet.stickers[0]).toMatchObject({
      primitiveRef: resolved,
      variant: "right",
      background: "white",
      copies: 4,
    });
    expect(repository.save).toHaveBeenCalled();
  });
});
