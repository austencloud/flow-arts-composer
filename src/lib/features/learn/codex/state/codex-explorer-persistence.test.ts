import { describe, it, expect } from "vitest";
import {
  serializeCodexExplorerPrefs,
  restoreCodexExplorerPrefs,
  defaultCodexExplorerPrefs,
  type CodexExplorerPrefs,
} from "./codex-explorer-persistence";

describe("codex explorer persistence", () => {
  const sample: CodexExplorerPrefs = {
    version: 2,
    selectedLetter: "Σ-",
    gridMode: "box",
    visibility: {
      showGlyph: false,
      showGrid: true,
      showTKA: false,
      showPlacements: true,
      showReversals: false,
      showNonRadialPoints: true,
    },
    splitSizes: [4, 7],
  };

  it("round-trips a full prefs object", () => {
    const restored = restoreCodexExplorerPrefs(serializeCodexExplorerPrefs(sample));
    expect(restored).toEqual(sample);
  });

  it("returns defaults for null / empty input", () => {
    expect(restoreCodexExplorerPrefs(null)).toEqual(defaultCodexExplorerPrefs());
    expect(restoreCodexExplorerPrefs("")).toEqual(defaultCodexExplorerPrefs());
  });

  it("returns defaults for corrupt JSON", () => {
    expect(restoreCodexExplorerPrefs("{not json")).toEqual(defaultCodexExplorerPrefs());
  });

  it("returns defaults when the version mismatches", () => {
    const stale = JSON.stringify({ ...sample, version: 1 });
    expect(restoreCodexExplorerPrefs(stale)).toEqual(defaultCodexExplorerPrefs());
  });

  it("fills missing visibility keys from defaults", () => {
    const partial = JSON.stringify({ ...sample, visibility: { showGlyph: false } });
    const restored = restoreCodexExplorerPrefs(partial);
    expect(restored.visibility.showGlyph).toBe(false);
    expect(restored.visibility.showTKA).toBe(defaultCodexExplorerPrefs().visibility.showTKA);
  });

  it("rejects malformed splitSizes and falls back to default", () => {
    const bad = JSON.stringify({ ...sample, splitSizes: [1, 2, 3] });
    expect(restoreCodexExplorerPrefs(bad).splitSizes).toEqual(defaultCodexExplorerPrefs().splitSizes);
  });
});
