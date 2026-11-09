import { describe, expect, it } from "vitest";

import { travelMeansWalking } from "#lib/shared/3d/locomotion/performer-travels.js";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import { stagePerformerTravels } from "#lib/features/stage/domain/stage-travel-plan.js";
import type {
  FormationSpot,
  StageChoreography,
} from "#lib/features/stage/domain/stage-types.js";

const still = { direction: { x: 0, z: 0 }, speed: 0, moving: false };

function spot(x: number, z: number): FormationSpot {
  return { x, z, walkStyle: "direct", easing: "linear" };
}

function stage(destination: FormationSpot): StageChoreography {
  return {
    id: "travels",
    name: "Travels",
    bpm: 120,
    stageWidth: 12,
    stageDepth: 10,
    environmentId: "void",
    performers: [
      { id: "a", index: 0, label: "A", color: "#f66", sequenceClips: [] },
    ],
    formations: [
      { id: "open", atBeat: 0, transitionBeats: 0, spots: { a: spot(1, 5) } },
      {
        id: "next",
        atBeat: 16,
        transitionBeats: 12,
        spots: { a: destination },
      },
    ],
    sharedSequenceId: null,
  };
}

describe("Performer travels", () => {
  it("a stationary travel state does not count as walking", () => {
    expect(travelMeansWalking(still)).toBe(false);
    expect(travelMeansWalking({ ...still, moving: true })).toBe(true);
    expect(travelMeansWalking({ ...still, speed: 1.2 })).toBe(true);
  });

  it("a card performer never travels; once one walks, the flag stays on", () => {
    const performer = createCharacterInstanceState(
      { id: "travels-sticky", positionX: 0, persistent: false },
      makeStandaloneDeps()
    );
    performer.setTravel(still);
    expect(performer.travels).toBe(false);

    performer.setTravel({
      direction: { x: 0, z: 1 },
      speed: 1.2,
      moving: true,
    });
    expect(performer.travels).toBe(true);
    // Stopping keeps the pack loaded for the next walk.
    performer.stopMovement();
    expect(performer.travels).toBe(true);
  });

  it("a stage plan that moves a performer marks them before the first step", () => {
    expect(stagePerformerTravels(stage(spot(1, 5)), "a")).toBe(false);
    expect(stagePerformerTravels(stage(spot(6, 5)), "a")).toBe(true);

    const performer = createCharacterInstanceState(
      { id: "travels-marked", positionX: 0, persistent: false },
      makeStandaloneDeps()
    );
    performer.markTravels();
    expect(performer.travels).toBe(true);
  });
});
