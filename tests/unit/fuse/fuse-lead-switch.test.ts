// @vitest-environment jsdom
/**
 * Switching which path leads must leave both paths on screen untouched, for
 * every rule the picker can make. The pairs below are rebuilt from the new
 * leader through the production transforms, so an inverse that drifts on any
 * axis (location, motion, turns, orientation) shows up here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFuseState,
  type FuseState,
} from "#lib/features/fuse/state/fuse-state.svelte.js";
import {
  createFuseRule,
  fuseRulesEqual,
  inverseFuseRule,
  type FuseRule,
} from "#lib/features/fuse/domain/fuse-rule.js";
import {
  FUSE_TND_MODES,
  resolveFuseRule,
} from "#lib/features/fuse/domain/fuse-tnd-rule.js";
import { buildFusePathSource } from "#lib/features/fuse/services/fuse-built-path.js";
import { createBuilderStep } from "#lib/features/assemble-lab/services/builder-path-editor.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

const { NORTH, EAST, SOUTH, WEST } = GridLocation;
const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;

type Move = readonly [GridLocation, RotationDirection, number];

// Lopsided on purpose: pro and anti, half and whole turns, and no symmetry of its own.
const LEFT_MOVES: readonly Move[] = [
  [EAST, CW, 0.5],
  [SOUTH, CCW, 1],
  [WEST, CW, 1],
  [NORTH, CW, 0.5],
  [EAST, CW, 0],
  [NORTH, CW, 2],
  [WEST, CCW, 0],
  [NORTH, CW, 1],
];
const RIGHT_MOVES: readonly Move[] = [
  [WEST, CCW, 0],
  [SOUTH, CCW, 0],
  [EAST, CW, 1],
  [NORTH, CW, 1],
  [WEST, CCW, 0],
  [NORTH, CCW, 0],
  [EAST, CW, 0],
  [NORTH, CCW, 1],
];

function soloFrom(moves: readonly Move[]) {
  let pose: { location: GridLocation; orientation: Orientation } = {
    location: NORTH,
    orientation: Orientation.IN,
  };
  const steps = moves.map(([destination, direction, turns]) => {
    const step = createBuilderStep(pose, destination, direction, turns);
    pose = {
      location: step.endLocation,
      orientation: step.endOrientation,
    };
    return step;
  });
  const source = buildFusePathSource({
    steps,
    expectedLength: moves.length,
    gridMode: GridMode.DIAMOND,
    side: "left",
  });
  if (!source.ok) throw new Error(source.message);
  return source.solo;
}

function createLinkableState(): FuseState {
  let call = 0;
  return createFuseState({
    browseLoader: {
      loadSequenceMetadata: vi.fn(async () => []),
      loadFullSequenceData: vi.fn(async () => null),
    },
    deriveLetters: async (sequence) => sequence,
    errorHandler: { showUserError: vi.fn(() => "fuse-test-error") },
    initialLength: 8,
    prefersReducedMotion: () => true,
    generateSoloLoop: vi.fn(async () => {
      call += 1;
      return {
        solo: soloFrom(call % 2 === 1 ? LEFT_MOVES : RIGHT_MOVES),
        loopSpec: { rewound: { period: 2 } },
      };
    }),
  });
}

function hands(sequence: SequenceData | null) {
  return sequence?.steps.map((step) =>
    (["left", "right"] as const).map((hand) => {
      const motion = step.motions[hand]!;
      return {
        motionType: motion.motionType,
        rotationDirection: motion.rotationDirection,
        startLocation: motion.startLocation,
        endLocation: motion.endLocation,
        turns: motion.turns,
        startOrientation: motion.startOrientation,
        endOrientation: motion.endOrientation,
      };
    })
  );
}

async function settled(state: FuseState): Promise<void> {
  await vi.waitFor(() => {
    expect(state.statusMessage).not.toBe("Previewing the linked path...");
    expect(state.symmetryPreview).not.toBeNull();
  });
}

async function linked(rule: FuseRule): Promise<FuseState> {
  const state = createLinkableState();
  await state.initialize();
  state.setRelationship("left", rule);
  await settled(state);
  return state;
}

const RULES = FUSE_TND_MODES.flatMap((mode) =>
  (["cw", "ccw"] as const).flatMap((quarterOffset) =>
    [false, true].flatMap((invert) =>
      [false, true].map((rewind) => ({
        name: `${mode} ${quarterOffset}${invert ? " invert" : ""}${rewind ? " rewind" : ""}`,
        rule: resolveFuseRule({ mode, quarterOffset, invert, rewind }),
      }))
    )
  )
);

describe("switching which path leads", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each(RULES)(
    "leaves both paths on screen alone: $name",
    async ({ rule }) => {
      const state = await linked(rule);
      const before = state.previewSequence;
      const steps = hands(before);
      expect(steps).toHaveLength(8);

      state.setDriver("right");

      expect(state.driverSide).toBe("right");
      expect(state.previewSequence).toBe(before);
      expect(state.error).toBeNull();

      // A reload rebuilds the left path from the right one through the turned
      // rule. It has to land on the same pair.
      const reloaded = createLinkableState();
      await reloaded.initialize();
      await settled(reloaded);
      expect(reloaded.driverSide).toBe("right");
      expect(hands(reloaded.previewSequence)).toEqual(steps);

      state.setDriver("left");
      expect(state.previewSequence).toBe(before);
      expect(fuseRulesEqual(state.rule, rule)).toBe(true);
    }
  );

  it("builds the next change on the path that now leads", async () => {
    const state = await linked(createFuseRule({ reflect: "mirror" }));
    const before = hands(state.previewSequence)!;

    state.setDriver("right");
    state.setRule(createFuseRule({ rotationSteps: 4 }));
    await settled(state);

    const after = hands(state.previewSequence)!;
    expect(after.map((step) => step[1])).toEqual(before.map((step) => step[1]));
    expect(after.map((step) => step[0])).not.toEqual(
      before.map((step) => step[0])
    );
  });

  it("keeps the hand's earlier path one Previous away", async () => {
    const state = createLinkableState();
    await state.initialize();
    const ownRight = state.right.sequence;

    state.setRelationship("left", createFuseRule({ reflect: "mirror" }));
    await settled(state);
    state.setDriver("right");

    expect(state.right.canGoBack).toBe(true);
    state.previous("right");
    expect(state.right.sequence).toEqual(ownRight);
  });

  it("does not pile up history when the lead goes back and forth", async () => {
    const state = await linked(createFuseRule({ rotationSteps: 2 }));

    for (const side of ["right", "left", "right", "left", "right"] as const) {
      state.setDriver(side);
    }

    expect(state.left.canGoBack).toBe(false);
    state.previous("right");
    await settled(state);
    expect(state.right.canGoBack).toBe(false);
  });

  it("does not flash the canvas as if a new path had arrived", async () => {
    const state = await linked(createFuseRule({ reflect: "flip" }));
    const revision = state.left.revision + state.right.revision;

    state.setDriver("right");

    expect(state.left.revision + state.right.revision).toBe(revision);
  });

  it("waits for a rule that is still being built", async () => {
    const state = await linked(createFuseRule({ reflect: "mirror" }));
    state.setRule(createFuseRule({ rotationSteps: 2 }));
    state.setDriver("right");
    state.setDriver("left");
    state.setDriver("right");
    await vi.waitFor(() => expect(state.driverSide).toBe("right"));
    await settled(state);

    expect(state.rule).toEqual(createFuseRule({ rotationSteps: 6 }));
    const steps = hands(state.previewSequence);
    const reloaded = createLinkableState();
    await reloaded.initialize();
    await settled(reloaded);
    expect(hands(reloaded.previewSequence)).toEqual(steps);
  });

  it("drafts a lead switch on the pair on screen, and Cancel undoes it", async () => {
    const rule = createFuseRule({ reflect: "mirror" });
    const state = await linked(rule);
    const steps = hands(state.previewSequence);
    const rightBefore = steps!.map((step) => step[1]);

    await state.previewRelationship("right", inverseFuseRule(rule));
    expect(state.previewDriverSide).toBe("right");
    expect(hands(state.previewSequence)).toEqual(steps);

    const quarter = createFuseRule({ rotationSteps: 2 });
    await state.previewRelationship("right", quarter);
    expect(hands(state.previewSequence)!.map((step) => step[1])).toEqual(
      rightBefore
    );

    state.cancelRelationshipPreview();
    expect(state.driverSide).toBe("left");
    expect(hands(state.previewSequence)).toEqual(steps);

    await state.previewRelationship("right", inverseFuseRule(rule));
    await state.previewRelationship("right", quarter);
    const drafted = hands(state.previewSequence);
    state.setRelationship("right", quarter);
    await settled(state);
    expect(state.driverSide).toBe("right");
    expect(hands(state.previewSequence)).toEqual(drafted);
  });
});
