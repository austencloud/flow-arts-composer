// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { exportDeckZIP } from "../print-zip-exporter";
import type { ZipCardPair } from "../types";

/**
 * The insert ships as card 001 of the ZIP. The risk this guards is index drift:
 * prepending the insert must renumber the FILES without shifting the card
 * indexes handed to `frontRenderer`, which allocates one physical short code per
 * sequence card. An off-by-one there mints the wrong identity for every card.
 */

const files: Record<string, string[]> = {};

vi.mock("jszip", () => {
  class FakeZip {
    folder(name: string) {
      files[name] = [];
      return {
        file: (path: string) => {
          files[name]!.push(path);
        },
      };
    }
    generateAsync() {
      return Promise.resolve(new Blob());
    }
  }
  return { default: FakeZip };
});

function fakeCanvas(): HTMLCanvasElement {
  return {
    toBlob: (cb: (b: Blob | null) => void) => cb(new Blob()),
  } as unknown as HTMLCanvasElement;
}

function pair(label: string): ZipCardPair {
  return { front: fakeCanvas(), back: fakeCanvas(), label };
}

describe("exportDeckZIP with the How to Read insert", () => {
  it("writes the insert as 001 and starts sequence cards at 002", async () => {
    for (const k of Object.keys(files)) delete files[k];
    const pairs = [pair("ABC"), pair("ΣΦΛ")];

    await exportDeckZIP(pairs, "Deck_007", undefined, {
      insertPair: { front: fakeCanvas(), back: fakeCanvas() },
    });

    expect(files.fronts).toEqual([
      "001_how-to-read_front.png",
      "002_ABC_front.png",
      "003_ΣΦΛ_front.png",
    ]);
    expect(files.backs).toEqual([
      "001_how-to-read_back.png",
      "002_ABC_back.png",
      "003_ΣΦΛ_back.png",
    ]);
  });

  it("never routes the insert through frontRenderer, and keeps card indexes unshifted", async () => {
    for (const k of Object.keys(files)) delete files[k];
    const seen: { label: string; cardIndex: number }[] = [];
    const pairs = [pair("ABC"), pair("DEF")];

    await exportDeckZIP(pairs, "Deck_007", undefined, {
      insertPair: { front: fakeCanvas(), back: fakeCanvas() },
      frontRenderer: async (p, cardIndex) => {
        seen.push({ label: p.label, cardIndex });
        return p.front;
      },
    });

    // Called once per SEQUENCE card only — the insert has no sequence and must
    // not consume a short code — and indexes stay 0-based over `pairs`.
    expect(seen).toEqual([
      { label: "ABC", cardIndex: 0 },
      { label: "DEF", cardIndex: 1 },
    ]);
  });

  it("numbers from 001 when no insert is supplied (legacy decks)", async () => {
    for (const k of Object.keys(files)) delete files[k];

    await exportDeckZIP([pair("ABC")], "Deck_001", undefined, {});

    expect(files.fronts).toEqual(["001_ABC_front.png"]);
  });

  it("reports progress over the printed card count, insert included", async () => {
    for (const k of Object.keys(files)) delete files[k];
    const totals: number[] = [];

    await exportDeckZIP(
      [pair("ABC"), pair("DEF")],
      "Deck_007",
      (_current, total) => totals.push(total),
      { insertPair: { front: fakeCanvas(), back: fakeCanvas() } },
    );

    expect(totals).toEqual([3, 3, 3]);
  });
});
