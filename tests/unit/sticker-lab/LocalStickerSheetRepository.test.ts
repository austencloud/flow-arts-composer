import { describe, it, expect, beforeEach } from "vitest";
import { LocalStickerSheetRepository } from "#lib/features/sticker-lab/services/local-sticker-sheet-repository.js";
import {
  createDefaultStickerSheet,
  createDefaultStickerUnit,
  type MandalaPrimitiveRef,
} from "#lib/features/sticker-lab/domain/sticker-types.js";
import { STORAGE_KEY_ACTIVE_SHEET } from "#lib/features/sticker-lab/domain/sticker-constants.js";

function mockLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

const testRef: MandalaPrimitiveRef = {
  shapeHash: "shape-abc",
  ultraHash: "shape-abc",
  identityKind: "geometry-v1",
  representativeSequenceId: "sequence-abc",
  displayName: "Alpha",
};

describe("LocalStickerSheetRepository", () => {
  let storage: Storage;
  let repo: LocalStickerSheetRepository;

  beforeEach(() => {
    storage = mockLocalStorage();
    repo = new LocalStickerSheetRepository(storage);
  });

  it("load returns null when no sheet is saved", () => {
    expect(repo.load()).toBeNull();
  });

  it("save then load returns the same sheet with v4 stickers intact", () => {
    const sheet = {
      ...createDefaultStickerSheet(),
      stickers: [createDefaultStickerUnit({ primitiveRef: testRef })],
    };
    repo.save(sheet);
    const loaded = repo.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(sheet.id);
    expect(loaded!.stickers).toHaveLength(1);
    expect(loaded!.stickers[0]!.primitiveRef.shapeHash).toBe("shape-abc");
  });

  it("clear removes the stored sheet", () => {
    repo.save(createDefaultStickerSheet());
    repo.clear();
    expect(repo.load()).toBeNull();
  });

  it("load returns null when stored payload is malformed JSON", () => {
    storage.setItem(STORAGE_KEY_ACTIVE_SHEET, "not-valid-json{");
    expect(repo.load()).toBeNull();
  });

  it("load returns null for an unknown future version (v99)", () => {
    storage.setItem(
      STORAGE_KEY_ACTIVE_SHEET,
      JSON.stringify({ version: 99, sheet: createDefaultStickerSheet() })
    );
    expect(repo.load()).toBeNull();
  });

  it("migrates a v1 sheet to v3 and marks its sequence proxy for lazy upgrade", () => {
    const v1Sheet = {
      id: "s1",
      name: "Old",
      sheetSize: "8.5x11",
      stickers: [
        {
          id: "st1",
          sourceLoop: {
            sequenceId: "seq-xyz",
            word: "ALPHA",
            loopType: "rotated-loop",
          },
          variant: "full",
          size: "3in-round",
          background: "transparent",
          copies: 2,
          presentation: "pure",
        },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };
    storage.setItem(
      STORAGE_KEY_ACTIVE_SHEET,
      JSON.stringify({ version: 1, sheet: v1Sheet })
    );

    const loaded = repo.load();
    expect(loaded).not.toBeNull();

    const sticker = loaded!.stickers[0]!;
    expect(sticker.primitiveRef.shapeHash).toBe("seq-xyz");
    expect(sticker.primitiveRef.ultraHash).toBe("seq-xyz");
    expect(sticker.primitiveRef.identityKind).toBe("sequence-proxy-v1");
    expect(sticker.primitiveRef.representativeSequenceId).toBe("seq-xyz");
    expect(sticker.primitiveRef.displayName).toBe("ALPHA");
    expect(sticker.copies).toBe(2);
    // deprecated back-link preserved for audit trail
    expect(sticker.sourceLoop?.sequenceId).toBe("seq-xyz");
  });

  it("migrates a v1 sticker with null sourceLoop using a legacy- prefix", () => {
    const v1Sheet = {
      id: "s1",
      name: "Old",
      sheetSize: "8.5x11",
      stickers: [
        {
          id: "st42",
          sourceLoop: null,
          variant: "blue",
          size: "3in-round",
          background: "white",
          copies: 1,
          presentation: "pure",
        },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };
    storage.setItem(
      STORAGE_KEY_ACTIVE_SHEET,
      JSON.stringify({ version: 1, sheet: v1Sheet })
    );

    const loaded = repo.load();
    expect(loaded!.stickers[0]!.primitiveRef.shapeHash).toBe("legacy-st42");
    expect(loaded!.stickers[0]!.primitiveRef.representativeSequenceId).toBe(
      "legacy-st42"
    );
    expect(loaded!.stickers[0]!.primitiveRef.displayName).toBe(
      "Imported sticker"
    );
    expect(loaded!.stickers[0]!.variant).toBe("left");
  });

  it("migrates v3 color-named variants to performer-relative identities", () => {
    const unit = createDefaultStickerUnit({ primitiveRef: testRef });
    const sheet = {
      ...createDefaultStickerSheet(),
      stickers: [
        { ...unit, id: "left-legacy", variant: "blue" },
        { ...unit, id: "right-legacy", variant: "red" },
      ],
    };
    storage.setItem(
      STORAGE_KEY_ACTIVE_SHEET,
      JSON.stringify({ version: 3, sheet })
    );

    expect(repo.load()!.stickers.map((sticker) => sticker.variant)).toEqual([
      "left",
      "right",
    ]);
  });

  it("v2 sheet with sheetSize=13x19 round-trips through save/load", () => {
    const sheet = {
      ...createDefaultStickerSheet(),
      sheetSize: "13x19" as const,
    };
    repo.save(sheet);
    const loaded = repo.load();
    expect(loaded!.sheetSize).toBe("13x19");
  });

  it("migrates a v2 primitive without losing its representative source", () => {
    const unit = createDefaultStickerUnit({ primitiveRef: testRef });
    const sheet = {
      ...createDefaultStickerSheet(),
      stickers: [
        {
          ...unit,
          primitiveRef: {
            shapeHash: "seq-old",
            ultraHash: "seq-old",
            sourceLoop: {
              sequenceId: "seq-old",
              word: "OLD",
              loopType: "rotated-loop",
            },
            displayName: "OLD",
          },
        },
      ],
    };
    storage.setItem(
      STORAGE_KEY_ACTIVE_SHEET,
      JSON.stringify({ version: 2, sheet })
    );

    expect(repo.load()!.stickers[0]!.primitiveRef).toMatchObject({
      shapeHash: "seq-old",
      identityKind: "sequence-proxy-v1",
      representativeSequenceId: "seq-old",
      displayName: "OLD",
    });
  });
});
