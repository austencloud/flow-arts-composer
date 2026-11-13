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
 * AAAA can't be done in wall plane (the arms would pass through each other),
 * so the viewer shows it in dual wheel. The danger is a silent one: the
 * chips say Wheel while the performer still spins in wall, or the request
 * gets overwritten so the next sequence loses wall too.
 */
const words = JSON.parse(
  readFileSync(path.join(process.cwd(), "static/data/hero/tnd-base-words.json"), "utf8"),
) as SequenceData[];
const word = (id: string) => words.find((candidate) => candidate.id === id)!;

let seq = 0;
function performer(allowImpossibleWall = false) {
  const state = createCharacterInstanceState(
    { id: `wall-arm-cross-${seq++}`, positionX: 0, persistent: false, allowImpossibleWall },
    makeStandaloneDeps(),
  );
  state.setPlaneMode(PlaneMode.WALL);
  return state;
}

const planesUsed = (state: ReturnType<typeof performer>) =>
  new Set(state.stepConfigs.flatMap((config) => [config.left?.plane, config.right?.plane]));

describe("CharacterInstanceState: wall ruled out for AAAA", () => {
  it("spins AAAA in dual wheel and says so", () => {
    const state = performer();
    state.loadSequence(word("tnd-split-same-aaaa"));
    expect(state.wallPlaneForced).toBe(true);
    expect(state.planeMode).toBe(PlaneMode.DUAL_WHEEL);
    expect([state.effectiveLeftPlane, state.effectiveRightPlane]).toEqual([Plane.WHEEL, Plane.WHEEL]);
    expect(planesUsed(state)).toEqual(new Set([Plane.WHEEL]));
  });

  it("keeps the wall request, so the next sequence gets wall again", () => {
    const state = performer();
    state.loadSequence(word("tnd-split-same-aaaa"));
    state.loadSequence(word("tnd-tog-opp-djdj"));
    expect(state.wallPlaneForced).toBe(false);
    expect(state.planeMode).toBe(PlaneMode.WALL);
    expect(planesUsed(state)).toEqual(new Set([Plane.WALL]));
  });

  it("lets one hand go to wall from the dual wheel it shows", () => {
    const state = performer();
    state.loadSequence(word("tnd-split-same-aaaa"));
    state.setHandPlane("left", Plane.WALL);
    expect([state.effectiveLeftPlane, state.effectiveRightPlane]).toEqual([Plane.WALL, Plane.WHEEL]);
  });

  it("leaves wall alone for contact research that opts out", () => {
    const state = performer(true);
    state.loadSequence(word("tnd-split-same-aaaa"));
    expect(state.wallPlaneForced).toBe(false);
    expect(planesUsed(state)).toEqual(new Set([Plane.WALL]));
  });
});
