import { describe, it, expect } from "vitest";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { getSceneUndoManager } from "#lib/shared/3d/undo/get-scene-undo-manager.js";

function makeConfig() {
  return { id: "p1", positionX: 0 };
}
function makeDeps() {
  return makeStandaloneDeps();
}

describe("CharacterInstanceState — performer settings", () => {
  it("starts with null raw settings (inherits from defaults)", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    expect(a.settings.effortId).toBeNull();
    expect(a.settings.prop).toBeNull();
    expect(a.settings.effect).toBeNull();
    expect(a.settings.propBuild).toBeNull();
  });

  it("effective values resolve to defaults when raw settings are null", () => {
    // $derived values evaluate correctly on first read (before any mutation)
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    expect(a.effectiveEffortId).toBe("linear");
    expect(a.effectiveProp).toBe(PropType.STAFF);
    // The effect override starts null (inherit the global default).
    expect(a.rawEffect).toBeNull();
  });

  it("setEffort updates raw effortId", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setEffort("glide");
    expect(a.settings.effortId).toBe("glide");
    // NOTE: effectiveEffortId is $derived — re-evaluation after mutation
    // requires a Svelte reactive context (component/effect root), so we
    // only assert the raw state here. Cascade resolution tested in integration.
  });

  it("setProp updates raw prop", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setProp(PropType.FAN);
    expect(a.settings.prop).toBe(PropType.FAN);
  });

  it("setEffect sets the single active effect (radio)", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setEffect("trails");
    expect(a.settings.effect).toBe("trails");
    // Selecting another replaces it - one effect at a time.
    a.setEffect("fire");
    expect(a.settings.effect).toBe("fire");
  });

  it("setEffect('none') turns the effect explicitly off", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setEffect("fire");
    a.setEffect("none");
    expect(a.settings.effect).toBe("none");
  });

  it("hasOverride starts false for all categories", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    expect(a.hasOverride.prop).toBe(false);
    expect(a.hasOverride.effects).toBe(false);
    expect(a.hasOverride.effort).toBe(false);
    expect(a.hasOverride.planes).toBe(false);
    expect(a.hasAnyOverride).toBe(false);
  });

  it("resetProp clears prop override to null", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setProp(PropType.FAN);
    expect(a.settings.prop).toBe(PropType.FAN);
    a.resetProp();
    expect(a.settings.prop).toBeNull();
  });

  it("sets and resets a partial prop build override", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setPropBuild({ fanBuild: "fire", fanCover: "bare" });
    expect(a.settings.propBuild).toEqual({
      fanBuild: "fire",
      fanCover: "bare",
    });
    a.resetPropBuild();
    expect(a.settings.propBuild).toBeNull();
  });

  it("resetEffort clears effort override to null", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setEffort("glide");
    expect(a.settings.effortId).toBe("glide");
    a.resetEffort();
    expect(a.settings.effortId).toBeNull();
  });

  it("resetEffects clears the effect override to null (inherit)", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setEffect("trails");
    expect(a.settings.effect).toBe("trails");
    a.resetEffects();
    expect(a.settings.effect).toBeNull();
  });

  it("displayName starts null and setDisplayName assigns / trims / clears", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    expect(a.displayName).toBeNull();
    a.setDisplayName("  Jade  ");
    expect(a.displayName).toBe("Jade"); // trimmed
    a.setDisplayName("");
    expect(a.displayName).toBeNull(); // empty clears the override
    a.setDisplayName("Nova");
    a.setDisplayName(null);
    expect(a.displayName).toBeNull();
  });

  it("undoes and redoes a character change", () => {
    const undo = getSceneUndoManager();
    undo.clear();
    const a = createCharacterInstanceState(makeConfig(), makeDeps());

    a.setCharacter("y-bot");
    expect(a.characterId).toBe("y-bot");
    expect(undo.historySize).toBe(1);

    undo.undo();
    expect(a.characterId).toBe("x-bot");

    undo.redo();
    expect(a.characterId).toBe("y-bot");
  });

  it("resetAllOverrides clears all settings to null, preserves staffLengthCm", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setProp(PropType.FAN);
    a.setEffort("glide");
    a.setEffect("trails");
    a.setStaffLengthCm(120);
    a.setPropBuild({ finish: "day" });
    a.resetAllOverrides();
    expect(a.settings.prop).toBeNull();
    expect(a.settings.effortId).toBeNull();
    expect(a.settings.effect).toBeNull();
    expect(a.settings.staffLengthCm).toBe(120);
    expect(a.settings.propBuild).toBeNull();
  });
});

describe("CharacterInstanceState — an effect equips the build that carries it", () => {
  it("swaps the default staff for the fire staff when fire is chosen", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    expect(a.effectiveProp).toBe(PropType.STAFF);
    a.setEffect("fire");
    expect(a.settings.effect).toBe("fire");
    expect(a.settings.prop).toBe(PropType.FIRE_DOUBLE_STAFF);
  });

  it("puts a fan on the fire build rather than burning paper", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setProp(PropType.FAN);
    a.setPropBuild({ fanBuild: "day", fanCover: "covered" });
    a.setEffect("fire");
    expect(a.settings.prop).toBe(PropType.FAN);
    expect(a.settings.propBuild).toEqual({
      fanBuild: "fire",
      fanCover: "bare",
    });
  });

  it("keeps unrelated build overrides when it equips", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setProp(PropType.FAN);
    a.setPropBuild({ fanFrameColor: "white" });
    a.setEffect("fire");
    expect(a.settings.propBuild).toEqual({
      fanFrameColor: "white",
      fanBuild: "fire",
    });
  });

  it("leaves the build alone for an effect that needs no build", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setProp(PropType.FAN);
    a.setEffect("trails");
    expect(a.settings.prop).toBe(PropType.FAN);
    expect(a.settings.propBuild).toBeNull();
  });

  it("keeps the equipped build when the effect is turned back off", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setProp(PropType.FAN);
    a.setEffect("fire");
    a.setEffect("none");
    expect(a.settings.propBuild).toEqual({ fanBuild: "fire" });
  });

  it("undoes the effect and the build it equipped as one step", () => {
    const undo = getSceneUndoManager();
    undo.clear();
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setProp(PropType.FAN);
    const historyBefore = undo.historySize;

    a.setEffect("fire");
    // One entry for both halves - two would let Ctrl+Z drop the effect and
    // leave the fan on the fire build.
    expect(undo.historySize).toBe(historyBefore + 1);
    expect(a.settings.propBuild).toEqual({ fanBuild: "fire" });

    undo.undo();
    expect(a.settings.effect).toBeNull();
    expect(a.settings.propBuild).toBeNull();
    expect(a.settings.prop).toBe(PropType.FAN);
  });
});

describe("CharacterInstanceState — picking a prop mid-effect equips too", () => {
  it("hands a burning performer a fire fan, not a pictograph one", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setEffect("fire"); // default staff -> fire staff
    a.setProp(PropType.FAN);
    expect(a.settings.prop).toBe(PropType.FAN);
    expect(a.settings.propBuild).toEqual({ fanBuild: "fire" });
  });

  it("respects an in-family build choice instead of bouncing it back", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setEffect("fire");
    expect(a.settings.prop).toBe(PropType.FIRE_DOUBLE_STAFF);
    // The Double Staff build radio is the performer overriding the equip.
    a.setProp(PropType.STAFF);
    expect(a.settings.prop).toBe(PropType.STAFF);
  });

  it("leaves the prop alone when no effect is running", () => {
    const a = createCharacterInstanceState(makeConfig(), makeDeps());
    a.setProp(PropType.CLUB);
    expect(a.settings.prop).toBe(PropType.CLUB);
    expect(a.settings.propBuild).toBeNull();
  });
});
