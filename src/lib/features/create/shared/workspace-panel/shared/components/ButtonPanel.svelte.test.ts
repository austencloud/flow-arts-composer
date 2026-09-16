import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateModuleContext } from "$lib/features/create/shared/context/create-module-context";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createStartPlacementData } from "$lib/shared/foundation/domain/factories/create-start-placement-data";
import ButtonPanel from "./ButtonPanel.svelte";

vi.mock("$lib/shared/mobile/share-action.svelte", () => ({
  shareTarget: {
    get isMobile() {
      return true;
    },
  },
}));

vi.mock("$lib/shared/navigation/state/navigation-state.svelte", () => ({
  navigationState: {
    activeTab: "construct",
  },
}));

vi.mock("$lib/shared/application/get-haptic-feedback", () => ({
  getHapticFeedback: () => null,
}));

vi.mock("$lib/shared/share/get-sharer", () => ({
  getSharer: () => ({
    getCardImageBlob: vi.fn().mockResolvedValue(
      new Blob(["card"], {
        type: "image/png",
      })
    ),
    generateFilename: vi.fn(() => "sequence.png"),
  }),
}));

vi.mock("$lib/shared/share/state/image-composition-state.svelte", () => ({
  getImageCompositionManager: () => ({
    darkMode: true,
    registerObserver: vi.fn(),
    unregisterObserver: vi.fn(),
  }),
}));

vi.mock("$lib/shared/pictograph/shared/state/visibility-state.svelte", () => ({
  getVisibilityStateManager: () => ({
    registerObserver: vi.fn(),
    unregisterObserver: vi.fn(),
  }),
}));

vi.mock("$lib/shared/qr/get-short-code-manager", () => ({
  getShortCodeManager: () => ({
    createShortCode: vi.fn().mockResolvedValue({
      url: "https://tka.run/A",
    }),
  }),
}));

const sequence = createSequenceData({
  id: "toolbar-geometry",
  word: "A",
  name: "A",
  steps: [createStepData({ letter: "A" })],
});
const startOnlySequence = createSequenceData({
  id: "toolbar-teaching-banner",
  startPlacement: createStartPlacementData({ id: "toolbar-start" }),
  steps: [],
});

type ButtonPanelCreateModuleStateFixture = Pick<
  CreateModuleContext["CreateModuleState"],
  | "canShowActionButtons"
  | "canShowSequenceActionsButton"
  | "canClearSequence"
  | "canUndo"
  | "canRedo"
  | "undoHistory"
  | "undo"
  | "redo"
  | "assembleTabState"
> & {
  getActiveTabSequenceState: () => {
    currentSequence: typeof sequence;
  };
};

type ButtonPanelContextFixture = {
  CreateModuleState: ButtonPanelCreateModuleStateFixture;
  constructTabState: {
    optionInteractionHintState: {
      readonly isVisible: boolean;
      readonly presentation: "anchored" | "workspace-banner";
      dismiss: () => void;
    };
  };
  constructTutorialState: Pick<
    CreateModuleContext["constructTutorialState"],
    "isActive" | "stage" | "recordFullPlay"
  >;
  panelState: Pick<
    CreateModuleContext["panelState"],
    "isExportPanelOpen" | "openSequenceActionsPanel"
  >;
  layout: Pick<CreateModuleContext["layout"], "shouldUseSideBySideLayout">;
};

function createContext(): ButtonPanelContextFixture {
  return {
    CreateModuleState: {
      canShowActionButtons: () => true,
      canShowSequenceActionsButton: () => true,
      canClearSequence: () => true,
      getActiveTabSequenceState: () => ({ currentSequence: sequence }),
      canUndo: false,
      canRedo: false,
      undoHistory: [],
      undo: () => false,
      redo: () => false,
      assembleTabState: null,
    },
    constructTabState: {
      optionInteractionHintState: {
        isVisible: false,
        presentation: "anchored",
        dismiss: vi.fn(),
      },
    },
    constructTutorialState: {
      isActive: false,
      stage: "play-sequence",
      recordFullPlay: vi.fn(),
    },
    panelState: {
      isExportPanelOpen: false,
      openSequenceActionsPanel: vi.fn(),
    },
    layout: {
      shouldUseSideBySideLayout: false,
    },
  } satisfies ButtonPanelContextFixture;
}

function rect(name: string): DOMRect {
  return (
    page.getByRole("button", { name, exact: true }).element() as HTMLElement
  ).getBoundingClientRect();
}

async function waitForLayout(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

beforeEach(() => {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(navigator, "canShare", {
    configurable: true,
    value: vi.fn(() => true),
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "canShare");
});

describe("ButtonPanel narrow geometry", () => {
  it("fits the compact interaction banner between start-only actions", async () => {
    const context = createContext();
    const dismiss = vi.fn();
    context.CreateModuleState.canShowActionButtons = () => false;
    context.CreateModuleState.canShowSequenceActionsButton = () => true;
    context.CreateModuleState.getActiveTabSequenceState = () => ({
      currentSequence: startOnlySequence,
    });
    context.constructTabState.optionInteractionHintState = {
      isVisible: true,
      presentation: "workspace-banner",
      dismiss,
    };

    const screen = render(ButtonPanel, {
      props: {
        onClearSequence: vi.fn(),
        onViewSequence: vi.fn(),
      },
      context: new Map([["createModule", context]]),
    });
    screen.container.style.width = "320px";

    await waitForLayout();

    const banner = screen.container.querySelector<HTMLElement>(
      ".option-interaction-banner"
    );
    const clear = rect("Clear sequence");
    const actions = rect("Sequence actions");
    const bannerBounds = banner?.getBoundingClientRect();

    expect(banner).not.toBeNull();
    expect(bannerBounds?.left).toBeGreaterThanOrEqual(clear.right);
    expect(bannerBounds?.right).toBeLessThanOrEqual(actions.left);
    expect(bannerBounds?.width).toBeGreaterThanOrEqual(200);

    await page.getByRole("button", { name: "Dismiss option hint" }).click();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("removes the interaction banner before Play enters", async () => {
    const context = createContext();
    context.constructTabState.optionInteractionHintState = {
      isVisible: true,
      presentation: "workspace-banner",
      dismiss: vi.fn(),
    };

    const screen = render(ButtonPanel, {
      props: {
        onClearSequence: vi.fn(),
        onViewSequence: vi.fn(),
      },
      context: new Map([["createModule", context]]),
    });

    expect(
      screen.container.querySelector(".option-interaction-banner")
    ).toBeNull();
    await expect
      .element(page.getByRole("button", { name: "Play sequence" }))
      .toBeInTheDocument();
  });

  it("keeps four controls in one centered row at 320 CSS pixels", async () => {
    const screen = render(ButtonPanel, {
      props: {
        onClearSequence: vi.fn(),
        onViewSequence: vi.fn(),
      },
      context: new Map([["createModule", createContext()]]),
    });
    screen.container.style.width = "320px";

    await waitForLayout();

    const containerBounds = screen.container.getBoundingClientRect();
    const play = rect("Play sequence");
    const buttons = [
      rect("Clear sequence"),
      play,
      rect("Sequence actions"),
      rect("Share sequence"),
    ];

    expect(play.width).toBe(50);
    expect(play.left + play.width / 2).toBeCloseTo(
      containerBounds.left + containerBounds.width / 2,
      0
    );

    for (const button of buttons) {
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.left).toBeGreaterThanOrEqual(containerBounds.left);
      expect(button.right).toBeLessThanOrEqual(containerBounds.right);
      expect(button.top + button.height / 2).toBeCloseTo(
        play.top + play.height / 2,
        0
      );
    }

    const orderedButtons = [...buttons].sort((a, b) => a.left - b.left);
    for (let index = 1; index < orderedButtons.length; index++) {
      const previousButton = orderedButtons[index - 1];
      const currentButton = orderedButtons[index];

      expect(previousButton).toBeDefined();
      expect(currentButton).toBeDefined();

      if (previousButton && currentButton) {
        expect(previousButton.right).toBeLessThanOrEqual(currentButton.left);
      }
    }
  });

  it("adds labels at 768 CSS pixels without moving Play off center", async () => {
    const screen = render(ButtonPanel, {
      props: {
        onClearSequence: vi.fn(),
        onViewSequence: vi.fn(),
      },
      context: new Map([["createModule", createContext()]]),
    });
    const clearLabel = screen.container.querySelector<HTMLElement>(
      "[data-testid='clear-sequence-button'] .workspace-action-label"
    );
    const shareLabel = screen.container.querySelector<HTMLElement>(
      "[data-testid='workspace-share-button'] .share-action-trigger-label"
    );
    const playLabel = screen.container.querySelector<HTMLElement>(
      ".view-sequence-button .workspace-action-label"
    );
    const actionsLabel = screen.container.querySelector<HTMLElement>(
      "[data-testid='sequence-actions-button'] .workspace-action-label"
    );

    expect(clearLabel).not.toBeNull();
    expect(playLabel).not.toBeNull();
    expect(actionsLabel).not.toBeNull();
    expect(shareLabel).not.toBeNull();

    screen.container.style.width = "767px";
    await waitForLayout();

    expect(getComputedStyle(clearLabel!).display).toBe("none");
    expect(getComputedStyle(playLabel!).display).toBe("none");
    expect(getComputedStyle(actionsLabel!).display).toBe("none");
    expect(getComputedStyle(shareLabel!).display).toBe("none");

    screen.container.style.width = "768px";
    await waitForLayout();

    expect(getComputedStyle(clearLabel!).display).not.toBe("none");
    expect(getComputedStyle(playLabel!).display).not.toBe("none");
    expect(getComputedStyle(actionsLabel!).display).not.toBe("none");
    expect(getComputedStyle(shareLabel!).display).not.toBe("none");

    const containerBounds = screen.container.getBoundingClientRect();
    const clear = rect("Clear sequence");
    const play = rect("Play sequence");
    const sequenceActions = rect("Sequence actions");
    const share = rect("Share sequence");

    expect(clear.width).toBeGreaterThan(44);
    expect(play.width).toBeGreaterThan(50);
    expect(sequenceActions.width).toBeGreaterThan(44);
    expect(share.width).toBeGreaterThan(44);
    expect(play.left + play.width / 2).toBeCloseTo(
      containerBounds.left + containerBounds.width / 2,
      0
    );
    expect(clear.right).toBeLessThanOrEqual(play.left);
    expect(play.right).toBeLessThanOrEqual(sequenceActions.left);
    expect(sequenceActions.right).toBeLessThanOrEqual(share.left);
  });
});
