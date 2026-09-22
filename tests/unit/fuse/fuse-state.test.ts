import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFuseState,
  type FuseStateDeps,
} from "$lib/features/fuse/state/fuse-state.svelte";
import { createFuseRule } from "$lib/features/fuse/domain/fuse-rule";
import { fuseSequences } from "$lib/features/fuse/services/sequence-fuser";
import { PLAYBACK_MAX_BPM } from "$lib/shared/animation-engine/domain/constants/timing";
import type { HandPathData } from "$lib/shared/foundation/domain/models/hand-path-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  DEFAULT_SOLO_LOOP_RECIPE,
  isStructuredSoloLoop,
  type GeneratedSoloLoop,
} from "$lib/features/fuse/services/solo-loop-generator";
import { buildFusePathSource } from "$lib/features/fuse/services/fuse-built-path";
import { createBuilderStep } from "$lib/features/assemble-lab/services/builder-path-editor";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeHandPath(id: string, length: number): HandPathData {
  const locations = [
    GridLocation.NORTH,
    GridLocation.EAST,
    GridLocation.SOUTH,
    GridLocation.WEST,
  ];
  const path = Array.from(
    { length: length + 1 },
    (_, index) => locations[index % locations.length]!
  );

  return {
    id,
    locations: path,
    contentHash: id,
    startLocation: path[0]!,
    endLocation: path[path.length - 1]!,
    length,
    bigrams: [],
    uniqueLocations: [...new Set(path)],
    impliedGridMode: GridMode.DIAMOND,
    isClosed: path[0] === path[path.length - 1],
  };
}

function makeSequence(id: string, length: number): SequenceData {
  return {
    ...fuseSequences(
      makeHandPath(`${id}-blue`, length),
      makeHandPath(`${id}-red`, length)
    ),
    id,
    name: id,
    displayName: id,
    word: id.toUpperCase(),
    sequenceLength: length,
  };
}

function metadataOnly(sequence: SequenceData): SequenceData {
  return { ...sequence, steps: [] };
}

function leftOnly(sequence: SequenceData): SequenceData {
  const { rightSoloProp: _rightSoloProp, ...rest } = sequence;
  return rest;
}

function rightOnly(sequence: SequenceData): SequenceData {
  const { leftSoloProp: _leftSoloProp, ...rest } = sequence;
  return rest;
}

function letterEveryStep(sequence: SequenceData): SequenceData {
  const letter = "A" as StepData["letter"];
  const steps = sequence.steps.map((step) => ({ ...step, letter }));
  return {
    ...sequence,
    steps,
    word: "A".repeat(steps.length),
    stepPairings: sequence.stepPairings?.map((pair) => ({ ...pair, letter })),
  };
}

function createLoader(
  metadata: SequenceData[],
  loadFullSequenceData: FuseStateDeps["browseLoader"]["loadFullSequenceData"] = async (
    _name,
    id
  ) => metadata.find((sequence) => sequence.id === id) ?? null
): FuseStateDeps["browseLoader"] {
  return {
    loadSequenceMetadata: vi.fn(async () => metadata),
    loadFullSequenceData: vi.fn(loadFullSequenceData),
  };
}

function createState(
  browseLoader: FuseStateDeps["browseLoader"],
  overrides: Partial<FuseStateDeps> = {}
) {
  return createFuseState({
    browseLoader,
    deriveLetters: async (sequence) => letterEveryStep(sequence),
    errorHandler: { showUserError: vi.fn(() => "fuse-test-error") },
    initialLength: 8,
    random: () => 0.999,
    prefersReducedMotion: () => true,
    ...overrides,
  });
}

function createSoloGenerator() {
  let generation = 0;
  return vi.fn(async (length: number): Promise<GeneratedSoloLoop> => {
    generation += 1;
    const sequence = makeSequence(`generated-${generation}`, length);
    return {
      solo: sequence.leftSoloProp!,
      loopSpec: { rewound: { period: 2 } },
    };
  });
}

function makeUnstructuredBuiltPath() {
  const destinations = [
    [GridLocation.EAST, RotationDirection.CLOCKWISE],
    [GridLocation.NORTH, RotationDirection.COUNTER_CLOCKWISE],
    [GridLocation.WEST, RotationDirection.COUNTER_CLOCKWISE],
    [GridLocation.NORTH, RotationDirection.CLOCKWISE],
    [GridLocation.EAST, RotationDirection.CLOCKWISE],
    [GridLocation.SOUTH, RotationDirection.CLOCKWISE],
    [GridLocation.WEST, RotationDirection.CLOCKWISE],
    [GridLocation.NORTH, RotationDirection.CLOCKWISE],
  ] as const;
  let pose = {
    location: GridLocation.NORTH,
    orientation: Orientation.IN,
  };
  const steps = destinations.map(([destination, direction]) => {
    const step = createBuilderStep(pose, destination, direction, 0);
    pose = {
      location: step.endLocation,
      orientation: step.endOrientation,
    };
    return step;
  });
  return buildFusePathSource({
    steps,
    expectedLength: 8,
    gridMode: GridMode.DIAMOND,
    side: "left",
  });
}

describe("Fuse state", () => {
  // createFuseState persists the selected pair to localStorage ("fuse-tab-state",
  // fuse-state.svelte.ts:50) and initialize() restores it on mount, re-hydrating
  // those exact ids through browseLoader. Without this reset each test inherits
  // the previous test's pair and its state's first act is an unexpected
  // loadFullSequenceData for a foreign sequence.
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates independent one-hand LOOPs without loading the sequence gallery", async () => {
    const loader = createLoader([]);
    const generator = createSoloGenerator();
    const state = createState(loader, { generateSoloLoop: generator });

    await state.initialize();

    expect(generator).toHaveBeenCalledTimes(2);
    expect(generator).toHaveBeenNthCalledWith(1, 8, DEFAULT_SOLO_LOOP_RECIPE);
    expect(loader.loadSequenceMetadata).not.toHaveBeenCalled();
    expect(loader.loadFullSequenceData).not.toHaveBeenCalled();
    expect(state.left.sequence?.leftSoloProp).toBeDefined();
    expect(state.right.sequence?.rightSoloProp).toBeDefined();
    expect(state.canFuse).toBe(true);

    const redHash = state.right.sequence?.rightSoloProp?.contentHash;
    await state.shuffle("left");

    expect(generator).toHaveBeenCalledTimes(3);
    expect(state.right.sequence?.rightSoloProp?.contentHash).toBe(redHash);
    expect(state.left.canGoBack).toBe(true);
  });

  it("restores the literal blue/red source pair saved before migration", async () => {
    const left = makeSequence("legacy-left", 8);
    const right = makeSequence("legacy-right", 8);
    const loader = createLoader([left, right]);
    localStorage.setItem(
      "fuse-tab-state",
      JSON.stringify({
        length: 8,
        blue: { id: left.id, word: left.word, name: left.name },
        red: { id: right.id, word: right.word, name: right.name },
      })
    );

    const state = createState(loader);
    await state.initialize();

    expect(loader.loadFullSequenceData).toHaveBeenCalledWith(
      left.word,
      left.id
    );
    expect(loader.loadFullSequenceData).toHaveBeenCalledWith(
      right.word,
      right.id
    );
    expect(state.left.sequence?.id).toBe(left.id);
    expect(state.right.sequence?.id).toBe(right.id);
  });

  it("classifies fused letters on the live preview", async () => {
    const state = createState(createLoader([]), {
      generateSoloLoop: createSoloGenerator(),
    });

    await state.initialize();

    await vi.waitFor(() =>
      expect(
        state.previewSequence?.steps.every((step) => step.letter === "A")
      ).toBe(true)
    );
  });

  it("uses one persisted generation recipe for both Regenerate buttons", async () => {
    const generator = createSoloGenerator();
    const state = createState(createLoader([]), {
      generateSoloLoop: generator,
    });
    await state.initialize();

    state.setGenerationLevel(3);
    state.setMaxTurnIntensity(0.5);
    state.setConstraintPreset("smooth");
    state.setHandPathMode("choppy");
    state.setMotionTypeFilter("prefer-dash");
    state.setGridMode(GridMode.BOX);
    state.setStartLocation(GridLocation.SOUTHWEST);
    state.setStartOrientation(Orientation.CLOCK);
    state.setTraversalDirection("counterclockwise");
    expect(generator).toHaveBeenCalledTimes(2);

    await state.shuffle("right");

    expect(generator).toHaveBeenLastCalledWith(8, {
      gridMode: GridMode.BOX,
      level: 3,
      maxTurnIntensity: 0.5,
      constraintPreset: "smooth",
      handPathMode: "choppy",
      motionTypeFilter: "prefer-dash",
      startLocation: GridLocation.SOUTHWEST,
      startOrientation: Orientation.CLOCK,
      traversalDirection: "counterclockwise",
    });
    expect(state.generationLevel).toBe(3);
    expect(state.maxTurnIntensity).toBe(0.5);

    state.setGenerationLevel(2);
    expect(state.maxTurnIntensity).toBe(1);
    expect(state.startOrientation).toBeNull();
    expect(generator).toHaveBeenCalledTimes(3);

    const restored = createState(createLoader([]), {
      generateSoloLoop: createSoloGenerator(),
    });
    expect(restored.generationLevel).toBe(2);
    expect(restored.maxTurnIntensity).toBe(1);
    expect(restored.constraintPreset).toBe("smooth");
    expect(restored.handPathMode).toBe("choppy");
    expect(restored.motionTypeFilter).toBe("prefer-dash");
    expect(restored.gridMode).toBe(GridMode.BOX);
    expect(restored.startLocation).toBe(GridLocation.SOUTHWEST);
    expect(restored.startOrientation).toBeNull();
    expect(restored.traversalDirection).toBe("counterclockwise");
  });

  it("migrates only the untouched legacy Fuse style to the shared default", () => {
    localStorage.setItem(
      "fuse-tab-state",
      JSON.stringify({
        constraintPreset: "mixed",
        handPathMode: "mixed",
        motionTypeFilter: null,
      })
    );

    const migrated = createState(createLoader([]));
    expect(migrated.constraintPreset).toBe("smooth");
    expect(migrated.handPathMode).toBe("mixed");
    expect(migrated.motionTypeFilter).toBeNull();

    // Once a person deliberately chooses Mixed, the persisted schema marker
    // keeps that choice from being mistaken for the retired Fuse baseline.
    migrated.setConstraintPreset("mixed");
    expect(JSON.parse(localStorage.getItem("fuse-tab-state") ?? "{}")).toEqual(
      expect.objectContaining({
        styleDefaultsVersion: 1,
        constraintPreset: "mixed",
      })
    );

    const restored = createState(createLoader([]));
    expect(restored.constraintPreset).toBe("mixed");
    migrated.dispose();
    restored.dispose();
  });

  it("preserves a legacy Mixed prop choice when another style axis was customized", () => {
    localStorage.setItem(
      "fuse-tab-state",
      JSON.stringify({
        constraintPreset: "mixed",
        handPathMode: "choppy",
        motionTypeFilter: null,
      })
    );

    const state = createState(createLoader([]));
    expect(state.constraintPreset).toBe("mixed");
    expect(state.handPathMode).toBe("choppy");
    state.dispose();
  });

  it("clears a start point that does not belong to the selected grid", () => {
    const state = createState(createLoader([]), {
      generateSoloLoop: createSoloGenerator(),
    });

    state.setStartLocation(GridLocation.SOUTH);
    state.setGridMode(GridMode.BOX);

    expect(state.gridMode).toBe(GridMode.BOX);
    expect(state.startLocation).toBeNull();
    state.setStartLocation(GridLocation.NORTHEAST);
    expect(state.startLocation).toBe(GridLocation.NORTHEAST);
  });

  it("chooses a new first step on one LOOP without changing its partner", async () => {
    const generator = createSoloGenerator();
    const state = createState(createLoader([]), {
      generateSoloLoop: generator,
    });
    await state.initialize();

    const originalBlueStart = state.left.sequence?.leftSoloProp?.startLocation;
    const originalRedHash = state.right.sequence?.rightSoloProp?.contentHash;
    await state.adjustSource("left", { kind: "first-step", step: 2 });

    expect(state.error).toBeNull();
    expect(state.left.sequence?.leftSoloProp?.startLocation).not.toBe(
      originalBlueStart
    );
    expect(state.right.sequence?.rightSoloProp?.contentHash).toBe(
      originalRedHash
    );
    expect(state.canFuse).toBe(true);
  });

  it("accepts a seamless custom path without requiring a Shape Matrix component", async () => {
    const state = createState(createLoader([]), {
      generateSoloLoop: createSoloGenerator(),
    });
    await state.initialize();
    const built = makeUnstructuredBuiltPath();

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(isStructuredSoloLoop(built.solo)).toBe(false);

    await state.setSource("left", built.sequence, {
      kind: "custom",
      label: "Built path",
    });

    expect(state.error).toBeNull();
    expect(state.left.sequence?.leftSoloProp?.contentHash).toBe(
      built.solo.contentHash
    );
    expect(state.left.sequence?.rightSoloProp).toBeUndefined();
    expect(state.left.sequence?.stepPairings).toBeUndefined();
    expect(
      state.left.sequence?.steps.every(
        (step) =>
          isVisibleMotion(step.motions.left) &&
          !isVisibleMotion(step.motions.right)
      )
    ).toBe(true);
    expect(state.canFuse).toBe(true);
  });

  it("rotates one source in 45-degree steps while preserving its partner", async () => {
    const state = createState(createLoader([]), {
      generateSoloLoop: createSoloGenerator(),
    });
    await state.initialize();

    const originalRedHash = state.right.sequence?.rightSoloProp?.contentHash;
    await state.adjustSource("left", { kind: "rotate", rotationSteps: 1 });

    expect(state.error).toBeNull();
    expect(state.left.sequence?.leftSoloProp?.startLocation).toBe(
      GridLocation.NORTHEAST
    );
    expect(state.right.sequence?.rightSoloProp?.contentHash).toBe(
      originalRedHash
    );
    expect(state.previewSequence?.gridMode).toBe(GridMode.SKEWED);
    expect(
      state.previewSequence?.steps.every(
        (step) => step.motions.left?.gridMode === GridMode.BOX
      )
    ).toBe(true);
    expect(
      state.previewSequence?.steps.every(
        (step) => step.motions.right?.gridMode === GridMode.DIAMOND
      )
    ).toBe(true);

    await state.adjustSource("left", { kind: "rotate", rotationSteps: 1 });

    expect(state.left.sequence?.leftSoloProp?.startLocation).toBe(
      GridLocation.EAST
    );
    expect(state.previewSequence?.gridMode).toBe(GridMode.DIAMOND);
  });

  it("keeps one-hand LOOP closure through every independent source transform", async () => {
    const state = createState(createLoader([]), {
      generateSoloLoop: createSoloGenerator(),
    });
    await state.initialize();

    const adjustments = [
      { kind: "rotate", rotationSteps: 1 },
      { kind: "rotate", rotationSteps: -1 },
      { kind: "mirror" },
      { kind: "flip" },
      { kind: "invert" },
      { kind: "reset" },
    ] as const;

    for (const adjustment of adjustments) {
      await state.adjustSource("left", adjustment);
      expect(state.error, adjustment.kind).toBeNull();
      expect(state.canFuse, adjustment.kind).toBe(true);
    }
  });

  it("applies a symmetry relationship as one state transition", async () => {
    const state = createState(createLoader([]), {
      generateSoloLoop: createSoloGenerator(),
    });
    await state.initialize();

    expect(state.mode).toBe("shuffle");
    expect(state.driverSide).toBe("left");
    expect(state.rule).toEqual(createFuseRule({ reflect: "mirror" }));

    state.setRelationship("right", createFuseRule({ rotationSteps: 2 }));

    expect(state.mode).toBe("symmetry");
    expect(state.driverSide).toBe("right");
    expect(state.rule).toEqual(createFuseRule({ rotationSteps: 2 }));
    await vi.waitFor(() => {
      expect(state.statusMessage).toBe("Left follows Right (Rotate 90°).");
    });
    expect(state.canFuse).toBe(true);
  });

  it("rebuilds the follower geometry when the symmetry rule changes", async () => {
    const state = createState(createLoader([]), {
      generateSoloLoop: createSoloGenerator(),
    });
    await state.initialize();

    state.setRelationship("left", createFuseRule({ reflect: "mirror" }));
    await vi.waitFor(() => {
      expect(state.statusMessage).toBe("Right follows Left (Mirror).");
    });
    const mirroredMotions = state.symmetryPreview?.steps.map(
      (step) => step.motions.right
    );

    state.setRule(createFuseRule({ rotationSteps: 2 }));
    await vi.waitFor(() => {
      expect(state.statusMessage).toBe("Right follows Left (Rotate 90°).");
    });
    const rotatedMotions = state.symmetryPreview?.steps.map(
      (step) => step.motions.right
    );

    expect(mirroredMotions).toBeDefined();
    expect(rotatedMotions).toBeDefined();
    expect(rotatedMotions).not.toEqual(mirroredMotions);
  });

  it("previews a pairing draft without mutating the applied relationship", async () => {
    const state = createState(createLoader([]), {
      generateSoloLoop: createSoloGenerator(),
    });
    await state.initialize();

    const independentPreview = state.previewSequence;
    await state.previewRelationship(
      "right",
      createFuseRule({ rotationSteps: 2 })
    );

    expect(state.mode).toBe("shuffle");
    expect(state.driverSide).toBe("left");
    expect(state.rule).toEqual(createFuseRule({ reflect: "mirror" }));
    expect(state.previewSequence).not.toEqual(independentPreview);

    state.cancelRelationshipPreview();
    expect(state.mode).toBe("shuffle");
    expect(state.driverSide).toBe("left");
    expect(state.rule).toEqual(createFuseRule({ reflect: "mirror" }));
    expect(state.previewSequence).toEqual(independentPreview);

    state.setRelationship("right", createFuseRule({ rotationSteps: 2 }));
    await vi.waitFor(() => {
      expect(state.statusMessage).toBe("Left follows Right (Rotate 90°).");
    });
    expect(state.mode).toBe("symmetry");
    expect(state.driverSide).toBe("right");
    expect(state.rule).toEqual(createFuseRule({ rotationSteps: 2 }));
  });

  it("distinguishes a catalog failure from an exact-length empty pool", async () => {
    const showUserError = vi.fn(() => "catalog-error");
    const loader = createLoader([]);
    vi.mocked(loader.loadSequenceMetadata).mockRejectedValueOnce(
      new Error("catalog offline")
    );
    const state = createState(loader, { errorHandler: { showUserError } });

    await state.initialize();

    expect(state.error?.kind).toBe("catalog");
    expect(state.statusMessage).toBe("Couldn't load paths. Try again.");
    expect(state.canRetry).toBe(true);
    expect(state.left.sequence).toBeNull();
    expect(state.right.sequence).toBeNull();
    expect(showUserError).toHaveBeenCalledOnce();
  });

  it("keeps exact-length empty data empty instead of falling back", async () => {
    const eight = makeSequence("eight", 8);
    const loader = createLoader([eight]);
    const state = createState(loader);

    await state.initialize();
    expect(state.appliedLength).toBe(8);
    expect(state.left.sequence?.id).toBe("eight");

    await state.setLength(12);

    expect(state.requestedLength).toBe(12);
    expect(state.appliedLength).toBeNull();
    expect(state.left.sequence).toBeNull();
    expect(state.right.sequence).toBeNull();
    expect(state.previewSequence).toBeNull();
    expect(state.error?.kind).toBe("empty");
    expect(state.statusMessage).toBe(
      "No 12-step paths are available. Choose another length."
    );
  });

  it("commits both sources and the preview atomically after a length load", async () => {
    const left = leftOnly(makeSequence("blue-four", 4));
    const right = rightOnly(makeSequence("red-four", 4));
    const leftRequest = deferred<SequenceData | null>();
    const rightRequest = deferred<SequenceData | null>();
    const metadata = [metadataOnly(left), metadataOnly(right)];
    const loader = createLoader(metadata, async (_name, id) => {
      return id === left.id ? leftRequest.promise : rightRequest.promise;
    });
    const state = createState(loader, { initialLength: 4 });

    const loading = state.initialize();
    await vi.waitFor(() => {
      expect(loader.loadFullSequenceData).toHaveBeenCalledWith(
        left.word,
        left.id
      );
    });

    leftRequest.resolve(left);
    await vi.waitFor(() => {
      expect(loader.loadFullSequenceData).toHaveBeenCalledWith(
        right.word,
        right.id
      );
    });

    expect(state.left.sequence).toBeNull();
    expect(state.right.sequence).toBeNull();
    expect(state.previewSequence).toBeNull();

    rightRequest.resolve(right);
    await loading;

    expect(state.left.sequence?.id).toBe(left.id);
    expect(state.right.sequence?.id).toBe(right.id);
    expect(state.previewSequence?.sequenceLength).toBe(4);
    expect(state.appliedLength).toBe(4);
    expect(state.canFuse).toBe(true);
  });

  it("deduplicates hydration shared by the Left and Right decks", async () => {
    const fullSequence = makeSequence("shared", 8);
    const loader = createLoader(
      [metadataOnly(fullSequence)],
      async () => fullSequence
    );
    const state = createState(loader);

    await state.initialize();

    expect(loader.loadFullSequenceData).toHaveBeenCalledOnce();
    expect(state.left.sequence?.id).toBe(fullSequence.id);
    expect(state.right.sequence?.id).toBe(fullSequence.id);
    expect(state.canFuse).toBe(true);
  });

  it("retries a hydration that previously resolved without data", async () => {
    const fullSequence = makeSequence("retryable", 8);
    let attempts = 0;
    const loader = createLoader([metadataOnly(fullSequence)], async () => {
      attempts += 1;
      return attempts === 1 ? null : fullSequence;
    });
    const state = createState(loader);

    await state.initialize();
    expect(state.error?.kind).toBe("empty");
    expect(loader.loadFullSequenceData).toHaveBeenCalledOnce();

    await state.setLength(8);

    expect(loader.loadFullSequenceData).toHaveBeenCalledTimes(2);
    expect(state.canFuse).toBe(true);
    expect(state.left.sequence?.id).toBe(fullSequence.id);
    expect(state.right.sequence?.id).toBe(fullSequence.id);
  });

  it("ignores an older length request that resolves after a newer one", async () => {
    const four = makeSequence("four", 4);
    const eight = makeSequence("eight", 8);
    const fourRequest = deferred<SequenceData | null>();
    const eightRequest = deferred<SequenceData | null>();
    const metadata = [metadataOnly(four), metadataOnly(eight)];
    const loader = createLoader(metadata, async (_name, id) => {
      return id === four.id ? fourRequest.promise : eightRequest.promise;
    });
    const state = createState(loader, { initialLength: 4 });

    const olderLoad = state.initialize();
    await vi.waitFor(() => {
      expect(loader.loadFullSequenceData).toHaveBeenCalledWith(
        four.word,
        four.id
      );
    });

    const newerLoad = state.setLength(8);
    await vi.waitFor(() => {
      expect(loader.loadFullSequenceData).toHaveBeenCalledWith(
        eight.word,
        eight.id
      );
    });

    eightRequest.resolve(eight);
    await newerLoad;
    expect(state.appliedLength).toBe(8);

    fourRequest.resolve(four);
    await olderLoad;

    expect(state.appliedLength).toBe(8);
    expect(state.left.sequence?.id).toBe(eight.id);
    expect(state.right.sequence?.id).toBe(eight.id);
    expect(state.previewSequence?.sequenceLength).toBe(8);
  });

  it("ignores a side replacement that resolves after the length changes", async () => {
    const firstEight = makeSequence("first-eight", 8);
    const secondEight = metadataOnly(makeSequence("second-eight", 8));
    const four = makeSequence("four", 4);
    const olderSideRequest = deferred<SequenceData | null>();
    const loader = createLoader(
      [firstEight, secondEight, four],
      async (_name, id) =>
        id === secondEight.id ? olderSideRequest.promise : four
    );
    const state = createState(loader);

    await state.initialize();
    const olderShuffle = state.shuffle("left");
    await vi.waitFor(() => {
      expect(loader.loadFullSequenceData).toHaveBeenCalledWith(
        secondEight.word,
        secondEight.id
      );
    });

    await state.setLength(4);
    expect(state.appliedLength).toBe(4);

    olderSideRequest.resolve(makeSequence("second-eight", 8));
    await olderShuffle;

    expect(state.appliedLength).toBe(4);
    expect(state.left.sequence?.id).toBe(four.id);
    expect(state.right.sequence?.id).toBe(four.id);
    expect(state.previewSequence?.sequenceLength).toBe(4);
  });

  it("skips candidates that do not carry the required side data", async () => {
    const rightCandidate = rightOnly(makeSequence("red-candidate", 8));
    const leftCandidate = leftOnly(makeSequence("blue-candidate", 8));
    const loader = createLoader([rightCandidate, leftCandidate]);
    const state = createState(loader);

    await state.initialize();

    expect(state.left.sequence?.id).toBe(leftCandidate.id);
    expect(state.right.sequence?.id).toBe(rightCandidate.id);
    expect(state.left.poolPosition).toBe(2);
    expect(state.right.poolPosition).toBe(1);
  });

  it("returns to a hydrated previous source without loading it again", async () => {
    const first = makeSequence("first", 8);
    const second = makeSequence("second", 8);
    const third = makeSequence("third", 8);
    const loader = createLoader([first, second, third]);
    const state = createState(loader);

    await state.initialize();
    await state.shuffle("left");
    expect(state.left.sequence?.id).toBe(second.id);
    expect(state.left.canGoBack).toBe(true);

    state.previous("left");

    expect(state.left.sequence?.id).toBe(first.id);
    expect(loader.loadFullSequenceData).not.toHaveBeenCalled();
  });

  it("keeps the shared playback phase through Shuffle and Back", async () => {
    let scheduledFrame: FrameRequestCallback | null = null;
    let frameId = 0;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        scheduledFrame = callback;
        frameId += 1;
        return frameId;
      })
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const first = makeSequence("first", 8);
    const second = makeSequence("second", 8);
    const replacement = deferred<SequenceData | null>();
    const loader = createLoader(
      [first, metadataOnly(second)],
      async (_name, id) => (id === second.id ? replacement.promise : first)
    );
    const state = createState(loader);

    try {
      await state.initialize();
      state.startClock();

      const firstTick = scheduledFrame;
      expect(firstTick).not.toBeNull();
      firstTick!(1_000);

      const secondTick = scheduledFrame;
      expect(secondTick).not.toBeNull();
      secondTick!(2_500);
      const phaseBeforeShuffle = state.currentStep;
      expect(phaseBeforeShuffle).toBeCloseTo(1.5);

      const shuffle = state.shuffle("left");
      await vi.waitFor(() => {
        expect(loader.loadFullSequenceData).toHaveBeenCalledWith(
          second.word,
          second.id
        );
      });

      const pendingTick = scheduledFrame;
      expect(pendingTick).not.toBeNull();
      pendingTick!(3_500);
      expect(state.currentStep).toBeGreaterThan(phaseBeforeShuffle);

      replacement.resolve(second);
      await shuffle;
      const phaseAfterShuffle = state.currentStep;
      expect(phaseAfterShuffle).toBeCloseTo(2.5);

      state.previous("left");
      expect(state.currentStep).toBeCloseTo(phaseAfterShuffle);
      expect(state.clockRunning).toBe(true);
    } finally {
      state.dispose();
      vi.unstubAllGlobals();
    }
  });

  it("keeps the primary action unavailable during a source replacement", async () => {
    const first = makeSequence("first", 8);
    const second = metadataOnly(makeSequence("second", 8));
    const secondRequest = deferred<SequenceData | null>();
    const loader = createLoader(
      [first, second],
      async () => secondRequest.promise
    );
    const state = createState(loader);

    await state.initialize();
    const shuffle = state.shuffle("left");

    expect(state.pendingSide).toBe("left");
    expect(state.canFuse).toBe(false);
    expect(state.left.sequence?.id).toBe(first.id);
    expect(state.statusMessage).toBe("Loading another Left path...");

    secondRequest.resolve(makeSequence("second", 8));
    await shuffle;
    expect(state.canFuse).toBe(true);
    expect(state.left.sequence?.id).toBe("second");
    expect(state.statusMessage).toContain("Left path second is ready");
  });

  it("blocks an incomplete derived result and keeps the selected pair", async () => {
    const source = makeSequence("source", 8);
    const showUserError = vi.fn(() => "derivation-error");
    const state = createState(createLoader([source]), {
      deriveLetters: async (sequence) => ({
        ...sequence,
        steps: sequence.steps.map((step, index) => ({
          ...step,
          letter: index === 0 ? ("A" as StepData["letter"]) : null,
        })),
        word: "A",
      }),
      errorHandler: { showUserError },
    });

    await state.initialize();
    const leftId = state.left.sequence?.id;
    const rightId = state.right.sequence?.id;

    const result = await state.buildFusedSequence();

    expect(result).toBeNull();
    expect(state.error?.kind).toBe("derivation");
    expect(state.left.sequence?.id).toBe(leftId);
    expect(state.right.sequence?.id).toBe(rightId);
    expect(state.isFusing).toBe(false);
    expect(showUserError).toHaveBeenCalledOnce();
  });

  it("keeps Greek letters intact in the built word", async () => {
    const source = makeSequence("source", 8);
    const state = createState(createLoader([source]), {
      deriveLetters: async (sequence) => ({
        ...sequence,
        steps: sequence.steps.map((step, index) => ({
          ...step,
          letter: (index === 0 ? "α" : "A") as StepData["letter"],
        })),
        word: "αA",
      }),
    });

    await state.initialize();
    const result = await state.buildFusedSequence();

    // buildFusedSequence recomputes the word from derived.steps (not the
    // injected `word` field above), so all 8 lettered steps show up.
    expect(result?.word).toBe("αAAAAAAA");
    expect(result?.name).toBe("αAAAAAAA");
  });

  it("locks final-action re-entry while derivation is pending", async () => {
    const source = makeSequence("source", 8);
    const derivation = deferred<SequenceData>();
    const deriveLetters = vi.fn(async () => derivation.promise);
    const state = createState(createLoader([source]), { deriveLetters });

    await state.initialize();
    const firstBuild = state.buildFusedSequence();
    const secondBuild = state.buildFusedSequence();

    expect(state.isFusing).toBe(true);
    expect(await secondBuild).toBeNull();
    expect(deriveLetters).toHaveBeenCalledOnce();

    derivation.resolve(letterEveryStep(state.previewSequence!));
    const result = await firstBuild;

    expect(result).not.toBeNull();
    expect(result?.stepPairings?.every((pair) => pair.letter === "A")).toBe(
      true
    );
    expect(state.isFusing).toBe(false);
  });

  it("invalidates pending work when disposed", async () => {
    const source = makeSequence("source", 8);
    const request = deferred<SequenceData | null>();
    const loader = createLoader(
      [metadataOnly(source)],
      async () => request.promise
    );
    const state = createState(loader);

    const loading = state.initialize();
    await vi.waitFor(() =>
      expect(loader.loadFullSequenceData).toHaveBeenCalled()
    );
    state.dispose();
    request.resolve(source);
    await loading;

    expect(state.left.sequence).toBeNull();
    expect(state.right.sequence).toBeNull();
    expect(state.previewSequence).toBeNull();
  });

  it("starts paused for reduced motion and only autoplays without it", async () => {
    const requestFrame = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const source = makeSequence("source", 8);

    try {
      const reducedState = createState(createLoader([source]), {
        prefersReducedMotion: () => true,
      });
      await reducedState.initialize();

      expect(reducedState.clockRunning).toBe(false);
      expect(requestFrame).not.toHaveBeenCalled();
      reducedState.dispose();

      const animatedState = createState(createLoader([source]), {
        prefersReducedMotion: () => false,
      });
      await animatedState.initialize();

      expect(animatedState.clockRunning).toBe(true);
      expect(requestFrame).toHaveBeenCalledOnce();
      animatedState.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("validates and clamps persisted tempo before using it", () => {
    try {
      localStorage.setItem("fuse-tab-state", JSON.stringify({ bpm: "fast" }));
      const malformedState = createState(createLoader([]));
      expect(malformedState.bpm).toBe(60);
      malformedState.dispose();

      localStorage.setItem("fuse-tab-state", JSON.stringify({ bpm: 999 }));
      const clampedState = createState(createLoader([]));
      expect(clampedState.bpm).toBe(PLAYBACK_MAX_BPM);
      clampedState.dispose();
    } finally {
      localStorage.removeItem("fuse-tab-state");
    }
  });

  describe("TnD rule model", () => {
    it("classifies the committed rule", () => {
      localStorage.setItem(
        "fuse-tab-state",
        JSON.stringify({ mode: "symmetry", rule: createFuseRule({ reflect: "mirror" }) })
      );
      const state = createState(createLoader([]));
      expect(state.tndSelection).toMatchObject({ mode: "TO", invert: false, rewind: false });
      expect(state.ruleAdjusted).toBe(false);
    });

    it("coerces an odd persisted rotation and says so once", () => {
      localStorage.setItem(
        "fuse-tab-state",
        JSON.stringify({
          mode: "symmetry",
          rule: createFuseRule({ rotationSteps: 3, reflect: "mirror" }),
        })
      );
      const state = createState(createLoader([]));
      expect(state.rule).toEqual(createFuseRule({ rotationSteps: 2, reflect: "mirror" }));
      expect(state.tndSelection.mode).toBe("QO");
      expect(state.ruleAdjusted).toBe(true);
      expect(JSON.parse(localStorage.getItem("fuse-tab-state") ?? "{}").rule).toEqual(
        createFuseRule({ rotationSteps: 2, reflect: "mirror" })
      );

      state.setRule(createFuseRule({ reflect: "flip" }));
      expect(state.ruleAdjusted).toBe(false);
    });

    it("has no check outside Linked mode", () => {
      localStorage.setItem("fuse-tab-state", JSON.stringify({ mode: "shuffle" }));
      const state = createState(createLoader([]));
      expect(state.tndCheck).toBeNull();
    });
  });
});
