import { Group, Scene } from "three";
import { describe, expect, it, vi } from "vitest";
import type { WorkerPerformerSnapshot } from "#lib/shared/3d/worker-renderer/domain/worker-renderer-protocol.js";
import { WorkerPerformerStage } from "#lib/shared/3d/worker-renderer/worlds/worker-performer.js";

function snapshot(angle: number): WorkerPerformerSnapshot {
  return {
    id: "performer",
    avatarId: "x-bot",
    position: [angle, 0, 0],
    facingAngle: angle,
    avatarHeightCm: 190.5,
    groundY: -1.5,
    staffLength: 0.86,
    staffThickness: 0.0125,
    propBuild: {
      finish: "fire",
      fanBuild: "pictograph",
      fanFrameColor: "black",
      fanCover: "bare",
    },
    leftPropType: "staff",
    rightPropType: "staff",
    leftProp: null,
    rightProp: null,
    stanceYaw: angle,
    stanceSegments: null,
    spinePitchOffset: 0,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("worker performer stage", () => {
  it("coalesces live snapshots while one avatar is loading", async () => {
    const scene = new Scene();
    const avatar = new Group();
    const setSnapshot = vi.fn();
    const created = deferred<never>();
    const createPerformer = vi.fn(() => created.promise);
    const performer = {
      id: "performer",
      root: avatar,
      matchesConfiguration: () => true,
      setSnapshot,
      update: vi.fn(),
      dispose: vi.fn(),
    };
    const stage = new WorkerPerformerStage(scene, createPerformer as never);

    const first = stage.setSnapshots([snapshot(0)]);
    const latestSnapshot = snapshot(1.25);
    const second = stage.setSnapshots([latestSnapshot]);
    expect(createPerformer).toHaveBeenCalledTimes(1);

    created.resolve(performer as never);
    await Promise.all([first, second]);

    expect(createPerformer).toHaveBeenCalledTimes(1);
    expect(scene.children).toContain(avatar);
    expect(setSnapshot).toHaveBeenLastCalledWith(latestSnapshot);
  });

  it("discards a loaded avatar when the performer disappeared meanwhile", async () => {
    const scene = new Scene();
    const created = deferred<never>();
    const performer = {
      id: "performer",
      root: new Group(),
      matchesConfiguration: () => true,
      setSnapshot: vi.fn(),
      update: vi.fn(),
      dispose: vi.fn(),
    };
    const stage = new WorkerPerformerStage(
      scene,
      vi.fn(() => created.promise) as never
    );

    const loading = stage.setSnapshots([snapshot(0)]);
    await stage.setSnapshots([]);
    created.resolve(performer as never);
    await loading;

    expect(performer.dispose).toHaveBeenCalledTimes(1);
    expect(scene.children).not.toContain(performer.root);
  });

  it("collects worker-derived effect outputs with stable performer source ranges", async () => {
    const firstOutput = {
      playing: true,
      sources: [{ sourceId: 1 }],
      imperative: [{ renderer: "trail", sourceId: "p1:0:left-end" }],
    };
    const secondOutput = {
      playing: false,
      sources: [{ sourceId: 5 }],
      imperative: [],
    };
    const performers = [firstOutput, secondOutput].map((output, index) => ({
      id: `performer-${index}`,
      root: new Group(),
      matchesConfiguration: () => true,
      setSnapshot: vi.fn(),
      setEffectSourceIdBase: vi.fn(),
      getEffects: () => output,
      update: vi.fn(),
      dispose: vi.fn(),
    }));
    let created = 0;
    const stage = new WorkerPerformerStage(
      new Scene(),
      vi.fn(async () => performers[created++] as never)
    );

    await stage.setSnapshots([
      { ...snapshot(0), id: "performer-0" },
      { ...snapshot(0), id: "performer-1" },
    ]);

    expect(performers[0].setEffectSourceIdBase).toHaveBeenCalledWith(1);
    expect(performers[1].setEffectSourceIdBase).toHaveBeenCalledWith(5);
    expect(stage.getEffects()).toMatchObject({
      playing: true,
      sources: [{ sourceId: 1 }, { sourceId: 5 }],
      imperative: [{ renderer: "trail", sourceId: "p1:0:left-end" }],
    });
  });
});
