import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pickerSource = readFileSync(
  resolve(
    "src/lib/shared/3d/components/controls/PerformerCharacterPicker.svelte"
  ),
  "utf8"
);

describe("character picker tiles", () => {
  it("draws no 3D of its own: a tile is its portrait, the stage is the preview", () => {
    expect(pickerSource).not.toContain("CharacterCardLivePreview");
    expect(pickerSource).not.toContain("<Canvas");
    expect(pickerSource).not.toContain("live preview");
    expect(
      existsSync(
        resolve(
          "src/lib/shared/3d/components/controls/character-select/CharacterCardLivePreview.svelte"
        )
      )
    ).toBe(false);
  });

  it("shows a fallback icon when a body has no portrait file", () => {
    expect(pickerSource).toContain("onerror=");
    expect(pickerSource).toContain("character-fallback-icon");
  });
});
