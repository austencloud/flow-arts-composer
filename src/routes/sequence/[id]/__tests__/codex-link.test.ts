import { describe, expect, it } from "vitest";
import { codexHrefForSteps } from "../codex-link";

describe("codexHrefForSteps", () => {
  it("opens the Codex on the first step's letter", () => {
    expect(codexHrefForSteps([{ letter: "A" }, { letter: "B" }])).toBe(
      "/codex?letter=A"
    );
  });

  it("skips letters the Codex does not list", () => {
    expect(codexHrefForSteps([{ letter: "not-a-letter" }, { letter: "C" }])).toBe(
      "/codex?letter=C"
    );
  });

  it("encodes Greek letters for the URL", () => {
    expect(codexHrefForSteps([{ letter: "Σ" }])).toBe(
      `/codex?letter=${encodeURIComponent("Σ")}`
    );
  });

  it("falls back to the Codex home with no listed letter", () => {
    expect(codexHrefForSteps([])).toBe("/codex");
    expect(codexHrefForSteps([{ letter: null }])).toBe("/codex");
  });
});
