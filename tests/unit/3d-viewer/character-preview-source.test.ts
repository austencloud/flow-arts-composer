import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveCharacterPreviewPerformer } from "#lib/shared/3d/components/controls/character-select/character-preview-source.js";

const pickerSource = readFileSync(
  resolve(
    "src/lib/shared/3d/components/controls/PerformerCharacterPicker.svelte"
  ),
  "utf8"
);
const previewSource = readFileSync(
  resolve(
    "src/lib/shared/3d/components/controls/character-select/CharacterCardLivePreview.svelte"
  ),
  "utf8"
);

describe("character picker live preview source", () => {
  const performers = [{ id: "performer-1" }, { id: "performer-2" }];

  it("uses the lowest-number performer for an all-performers preview", () => {
    expect(resolveCharacterPreviewPerformer(performers, null)).toBe(
      performers[0]
    );
  });

  it("uses the selected performer and safely falls back when selection is stale", () => {
    expect(resolveCharacterPreviewPerformer(performers, 1)).toBe(performers[1]);
    expect(resolveCharacterPreviewPerformer(performers, 99)).toBe(
      performers[0]
    );
    expect(resolveCharacterPreviewPerformer([], null)).toBeNull();
  });

  it("keeps WebGL to the pinned personal portrait plus one interaction preview", () => {
    expect(pickerSource.match(/<CharacterCardLivePreview/g)).toHaveLength(1);
    expect(pickerSource).toContain("{#if hasLivePreview}");
    expect(pickerSource).toContain(
      "isPersonalCharacter || livePreviewCharacterId === definition.id"
    );
    expect(previewSource).toContain("<CanvasLifecycle />");
    expect(previewSource).toContain('renderMode="on-demand"');
    expect(previewSource).not.toContain("<Scene3D");
  });

  it("plays only the hovered or focused preview and honors reduced motion", () => {
    expect(previewSource).toContain(
      "active && !reduceMotion && previewState.hasSequence"
    );
    expect(previewSource).toContain("autoRotate={active && !reduceMotion}");
    expect(pickerSource).toContain(
      "focusedCharacterId ?? hoveredCharacterId ?? restingPreviewCharacterId"
    );
    expect(pickerSource).toMatch(
      /personalCharacterId\s*\?\?\s*selectedCharacterId/
    );
  });
});
