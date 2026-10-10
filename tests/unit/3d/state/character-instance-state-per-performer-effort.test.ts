import { describe, it, expect } from "vitest";
import { createCharacterInstanceState, makeStandaloneDeps } from "#lib/shared/3d/state/character-instance-state.svelte.js";

function makeConfig(id = "p1") { return { id, positionX: 0 }; }
function makeDeps() { return makeStandaloneDeps(); }

describe("CharacterInstanceState — effort read is per-performer", () => {
  it("effortPreset reflects effective effortId (default linear from cascade)", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    expect(a.effortPreset).toBe("linear");
  });

  it("changing settings via setEffort updates raw effortId", () => {
    // effortPreset reads $derived(effectiveEffortId) — $derived values
    // don't re-evaluate after mutation without a Svelte reactive context.
    // Test the raw state instead; cascade resolution tested in integration.
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setEffort("glide");
    expect(a.settings.effortId).toBe("glide");
  });

  it("two independent instances have independent efforts", () => {
    const a = createCharacterInstanceState(makeConfig("p1"), makeDeps());
    const b = createCharacterInstanceState(makeConfig("p2"), makeDeps());
    a.setEffort("press");
    b.setEffort("punch");
    expect(a.settings.effortId).toBe("press");
    expect(b.settings.effortId).toBe("punch");
  });
});
