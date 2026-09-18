import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";
import { flushSync } from "svelte";
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
});

function createState(): PanelCoordinationState {
  return createPanelCoordinationState();
}

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
    const state = createState();
    const { container } = render(ExpandedCardStage, props(state));
    expect(container.querySelector(".expanded-card-stage")).toBeNull();
  });

  it("renders the Setups panel in the stage on side-by-side layouts", async () => {
    const state = createState();
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
    const state = createState();
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
    const state = createState();
    render(ExpandedCardStage, props(state, true));

    state.openLOOPPanel(LOOPType.MIRRORED, new Set(), () => {});
    flushSync();

    await expect
      .element(page.getByRole("button", { name: "Close LOOP selection" }))
      .toBeVisible();
    expect(countViewTransitionNameClaims("generate-card-loop")).toBe(1);
  });

  it("closes on Escape and releases the claim", async () => {
    const state = createState();
    render(ExpandedCardStage, props(state, true));

    state.openPresetDrawer();
    flushSync();
    expect(state.openGenerateCard).toBe("preset");

    await userEvent.keyboard("{Escape}");

    // Chromium's View Transitions API runs the update callback (which is
    // where morphGenerateCard's mutate lands) on its own schedule, not
    // synchronously with the keydown that requested it. Poll instead of
    // guessing a frame count.
    await vi.waitFor(() => {
      flushSync();
      expect(state.openGenerateCard).toBeNull();
    });
    expect(countViewTransitionNameClaims("generate-card-preset")).toBe(0);
  });
});
