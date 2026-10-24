import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";

vi.mock(
  "#lib/shared/pictograph/shared/components/PictographContainer.svelte",
  async () => ({
    default: (await import("./PictographArrivalContainerStub.svelte")).default,
  })
);

import PictographArrivalStage from "./PictographArrivalStage.svelte";

const firstStep = {
  id: "step-1",
  stepNumber: 1,
  duration: 1,
} as StepData;
const candidateStep = {
  id: "candidate-step",
  stepNumber: 2,
  duration: 1,
} as StepData;
const sequence = {
  id: "sequence",
  name: "",
  word: "",
  steps: [firstStep, candidateStep],
  thumbnails: [],
  isFavorite: false,
  isCircular: false,
  tags: [],
  metadata: {},
} satisfies SequenceData;

describe("PictographArrivalStage audition", () => {
  it("uses the candidate's effective rotation to expose the preview clock", async () => {
    const highTurnStep = createStepData({
      id: "high-turn-step",
      stepNumber: 2,
      motions: {
        left: createMotionData({
          hand: HandSide.LEFT,
          motionType: MotionType.STATIC,
          rotationDirection: RotationDirection.CLOCKWISE,
          turns: 3,
        }),
      },
    });

    render(PictographArrivalStage, {
      request: {
        intent: "audition",
        stepIndex: 1,
        requestId: 6,
        owner: "stage",
        phase: "preview",
      },
      sequence: { ...sequence, steps: [firstStep, highTurnStep] },
      getDestinationRect: () => null,
      onBeginLanding: vi.fn(),
      onBeginHandoff: vi.fn(),
      onComplete: vi.fn(),
    });

    const pictograph = page
      .getByTestId("arrival-pictograph")
      .element() as HTMLElement;
    expect(
      pictograph.closest<HTMLElement>("[data-arrival-intent='audition']")
        ?.dataset.propMotionDurationMs
    ).toBe("1500");
  });

  it("animates from the preceding beat and holds without landing", async () => {
    const onBeginLanding = vi.fn();
    const onBeginHandoff = vi.fn();
    const onComplete = vi.fn();
    const onMotionComplete = vi.fn();

    render(PictographArrivalStage, {
      request: {
        intent: "audition",
        stepIndex: 1,
        requestId: 7,
        owner: "stage",
        phase: "preview",
      },
      sequence,
      getDestinationRect: () => null,
      onBeginLanding,
      onBeginHandoff,
      onComplete,
      onMotionComplete,
    });

    await expect
      .element(page.getByTestId("arrival-pictograph"))
      .toHaveAttribute("data-step-id", "candidate-step");
    await expect
      .element(page.getByTestId("arrival-pictograph"))
      .toHaveAttribute("data-motion-start-id", "step-1");
    const pictograph = page
      .getByTestId("arrival-pictograph")
      .element() as HTMLElement;
    await vi.waitFor(
      () => {
        expect(
          pictograph.closest<HTMLElement>("[data-arrival-intent='audition']")
            ?.dataset.arrivalPhase
        ).toBe("holding");
      },
      { timeout: 2500 }
    );
    await expect
      .element(page.getByTestId("arrival-pictograph"))
      .toHaveAttribute("data-motion-progress", "1");

    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(onMotionComplete).toHaveBeenCalledOnce();
    expect(onBeginLanding).not.toHaveBeenCalled();
    expect(onBeginHandoff).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe("PictographArrivalStage commit", () => {
  it("releases the final grid before measuring the landing destination", async () => {
    const landingOrder: string[] = [];
    const onBeginLanding = vi.fn(() => landingOrder.push("release-grid"));
    const getDestinationRect = vi.fn(() => {
      landingOrder.push("measure-destination");
      return { left: 24, top: 24, width: 96, height: 96 };
    });

    render(PictographArrivalStage, {
      request: {
        intent: "commit",
        stepIndex: 1,
        requestId: 8,
        owner: "stage",
        phase: "preview",
      },
      sequence,
      getDestinationRect,
      onBeginLanding,
      onBeginHandoff: vi.fn(),
      onComplete: vi.fn(),
    });

    await vi.waitFor(
      () => {
        expect(getDestinationRect).toHaveBeenCalledOnce();
      },
      { timeout: 3000 }
    );

    expect(onBeginLanding).toHaveBeenCalledWith(8);
    expect(landingOrder).toEqual(["release-grid", "measure-destination"]);
  });
});

describe("PictographArrivalStage screen presentation", () => {
  const commitRequest = (requestId: number) =>
    ({
      intent: "commit",
      stepIndex: 1,
      requestId,
      owner: "stage",
      phase: "preview",
    }) as const;

  it("plays over the whole screen, outside the step grid", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    render(PictographArrivalStage, {
      target: host,
      props: {
        request: commitRequest(11),
        sequence,
        presentation: "screen",
        getDestinationRect: () => null,
        onBeginLanding: vi.fn(),
        onBeginHandoff: vi.fn(),
        onComplete: vi.fn(),
      },
    });

    const overlay = page
      .getByTestId("arrival-pictograph")
      .element()
      .closest<HTMLElement>(".arrival-overlay");
    expect(overlay?.parentElement).toBe(document.body);
    expect(host.contains(overlay)).toBe(false);
    expect(getComputedStyle(overlay!).position).toBe("fixed");
    host.remove();
  });

  it("lands as soon as the screen is tapped mid-preview", async () => {
    const onBeginLanding = vi.fn();
    render(PictographArrivalStage, {
      request: commitRequest(12),
      sequence,
      presentation: "screen",
      getDestinationRect: () => ({ left: 24, top: 24, width: 64, height: 64 }),
      onBeginLanding,
      onBeginHandoff: vi.fn(),
      onComplete: vi.fn(),
    });

    const overlay = page
      .getByTestId("arrival-pictograph")
      .element()
      .closest<HTMLElement>(".arrival-overlay")!;
    await vi.waitFor(() => {
      expect(overlay.dataset.arrivalPhase).toBe("moving");
    });

    window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(onBeginLanding).toHaveBeenCalledWith(12);
    expect(overlay.dataset.arrivalPhase).toBe("landing");
    // The card was cut off mid-entrance; it lands visible, not from 0 opacity.
    const card = overlay.querySelector<HTMLElement>("[data-arrival-card]")!;
    expect(card.classList.contains("entered")).toBe(true);
  });

  it("does not let a tap cut the workspace stage short", async () => {
    const onBeginLanding = vi.fn();
    render(PictographArrivalStage, {
      request: commitRequest(13),
      sequence,
      getDestinationRect: () => ({ left: 24, top: 24, width: 64, height: 64 }),
      onBeginLanding,
      onBeginHandoff: vi.fn(),
      onComplete: vi.fn(),
    });

    const overlay = page
      .getByTestId("arrival-pictograph")
      .element()
      .closest<HTMLElement>(".arrival-overlay")!;
    await vi.waitFor(() => {
      expect(overlay.dataset.arrivalPhase).toBe("moving");
    });

    window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(onBeginLanding).not.toHaveBeenCalled();
    expect(overlay.dataset.arrivalPhase).toBe("moving");
  });
});

describe("PictographArrivalStage grid join", () => {
  it("draws the arriving step and its starting beat on the joined grids", async () => {
    render(PictographArrivalStage, {
      request: {
        intent: "audition",
        stepIndex: 1,
        requestId: 9,
        owner: "stage",
        phase: "preview",
      },
      sequence,
      gridJoin: { toward: "e", steps: 1 },
      getDestinationRect: () => null,
      onBeginLanding: vi.fn(),
      onBeginHandoff: vi.fn(),
      onComplete: vi.fn(),
    });

    const pictograph = page.getByTestId("arrival-pictograph");
    await expect.element(pictograph).toHaveAttribute("data-join", "e1");
    await expect
      .element(pictograph)
      .toHaveAttribute("data-motion-start-join", "e1");
  });

  it("leaves one-grid steps unjoined", async () => {
    render(PictographArrivalStage, {
      request: {
        intent: "audition",
        stepIndex: 1,
        requestId: 10,
        owner: "stage",
        phase: "preview",
      },
      sequence,
      getDestinationRect: () => null,
      onBeginLanding: vi.fn(),
      onBeginHandoff: vi.fn(),
      onComplete: vi.fn(),
    });

    const pictograph = page.getByTestId("arrival-pictograph");
    await expect
      .element(pictograph)
      .toHaveAttribute("data-step-id", "candidate-step");
    await expect.element(pictograph).not.toHaveAttribute("data-join");
  });
});
