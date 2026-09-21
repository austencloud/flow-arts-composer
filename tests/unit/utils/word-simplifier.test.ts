/**
 * Word Simplifier Tests
 *
 * HIGH VALUE: Pattern detection algorithm that affects:
 * 1. How sequences are displayed in the UI
 * 2. What gets saved as the sequence name
 * 3. Duplicate detection (relies on simplified word)
 *
 * If broken: "ABCABCABC" could display as full string instead of "ABC",
 * causing UI clutter and potential duplicate detection failures.
 */

import { describe, expect, it } from "vitest";
import {
  simplifyRepeatedWord,
  simplifyAndTruncate,
  compressWord,
  compressedToDisplayString,
} from "../../../src/lib/shared/foundation/utils/word-simplifier";

describe("Word Simplifier", () => {
  describe("simplifyRepeatedWord", () => {
    it("should simplify repeated patterns", () => {
      expect(simplifyRepeatedWord("ABCABCABC")).toBe("ABC");
      expect(simplifyRepeatedWord("TESTTEST")).toBe("TEST");
      expect(simplifyRepeatedWord("JΦJΦJΦJΦ")).toBe("JΦ");
      expect(simplifyRepeatedWord("AAAA")).toBe("A");
      expect(simplifyRepeatedWord("ABAB")).toBe("AB");
    });

    it("should return original when no pattern", () => {
      expect(simplifyRepeatedWord("HELLO")).toBe("HELLO");
      expect(simplifyRepeatedWord("ABC")).toBe("ABC");
      expect(simplifyRepeatedWord("ABCDE")).toBe("ABCDE");
    });

    it("should handle single character", () => {
      expect(simplifyRepeatedWord("A")).toBe("A");
    });

    it("should handle two characters", () => {
      expect(simplifyRepeatedWord("AA")).toBe("A");
      expect(simplifyRepeatedWord("AB")).toBe("AB");
    });

    it("should handle empty/null input", () => {
      expect(simplifyRepeatedWord("")).toBe("");
      expect(simplifyRepeatedWord(null as any)).toBe(null);
      expect(simplifyRepeatedWord(undefined as any)).toBe(undefined);
    });

    it("should find shortest repeating pattern", () => {
      // "ABABABAB" could be "AB" or "ABAB" - should pick shortest
      expect(simplifyRepeatedWord("ABABABAB")).toBe("AB");
      expect(simplifyRepeatedWord("ABCABCABCABC")).toBe("ABC");
    });

    it("should handle Greek letters (TKA specific)", () => {
      expect(simplifyRepeatedWord("Λ-ΓΛ-ΓΛ-Γ")).toBe("Λ-Γ");
      expect(simplifyRepeatedWord("ΦΨΩ")).toBe("ΦΨΩ"); // No pattern
      expect(simplifyRepeatedWord("ΛΛΛ")).toBe("Λ");
    });

    it("should handle patterns with dashes", () => {
      expect(simplifyRepeatedWord("A-BA-BA-B")).toBe("A-B");
      expect(simplifyRepeatedWord("X-Y-ZX-Y-Z")).toBe("X-Y-Z");
    });

    it("should NOT simplify partial/incomplete patterns", () => {
      // "ABCAB" is 5 chars - no pattern divides evenly (5 is prime)
      expect(simplifyRepeatedWord("ABCAB")).toBe("ABCAB");
      // "ABCABCA" is 7 chars - no pattern divides evenly (7 is prime)
      expect(simplifyRepeatedWord("ABCABCA")).toBe("ABCABCA");
    });

    it("should correctly simplify when pattern divides evenly", () => {
      // 6 chars, pattern of 3 = 6/3=2 = divides evenly = simplifies
      expect(simplifyRepeatedWord("ABCABC")).toBe("ABC");
      // 8 chars, pattern of 2 = 8/2=4 = divides evenly = simplifies
      expect(simplifyRepeatedWord("ABABABAB")).toBe("AB");
    });
  });

  describe("simplifyAndTruncate", () => {
    it("should simplify then truncate", () => {
      // First simplify, then truncate
      expect(simplifyAndTruncate("ABCABCABC", 8)).toBe("ABC");
      expect(simplifyAndTruncate("ABCDEFGHIJKL", 8)).toBe("ABCDEFGH...");
    });

    it("should not truncate if within limit", () => {
      expect(simplifyAndTruncate("ABC", 8)).toBe("ABC");
      expect(simplifyAndTruncate("ABCDEFGH", 8)).toBe("ABCDEFGH");
    });

    it("should count letter+dash as single unit", () => {
      // "A-B-C-D-" = 4 letter units, not 8 characters
      expect(simplifyAndTruncate("A-B-C-D-", 8)).toBe("A-B-C-D-");
      // "A-B-C-D-E-F-G-H-I-" = 9 letter units, should truncate to 8
      expect(simplifyAndTruncate("A-B-C-D-E-F-G-H-I-", 8)).toBe(
        "A-B-C-D-E-F-G-H-..."
      );
    });

    it("should handle Greek letters with dashes", () => {
      // "Λ-Γ-Φ-Ψ-" = 4 letter units
      expect(simplifyAndTruncate("Λ-Γ-Φ-Ψ-", 8)).toBe("Λ-Γ-Φ-Ψ-");
    });

    it("should handle mixed letter and letter-dash units", () => {
      // "AB-CD-EF" = A, B-, C, D-, E, F = 6 units? Let me think...
      // Actually: A, B-, C, D-, E, F = 6 units
      // Wait, the algorithm treats "letter followed by dash" as one unit
      // So "AB-CD-EF" would be: A, B-, C, D-, E, F = 6 letter units
      const result = simplifyAndTruncate("AB-CD-EF", 8);
      expect(result).toBe("AB-CD-EF"); // 6 units, under limit
    });

    it("should use default maxLetters of 8", () => {
      expect(simplifyAndTruncate("ABCDEFGHIJ")).toBe("ABCDEFGH...");
    });

    it("should handle empty input", () => {
      expect(simplifyAndTruncate("", 8)).toBe("");
    });
  });

  describe("Edge Cases", () => {
    it("should handle all-dash string", () => {
      // Edge case: string of only dashes - correctly simplifies "---" to "-"
      // since it's "-" repeated 3 times
      expect(simplifyRepeatedWord("---")).toBe("-");
    });

    it("should handle very long repeating pattern", () => {
      const longPattern = "ABCDEFGHIJ";
      const repeated = longPattern.repeat(10);
      expect(simplifyRepeatedWord(repeated)).toBe(longPattern);
    });

    it("should be performant with long strings", () => {
      const longString = "A".repeat(1000);
      const start = performance.now();
      const result = simplifyRepeatedWord(longString);
      const duration = performance.now() - start;

      expect(result).toBe("A");
      expect(duration).toBeLessThan(50); // Should be fast
    });

    it("should handle Unicode combining characters", () => {
      // Greek letters with diacritics
      expect(simplifyRepeatedWord("ά")).toBe("ά");
    });
  });

  describe("compressWord", () => {
    it("should detect two different repeated halves", () => {
      // (AB)×2 (CD)×2 = ABABCDCD
      const segments = compressWord("ABABCDCD");
      expect(compressedToDisplayString(segments)).toBe("(AB)×2(CD)×2");
    });

    it("should detect adjacent transformed LOOP runs with dash letters", () => {
      const segments = compressWord("HΨ-HΨ-HΨ-HΨ-GΨ-GΨ-GΨ-GΨ-");

      expect(segments).toEqual([
        { tokens: ["H", "Ψ-"], repeat: 4 },
        { tokens: ["G", "Ψ-"], repeat: 4 },
      ]);
      expect(
        segments.map((segment) => segment.tokens.join("")).join(" · ")
      ).toBe("HΨ- · GΨ-");
    });

    it("should handle full-word repetition as single segment", () => {
      const segments = compressWord("ABCABC");
      expect(segments).toEqual([{ tokens: ["A", "B", "C"], repeat: 2 }]);
    });

    it("should not compress single-char repeats below threshold", () => {
      // LL is only 2 repeats of a single char — not worth bracket overhead
      const segments = compressWord("HELLO");
      expect(segments).toEqual([
        { tokens: ["H", "E", "L", "L", "O"], repeat: 1 },
      ]);
    });

    it("should return single segment for truly non-repeating word", () => {
      const segments = compressWord("ABCDE");
      expect(segments).toEqual([
        { tokens: ["A", "B", "C", "D", "E"], repeat: 1 },
      ]);
    });

    it("should handle dash letters as single tokens", () => {
      // (AΦ-)×2
      const segments = compressWord("AΦ-AΦ-");
      expect(segments).toEqual([{ tokens: ["A", "Φ-"], repeat: 2 }]);
    });

    it("should handle mixed repeated and non-repeated regions", () => {
      // X (AB)×2 Y → X as unrepeated, (AB)×2, Y unrepeated
      const segments = compressWord("XABABY");
      expect(compressedToDisplayString(segments)).toBe("X(AB)×2Y");
    });

    it("should handle triple repetition", () => {
      const segments = compressWord("ABCABCABC");
      expect(compressedToDisplayString(segments)).toBe("(ABC)×3");
    });

    it("should handle the real-world 32-token case", () => {
      // User's actual example: (AKEAAαΦ-A)×2 (AAAABαΦ-B)×2
      const word = "AKEAAαΦ-AAKEAAαΦ-AAAAABαΦ-BAAAABαΦ-B";
      const segments = compressWord(word);
      expect(compressedToDisplayString(segments)).toBe(
        "(AKEAAαΦ-A)×2(AAAABαΦ-B)×2"
      );
    });

    it("should handle empty and null input", () => {
      expect(compressWord("")).toEqual([]);
      expect(compressWord(null as any)).toEqual([]);
    });

    it("should handle single character", () => {
      expect(compressWord("A")).toEqual([{ tokens: ["A"], repeat: 1 }]);
    });

    it("should compress single-char only at 4+ repeats", () => {
      expect(compressedToDisplayString(compressWord("AAA"))).toBe("AAA");
      expect(compressedToDisplayString(compressWord("AAAA"))).toBe("(A)×4");
      expect(compressedToDisplayString(compressWord("AAAAAA"))).toBe("(A)×6");
    });

    it("should prefer longer patterns when they cover more tokens", () => {
      // ABABABAB could be (AB)×4 or (ABAB)×2 — should pick (AB)×4 since 2*4=8 > 4*2=8 but shorter pattern wins at tie
      const segments = compressWord("ABABABAB");
      expect(compressedToDisplayString(segments)).toBe("(AB)×4");
    });
  });
});

describe("simplifyRepeatedWord with skew notation", () => {
  it("simplifies a repeated span", () => {
    expect(simplifyRepeatedWord("{STS}{STS}")).toBe("{STS}");
  });

  it("simplifies a repeat inside one span", () => {
    expect(simplifyRepeatedWord("{STSSTS}")).toBe("{STS}");
    expect(simplifyRepeatedWord("{USUSUSUS}")).toBe("{US}");
  });

  it("keeps skewed and unskewed units apart", () => {
    expect(simplifyRepeatedWord("A{A}")).toBe("A{A}");
    expect(simplifyRepeatedWord("A{A}A{A}")).toBe("A{A}");
  });

  it("applies the mirror rule inside a span", () => {
    expect(simplifyRepeatedWord("{ABBA}")).toBe("{AB}");
  });

  it("leaves plain words exactly as before", () => {
    expect(simplifyRepeatedWord("ABCABCABC")).toBe("ABC");
    expect(simplifyRepeatedWord("W-W-")).toBe("W-");
    expect(simplifyRepeatedWord("HELLO")).toBe("HELLO");
    expect(simplifyRepeatedWord("__fused__")).toBe("__fused__");
  });
});
