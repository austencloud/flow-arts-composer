import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CHARACTER_ID } from "#lib/shared/3d/domain/character-model.js";
import { createPerformerManager } from "#lib/shared/3d/state/performer-manager.svelte.js";

describe("performer manager count transitions", () => {
  let now = 1_000;

  beforeEach(() => {
    vi.spyOn(performance, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("brings a new character in while the existing cast glides into place", () => {
    const manager = createPerformerManager({
      initialCharacterId: DEFAULT_CHARACTER_ID,
      maxPerformers: 8,
    });
    manager.initialize();

    const original = manager.performers[0];
    expect(original?.position.x).toBe(0);
    expect(original?.position.z).toBe(0);

    const addTargets = manager.addPerformer();

    expect(addTargets?.map((target) => target.position.x)).toEqual([-1, 1]);

    const added = manager.performers[1];
    expect(added?.position.x).toBe(1);
    expect(added?.position.z).toBe(0);
    expect(original?.position.x).toBe(0);
    expect(original?.position.z).toBe(0);
    expect(added?.presenceProgress).toBe(0);
    expect(manager.renderablePerformers.map((item) => item.presencePhase)).toEqual([
      "present",
      "entering",
    ]);

    manager.updateFormationTransition(now + 140);
    expect(original?.position.x).toBeCloseTo(-0.5);
    expect(original?.position.z).toBe(0);
    expect(added?.position.x).toBe(1);
    expect(added?.position.z).toBe(0);
    expect(added?.presenceProgress).toBeCloseTo(0.5);

    manager.updateFormationTransition(now + 280);
    expect(original?.position.x).toBe(-1);
    expect(original?.position.z).toBe(0);
    expect(added?.position.x).toBe(1);
    expect(added?.position.z).toBe(0);
    expect(added?.presenceProgress).toBe(1);
    expect(manager.renderablePerformers[1]?.presencePhase).toBe("present");

    manager.destroy();
  });

  it("uses the host stage's heading for same-direction casts", () => {
    const frontStageFacingAngle = Math.PI;
    const manager = createPerformerManager({
      initialCharacterId: DEFAULT_CHARACTER_ID,
      maxPerformers: 8,
      getFrontStageFacingAngle: () => frontStageFacingAngle,
    });

    manager.initialize();
    expect(manager.performers[0]?.facingAngle).toBe(frontStageFacingAngle);

    manager.addPerformer();
    manager.updateFormationTransition(now + 280);
    expect(
      manager.performers.map((performer) => performer.facingAngle)
    ).toEqual([frontStageFacingAngle, frontStageFacingAngle]);

    manager.destroy();
  });

  it("keeps the departing character visible while survivors close the layout", () => {
    const manager = createPerformerManager({
      initialCharacterId: DEFAULT_CHARACTER_ID,
      maxPerformers: 8,
    });
    manager.initialize();
    manager.addPerformer();
    manager.updateFormationTransition(now + 280);

    const survivor = manager.performers[0];
    expect(survivor?.position.x).toBe(-1);
    expect(survivor?.position.z).toBe(0);

    now = 2_000;
    const removeTargets = manager.removePerformer();

    expect(removeTargets?.map((target) => target.position.x)).toEqual([0]);

    expect(manager.performers).toHaveLength(1);
    expect(manager.renderablePerformers).toHaveLength(2);
    expect(manager.renderablePerformers[1]?.presencePhase).toBe("exiting");
    expect(survivor?.position.x).toBe(-1);
    expect(survivor?.position.z).toBe(0);

    manager.updateFormationTransition(now + 140);
    expect(survivor?.position.x).toBeCloseTo(-0.5);
    expect(survivor?.position.z).toBe(0);
    expect(
      manager.renderablePerformers.find((item) => item.presencePhase === "exiting")
        ?.performer.presenceProgress
    ).toBeCloseTo(0.5);

    manager.updateFormationTransition(now + 280);
    expect(survivor?.position.x).toBe(0);
    expect(survivor?.position.z).toBe(0);
    expect(manager.renderablePerformers).toHaveLength(1);

    manager.destroy();
  });

  it("removes the requested performer without replacing another cast member", () => {
    const manager = createPerformerManager({
      initialCharacterId: DEFAULT_CHARACTER_ID,
      maxPerformers: 8,
    });
    manager.initialize();
    manager.addPerformer();
    manager.updateFormationTransition(now + 280);

    now = 2_000;
    manager.addPerformer();
    manager.updateFormationTransition(now + 280);

    const originalIds = manager.performers.map((performer) => performer.id);
    expect(originalIds).toEqual(["performer-0", "performer-1", "performer-2"]);

    now = 3_000;
    manager.removePerformer(1);

    expect(manager.performers.map((performer) => performer.id)).toEqual([
      "performer-0",
      "performer-2",
    ]);

    now = 4_000;
    manager.addPerformer();
    const idsAfterReAdd = manager.performers.map((performer) => performer.id);
    expect(idsAfterReAdd).toEqual([
      "performer-0",
      "performer-2",
      "performer-3",
    ]);
    expect(new Set(idsAfterReAdd).size).toBe(idsAfterReAdd.length);

    manager.destroy();
  });

  it("carries performer velocity through a rapid count retarget", () => {
    const manager = createPerformerManager({
      initialCharacterId: DEFAULT_CHARACTER_ID,
      maxPerformers: 8,
    });
    manager.initialize();
    manager.addPerformer();

    manager.updateFormationTransition(now + 120);
    const beforeRetarget = manager.performers[0]!.position.x;
    const firstTiming = manager.formationTransitionTiming;

    now += 120;
    manager.addPerformer();
    const replacementTiming = manager.formationTransitionTiming;
    manager.updateFormationTransition(now + 1);
    const afterRetarget = manager.performers[0]!.position.x;

    expect(replacementTiming?.id).not.toBe(firstTiming?.id);
    expect(replacementTiming?.startTimeMs).toBe(now);
    expect(afterRetarget).toBeLessThan(beforeRetarget);

    manager.destroy();
  });

  it("settles character presence and layout immediately for reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true })
    );
    const manager = createPerformerManager({
      initialCharacterId: DEFAULT_CHARACTER_ID,
      maxPerformers: 8,
    });
    manager.initialize();

    manager.addPerformer();
    expect(manager.performers.map((performer) => performer.position.x)).toEqual([
      -1, 1,
    ]);
    expect(manager.performers[1]?.presenceProgress).toBe(1);
    expect(manager.renderablePerformers.map((item) => item.presencePhase)).toEqual([
      "present",
      "present",
    ]);

    manager.removePerformer();
    expect(manager.performers[0]?.position.x).toBe(0);
    expect(manager.renderablePerformers).toHaveLength(1);

    manager.destroy();
  });
});
