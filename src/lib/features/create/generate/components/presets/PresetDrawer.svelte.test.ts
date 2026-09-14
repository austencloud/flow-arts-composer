import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "svelte";
import PresetDrawer from "./PresetDrawer.svelte";
import type { FavoriteState } from "../../state/favorite-state.svelte";
import type {
  CommunityFavorite,
  SavedGeneratorSetup,
  PendingSetupAction,
} from "../../domain/models/favorite-config";

const NOW = new Date("2026-07-30T12:00:00Z");
const CONFIG = {
  level: 2,
  length: 8,
  gridMode: "box",
  loopEnabled: false,
} as SavedGeneratorSetup["config"];

function setup(
  id: string,
  name = `Setup ${id}`,
  length = CONFIG.length
): SavedGeneratorSetup {
  return {
    id,
    name,
    config: { ...CONFIG, length },
    startEndOptions: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

interface StateOptions {
  setups?: SavedGeneratorSetup[];
  communityFavorites?: CommunityFavorite[];
  sharedSetupId?: string | null;
  activeSetupId?: string | null;
  activeStatus?: "active" | null;
  setupsLoadError?: string | null;
  pendingAction?: PendingSetupAction | null;
}

function fakeState(options: StateOptions = {}): FavoriteState {
  return {
    setups: options.setups ?? [],
    communityFavorites: options.communityFavorites ?? [],
    sharedSetupId: options.sharedSetupId ?? null,
    activeSource: options.activeSetupId
      ? { kind: "setup", setupId: options.activeSetupId }
      : null,
    activeStatus: options.activeStatus ?? null,
    isLoadingSetups: false,
    isLoadingCommunity: false,
    setupsLoadError: options.setupsLoadError ?? null,
    communityLoadError: null,
    pendingAction: options.pendingAction ?? null,
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

type PresetDrawerProps = ComponentProps<typeof PresetDrawer>;

function props(
  favoriteState: FavoriteState,
  overrides: Partial<PresetDrawerProps> = {}
): PresetDrawerProps {
  return {
    isOpen: true,
    favoriteState,
    isSignedOut: false,
    isPreview: false,
    isAnonymous: false,
    onApply: vi.fn(),
    onRequestCommunityAccount: vi.fn(),
    onRequestShareAccount: vi.fn(),
    onRequestSignIn: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("PresetDrawer", () => {
  it("keeps Save current setup available after setups exist", async () => {
    render(
      PresetDrawer,
      props(fakeState({ setups: [setup("1"), setup("2")] }))
    );

    await expect
      .element(page.getByRole("button", { name: "Save current setup" }))
      .toBeEnabled();
  });

  it("labels setup length in steps", async () => {
    render(
      PresetDrawer,
      props(fakeState({ setups: [setup("long", "Long setup", 16)] }))
    );

    await expect.element(page.getByText("L2 · Box · 16 steps")).toBeVisible();
    await expect
      .element(page.getByText("L2 · Box · 16ct"))
      .not.toBeInTheDocument();
  });

  it("asks guests to create an account before opening community setups", async () => {
    const onApply = vi.fn();
    const onRequestCommunityAccount = vi.fn();
    const communityFavorite: CommunityFavorite = {
      userId: "austen",
      displayName: "Austen Cloud",
      config: { ...CONFIG, length: 16 },
      startEndOptions: null,
      setAt: NOW,
    };

    render(
      PresetDrawer,
      props(fakeState({ communityFavorites: [communityFavorite] }), {
        isAnonymous: true,
        onApply,
        onRequestCommunityAccount,
      })
    );

    await page.getByRole("tab", { name: "Community" }).click();

    expect(onRequestCommunityAccount).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
    await expect
      .element(page.getByRole("tab", { name: "Saved" }))
      .toHaveAttribute("aria-selected", "true");
    await expect.element(page.getByText("Austen Cloud")).not.toBeVisible();
  });

  it("keeps load failure distinct from an empty list", async () => {
    const errorProps = props(
      fakeState({
        setupsLoadError: "Saved setups could not load",
      })
    );
    const screen = render(PresetDrawer, errorProps);

    await expect
      .element(page.getByText("Saved setups could not load"))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Try again" }))
      .toBeVisible();
    await expect
      .element(page.getByText("No saved setups yet"))
      .not.toBeInTheDocument();

    await screen.rerender(props(fakeState()));

    await expect.element(page.getByText("No saved setups yet")).toBeVisible();
    await expect
      .element(page.getByText("Saved setups could not load"))
      .not.toBeInTheDocument();
  });

  it("disables Update on the active row and enables it elsewhere", async () => {
    const active = setup("1");
    const other = setup("2");
    render(
      PresetDrawer,
      props(
        fakeState({
          setups: [active, other],
          activeSetupId: active.id,
          activeStatus: "active",
        })
      )
    );

    await page.getByRole("button", { name: "Actions for Setup 1" }).click();
    await expect
      .element(
        page.getByRole("menuitem", {
          name: "Update with current settings",
        })
      )
      .toBeDisabled();
    await page.getByRole("button", { name: "Actions for Setup 1" }).click();

    await page.getByRole("button", { name: "Actions for Setup 2" }).click();
    await expect
      .element(
        page.getByRole("menuitem", {
          name: "Update with current settings",
        })
      )
      .toBeEnabled();
  });

  it("warns that deleting the shared setup also unshares it", async () => {
    const shared = setup("shared", "Shared setup");
    const privateSetup = setup("private", "Private setup");
    const screen = render(
      PresetDrawer,
      props(
        fakeState({
          setups: [shared, privateSetup],
          sharedSetupId: shared.id,
        })
      )
    );

    await page
      .getByRole("button", { name: "Actions for Shared setup" })
      .click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect
      .element(
        page.getByText(
          "This removes the saved setup and stops sharing it as your Favorite. Your current generator settings will not change."
        )
      )
      .toBeVisible();

    screen.unmount();
    render(
      PresetDrawer,
      props(
        fakeState({
          setups: [privateSetup],
          sharedSetupId: null,
        })
      )
    );
    await page
      .getByRole("button", { name: "Actions for Private setup" })
      .click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect
      .element(
        page.getByText(
          "This removes the saved setup. Your current generator settings will not change."
        )
      )
      .toBeVisible();
  });
});
