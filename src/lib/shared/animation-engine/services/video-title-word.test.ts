import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnimationPlaybackController } from "./animation-playback-controller-factory";
import { createAnimationPanelState } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridLocation,
  GridPlacement,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

// A Create sequence spelling "T" downloaded as a video titled "SPM". An unsaved
// workspace sequence stores an empty `word` and an automatic name such as
// "Sequence 11:46:02 PM"; the animation engine titled the video `word || name`,
// and the glyph header keeps only TKA letters, so the name became "SPM".
//
// This drives the stack WorkspaceShareSheet.requestWorkspaceVideo uses: the
// factory controller, an ephemeral panel state, and initialize(). The video
// export orchestrator hands panelState.sequenceWord to the frame compositor,
// which draws it as the title bar.

/** T, gamma11 to gamma9: both hands anti-spin clockwise, S to E and E to N. */
function letterTStep(): ReturnType<typeof createStepData> {
  return createStepData({
    stepNumber: 1,
    letter: Letter.T,
    startPlacement: GridPlacement.GAMMA11,
    endPlacement: GridPlacement.GAMMA9,
    motions: {
      [HandSide.LEFT]: createMotionData({
        hand: HandSide.LEFT,
        motionType: MotionType.ANTI,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.EAST,
      }),
      [HandSide.RIGHT]: createMotionData({
        hand: HandSide.RIGHT,
        motionType: MotionType.ANTI,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.EAST,
        endLocation: GridLocation.NORTH,
      }),
    },
  });
}

/** The word the exported video's title bar receives for this sequence. */
function videoTitleWord(sequence: SequenceData): string {
  const panelState = createAnimationPanelState({ ephemeral: true });
  const controller = createAnimationPlaybackController(undefined, {
    syncSharedWorkspaceState: false,
  });
  try {
    expect(controller.initialize(sequence, panelState)).toBe(true);
    return panelState.sequenceWord;
  } finally {
    controller.dispose();
  }
}

describe("exported video title word", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1)
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("titles an unsaved sequence by its letters, not its automatic name", () => {
    const sequence = createSequenceData({
      name: "Sequence 11:46:02 PM",
      word: "",
      steps: [letterTStep()],
    });

    expect(videoTitleWord(sequence)).toBe("T");
  });

  it("keeps a stored word when a legacy start entry carries its own letter", () => {
    // Legacy blobs (the museum exhibits among them) keep the start placement as
    // a stepNumber 0 entry lettered α. It is not a beat and is not in the word.
    const startEntry = createStepData({
      stepNumber: 0,
      letter: Letter.ALPHA,
      startPlacement: GridPlacement.ALPHA7,
      endPlacement: GridPlacement.ALPHA7,
    });
    const sequence = createSequenceData({
      name: "Sequence 11:46:02 PM",
      word: "T",
      steps: [startEntry, letterTStep()],
    });

    expect(videoTitleWord(sequence)).toBe("T");
  });
});
