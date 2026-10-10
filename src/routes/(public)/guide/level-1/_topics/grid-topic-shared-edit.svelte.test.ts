/**
 * Proof for the guide rethink pilot: the Grid's explanations live in one
 * record. Replacing a unit's text there must change the lesson, the web topic
 * page and the print handbook page together.
 */
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/guide-topics/grid-topic.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("#lib/shared/guide-topics/grid-topic.js")
    >();
  return { ...actual, gridTopicText: (unit: string) => `PROBE:${unit}` };
});

import GridStepHeader from "#lib/features/learn/components/interactive/grid-concept/GridStepHeader.svelte";

describe("one shared edit reaches every Grid view", () => {
  it("the lesson shows each shared point definition at its step", async () => {
    for (const [phase, unit] of [
      ["center", "centerPoint"],
      ["hand", "handPoints"],
      ["outer", "outerPoints"],
    ] as const) {
      const screen = render(GridStepHeader, {
        step: 2,
        gridPhase: "split",
        pointTypePhase: phase,
      });
      await expect
        .element(screen.getByText(`PROBE:${unit}`))
        .toBeInTheDocument();
      screen.unmount();
    }
  });

  it("the lesson opens with the shared intro", async () => {
    const screen = render(GridStepHeader, {
      step: 0,
      gridPhase: "split",
      pointTypePhase: "center",
    });
    await expect.element(screen.getByText("PROBE:intro")).toBeInTheDocument();
  });
});
