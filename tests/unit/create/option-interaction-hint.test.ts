import { describe, expect, it, vi } from "vitest";
import { createOptionInteractionHintState } from "#lib/features/create/construct/option-picker/state/option-interaction-hint-state.svelte.js";
import { calculateOptionInteractionHintPosition } from "#lib/features/create/construct/option-picker/services/option-interaction-hint-position.js";
import {
  ROOMY_OPTION_PICKER_WIDTH,
  selectOptionInteractionHintPresentation,
} from "#lib/features/create/construct/option-picker/services/option-interaction-hint-presentation.js";

describe("option interaction hint", () => {
  it("persists the first dismissal exactly once", () => {
    const markSeen = vi.fn();
    const state = createOptionInteractionHintState({
      hasSeen: () => false,
      markSeen,
    });

    expect(state.isVisible).toBe(false);
    state.revealIfUnseen();
    expect(state.isVisible).toBe(true);
    state.dismiss();
    state.dismiss();

    expect(state.isVisible).toBe(false);
    expect(markSeen).toHaveBeenCalledTimes(1);
  });

  it("stays hidden when the marker was already recorded", () => {
    const state = createOptionInteractionHintState({
      hasSeen: () => true,
      markSeen: vi.fn(),
    });

    state.revealIfUnseen();
    expect(state.isVisible).toBe(false);
  });

  it("switches presentation without marking the hint as seen", () => {
    const markSeen = vi.fn();
    const state = createOptionInteractionHintState({
      hasSeen: () => false,
      markSeen,
    });

    state.revealIfUnseen();
    state.setPresentation("workspace-banner");

    expect(state.isVisible).toBe(true);
    expect(state.presentation).toBe("workspace-banner");
    expect(markSeen).not.toHaveBeenCalled();
  });

  it("reserves the anchored cue for a truly roomy side-by-side picker", () => {
    expect(
      selectOptionInteractionHintPresentation({
        isSideBySide: true,
        pickerWidth: ROOMY_OPTION_PICKER_WIDTH - 1,
      })
    ).toBe("workspace-banner");
    expect(
      selectOptionInteractionHintPresentation({
        isSideBySide: false,
        pickerWidth: ROOMY_OPTION_PICKER_WIDTH,
      })
    ).toBe("workspace-banner");
    expect(
      selectOptionInteractionHintPresentation({
        isSideBySide: true,
        pickerWidth: ROOMY_OPTION_PICKER_WIDTH,
      })
    ).toBe("anchored");
  });

  it("keeps the bubble inside the container while pointing at an edge option", () => {
    const position = calculateOptionInteractionHintPosition({
      container: {
        top: 100,
        right: 420,
        bottom: 500,
        left: 100,
        width: 320,
        height: 400,
      },
      anchor: {
        top: 140,
        right: 156,
        bottom: 196,
        left: 100,
        width: 56,
        height: 56,
      },
      hintWidth: 208,
      hintHeight: 72,
    });

    expect(position).toEqual({
      top: 108,
      left: 8,
      arrowLeft: 20,
      placement: "below",
    });
  });

  it("prefers the space above a lower option", () => {
    const position = calculateOptionInteractionHintPosition({
      container: {
        top: 100,
        right: 500,
        bottom: 600,
        left: 100,
        width: 400,
        height: 500,
      },
      anchor: {
        top: 430,
        right: 340,
        bottom: 510,
        left: 260,
        width: 80,
        height: 80,
      },
      hintWidth: 208,
      hintHeight: 72,
    });

    expect(position.placement).toBe("above");
    expect(position.top).toBe(246);
    expect(position.left).toBe(96);
  });

  it("places the bubble below when picker controls occupy the space above", () => {
    const position = calculateOptionInteractionHintPosition({
      container: {
        top: 400,
        right: 430,
        bottom: 900,
        left: 0,
        width: 430,
        height: 500,
      },
      anchor: {
        top: 494,
        right: 137,
        bottom: 560,
        left: 71,
        width: 66,
        height: 66,
      },
      hintWidth: 208,
      hintHeight: 72,
      topInset: 42,
    });

    expect(position.placement).toBe("below");
    expect(position.top).toBe(172);
  });
});
