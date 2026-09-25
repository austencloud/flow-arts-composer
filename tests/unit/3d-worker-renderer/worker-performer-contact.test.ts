import { Group, Vector3, type Object3D } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaneMode } from "@austencloud/scene-3d";
import type { WorkerPerformerSnapshot } from "$lib/shared/3d/worker-renderer/domain/worker-renderer-protocol";
import { WorkerPerformer } from "$lib/shared/3d/worker-renderer/worlds/worker-performer";
import { createWorkerPerformerSnapshot } from "$lib/shared/3d/worker-renderer/services/worker-performer-snapshot";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
  type CharacterInstanceState,
} from "$lib/shared/3d/state/character-instance-state.svelte";
import { propContinuityCorpus } from "../../tools/prop-continuity-corpus";

/** The avatar the worker would load, reduced to the calls it makes. The
 *  contact hooks are optional on the animator, so `bare` leaves them out. */
const avatar = vi.hoisted(() => ({
  bare: false,
  root: null as Object3D | null,
  animator: {
    resetContactHistory: vi.fn(),
    setPairSeparation: vi.fn(),
    getPalmWorldPoint: vi.fn(),
    setPropsAndBlend: vi.fn(),
    setExternalSpinePitch: vi.fn(),
    setStanceYaw: vi.fn(),
    setStanceYawSegments: vi.fn(),
    setHeadDodgeEnabled: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@austencloud/scene-3d/worker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@austencloud/scene-3d/worker")>()),
  createAvatarServices: () => {
    const {
      resetContactHistory: _reset,
      setPairSeparation: _separation,
      getPalmWorldPoint: _palm,
      ...bare
    } = avatar.animator;
    return {
      animator: avatar.bare ? bare : avatar.animator,
      skeleton: {
        loadModel: async () => {},
        setHeight: () => {},
        getRoot: () => avatar.root,
        getState: () => ({ fingerChains: null }),
        getFeetOffset: () => 0,
        updateMatrices: () => {},
        dispose: () => {},
      },
      fingers: {
        initialize: () => {},
        isReady: () => false,
        setGrips: () => {},
        update: () => {},
        dispose: () => {},
      },
    };
  },
}));

vi.mock(
  "$lib/shared/3d/worker-renderer/worlds/props/worker-prop-factory",
  async () => {
    const { Group: VisualRoot } = await import("three");
    return {
      createWorkerPropVisual: async () => ({
        ok: true,
        visual: {
          root: new VisualRoot(),
          setState: () => {},
          dispose: () => {},
        },
      }),
    };
  }
);

const PROP_BUILD = {
  finish: "fire",
  fanBuild: "pictograph",
  fanFrameColor: "black",
  fanCover: "bare",
} as const;

function held(x: number) {
  return {
    centerPathAngle: 0,
    staffRotationAngle: 0,
    plane: "wall",
    handAnchor: [0.1, 0, 0.3] as [number, number, number],
    flipped: false,
    worldPosition: [x, 1.2, 0] as [number, number, number],
    worldRotation: [0, 0, 0, 1] as [number, number, number, number],
    gripType: "square",
  };
}

function snapshot(
  contact: Partial<
    Pick<WorkerPerformerSnapshot, "contactResetKey" | "pairSeparation">
  >
): WorkerPerformerSnapshot {
  return {
    id: "performer",
    avatarId: "x-bot",
    position: [1, 0, -2],
    facingAngle: Math.PI / 3,
    avatarHeightCm: 190.5,
    groundY: -1.5,
    staffLength: 0.86,
    staffThickness: 0.0125,
    propBuild: { ...PROP_BUILD },
    leftPropType: "staff",
    rightPropType: "staff",
    leftProp: held(0.3),
    rightProp: held(-0.3),
    stanceYaw: 0,
    stanceSegments: null,
    spinePitchOffset: 0,
    ...contact,
  };
}

function part(performer: WorkerPerformer, name: string): Object3D {
  const found = performer.root.getObjectByName(name);
  if (!found) throw new Error(`no ${name}`);
  return found;
}

/** The palm the stub animator reports: the left staff's anchor plus `gap`
 *  in the anchor's own frame. The right hand reports no palm. */
function palmOffLeftAnchor(performer: WorkerPerformer, gap: Vector3) {
  avatar.animator.getPalmWorldPoint.mockImplementation(
    (side: "left" | "right", target: Vector3) =>
      side === "left"
        ? part(performer, "left-prop-anchor").localToWorld(target.copy(gap))
        : null
  );
}

describe("worker performer contact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    avatar.bare = false;
    avatar.root = new Group();
  });

  it("resets the arm history once per reset key, before the arms are set", async () => {
    const performer = await WorkerPerformer.create(
      snapshot({ contactResetKey: 3, pairSeparation: false })
    );
    const { animator } = avatar;
    performer.update(1 / 60);
    performer.update(1 / 60);
    expect(animator.resetContactHistory).toHaveBeenCalledTimes(1);
    expect(animator.setPairSeparation).toHaveBeenLastCalledWith(false);
    expect(
      animator.resetContactHistory.mock.invocationCallOrder[0]
    ).toBeLessThan(animator.setPropsAndBlend.mock.invocationCallOrder[0]!);
    expect(animator.setPairSeparation.mock.invocationCallOrder[0]).toBeLessThan(
      animator.setPropsAndBlend.mock.invocationCallOrder[0]!
    );

    performer.setSnapshot(
      snapshot({ contactResetKey: 4, pairSeparation: true })
    );
    performer.update(1 / 60);
    expect(animator.resetContactHistory).toHaveBeenCalledTimes(2);
    expect(animator.setPairSeparation).toHaveBeenLastCalledWith(true);

    // A host that plans no contact sends neither field: no resets, and the
    // animator keeps pulling the pair apart itself.
    performer.setSnapshot(snapshot({}));
    performer.update(1 / 60);
    expect(animator.resetContactHistory).toHaveBeenCalledTimes(2);
    expect(animator.setPairSeparation).toHaveBeenLastCalledWith(true);
    performer.dispose();
  });

  it("locks a held staff to the solved palm, by at most 6 cm", async () => {
    const performer = await WorkerPerformer.create(
      snapshot({ contactResetKey: 1, pairSeparation: false })
    );
    const near = new Vector3(0.02, -0.01, 0.015);
    palmOffLeftAnchor(performer, near);
    performer.update(1 / 60);
    const left = part(performer, "left-prop-correction");
    const right = part(performer, "right-prop-correction");
    expect(left.position.distanceTo(near)).toBeLessThan(1e-9);
    expect(right.position.length()).toBe(0);

    const far = new Vector3(0.1, 0.05, -0.08);
    palmOffLeftAnchor(performer, far);
    performer.update(1 / 60);
    expect(left.position.length()).toBeCloseTo(0.06, 9);
    expect(
      left.position.clone().normalize().dot(far.clone().normalize())
    ).toBeCloseTo(1, 9);
    performer.dispose();
  });

  it("runs an animator without the contact hooks", async () => {
    avatar.bare = true;
    const performer = await WorkerPerformer.create(
      snapshot({ contactResetKey: 1, pairSeparation: false })
    );
    expect(() => performer.update(1 / 60)).not.toThrow();
    expect(avatar.animator.update).toHaveBeenCalledTimes(1);
    expect(avatar.animator.resetContactHistory).not.toHaveBeenCalled();
    expect(part(performer, "left-prop-correction").position.length()).toBe(0);
    performer.dispose();
  });
});

function performerFor(id: string): CharacterInstanceState {
  const entry = propContinuityCorpus().find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`no corpus entry ${id}`);
  const state = createCharacterInstanceState(
    { id: `worker-contact-${id}`, positionX: 0, persistent: false },
    makeStandaloneDeps()
  );
  state.setPlaneMode(PlaneMode.WALL);
  state.loadSequence(entry.sequence);
  return state;
}

function seek(performer: CharacterInstanceState, scoreTime: number) {
  const beat = Math.floor(scoreTime);
  performer.goToStep(beat + performer.motionStepOffset);
  performer.setProgress(scoreTime - beat);
}

describe("worker performer snapshot contact", () => {
  it("serializes the displaced props, the planned flag and the reset key", () => {
    const performer = performerFor("tnd-tog-opp-ekek");
    const snap = () =>
      createWorkerPerformerSnapshot(performer, {
        leftPropType: "staff",
        rightPropType: "staff",
        propBuild: PROP_BUILD,
      });

    // Left hand at the far cross-body point, pulled in toward the grid centre.
    seek(performer, 2.087);
    const first = snap();
    expect(first.pairSeparation).toBe(false);
    expect(typeof first.contactResetKey).toBe("number");
    const authored = performer.leftPropState!.worldPosition;
    const sent = new Vector3().fromArray(first.leftProp!.worldPosition);
    expect(sent.length()).toBeLessThan(authored.length() - 0.05);

    seek(performer, 2.1);
    expect(snap().contactResetKey).toBe(first.contactResetKey);
    seek(performer, 1);
    expect(snap().contactResetKey).toBe(first.contactResetKey! + 1);
  });
});
