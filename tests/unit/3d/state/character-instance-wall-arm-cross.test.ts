import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Plane, PlaneMode } from "@austencloud/scene-3d";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/**
 * The viewer shows a sequence in the plane that was asked for. The wall
 * arm-cross rule (AAAA can't be done in wall plane, so show it in dual wheel)
 * is an experiment that stays off unless a caller asks for it. Two silent
 * dangers: the rule creeping back on for everyone, and, while it is on, the
 * chips saying Wheel while the performer still spins in wall or the request
 * being overwritten so the next sequence loses wall too.
 */
const words = JSON.parse(
  readFileSync(path.join(process.cwd(), "static/data/hero/tnd-base-words.json"), "utf8"),
) as SequenceData[];
const word = (id: string) => words.find((candidate) => candidate.id === id)!;

let seq = 0;
function performer(options: { enforceWallPlaneArmCross?: boolean } = {}) {
  const state = createCharacterInstanceState(
    { id: `wall-arm-cross-${seq++}`, positionX: 0, persistent: false, ...options },
    makeStandaloneDeps(),
  );
  state.setPlaneMode(PlaneMode.WALL);
  return state;
}

const planesUsed = (state: ReturnType<typeof performer>) =>
  new Set(state.stepConfigs.flatMap((config) => [config.left?.plane, config.right?.plane]));

describe("CharacterInstanceState: wall plane as asked", () => {
  it("spins AAAA in wall plane when asked, with no stand-in", () => {
    const state = performer();
    state.loadSequence(word("tnd-split-same-aaaa"));
    expect(state.wallPlaneArmCross).toBeNull();
    expect(state.wallPlaneForced).toBe(false);
    expect(state.planeMode).toBe(PlaneMode.WALL);
    expect([state.effectiveLeftPlane, state.effectiveRightPlane]).toEqual([Plane.WALL, Plane.WALL]);
    expect(planesUsed(state)).toEqual(new Set([Plane.WALL]));
  });
});

describe("CharacterInstanceState: the wall arm-cross experiment, switched on", () => {
  const experiment = { enforceWallPlaneArmCross: true };

  it("spins AAAA in dual wheel and says so", () => {
    const state = performer(experiment);
    state.loadSequence(word("tnd-split-same-aaaa"));
    expect(state.wallPlaneForced).toBe(true);
    expect(state.planeMode).toBe(PlaneMode.DUAL_WHEEL);
    expect([state.effectiveLeftPlane, state.effectiveRightPlane]).toEqual([Plane.WHEEL, Plane.WHEEL]);
    expect(planesUsed(state)).toEqual(new Set([Plane.WHEEL]));
  });

  it("keeps the wall request, so the next sequence gets wall again", () => {
    const state = performer(experiment);
    state.loadSequence(word("tnd-split-same-aaaa"));
    state.loadSequence(word("tnd-tog-opp-djdj"));
    expect(state.wallPlaneForced).toBe(false);
    expect(state.planeMode).toBe(PlaneMode.WALL);
    expect(planesUsed(state)).toEqual(new Set([Plane.WALL]));
  });

  it("lets one hand go to wall from the dual wheel it shows", () => {
    const state = performer(experiment);
    state.loadSequence(word("tnd-split-same-aaaa"));
    state.setHandPlane("left", Plane.WALL);
    expect([state.effectiveLeftPlane, state.effectiveRightPlane]).toEqual([Plane.WALL, Plane.WHEEL]);
  });
});
