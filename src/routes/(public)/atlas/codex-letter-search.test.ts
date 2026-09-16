import { describe, expect, it } from "vitest";
import { resolveCodexLetterQuery } from "./codex-letter-search";

const LETTERS = ["A", "W", "W-", "Σ", "Σ-", "Φ", "Φ-", "α"];
const EXTENSIONS = ["τ-"];

function resolve(query: string): string | null {
  return resolveCodexLetterQuery(query, LETTERS, EXTENSIONS);
}

describe("Codex letter search", () => {
  it("distinguishes base letters from dash-suffixed letters", () => {
    expect(resolve("w")).toBe("W");
    expect(resolve("W-")).toBe("W-");
    expect(resolve("w dash")).toBe("W-");
  });

  it("accepts Greek symbols and spoken names", () => {
    expect(resolve("Σ")).toBe("Σ");
    expect(resolve("sigma-dash")).toBe("Σ-");
    expect(resolve("letter alpha")).toBe("α");
  });

  it("resolves registered extensions without treating partial prose as a letter", () => {
    expect(resolve("tau dash")).toBe("τ-");
    expect(resolve("τ-")).toBe("τ-");
    expect(resolve("alpha placement")).toBeNull();
    expect(resolve("letters")).toBeNull();
  });
});
