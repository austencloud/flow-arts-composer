import { describe, expect, it } from "vitest";

import { setStageDirectionCueVisibility } from "#lib/shared/3d/environments/domain/stage-direction-cues.js";
import { createAutumnStage } from "#lib/shared/3d/environments/worlds/autumn/autumn-stage.js";

// A film recording hides the stage direction cues by their role tag. If a cue
// lost its tag, it would come back in every recorded film with nothing to
// say so, and if the helper matched too widely, the deck would vanish.
describe("stage direction cues", () => {
  it("hides the autumn stage's four cue strips and nothing else", () => {
    const stage = createAutumnStage({ groundY: 0, showDirectionCues: true });
    const names = (visible: boolean) => {
      const found: string[] = [];
      stage.object.traverse((object) => {
        if (object !== stage.object && object.visible === visible) {
          found.push(object.name);
        }
      });
      return found;
    };
    const shownBefore = names(true);

    setStageDirectionCueVisibility(stage.object, false);
    expect(names(false).sort()).toEqual([
      "autumn-stage-downstage-cue",
      "autumn-stage-left-cue",
      "autumn-stage-right-cue",
      "autumn-stage-upstage-cue",
    ]);
    expect(names(true)).toContain("autumn-stage-plank-0");

    setStageDirectionCueVisibility(stage.object, true);
    expect(names(true)).toEqual(shownBefore);
    stage.dispose();
  });
});
