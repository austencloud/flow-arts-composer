import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";
import { flushSync, tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "svelte";
import ExpandedCardStage from "./ExpandedCardStage.svelte";
import {
  createPanelCoordinationState,
  type PanelCoordinationState,
} from "$lib/shared/create/state/panel-coordination-state.svelte";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import {
  countViewTransitionNameClaims,
  resetViewTransitionNameRegistry,
} from "$lib/shared/transitions/view-transition-name-registry";
import type { FavoriteState } from "../../state/favorite-state.svelte";

afterEach(() => {
  resetViewTransitionNameRegistry();
  vi.restoreAllMocks();
});

function fakeFavorites(): FavoriteState {
  return {
    setups: [],
    communityFavorites: [],
    sharedSetupId: null,
    activeSource: null,
    activeStatus: null,
    isLoadingSetups: false,
    isLoadingCommunity: false,
    setupsLoadError: null,
    communityLoadError: null,
    pendingAction: null,
    canSave: true,
    loadPersonal: vi.fn(async () => undefined),
    loadCommunity: vi.fn(async () => undefined),
    saveCurrentSetup: vi.fn(async () => true),
    renameSetup: vi.fn(async () => true),
    updateSetupFromCurrent: vi.fn(async () => true),
    shareSetup: vi.fn(async () => true),
    unshareSetup: vi.fn(async () => true),
    deleteSetup: vi.fn(async () => true),
    setActiveSource: vi.fn(),
  } as unknown as FavoriteState;
}

type Props = ComponentProps<typeof ExpandedCardStage>;

function props(
  panelState: PanelCoordinationState,
  isDesktopLayout = true
): Props {
  return {
    panelState,
    isDesktopLayout,
    loop: {
      rhythm: {
        rotationInterval: 2,
        inversionInterval: 2,
        inversionMode: "expand",
        reflectionAxis: "north-south",
      },
      sequenceLength: 8,
      onRhythmChange: vi.fn(),
      onLoopDisable: vi.fn(),
      onRequestSignup: vi.fn(),
    },
    setups: {
      favoriteState: fakeFavorites(),
      isSignedOut: false,
      isPreview: false,
      isAnonymous: false,
      onApply: vi.fn(),
      onRequestCommunityAccount: vi.fn(),
      onRequestShareAccount: vi.fn(),
      onRequestSignIn: vi.fn(),
    },
  };
}

describe("ExpandedCardStage", () => {
  it("renders nothing while no card is open", () => {
    const state = createPanelCoordinationState();
    const { container } = render(ExpandedCardStage, props(state));
    expect(container.querySelector(".expanded-card-stage")).toBeNull();
  });

  it("scales the stage root in on a plain open", async () => {
    const state = createPanelCoordinationState();
    const { container } = render(ExpandedCardStage, props(state, true));

    state.openPresetDrawer();
    flushSync();

    const root = container.querySelector<HTMLElement>(".expanded-card-stage");
    expect(root).not.toBeNull();
    // Nothing has claimed the morph (registry is empty per afterEach) and
    // motion is not reduced, so the entrance is a real animation, not the
    // instant no-op stageEntrance() returns for the other two cases.
    await vi.waitFor(() => {
      expect(root!.getAnimations().length).toBe(1);
    });
  });

  it("skips the scale entrance under reduced motion", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);

    const state = createPanelCoordinationState();
    const { container } = render(ExpandedCardStage, props(state, true));

    state.openPresetDrawer();
    flushSync();
    await tick();

    const root = container.querySelector<HTMLElement>(".expanded-card-stage");
    expect(root).not.toBeNull();
    expect(root!.getAnimations().length).toBe(0);
  });

  it("renders the Setups panel in the stage on side-by-side layouts", async () => {
    const state = createPanelCoordinationState();
    const { container } = render(ExpandedCardStage, props(state, true));

    state.openPresetDrawer();
    flushSync();

    const root = container.querySelector<HTMLElement>(".expanded-card-stage");
    expect(root).not.toBeNull();
    expect(root!.dataset.destination).toBe("stage");
    expect(countViewTransitionNameClaims("generate-card-preset")).toBe(1);
    await expect
      .element(page.getByRole("heading", { name: "Generator setups" }))
      .toBeVisible();
  });

  it("portals to the body on stacked layouts", () => {
    const state = createPanelCoordinationState();
    const { container } = render(ExpandedCardStage, props(state, false));

    state.openPresetDrawer();
    flushSync();

    expect(container.querySelector(".expanded-card-stage")).toBeNull();
    const root = document.body.querySelector<HTMLElement>(
      ":scope > .expanded-card-stage"
    );
    expect(root).not.toBeNull();
    expect(root!.dataset.destination).toBe("viewport");
  });

  it("renders the LOOP overlay for the loop card", async () => {
    const state = createPanelCoordinationState();
    render(ExpandedCardStage, props(state, true));

    state.openLOOPPanel(LOOPType.MIRRORED, new Set(), () => {});
    flushSync();

    await expect
      .element(page.getByRole("button", { name: "Close LOOP selection" }))
      .toBeVisible();
    expect(countViewTransitionNameClaims("generate-card-loop")).toBe(1);
  });

  it("moves focus onto the stage on open and back to the trigger on close", async () => {
    const fixture = document.createElement("div");
    fixture.className = "card-wrapper";
    fixture.dataset.cardId = "preset";
    const triggerButton = document.createElement("button");
    triggerButton.type = "button";
    triggerButton.textContent = "Open setups";
    fixture.appendChild(triggerButton);
    document.body.appendChild(fixture);

    try {
      const state = createPanelCoordinationState();
      const { container } = render(ExpandedCardStage, props(state, true));

      state.openPresetDrawer();
      flushSync();
      await tick();

      const root = container.querySelector<HTMLElement>(".expanded-card-stage");
      expect(document.activeElement).toBe(root);

      state.closeGenerateCard();
      flushSync();
      await tick();

      expect(document.activeElement).toBe(triggerButton);
    } finally {
      fixture.remove();
    }
  });

  it("removes the portaled node and releases the claim on unmount", () => {
    const state = createPanelCoordinationState();
    const screen = render(ExpandedCardStage, props(state, false));

    state.openPresetDrawer();
    flushSync();

    expect(
      document.body.querySelector(":scope > .expanded-card-stage")
    ).not.toBeNull();
    expect(countViewTransitionNameClaims("generate-card-preset")).toBe(1);

    screen.unmount();

    expect(
      document.body.querySelector(":scope > .expanded-card-stage")
    ).toBeNull();
    expect(countViewTransitionNameClaims("generate-card-preset")).toBe(0);
  });

  it("closes on Escape and releases the claim", async () => {
    const state = createPanelCoordinationState();
    const { container } = render(ExpandedCardStage, props(state, true));

    state.openPresetDrawer();
    flushSync();
    expect(state.openGenerateCard).toBe("preset");

    const root = container.querySelector<HTMLElement>(".expanded-card-stage");
    expect(root).not.toBeNull();
    // The open effect focuses the root after tick(); wait for that instead of
    // assuming it has already landed by the time flushSync() returns.
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(root);
    });
    // Prove the claim actually exists here, so the release assertion below
    // cannot pass vacuously against a claim that was never made.
    expect(countViewTransitionNameClaims("generate-card-preset")).toBe(1);

    // Focus is inside the stage root, so this real key press is answered by
    // the root's own onkeydown handler (the stage is a non-modal dialog and
    // owns the first Escape), not by the app's global keyboard shortcut
    // coordinator, which this isolated component render does not mount.
    await userEvent.keyboard("{Escape}");

    // Chromium's View Transitions API runs the update callback (which is
    // where morphGenerateCard's mutate lands) on its own schedule, not
    // synchronously with the Escape press that requested it. Poll instead of
    // guessing a frame count.
    await vi.waitFor(() => {
      flushSync();
      expect(state.openGenerateCard).toBeNull();
    });
    // The claim is released by claimedViewTransitionName's destroy(), which
    // only runs once Svelte finishes unmounting the stage root - and that
    // waits for the root's own outro to finish first. lastGenerateCardMorphRan()
    // is true here (close() runs a real view transition in Chromium), so the
    // outro duration is 0; the lag between openGenerateCard going null and the
    // claim reaching 0 is the view-transition update callback plus Svelte's
    // own teardown, not the outro. Poll separately instead of asserting in the
    // same tick.
    await vi.waitFor(() => {
      expect(countViewTransitionNameClaims("generate-card-preset")).toBe(0);
    });
  });
});
