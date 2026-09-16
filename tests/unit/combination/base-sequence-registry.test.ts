import { describe, it, expect } from "vitest";
import {
  BASE_SEQUENCES,
  rosterConfirmedBases,
  ambientEligibleBases,
  ambientLetterSet,
  ambientBaseForLetter,
} from "$lib/shared/combination/domain/base-sequence-registry";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import { getAllLetterVariants } from "../../helpers/real-pictograph-loader";
import { placementGroup } from "$lib/shared/combination/services/placement-groups";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

describe("base-sequence registry", () => {
  it("contains the MCP-documented compound bases", () => {
    const words = BASE_SEQUENCES.map((b) => b.word);
    for (const w of ["DJ", "EK", "FL", "MP", "NQ", "OR", "ΦΨ"]) {
      expect(words).toContain(w);
    }
  });

  it("contains Austen's promoted bases with Θ (U+0398), never lowercase θ", () => {
    const words = BASE_SEQUENCES.map((b) => b.word);
    expect(words).toContain("WΣYΘ");
    expect(words).toContain("XΔZΩ");
    expect(words).not.toContain("WΣYθ");
  });

  it("every entry's edges chain and close into a cycle", () => {
    for (const base of BASE_SEQUENCES) {
      expect(base.edges.length).toBeGreaterThan(0);
      for (let i = 0; i < base.edges.length; i++) {
        const next = base.edges[(i + 1) % base.edges.length]!;
        expect(
          base.edges[i]!.to,
          `${base.word} edge ${i} (${base.edges[i]!.letter}) doesn't chain into edge ${
            (i + 1) % base.edges.length
          } (${next.letter})`
        ).toBe(next.from);
      }
    }
  });

  it("edges' letters correspond exactly to `letters`, in cycle order", () => {
    for (const base of BASE_SEQUENCES) {
      expect(base.edges.map((e) => e.letter)).toEqual(base.letters);
    }
  });

  it("ambient-eligible = rosterConfirmed bases only", () => {
    expect(ambientEligibleBases().every((b) => b.rosterConfirmed)).toBe(true);
    expect(rosterConfirmedBases().length).toBeGreaterThanOrEqual(9);
  });

  it("ambientLetterSet covers the bridge letters and excludes unconfirmed-roster placeholders", () => {
    const letters = ambientLetterSet();
    expect(letters.has(Letter.PHI)).toBe(true);
    expect(letters.has(Letter.PSI)).toBe(true);
    expect(letters.has(Letter.G)).toBe(true);
    // Placeholders (rosterConfirmed: false) must never leak into ambient use,
    // even though their edges are now canon-grounded.
    expect(letters.has(Letter.THETA)).toBe(false);
    expect(letters.has(Letter.C)).toBe(false);
  });

  it("ambientBaseForLetter resolves the owning rosterConfirmed base, and is null off-roster", () => {
    expect(ambientBaseForLetter(Letter.G)?.word).toBe("GG");
    expect(ambientBaseForLetter(Letter.PHI)?.word).toBe("ΦΨ");
    expect(ambientBaseForLetter(Letter.D)?.word).toBe("DJ");
    // Unconfirmed placeholders never resolve, even though their letters have
    // canon-grounded edges in the registry.
    expect(ambientBaseForLetter(Letter.THETA)).toBeNull();
    expect(ambientBaseForLetter(Letter.C)).toBeNull();
  });

  it("each ambient-eligible letter belongs to EXACTLY ONE rosterConfirmed base (uniqueness is load-bearing for ambientWord tagging)", () => {
    const owners = new Map<Letter, string[]>();
    for (const base of ambientEligibleBases()) {
      for (const letter of base.letters) {
        const list = owners.get(letter) ?? [];
        list.push(base.word);
        owners.set(letter, list);
      }
    }
    for (const [letter, words] of owners) {
      expect(
        words,
        `letter ${letter} is claimed by multiple ambient bases: ${words.join(", ")}`
      ).toHaveLength(1);
    }
  });

  it("every entry's edges agree with the canonical dataframe (all 19 entries, roster-confirmed or not)", async () => {
    // 19 after quarter-same (SS/TT/UU/VV) was added 2026-08-05 — it had been
    // absent entirely while quarter-opposite (MP/NQ/OR) was fully rostered.
    // Still short of the handoff's full 24: both Type 3 sequences and the
    // Type 4 are not entered yet.
    expect(BASE_SEQUENCES.length).toBe(19);

    for (const base of BASE_SEQUENCES) {
      for (const letterEdge of base.edges) {
        const variants = await getAllLetterVariants(
          letterEdge.letter,
          GridMode.DIAMOND
        );
        expect(
          variants.length,
          `no diamond dataframe rows found for letter ${letterEdge.letter} (base ${base.word})`
        ).toBeGreaterThan(0);

        const families = variants.map((v) => ({
          from: v.startPlacement ? placementGroup(v.startPlacement) : null,
          to: v.endPlacement ? placementGroup(v.endPlacement) : null,
        }));

        const hasMatch = families.some(
          (f) => f.from === letterEdge.from && f.to === letterEdge.to
        );
        expect(
          hasMatch,
          `base ${base.word}'s edge ${letterEdge.letter}: ${letterEdge.from}->${letterEdge.to} ` +
            `does not match any real dataframe row for ${letterEdge.letter} ` +
            `(found families: ${JSON.stringify(families)})`
        ).toBe(true);
      }
    }
  });
});
