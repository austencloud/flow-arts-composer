import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { SceneEnvironmentId } from "#lib/shared/3d/environments/domain/scene-environment.js";
import type { BuiltTunnelLayer } from "./tunnel-layer-builder";
import { tunnelStepIndexAt } from "./tunnel-prop-sampling";
import {
  applyTunnelCastToViewer,
  buildTunnelCast3D,
  TUNNEL_CAST_DEPTH_SPACING_M,
  tunnelCastPerformerSteps,
  tunnelCastStandings,
  type TunnelCastPerformer3D,
  type TunnelCastViewer,
} from "./tunnel-cast-3d";

function sequence(id: string, beats: number): SequenceData {
  return {
    id,
    steps: Array.from({ length: beats }, () => ({})),
  } as unknown as SequenceData;
}

function layer(
  stageInstanceId: string,
  performerLabel: string,
  drawn: SequenceData,
  stepOffset = 0
): BuiltTunnelLayer {
  return {
    stageInstanceId,
    performerLabel,
    performerId: stageInstanceId,
    arm: 0,
    stepOffset,
    speed: 1,
    sequence: drawn,
    performerSequence: drawn,
  } as unknown as BuiltTunnelLayer;
}

const FRONT = sequence("front", 8);
const BACK = sequence("back", 8);

function cast(): TunnelCastPerformer3D[] {
  return buildTunnelCast3D(
    [layer("i0", "Front", FRONT), layer("i1", "Back", BACK)],
    [
      { leftHex: "#0000ff", rightHex: "#ff0000" },
      { leftHex: "#00ff00", rightHex: "#ffff00" },
    ],
    (l) => ({ offset: l.stepOffset, speed: l.speed })
  );
}

function fakeViewer(environmentId: string = SceneEnvironmentId.COSMIC) {
  const loads: string[] = [];
  const makeRig = () => {
    const rig = {
      position: { x: 0, z: 0 },
      facingAngle: 0,
      sourceSequence: null as SequenceData | null,
      displayName: null as string | null,
      snapFacingAngle(angle: number) {
        rig.facingAngle = angle;
      },
      setDisplayName(name: string | null) {
        rig.displayName = name;
      },
      loadSequence(next: SequenceData) {
        loads.push(next.id);
        rig.sourceSequence = next;
      },
    };
    return rig;
  };
  const performers = [makeRig()];
  const viewer = {
    environmentId,
    performerManager: {
      performers,
      ensurePerformerCount(count: number) {
        while (performers.length < count) performers.push(makeRig());
      },
      removePerformer(index = performers.length - 1) {
        performers.splice(index, 1);
      },
      cancelFormationTransition() {},
    },
  } as unknown as TunnelCastViewer;
  return { viewer, performers, loads };
}

describe("tunnel cast in 3D", () => {
  it("gives each layer its drawn sequence, label and tunnel colors, front first", () => {
    const performers = cast();
    expect(performers.map((p) => p.label)).toEqual(["Front", "Back"]);
    expect(performers.map((p) => p.sequence)).toEqual([FRONT, BACK]);
    expect(performers[1]!.colors).toEqual({ left: "#00ff00", right: "#ffff00" });
  });

  it("puts every performer on the beat the 2D tunnel draws for that layer", () => {
    const staggered = buildTunnelCast3D(
      [layer("i0", "Front", FRONT), layer("i1", "Back", BACK, 3)],
      [],
      (l) => ({ offset: l.stepOffset, speed: l.speed })
    );
    for (const currentStep of [0.4, 1, 2.5, 7.9, 9.25]) {
      const steps = tunnelCastPerformerSteps(staggered, currentStep);
      staggered.forEach((performer, index) => {
        const step = steps[index]!;
        // 3D step N is 2D beat N; 2D cell index N-1 is beat N.
        const twoDIndex = tunnelStepIndexAt(8, currentStep, performer.offset, 1);
        if (step >= 1) expect(Math.floor(step) - 1).toBe(twoDIndex);
      });
    }
    expect(tunnelCastPerformerSteps(staggered, 2)).toEqual([2, 5]);
  });

  it("stands the cast in a file facing the camera, front nearest it", () => {
    const [front, back] = tunnelCastStandings(2, SceneEnvironmentId.COSMIC);
    expect(front!.x).toBe(0);
    expect(back!.x).toBe(0);
    expect(front!.z - back!.z).toBeCloseTo(TUNNEL_CAST_DEPTH_SPACING_M);
    expect(front!.facingAngle).toBe(0);

    // Ember's camera opens from the other side of the stage.
    const [emberFront, emberBack] = tunnelCastStandings(2, SceneEnvironmentId.EMBER);
    expect(emberFront!.z).toBeLessThan(emberBack!.z);
    expect(emberFront!.facingAngle).toBeCloseTo(Math.PI);
  });

  it("stands the file at a custom spacing, centred on the stage", () => {
    const [front, back] = tunnelCastStandings(2, SceneEnvironmentId.COSMIC, 0.9);
    expect(front!.z - back!.z).toBeCloseTo(0.9);
    expect(front!.z + back!.z).toBeCloseTo(0);
    expect(tunnelCastStandings(3, SceneEnvironmentId.COSMIC)).toEqual(
      tunnelCastStandings(3, SceneEnvironmentId.COSMIC, TUNNEL_CAST_DEPTH_SPACING_M)
    );
  });

  it("moves an already-staged cast when only the spacing changes", () => {
    const { viewer, performers, loads } = fakeViewer();
    applyTunnelCastToViewer(viewer, cast());
    expect(applyTunnelCastToViewer(viewer, cast(), { spacing: 0.9 })).toBe(true);
    expect(performers[0]!.position.z - performers[1]!.position.z).toBeCloseTo(0.9);
    expect(loads).toEqual(["front", "back"]);
    expect(applyTunnelCastToViewer(viewer, cast(), { spacing: 0.9 })).toBe(false);
  });

  it("stages the cast once and leaves an already-staged cast alone", () => {
    const { viewer, performers, loads } = fakeViewer();
    expect(applyTunnelCastToViewer(viewer, cast())).toBe(true);
    expect(performers).toHaveLength(2);
    expect(performers.map((p) => p.sourceSequence)).toEqual([FRONT, BACK]);
    expect(performers.map((p) => p.displayName)).toEqual(["Front", "Back"]);
    expect(loads).toEqual(["front", "back"]);

    expect(applyTunnelCastToViewer(viewer, cast())).toBe(false);
    expect(loads).toEqual(["front", "back"]);
  });

  it("puts back a sequence the viewer loaded over a performer without moving anyone", () => {
    const { viewer, performers } = fakeViewer();
    applyTunnelCastToViewer(viewer, cast());
    performers[1]!.loadSequence(FRONT);
    expect(applyTunnelCastToViewer(viewer, cast())).toBe(false);
    expect(performers[1]!.sourceSequence).toBe(BACK);
  });
});
