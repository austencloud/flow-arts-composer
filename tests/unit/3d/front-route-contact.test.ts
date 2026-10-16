import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { PlaneMode } from "@austencloud/scene-3d";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import {
  buildStanceYawTrackForSource,
  resolveTrackedUpperBodyStance,
  sampleFrontRouteWeight,
} from "#lib/shared/3d/collision/stance-yaw-track.js";
import {
  buildHardBeatTrack,
  displaceProp,
  sampleHardBeatTrack,
} from "#lib/shared/3d/collision/hard-beat-displacement.js";
import {
  bodyClearanceNeed,
  defaultBodyClearanceModel,
  type StaffLine,
} from "#lib/shared/3d/collision/body-clearance.js";
import { resolvePerformerContact } from "#lib/shared/3d/domain/performer-contact-displacement.js";
import { propStateToStaffTarget } from "#lib/shared/3d/services/swept-volume/swept-volume-builder.js";

it("routes a fleeting side cue through a continuous clear front lane", () => {
  // Reconstructed from the frozen ch22 capture's arm chain and live staff fit.
  const staffLengthM = 0.7677750647379632;
  const measurements = {
    upperArmM: 0.27737262730189777,
    forearmM: 0.26646768112427793,
    shoulderWidthM: 0.3417786504183231,
    reachM: 0.5438403084261757,
  };
  const sequence = JSON.parse(
    readFileSync("tests/fixtures/3d/family-stick-A.sequence.json", "utf8")
  );
  const source = createCharacterInstanceState(
    { id: "front-route-stick-a", characterId: "ch22", persistent: false },
    makeStandaloneDeps()
  );
  source.setPlaneMode(PlaneMode.WALL);
  source.loadSequence(sequence);
  const baseStance = buildStanceYawTrackForSource(source, PlaneMode.WALL)!;
  const baseHands = buildHardBeatTrack({
    source,
    stanceTrack: baseStance,
    heightM: 1.905,
    staffLengthM,
  })!;
  const selected = resolvePerformerContact(source, {
    heightCm: 190.5,
    staffLengthM,
    measurements,
  });
  const routedStance = selected.stanceTrack!;
  const routedHands = selected.track!;
  expect(routedHands.frontRouteOverlay?.events).toHaveLength(2);
  expect(routedStance.frontRouteEvents).toBe(
    routedHands.frontRouteOverlay?.events
  );

  const events = routedStance.frontRouteEvents!;
  for (const time of [-16.125, -0.125, 0.125, 15.875, 16.125]) {
    expect(sampleFrontRouteWeight(events, time, 16, true)).toBeCloseTo(
      sampleFrontRouteWeight(events, time + 16, 16, true),
      10
    );
  }

  const model = defaultBodyClearanceModel({
    heightM: 1.905,
    shoulderHalfWidthM: measurements.shoulderWidthM / 2,
  });
  const samples = (rate: number) => {
    const oldContact: boolean[] = [];
    const newContact: boolean[] = [];
    const oldTarget: number[] = [];
    const newTarget: number[] = [];
    for (let index = 0; index < 16 * rate; index++) {
      const time = index / rate;
      const props = source.propStatesAtScoreTime(time);
      const evaluate = (
        stanceTrack: typeof baseStance,
        hands: typeof baseHands
      ) => {
        const stance = resolveTrackedUpperBodyStance(
          stanceTrack,
          time,
          PlaneMode.WALL,
          props.left,
          props.right,
          measurements
        );
        const move = sampleHardBeatTrack(hands, time);
        const shifted = [
          displaceProp(props.left, move.left),
          displaceProp(props.right, move.right),
        ] as const;
        const depths = [stance.leftDepthOffsetM, stance.rightDepthOffsetM];
        const lines = shifted.map((prop, side): StaffLine | null => {
          if (!prop) return null;
          const line = propStateToStaffTarget(prop, staffLengthM / 2);
          return {
            a: { ...line.tipAWorld, z: line.tipAWorld.z + depths[side]! },
            b: { ...line.tipBWorld, z: line.tipBWorld.z + depths[side]! },
          };
        });
        return {
          contact:
            bodyClearanceNeed(
              lines,
              {
                chestRad: stance.segments.chestRad,
                spine1Rad: stance.segments.spine1Rad,
              },
              model,
              { x: 0, z: -1 }
            ) > 1e-6,
          targetZ: shifted[0]!.worldPosition.z + depths[0]!,
        };
      };
      const old = evaluate(baseStance, baseHands);
      const next = evaluate(routedStance, routedHands);
      oldContact.push(old.contact);
      newContact.push(next.contact);
      oldTarget.push(old.targetZ);
      newTarget.push(next.targetZ);
    }
    expect(
      newContact.every((contact, index) => !contact || oldContact[index])
    ).toBe(true);
    const seamJump = (values: number[]) =>
      Math.max(
        ...[16 * rate - 1, 0].map((index) =>
          Math.abs(values[index]! - values[(index + 1) % values.length]!)
        )
      );
    return { oldJump: seamJump(oldTarget), newJump: seamJump(newTarget) };
  };
  const atThirty = samples(30);
  samples(48);
  expect(atThirty.oldJump).toBeGreaterThan(0.2);
  expect(atThirty.newJump).toBeLessThan(0.08);
});

it("selects the same physical route after a cyclic score rotation", () => {
  const original = JSON.parse(
    readFileSync("tests/fixtures/3d/family-stick-A.sequence.json", "utf8")
  );
  const shift = 3;
  const rotated = structuredClone(original);
  rotated.steps = [
    ...original.steps.slice(shift),
    ...original.steps.slice(0, shift),
  ].map((step, index) => ({ ...step, stepNumber: index + 1 }));
  const first = rotated.steps[0];
  const starting = structuredClone(original.startingPlacement);
  starting.gridPlacement = first.startPlacement;
  starting.startPlacement = first.startPlacement;
  starting.endPlacement = first.startPlacement;
  for (const side of ["left", "right"] as const) {
    const motion = first.motions[side];
    starting.motions[side].startLocation = motion.startLocation;
    starting.motions[side].endLocation = motion.startLocation;
    starting.motions[side].startOrientation = motion.startOrientation;
    starting.motions[side].endOrientation = motion.startOrientation;
  }
  rotated.startingPlacement = starting;
  rotated.startPlacement = starting;

  const makeSource = (sequence: typeof original, id: string) => {
    const source = createCharacterInstanceState(
      { id, characterId: "ch22", persistent: false },
      makeStandaloneDeps()
    );
    source.setPlaneMode(PlaneMode.WALL);
    source.loadSequence(sequence);
    return source;
  };
  const source = makeSource(original, "front-route-phase-original");
  const shifted = makeSource(rotated, "front-route-phase-shifted");
  const options = {
    heightCm: 190.5,
    staffLengthM: 0.7677750647379632,
    measurements: {
      upperArmM: 0.27737262730189777,
      forearmM: 0.26646768112427793,
      shoulderWidthM: 0.3417786504183231,
      reachM: 0.5438403084261757,
    },
  };
  const old = resolvePerformerContact(source, options);
  const next = resolvePerformerContact(shifted, options);
  const centers = (
    events: NonNullable<typeof old.stanceTrack>["frontRouteEvents"]
  ) =>
    events!
      .map((event) => (event.startStep + event.durationSteps / 2) % 16)
      .sort((a, b) => a - b);
  expect(centers(next.stanceTrack!.frontRouteEvents)).toEqual(
    centers(old.stanceTrack!.frontRouteEvents)
      .map((center) => (center - shift + 16) % 16)
      .sort((a, b) => a - b)
  );
  for (const time of [
    0, 0.033333, 0.125, 4.9, 5, 5.033333, 12.9, 13, 13.033333, 15.966667,
  ]) {
    const previousTime = (time + shift) % 16;
    const a = source.propStatesAtScoreTime(previousTime);
    const b = shifted.propStatesAtScoreTime(time);
    expect(
      b.left!.worldPosition.distanceTo(a.left!.worldPosition)
    ).toBeLessThan(1e-5);
    expect(
      b.right!.worldPosition.distanceTo(a.right!.worldPosition)
    ).toBeLessThan(1e-5);
    const aStance = resolveTrackedUpperBodyStance(
      old.stanceTrack,
      previousTime,
      PlaneMode.WALL,
      a.left,
      a.right,
      options.measurements
    );
    const bStance = resolveTrackedUpperBodyStance(
      next.stanceTrack,
      time,
      PlaneMode.WALL,
      b.left,
      b.right,
      options.measurements
    );
    expect(bStance.corridorBlend).toBeCloseTo(aStance.corridorBlend, 5);
    const aHands = sampleHardBeatTrack(old.track!, previousTime);
    const bHands = sampleHardBeatTrack(next.track!, time);
    expect(bHands.left.depthM).toBeCloseTo(aHands.left.depthM, 5);
    expect(bHands.right.depthM).toBeCloseTo(aHands.right.depthM, 5);
  }
});
