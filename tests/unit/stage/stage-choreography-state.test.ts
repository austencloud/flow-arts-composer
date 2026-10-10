import { describe, expect, it } from "vitest";

import { createStageChoreographyState } from "#lib/features/stage/state/stage-choreography-state.svelte.js";
import { sampleStageFormations } from "#lib/features/stage/domain/stage-formation-sampler.js";
import { resolveStageTravel } from "#lib/features/stage/domain/stage-travel-plan.js";
import { generatePresetPositions } from "#lib/features/stage/state/formation-presets.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { SceneEnvironmentId } from "#lib/shared/3d/environments/domain/scene-environment.js";
import {
  STUDIO_PROJECT_SCHEMA,
  STUDIO_PROJECT_VERSION,
} from "#lib/features/stage/domain/studio-project.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

function sequence(id: string, word: string, stepCount: number): SequenceData {
  return {
    id,
    word,
    name: word,
    steps: Array.from({ length: stepCount }, () => ({})),
  } as unknown as SequenceData;
}

describe("stage choreography state", () => {
  it("undoes tempo changes and leaves no history for the current tempo", () => {
    const state = createStageChoreographyState();
    const original = state.bpm;
    state.setBpm(original);
    expect(state.canUndo).toBe(false);

    state.setBpm(original + 10);
    expect(state.bpm).toBe(original + 10);
    state.undo();
    expect(state.bpm).toBe(original);
    state.redo();
    expect(state.bpm).toBe(original + 10);
    state.destroy();
  });

  it("records one formation drag and ignores a click without movement", () => {
    const state = createStageChoreographyState();
    const formation = state.choreography.formations[1]!;
    const originalBeat = formation.atBeat;
    state.beginDrag();
    state.endDrag();
    expect(state.canUndo).toBe(false);

    state.beginDrag();
    state.moveFormation(formation.id, originalBeat + 4);
    state.endDrag();
    expect(state.choreography.formations[1]!.atBeat).toBe(originalBeat + 4);
    state.undo();
    expect(state.choreography.formations[1]!.atBeat).toBe(originalBeat);
    expect(state.canUndo).toBe(false);
    state.destroy();
  });

  it("restores a null shared sequence ID", () => {
    const state = createStageChoreographyState();
    state.choreography.sharedSequenceId = null;
    state.setSharedSequence(sequence("replacement", "AB", 2));
    state.undo();
    expect(state.choreography.sharedSequenceId).toBeNull();
    state.destroy();
  });

  it("seeds the same versioned Stage project for a guided solo start", () => {
    const state = createStageChoreographyState();

    state.applyStudioStarter({
      startingMaterial: "choose-sequence",
      performerCount: 1,
      formation: "solo",
      environmentId: SceneEnvironmentId.FOREST,
      prop: PropType.POI,
    });

    expect(state.studioProject).toMatchObject({
      schema: STUDIO_PROJECT_SCHEMA,
      version: STUDIO_PROJECT_VERSION,
      stage: {
        environmentId: SceneEnvironmentId.FOREST,
        sharedSequenceId: "tnd-quarter-opp-mpmp",
      },
    });
    expect(state.choreography.performers).toHaveLength(1);
    expect(state.choreography.formations).toHaveLength(1);
    expect(state.choreography.formations[0]).toMatchObject({
      atBeat: 0,
      presetId: "solo",
    });

    state.undo();
    expect(state.choreography.performers).toHaveLength(3);
    state.destroy();
  });

  it("seeds an exact six-person circle from the guided Studio start", () => {
    const state = createStageChoreographyState();

    state.applyStudioStarter({
      startingMaterial: "recommended",
      performerCount: 6,
      formation: "circle",
      environmentId: SceneEnvironmentId.COSMIC,
      prop: PropType.FAN,
    });

    expect(state.choreography.performers).toHaveLength(6);
    expect(state.choreography.formations).toHaveLength(1);
    expect(state.choreography.formations[0]?.presetId).toBe("circle");
    expect(
      Object.keys(state.choreography.formations[0]?.spots ?? {})
    ).toHaveLength(6);
    expect(
      Object.values(state.choreography.formations[0]?.spots ?? {}).every(
        (spot) => Number.isFinite(spot.facingAngle)
      )
    ).toBe(true);
    expect(state.studioProject.version).toBe(STUDIO_PROJECT_VERSION);
    expect(state.studioProject.stage).toBe(state.choreography);
    state.destroy();
  });

  it("authors relational facing for duo presets and clears it for a line", () => {
    const faceToFace = generatePresetPositions("facing-each-other", 2, 10, 8);
    const backToBack = generatePresetPositions("back-to-back", 2, 10, 8);
    const sideBySide = generatePresetPositions("side-by-side", 2, 10, 8);

    expect(faceToFace.map((spot) => spot.facingAngle)).toEqual([Math.PI, 0]);
    expect(backToBack.map((spot) => spot.facingAngle)).toEqual([0, Math.PI]);
    expect(sideBySide.every((spot) => spot.facingAngle === undefined)).toBe(
      true
    );

    const state = createStageChoreographyState();
    state.applyStudioStarter({
      startingMaterial: "recommended",
      performerCount: 2,
      formation: "facing-each-other",
      environmentId: SceneEnvironmentId.EMBER,
      prop: PropType.STAFF,
    });
    const opening = state.choreography.formations[0]!;
    expect(
      Object.values(opening.spots).map((spot) => spot.facingAngle)
    ).toEqual([Math.PI, 0]);

    state.applyPresetToFormation(opening.id, "side-by-side");
    expect(
      Object.values(opening.spots).every(
        (spot) => spot.facingAngle === undefined
      )
    ).toBe(true);
    state.destroy();
  });

  it("creates isolated Stage documents holding one lane across the show", () => {
    const first = createStageChoreographyState();
    const second = createStageChoreographyState();

    expect(first.choreography.id).not.toBe(second.choreography.id);
    expect(first.choreography.performers).toHaveLength(3);
    expect(
      first.choreography.performers.every(
        (performer) => performer.sequenceClips.length === 1
      )
    ).toBe(true);
    expect(first.maxTotalBeats).toBe(64);

    first.destroy();
    second.destroy();
  });

  it("removes a performer by identity and restores the whole row with one undo", () => {
    const state = createStageChoreographyState();
    const [performerA, performerB, performerC] = state.choreography.performers;
    const before = JSON.parse(JSON.stringify(state.choreography));

    expect(state.removePerformers([performerB!.id])).toBe(true);
    expect(
      state.choreography.performers.map((performer) => performer.id)
    ).toEqual([performerA!.id, performerC!.id]);
    expect(
      state.choreography.performers.map((performer) => performer.label)
    ).toEqual(["A", "B"]);
    for (const formation of state.choreography.formations) {
      expect(formation.spots[performerB!.id]).toBeUndefined();
      expect(formation.spots[performerC!.id]).toBeDefined();
    }

    state.undo();
    expect(state.choreography).toEqual(before);
    state.destroy();
  });

  it("refuses to delete the final performer", () => {
    const state = createStageChoreographyState();
    const allIds = state.choreography.performers.map(
      (performer) => performer.id
    );

    expect(state.removePerformers(allIds)).toBe(false);
    expect(state.choreography.performers).toHaveLength(3);
    expect(state.canUndo).toBe(false);
    state.destroy();
  });

  it("adds a library sequence to one performer without changing other lanes", () => {
    const state = createStageChoreographyState();
    const [first, second] = state.choreography.performers;
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    const added = state.addSequenceClip(
      first!.id,
      sequence("sequence-new", "NEW", 6),
      16
    );

    // The opening clip already covers counts 0-64, so a clip dropped inside it
    // lands after it rather than on top of it. Clips carry no label of their
    // own: the timeline reads the word off the resolved sequence.
    expect(added).toMatchObject({
      sequenceId: "sequence-new",
      startBeat: 64,
      durationBeats: 6,
      sourceBeatCount: 6,
    });
    expect(added).not.toHaveProperty("label");
    expect(first!.sequenceClips).toHaveLength(2);
    expect(second!.sequenceClips).toHaveLength(1);
    // The show is as long as its longest lane, so a clip landing after the
    // opening one extends it: 64 counts plus the six this clip adds.
    expect(state.maxTotalBeats).toBe(70);
    state.destroy();
  });

  it("moves, resizes, loops, removes, and undoes a clip", () => {
    const state = createStageChoreographyState();
    const performer = state.choreography.performers[0]!;
    const target = performer.sequenceClips[0]!;

    state.moveSequenceClip(target.id, 10.25);
    state.resizeSequenceClip(target.id, 5.5);
    state.toggleSequenceClipLoop(target.id);

    // The opening clip loops so a short sequence fills the whole show; the
    // toggle is what turns that off.
    expect(target).toMatchObject({
      startBeat: 10.25,
      durationBeats: 5.5,
      loop: false,
    });

    state.removeSequenceClip(target.id);
    expect(performer.sequenceClips.some((clip) => clip.id === target.id)).toBe(
      false
    );
    state.undo();
    expect(
      state.choreography.performers[0]!.sequenceClips.some(
        (clip) => clip.id === target.id
      )
    ).toBe(true);
    state.destroy();
  });

  it("resets one custom Floor trip to inherited timing and undoes it", () => {
    const state = createStageChoreographyState();
    const performer = state.choreography.performers[0]!;
    const destination = state.choreography.formations[1]!;

    state.setPerformerTravelStepCount(destination.id, performer.id, 6);
    const authored = JSON.parse(
      JSON.stringify(destination.spots[performer.id]!.travel)
    );
    expect(authored).toBeDefined();

    expect(state.resetPerformerTravelTiming(destination.id, performer.id)).toBe(
      true
    );
    expect(
      state.choreography.formations[1]!.spots[performer.id]!.travel
    ).toBeUndefined();

    state.undo();
    expect(
      state.choreography.formations[1]!.spots[performer.id]!.travel
    ).toEqual(authored);
    state.destroy();
  });

  it("opens on a line, a triangle, and that triangle reversed", () => {
    const state = createStageChoreographyState();
    const { formations, performers, stageWidth, stageDepth } =
      state.choreography;
    const line = generatePresetPositions(
      "line",
      performers.length,
      stageWidth,
      stageDepth
    );
    const triangle = generatePresetPositions(
      "triangle",
      performers.length,
      stageWidth,
      stageDepth
    );
    const triangleMeanZ =
      triangle.reduce((total, point) => total + point.z, 0) / triangle.length;
    const spotsFor = (positions: typeof line) =>
      Object.fromEntries(
        performers.map((performer, index) => [
          performer.id,
          {
            ...positions[index]!,
            walkStyle: "direct",
            easing: "easeInOut",
          },
        ])
      );

    expect(formations).toEqual([
      {
        id: "default-formation-0",
        atBeat: 0,
        transitionBeats: 0,
        spots: spotsFor(line),
        presetId: "line",
      },
      {
        id: "default-formation-32",
        atBeat: 32,
        transitionBeats: 16,
        spots: spotsFor(triangle),
        presetId: "triangle",
      },
      {
        id: "default-formation-64",
        atBeat: 64,
        transitionBeats: 16,
        spots: spotsFor(
          triangle.map((point) => ({
            x: point.x,
            z: 2 * triangleMeanZ - point.z,
          }))
        ),
      },
    ]);

    state.destroy();
  });

  it("turns the closing triangle inside out over the last sixteen counts", () => {
    const state = createStageChoreographyState();
    const { performers } = state.choreography;
    const at = (beat: number) =>
      sampleStageFormations(state.choreography, beat);

    const held = at(48);
    const arrived = at(64);
    const downstageIndex = held.reduce(
      (nearest, frame, index) =>
        frame.stagePosition.z < held[nearest]!.stagePosition.z
          ? index
          : nearest,
      0
    );

    // The performer nearest the audience walks away from it; whoever was
    // furthest upstage walks toward it. That is the reverse triangle.
    expect(arrived[downstageIndex]!.stagePosition.z).toBeGreaterThan(
      held[downstageIndex]!.stagePosition.z
    );

    // Mirrored through the triangle's OWN mean depth, so the shape turns
    // inside out where it stands instead of being thrown across the stage.
    // Nobody drifts sideways doing it.
    const meanZ =
      held.reduce((total, frame) => total + frame.stagePosition.z, 0) /
      held.length;
    for (const [index, frame] of held.entries()) {
      expect(arrived[index]!.stagePosition.z).toBeCloseTo(
        2 * meanZ - frame.stagePosition.z,
        6
      );
      expect(arrived[index]!.stagePosition.x).toBeCloseTo(
        frame.stagePosition.x,
        6
      );
      // The demo is only a demo if every performer walks. A cast whose middle
      // rank sits on the mean depth turns inside out without moving.
      expect(arrived[index]!.stagePosition.z).not.toBeCloseTo(
        frame.stagePosition.z,
        3
      );
    }

    // Nothing moves before the walk starts, and everyone is walking inside it.
    expect(at(47).every((frame) => !frame.isMoving)).toBe(true);
    expect(at(56).every((frame) => frame.isMoving)).toBe(true);
    expect(performers).toHaveLength(3);
    state.destroy();
  });

  it("reads staging at a count off the formation track", () => {
    const state = createStageChoreographyState();
    const secondFormation = state.choreography.formations[1]!;
    const stagingAt = (beat: number) =>
      sampleStageFormations(state.choreography, beat).map(
        ({ stagePosition }) => ({ ...stagePosition })
      );

    // Count 24 sits inside the walk into the second set, which arrives on 32
    // over sixteen counts.
    const beforeMove = stagingAt(24);

    state.moveFormation(secondFormation.id, 12);

    // Arriving on 12 clamps the walk to the twelve counts since the opening
    // set, so by 24 that walk is long over and everyone is holding the shape.
    expect(
      state.choreography.formations.map((formation) => formation.atBeat)
    ).toEqual([0, 12, 64]);
    expect(state.choreography.formations[1]!.transitionBeats).toBe(12);
    expect(stagingAt(24)).not.toEqual(beforeMove);
    state.destroy();
  });

  it("keeps the Stage environment in the document and its undo history", () => {
    const state = createStageChoreographyState({
      initialEnvironmentId: SceneEnvironmentId.BLOSSOM,
    });

    expect(state.choreography.environmentId).toBe(SceneEnvironmentId.BLOSSOM);
    state.setEnvironmentId(SceneEnvironmentId.OCEAN);
    expect(state.choreography.environmentId).toBe(SceneEnvironmentId.OCEAN);

    state.undo();
    expect(state.choreography.environmentId).toBe(SceneEnvironmentId.BLOSSOM);
    state.redo();
    expect(state.choreography.environmentId).toBe(SceneEnvironmentId.OCEAN);
    state.destroy();
  });

  it("adds a complete formation without moving anyone at that beat", () => {
    const state = createStageChoreographyState();
    const beat = 4;
    const before = sampleStageFormations(state.choreography, beat);

    const added = state.addFormation(beat);

    expect(added).not.toBeNull();
    for (const frame of before) {
      expect(added?.spots[frame.performerId]?.x).toBeCloseTo(
        frame.stagePosition.x,
        6
      );
      expect(added?.spots[frame.performerId]?.z).toBeCloseTo(
        frame.stagePosition.z,
        6
      );
    }
    expect(state.addFormation(beat)).toBeNull();
    state.destroy();
  });

  it("clamps transitions against the previous formation", () => {
    const state = createStageChoreographyState();
    const formation = state.addFormation(12);
    expect(formation).not.toBeNull();

    state.setFormationTransitionBeats(formation!.id, 20.7);

    // A set arriving on 12 cannot walk for longer than the twelve counts since
    // the opening set.
    expect(
      state.choreography.formations.find(
        (candidate) => candidate.id === formation!.id
      )?.transitionBeats
    ).toBe(12);
    state.destroy();
  });

  it("authors and undoes one uninterrupted Director formation transition", () => {
    const state = createStageChoreographyState();
    const before = JSON.parse(JSON.stringify(state.choreography.formations));

    expect(state.applyFormationTransition("circle", 4, "v-shape", 8)).toBe(
      true
    );

    const start = state.choreography.formations.find(
      (formation) => formation.atBeat === 8
    );
    const destination = state.choreography.formations.find(
      (formation) => formation.atBeat === 12
    );
    expect(start).toMatchObject({ presetId: "v-shape" });
    expect(destination).toMatchObject({
      presetId: "circle",
      transitionBeats: 4,
    });
    expect(
      sampleStageFormations(state.choreography, 10).every(
        (frame) => frame.isMoving
      )
    ).toBe(true);

    state.undo();
    expect(state.choreography.formations).toEqual(before);
    state.destroy();
  });

  it("anchors an unqualified transition to the exact sampled live positions", () => {
    const state = createStageChoreographyState();
    const atBeat = 8;
    const before = sampleStageFormations(state.choreography, atBeat);

    state.applyFormationTransition("circle", 4, undefined, atBeat);

    const anchor = state.choreography.formations.find(
      (formation) => formation.atBeat === atBeat
    );
    expect(anchor).toBeDefined();
    for (const frame of before) {
      expect(anchor!.spots[frame.performerId]!.x).toBeCloseTo(
        frame.stagePosition.x,
        6
      );
      expect(anchor!.spots[frame.performerId]!.z).toBeCloseTo(
        frame.stagePosition.z,
        6
      );
    }
    state.destroy();
  });

  it("refuses to replace already-authored travel with a stationary anchor", () => {
    const state = createStageChoreographyState();
    const before = JSON.stringify(state.choreography);
    const beforeRevision = state.historyRevision;
    const beforeFrames = sampleStageFormations(state.choreography, 20);

    expect(() =>
      state.applyFormationTransition("circle", 4, undefined, 24)
    ).toThrow("would change movement before beat 24");
    expect(JSON.stringify(state.choreography)).toBe(before);
    expect(state.historyRevision).toBe(beforeRevision);
    expect(sampleStageFormations(state.choreography, 20)).toEqual(beforeFrames);
    state.destroy();
  });

  it("preserves incoming travel when directing from an existing set", () => {
    const state = createStageChoreographyState();
    const beforeFrames = sampleStageFormations(state.choreography, 20);
    state.applyFormationTransition("circle", 4, undefined, 32);
    expect(sampleStageFormations(state.choreography, 20)).toEqual(beforeFrames);
    state.destroy();
  });

  it("refuses to erase an earlier turn even when the performer stays in place", () => {
    const state = createStageChoreographyState();
    for (const performer of state.choreography.performers) {
      const opening = state.choreography.formations[0]!.spots[performer.id]!;
      opening.facingAngle = 0;
      state.choreography.formations[1]!.spots[performer.id] = {
        ...opening,
        facingAngle: Math.PI / 2,
      };
    }
    const before = JSON.stringify(state.choreography);
    const beforeFacing = sampleStageFormations(state.choreography, 20).map(
      (frame) => frame.bodyFacing
    );
    expect(beforeFacing.every((facing) => facing === Math.PI / 2)).toBe(true);
    expect(() =>
      state.applyFormationTransition("circle", 4, undefined, 24)
    ).toThrow("would change movement before beat 24");
    expect(JSON.stringify(state.choreography)).toBe(before);
    expect(
      sampleStageFormations(state.choreography, 20).map(
        (frame) => frame.bodyFacing
      )
    ).toEqual(beforeFacing);
    state.destroy();
  });

  it("captures actual body facing when creating a permitted held anchor", () => {
    const state = createStageChoreographyState();
    const performer = state.choreography.performers[0]!;
    state.choreography.formations[0]!.spots[performer.id]!.facingAngle =
      Math.PI / 3;
    const facing = sampleStageFormations(state.choreography, 8)[0]!.bodyFacing;
    state.applyFormationTransition("circle", 4, undefined, 8);
    expect(
      state.choreography.formations.find((set) => set.atBeat === 8)!.spots[
        performer.id
      ]!.facingAngle
    ).toBe(facing);
    state.destroy();
  });

  it("refuses a new start shape that would rewrite arrival at an existing set", () => {
    const state = createStageChoreographyState();
    const before = JSON.stringify(state.choreography);
    expect(() =>
      state.applyFormationTransition("circle", 4, "v-shape", 32)
    ).toThrow("would change movement before beat 32");
    expect(JSON.stringify(state.choreography)).toBe(before);
    state.destroy();
  });

  it("replaces old performer timing with the explicitly requested transition duration", () => {
    const state = createStageChoreographyState();
    const destination = state.addFormation(4, "circle")!;
    const performer = state.choreography.performers[0]!;
    state.updatePerformerTravelTiming(destination.id, performer.id, 1, 2);

    state.applyFormationTransition("circle", 4, "v-shape", 0);
    const index = state.choreography.formations.findIndex(
      (set) => set.atBeat === 4
    );
    expect(
      resolveStageTravel(state.choreography, performer.id, index)
    ).toMatchObject({
      departureBeat: 0,
      arrivalBeat: 4,
      durationBeats: 4,
    });
    state.undo();
    expect(
      state.choreography.formations[index]!.spots[performer.id]!.travel
    ).toMatchObject({ departureBeat: 1, arrivalBeat: 2 });
    state.destroy();
  });

  it("authors and undoes one performer's Floor timing without moving the set", () => {
    const state = createStageChoreographyState();
    const performer = state.choreography.performers[0]!;
    const destination = state.choreography.formations[1]!;
    const originalSetBeat = destination.atBeat;

    state.beginDrag();
    state.updatePerformerTravelTiming(destination.id, performer.id, 20, 30);
    state.endDrag();
    state.setPerformerTravelStepCount(destination.id, performer.id, 8);

    expect(
      state.choreography.formations[1]!.spots[performer.id]!.travel
    ).toEqual({
      departureBeat: 20,
      arrivalBeat: 30,
      stepCount: 8,
    });
    expect(destination.atBeat).toBe(originalSetBeat);

    state.undo();
    expect(
      state.choreography.formations[1]!.spots[performer.id]!.travel
    ).toEqual({ departureBeat: 20, arrivalBeat: 30 });
    state.undo();
    expect(
      state.choreography.formations[1]!.spots[performer.id]!.travel
    ).toBeUndefined();
    state.destroy();
  });

  it("does not remove or retime the opening formation", () => {
    const state = createStageChoreographyState();
    const opening = state.choreography.formations[0]!;

    state.removeFormation(opening.id);
    state.moveFormation(opening.id, 6);

    expect(state.choreography.formations[0]).toMatchObject({
      id: opening.id,
      atBeat: 0,
      transitionBeats: 0,
    });
    state.destroy();
  });

  it("re-sorts a moved formation", () => {
    const state = createStageChoreographyState();
    const later = state.addFormation(16);
    expect(later).not.toBeNull();

    state.moveFormation(later!.id, 4);

    expect(
      state.choreography.formations.map((formation) => formation.atBeat)
    ).toEqual([0, 4, 32, 64]);
    expect(state.choreography.formations[1]?.id).toBe(later!.id);
    state.destroy();
  });

  it("round-trips a formation edit through undo and redo", () => {
    const state = createStageChoreographyState();
    const formation = state.choreography.formations[1]!;
    const performer = state.choreography.performers[0]!;
    const originalX = formation.spots[performer.id]!.x;

    // A spot drag commits its intermediate moves as one history entry.
    state.beginDrag();
    state.updateSpotPosition(formation.id, performer.id, originalX + 1, 2);
    state.updateSpotPosition(formation.id, performer.id, originalX + 1, 2);
    state.endDrag();
    expect(state.choreography.formations[1]!.spots[performer.id]!.x).toBe(
      originalX + 1
    );

    state.undo();
    expect(state.choreography.formations[1]!.spots[performer.id]!.x).toBe(
      originalX
    );
    state.redo();
    expect(state.choreography.formations[1]!.spots[performer.id]!.x).toBe(
      originalX + 1
    );
    state.destroy();
  });

  it("finishes an active spot drag before undo and records the next edit", () => {
    const state = createStageChoreographyState();
    const formation = state.choreography.formations[1]!;
    const performer = state.choreography.performers[0]!;
    const originalX = formation.spots[performer.id]!.x;

    state.beginDrag();
    state.updateSpotPosition(formation.id, performer.id, originalX + 1, 2);
    state.undo();
    expect(state.choreography.formations[1]!.spots[performer.id]!.x).toBe(
      originalX
    );

    const originalBpm = state.choreography.bpm;
    state.setBpm(originalBpm + 10);
    state.undo();
    expect(state.choreography.bpm).toBe(originalBpm);
    state.destroy();
  });

  it("records direct spot and Floor timing edits outside gestures", () => {
    const state = createStageChoreographyState();
    const formation = state.choreography.formations[1]!;
    const performer = state.choreography.performers[0]!;
    const originalX = formation.spots[performer.id]!.x;
    const originalTravel = formation.spots[performer.id]!.travel;

    state.updateSpotPosition(formation.id, performer.id, originalX + 1, 2);
    state.updatePerformerTravelTiming(formation.id, performer.id, 4, 8);
    state.undo();
    expect(
      state.choreography.formations[1]!.spots[performer.id]!.travel
    ).toEqual(originalTravel);
    state.undo();
    expect(state.choreography.formations[1]!.spots[performer.id]!.x).toBe(
      originalX
    );
    state.destroy();
  });

  it("keeps every formation complete when performer count changes", () => {
    const state = createStageChoreographyState();
    state.addFormation(16, "circle");

    state.setPerformerCount(6);
    const sixIds = state.choreography.performers.map(
      (performer) => performer.id
    );
    expect(
      state.choreography.formations.every((formation) =>
        sixIds.every((performerId) => formation.spots[performerId])
      )
    ).toBe(true);

    const removedIds = sixIds.slice(2);
    state.setPerformerCount(2);
    expect(
      state.choreography.formations.every((formation) =>
        removedIds.every((performerId) => !formation.spots[performerId])
      )
    ).toBe(true);
    state.destroy();
  });
});

function seedCast(
  state: ReturnType<typeof createStageChoreographyState>,
  performerCount: 1 | 2 | 3
) {
  state.applyStudioStarter({
    startingMaterial: "choose-sequence",
    performerCount,
    formation: "line",
    environmentId: SceneEnvironmentId.FOREST,
    prop: PropType.STAFF,
  });
  state.setSharedSequence(sequence("shared", "SHARED", 8));
}

describe("assignPerformerSequences", () => {
  it("replaces every untouched lane with its own sequence in one undo step", () => {
    const state = createStageChoreographyState();
    seedCast(state, 3);
    const [a, b, c] = state.choreography.performers;
    const revisionBefore = state.historyRevision;

    const changed = state.assignPerformerSequences([
      { performerId: a!.id, sequence: sequence("s1", "ONE", 4) },
      { performerId: b!.id, sequence: sequence("s2", "TWO", 16) },
      { performerId: c!.id, sequence: sequence("s3", "THREE", 8) },
    ]);

    expect(changed).toBe(true);
    expect(
      state.choreography.performers.map((p) =>
        p.sequenceClips.map((clip) => [clip.sequenceId, clip.sourceBeatCount])
      )
    ).toEqual([[["s1", 4]], [["s2", 16]], [["s3", 8]]]);
    expect(state.historyRevision).toBe(revisionBefore + 1);
    expect(state.canUndo).toBe(true);

    state.undo();
    expect(
      state.choreography.performers.map((p) =>
        p.sequenceClips.map((clip) => clip.sequenceId)
      )
    ).toEqual([["shared"], ["shared"], ["shared"]]);
  });

  it("keeps a lane's authored span when the shared clip was stretched", () => {
    const state = createStageChoreographyState();
    seedCast(state, 1);
    const performer = state.choreography.performers[0]!;
    const clip = performer.sequenceClips[0]!;
    state.resizeSequenceClip(clip.id, 32);

    state.assignPerformerSequences([
      { performerId: performer.id, sequence: sequence("s1", "ONE", 4) },
    ]);

    expect(performer.sequenceClips[0]).toMatchObject({
      sequenceId: "s1",
      sourceBeatCount: 4,
      durationBeats: 32,
    });
  });

  it("refuses to overwrite a lane that already holds authored clips", () => {
    const state = createStageChoreographyState();
    seedCast(state, 2);
    const [a, b] = state.choreography.performers;
    state.addSequenceClip(b!.id, sequence("custom", "CUSTOM", 8), 64);
    const before = JSON.stringify(state.choreography.performers);
    const revisionBefore = state.historyRevision;

    expect(() =>
      state.assignPerformerSequences([
        { performerId: a!.id, sequence: sequence("s1", "ONE", 4) },
        { performerId: b!.id, sequence: sequence("s2", "TWO", 4) },
      ])
    ).toThrow(/B/);
    expect(JSON.stringify(state.choreography.performers)).toBe(before);
    expect(state.historyRevision).toBe(revisionBefore);
  });

  it("rejects an assignment that misses a performer or names an unknown one", () => {
    const state = createStageChoreographyState();
    seedCast(state, 2);
    const [a] = state.choreography.performers;
    expect(() =>
      state.assignPerformerSequences([
        { performerId: a!.id, sequence: sequence("s1", "ONE", 4) },
      ])
    ).toThrow(/every performer/i);
    expect(() =>
      state.assignPerformerSequences([
        { performerId: a!.id, sequence: sequence("s1", "ONE", 4) },
        { performerId: "ghost", sequence: sequence("s2", "TWO", 4) },
      ])
    ).toThrow(/every performer/i);
  });
});

describe("stage choreography arrange transforms", () => {
  function snapshotSpots(
    state: ReturnType<typeof createStageChoreographyState>
  ) {
    return JSON.parse(
      JSON.stringify(state.choreography.formations[0]!.spots)
    ) as Record<string, { x: number; z: number }>;
  }

  it("scales the set about its centroid, marks it custom, and undoes in one step", () => {
    const state = createStageChoreographyState();
    const set = state.choreography.formations[0]!;
    const before = snapshotSpots(state);
    const ids = Object.keys(before);
    const centerX =
      ids.reduce((sum, id) => sum + before[id]!.x, 0) / ids.length;
    const centerZ =
      ids.reduce((sum, id) => sum + before[id]!.z, 0) / ids.length;

    expect(state.transformFormationSpots(set.id, { scale: 1.15 })).toBe(true);

    for (const id of ids) {
      expect(set.spots[id]!.x).toBeCloseTo(
        centerX + (before[id]!.x - centerX) * 1.15,
        6
      );
      expect(set.spots[id]!.z).toBeCloseTo(
        centerZ + (before[id]!.z - centerZ) * 1.15,
        6
      );
    }
    expect(set.presetId).toBe("custom");
    expect(state.canUndo).toBe(true);
    state.undo();
    expect(snapshotSpots(state)).toEqual(before);
    expect(state.canUndo).toBe(false);
    state.destroy();
  });

  it("shifts every spot, clamps to the floor, and pushes one history entry", () => {
    const state = createStageChoreographyState();
    const set = state.choreography.formations[0]!;
    const before = snapshotSpots(state);
    const revision = state.historyRevision;

    state.transformFormationSpots(set.id, { dz: -100 });

    for (const id of Object.keys(before)) {
      expect(set.spots[id]!.z).toBe(0);
      expect(set.spots[id]!.x).toBeCloseTo(before[id]!.x, 6);
    }
    expect(state.historyRevision).toBe(revision + 1);
    state.destroy();
  });

  it("returns false for an unknown set", () => {
    const state = createStageChoreographyState();
    expect(state.transformFormationSpots("nope", { dx: 1 })).toBe(false);
    expect(state.canUndo).toBe(false);
    state.destroy();
  });
});
