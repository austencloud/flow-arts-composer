import { describe, expect, it } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { CharacterInstanceState } from "../../state/character-instance-state.svelte.js";
import { DEFAULT_PERFORMER_HAND_DISTANCE, fixedHandDistance } from "../../domain/performer-hand-distance.js";
import { createComposerCaptureRequestMemo } from "./composer-capture-request.js";

const score = {
  steps: [{ stepNumber: 1, duration: 1, motions: { left: "a", right: "b" } }],
} as unknown as SequenceData;

function performerFixture() {
  const fields = {
    id: "p1",
    loadedSequence: null as SequenceData | null,
    characterId: "ch01",
    effectivePropBuild: { size: "standard" },
    effectiveEffortId: "default",
    handDistance: DEFAULT_PERFORMER_HAND_DISTANCE,
    settings: { staffLengthCm: null as number | null },
    effectiveLeftPlane: "wall",
    effectiveRightPlane: "wall",
    beatPlaneOverrides: new Map<number, { left?: string; right?: string }>(),
  };
  return { fields, performer: fields as unknown as CharacterInstanceState };
}

describe("Composer capture request memo", () => {
  it("reuses a request across playback ticks, but invalidates every capture input", () => {
    const memo = createComposerCaptureRequestMemo();
    const { fields, performer } = performerFixture();
    let prop = PropType.STAFF;
    let effect = "fire";
    let leftFlipped = false;
    let rightFlipped = false;
    let fallback = score;
    const request = () => memo(performer, fallback, prop, effect, leftFlipped, rightFlipped);
    let previous = request();
    expect(request()).toBe(previous);

    const changed = () => {
      const next = request();
      expect(next).not.toBe(previous);
      previous = next;
      expect(request()).toBe(previous);
    };

    fields.characterId = "ch02"; changed();
    prop = PropType.FAN; changed();
    fields.effectivePropBuild = { size: "large" }; changed();
    effect = "led"; changed();
    leftFlipped = true; changed();
    rightFlipped = true; changed();
    fields.effectiveEffortId = "gentle"; changed();
    fields.handDistance = {
      left: fixedHandDistance(0.35),
      right: fixedHandDistance(0.35),
    }; changed();
    fields.settings.staffLengthCm = 120; changed();
    fields.effectiveLeftPlane = "wheel"; changed();
    fields.effectiveRightPlane = "floor"; changed();
    fields.beatPlaneOverrides = new Map([[1, { left: "wall" }]]); changed();
    fallback = { ...score, steps: [{ ...score.steps[0]!, duration: 2 }] }; changed();
    fields.loadedSequence = score; changed();
    fields.id = "p2"; changed();
  });
});
