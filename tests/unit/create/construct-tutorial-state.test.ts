import { describe, expect, it } from "vitest";
import { createConstructTutorialState } from "$lib/features/create/construct/tutorial/state/construct-tutorial-state.svelte";

describe("Construct live tutorial state", () => {
  it("advances only after the matching successful live action", () => {
    const tutorial = createConstructTutorialState();
    tutorial.start();

    expect(tutorial.stage).toBe("start-placement");
    expect(
      tutorial.recordOptionApplied({
        letter: "A",
        stepNumber: 1,
      })
    ).toBe(false);

    expect(tutorial.recordStartPlacement("α1")).toBe(true);
    expect(tutorial.stage).toBe("next-pictograph");
    expect(tutorial.placementLabel).toBe("α1");

    expect(
      tutorial.recordOptionApplied({
        letter: "A",
        stepNumber: 1,
      })
    ).toBe(true);
    expect(tutorial.stage).toBe("play-sequence");
    expect(tutorial.addedLetter).toBe("A");

    expect(tutorial.recordFullPlay()).toBe(true);
    expect(tutorial.status).toBe("completed");
  });

  it("dismisses and can restart cleanly", () => {
    const tutorial = createConstructTutorialState();
    tutorial.start();
    tutorial.recordStartPlacement("β5");
    tutorial.dismiss();

    expect(tutorial.status).toBe("dismissed");
    expect(
      tutorial.recordOptionApplied({
        letter: "A",
        stepNumber: 1,
      })
    ).toBe(false);

    tutorial.start();
    expect(tutorial.status).toBe("active");
    expect(tutorial.stage).toBe("start-placement");
    expect(tutorial.placementLabel).toBeNull();
    expect(tutorial.addedLetter).toBeNull();
  });

  it("accepts a valid custom start placement without a canonical label", () => {
    const tutorial = createConstructTutorialState();
    tutorial.start();

    expect(tutorial.recordStartPlacement(null)).toBe(true);
    expect(tutorial.stage).toBe("next-pictograph");
    expect(tutorial.placementLabel).toBeNull();
  });
});
