import { describe, expect, it, vi } from "vitest";
import { createMotionPathExplorerState } from "../../../src/routes/(public)/guide/motion-paths/_data/motion-path-explorer-state.svelte";
import { motionPathExamples } from "../../../src/routes/(public)/guide/motion-paths/_data/motion-path-examples";
import { MotionType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { Flower } from "$lib/shared/shape-matrix/domain/flower-signature";
import { MODE_ORDER } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";

const proIn: Flower = {
  style: "pro",
  turns: 0,
  ori: "in",
  grid: "diamond",
  petals: 1,
};
const antiOut: Flower = {
  style: "anti",
  turns: 0,
  ori: "out",
  grid: "diamond",
  petals: 1,
};

describe("motion path guide isolation", () => {
  it("keeps the underlying fixed path for floats in Hybrid", () => {
    const explorer = createMotionPathExplorerState();
    const source = structuredClone(motionPathExamples[2]!);
    source.steps[0]!.motions.left.motionType = MotionType.FLOAT;
    explorer.chooseSequence(source);
    explorer.scope.visibility.setPathPolicy({
      pathShape: "concave",
      motionAwarePaths: true,
    });
    explorer.syncPolicy();
    expect(explorer.sequence.steps[0]!.motions.left.pathShape).toBe("concave");
    expect(explorer.sequence.steps[0]!.motions.right.pathShape).toBe("arc");
  });
  it("compares authored exceptions without changing the selected source", () => {
    const explorer = createMotionPathExplorerState();
    const source = structuredClone(motionPathExamples[2]!);
    source.steps[0]!.motions.left.pathShape = "concave";
    const before = JSON.stringify(source);
    explorer.chooseSequence(source);
    explorer.scope.visibility.setPathPolicy({
      pathShape: "arc",
      motionAwarePaths: true,
    });
    explorer.syncPolicy();
    const hybridId = explorer.sequence.id;
    expect(explorer.sequence.steps[0]!.motions.left.pathShape).toBe("concave");
    expect(explorer.sequence.steps[0]!.motions.right.pathShape).toBe("arc");
    explorer.scope.visibility.setPathPolicy({
      pathShape: "arc",
      motionAwarePaths: false,
    });
    explorer.syncPolicy();
    expect(explorer.sequence.id).not.toBe(hybridId);
    expect(
      explorer.sequence.steps.every((step) =>
        Object.values(step.motions).every(
          (motion) => motion.pathShape === "arc"
        )
      )
    ).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("leaves stored defaults and neighboring explorers alone", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem");
    try {
      const first = createMotionPathExplorerState();
      const second = createMotionPathExplorerState();
      first.scope.visibility.setPathPolicy({
        pathShape: "concave",
        motionAwarePaths: true,
      });
      first.syncPolicy();
      first.scope.visibility.setVisibility("leftPathLines", false);
      first.setBpm(90);
      first.propType = PropType.FAN;
      first.trace = "hands";
      first.chooseSequence(structuredClone(motionPathExamples[1]!));
      expect(second.selectedPath).toBe("hybrid");
      expect(second.scope.visibility.getVisibility("leftPathLines")).toBe(true);
      expect(second.bpm).toBe(48);
      expect(second.propType).toBe(PropType.STAFF);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("opens the toy box with no effect over the mandala", () => {
    const explorer = createMotionPathExplorerState();
    expect(explorer.scope.effects.activeEffect).toBe("none");
    expect(explorer.scope.effects.tipEffectMap).toEqual({});
    expect(explorer.bpm).toBe(48);
  });

  it("keeps a solo's other hand path line off when Hand paths turns on", () => {
    const explorer = createMotionPathExplorerState();
    const visibility = explorer.scope.visibility;
    const builder = () => new Promise<never>(() => {});
    explorer.chooseMatrixSolo(
      "right",
      proIn,
      { left: proIn, right: proIn },
      builder
    );
    expect(visibility.getVisibility("leftPathLines")).toBe(false);
    expect(visibility.getVisibility("rightPathLines")).toBe(true);

    visibility.setVisibility("rightPathLines", false);
    visibility.setVisibility("leftPathLines", true);
    visibility.setVisibility("rightPathLines", true);
    expect(visibility.getVisibility("leftPathLines")).toBe(false);
    expect(visibility.getVisibility("rightPathLines")).toBe(true);

    explorer.clearMatrixPair();
    expect(visibility.getVisibility("leftPathLines")).toBe(true);
    expect(visibility.getVisibility("rightPathLines")).toBe(true);
  });

  it("keeps the newest matrix realization when an older build finishes late", async () => {
    const explorer = createMotionPathExplorerState();
    const pending: Array<{
      pair: { left: Flower; right: Flower };
      mode: string;
      resolve: (sequence: (typeof motionPathExamples)[number]) => void;
    }> = [];
    const builder = (pair: { left: Flower; right: Flower }, mode: string) =>
      new Promise<(typeof motionPathExamples)[number]>((resolve) => {
        pending.push({ pair, mode, resolve });
      });
    const first = structuredClone(motionPathExamples[0]!);
    first.id = "older-matrix-realization";
    const newest = structuredClone(motionPathExamples[1]!);
    newest.id = "newest-matrix-realization";

    explorer.chooseMatrixPair({ left: proIn, right: proIn }, builder);
    explorer.chooseMatrixPair({ left: antiOut, right: antiOut }, builder);
    await Promise.resolve();

    await vi.waitFor(() => expect(pending).toHaveLength(12));
    const newestSelection = pending.find(
      (build) => build.pair.left.style === "anti" && build.mode === "SS"
    );
    const olderSelection = pending.find(
      (build) => build.pair.left.style === "pro" && build.mode === "SS"
    );
    expect(newestSelection).toBeDefined();
    expect(olderSelection).toBeDefined();

    newestSelection!.resolve(newest);
    await vi.waitFor(() =>
      expect(explorer.sequence.id).toBe("newest-matrix-realization-hybrid")
    );
    olderSelection!.resolve(first);
    await Promise.resolve();

    expect(explorer.sequence.id).toBe("newest-matrix-realization-hybrid");
  });

  it("reuses a pair's prewarmed relationship instead of rebuilding on its click", async () => {
    const explorer = createMotionPathExplorerState();
    const calls: string[] = [];
    const builder = async (
      _pair: { left: Flower; right: Flower },
      mode: string
    ) => {
      calls.push(mode);
      const sequence = structuredClone(motionPathExamples[0]!);
      sequence.id = `matrix-${mode}`;
      return sequence;
    };

    explorer.chooseMatrixPair({ left: proIn, right: antiOut }, builder);
    await vi.waitFor(() =>
      expect(calls).toEqual(expect.arrayContaining(MODE_ORDER))
    );
    explorer.chooseHandRelationship("TO", builder);
    await vi.waitFor(() => expect(explorer.sequence.id).toBe("matrix-TO-hybrid"));

    expect(calls.filter((mode) => mode === "TO")).toHaveLength(1);
  });

  it("gives every completed selection a new transition key, even for the same sequence id", () => {
    const explorer = createMotionPathExplorerState();
    const before = explorer.transitionKey;
    explorer.chooseSequence(structuredClone(motionPathExamples[2]!));
    expect(explorer.transitionKey).not.toBe(before);
  });

  it("retries a relationship after a transient null build", async () => {
    const explorer = createMotionPathExplorerState();
    const recovered = structuredClone(motionPathExamples[0]!);
    recovered.id = "recovered-relationship";
    let selectedAttempts = 0;
    const builder = async (_pair: unknown, mode: string) => {
      if (mode === "SS" && selectedAttempts++ === 0) return null;
      return recovered;
    };

    explorer.chooseMatrixPair({ left: proIn, right: antiOut }, builder);
    await vi.waitFor(() => expect(explorer.pickerStatus).toBe("error"));
    explorer.retryMatrixSelection();
    await vi.waitFor(() =>
      expect(explorer.sequence.id).toBe("recovered-relationship-hybrid")
    );
    expect(explorer.pickerStatus).toBe("idle");
  });

  it("keeps the selected path policy while changing a matrix relationship", async () => {
    const explorer = createMotionPathExplorerState();
    explorer.scope.visibility.setPathPolicy({
      pathShape: "concave",
      motionAwarePaths: true,
    });
    explorer.syncPolicy();
    const realization = structuredClone(motionPathExamples[1]!);
    realization.id = "matrix-relationship";

    explorer.chooseHandRelationship("TO", async () => realization);
    explorer.chooseMatrixPair(
      { left: proIn, right: antiOut },
      async () => realization
    );
    await vi.waitFor(() =>
      expect(explorer.sequence.id).toBe("matrix-relationship-hybrid")
    );

    expect(explorer.selectedPath).toBe("hybrid");
    expect(explorer.sequence.id).toBe("matrix-relationship-hybrid");
  });

  it("keeps complete, closing MCP examples through the app adapter", () => {
    for (const sequence of motionPathExamples) {
      expect(sequence.steps).toHaveLength(4);
      for (const hand of ["left", "right"] as const) {
        const motions = sequence.steps.map((step) => step.motions[hand]);
        for (let index = 0; index < motions.length; index++) {
          const current = motions[index]!;
          const next = motions[(index + 1) % motions.length]!;
          expect(current.endLocation).toBe(next.startLocation);
          expect(current.endOrientation).toBe(next.startOrientation);
        }
        expect(sequence.startPlacement!.motions[hand].endLocation).toBe(
          motions[0]!.startLocation
        );
      }
    }
  });
});
