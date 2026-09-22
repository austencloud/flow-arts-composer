import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "svelte";
import SetupsPanel from "./SetupsPanel.svelte";
import type { FavoriteState } from "../../state/favorite-state.svelte";
import type {
  CommunitySetup,
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

function communitySetup(
  userId: string,
  setupId: string,
  displayName: string,
  name: string
): CommunitySetup {
  return {
    setupId,
    userId,
    displayName,
    name,
    config: { ...CONFIG, length: 16 },
    startEndOptions: null,
    createdAt: NOW,
  };
}

interface StateOptions {
  setups?: SavedGeneratorSetup[];
  communitySetups?: CommunitySetup[];
  activeSetupId?: string | null;
  activeStatus?: "active" | null;
  setupsLoadError?: string | null;
  communityLoadError?: string | null;
  pendingAction?: PendingSetupAction | null;
}

function fakeState(options: StateOptions = {}): FavoriteState {
  return {
    setups: options.setups ?? [],
    communitySetups: options.communitySetups ?? [],
    activeSource: options.activeSetupId
      ? { kind: "setup", setupId: options.activeSetupId }
      : null,
    activeStatus: options.activeStatus ?? null,
    isLoadingSetups: false,
    isLoadingCommunity: false,
    setupsLoadError: options.setupsLoadError ?? null,
    communityLoadError: options.communityLoadError ?? null,
    pendingAction: options.pendingAction ?? null,
    canSave: true,
    loadPersonal: vi.fn(async () => undefined),
    loadCommunity: vi.fn(async () => undefined),
    saveCurrentSetup: vi.fn(async () => true),
    renameSetup: vi.fn(async () => true),
    updateSetupFromCurrent: vi.fn(async () => true),
    deleteSetup: vi.fn(async () => true),
    setActiveSource: vi.fn(),
  } as unknown as FavoriteState;
}

type SetupsPanelProps = ComponentProps<typeof SetupsPanel>;

function props(
  favoriteState: FavoriteState,
  overrides: Partial<SetupsPanelProps> = {}
): SetupsPanelProps {
  return {
    favoriteState,
    isSignedOut: false,
    isPreview: false,
    isAnonymous: false,
    onApply: vi.fn(),
    onRequestCommunityAccount: vi.fn(),
    onRequestSaveAccount: vi.fn(),
    onRequestSignIn: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("SetupsPanel", () => {
  it("keeps Save current setup available after setups exist", async () => {
    render(SetupsPanel, props(fakeState({ setups: [setup("1"), setup("2")] })));

    await expect
      .element(page.getByRole("button", { name: "Save current setup" }))
      .toBeEnabled();
  });

  it("tells the owner that saved setups are shared", async () => {
    render(SetupsPanel, props(fakeState()));

    await expect
      .element(page.getByText("Saved setups are shared with the community."))
      .toBeVisible();
  });

  it("sends a guest to the account prompt instead of saving", async () => {
    const state = fakeState();
    const onRequestSaveAccount = vi.fn();
    render(
      SetupsPanel,
      props(state, { isAnonymous: true, onRequestSaveAccount })
    );

    await page.getByRole("button", { name: "Save current setup" }).click();

    expect(onRequestSaveAccount).toHaveBeenCalledOnce();
    expect(state.saveCurrentSetup).not.toHaveBeenCalled();
  });

  it("labels setup length in steps", async () => {
    render(
      SetupsPanel,
      props(fakeState({ setups: [setup("long", "Long setup", 16)] }))
    );

    await expect.element(page.getByText("L2 · Box · 16 steps")).toBeVisible();
    await expect
      .element(page.getByText("L2 · Box · 16ct"))
      .not.toBeInTheDocument();
  });

  it("has no share control on a saved setup row", async () => {
    render(SetupsPanel, props(fakeState({ setups: [setup("1")] })));

    await page.getByRole("button", { name: "Actions for Setup 1" }).click();

    await expect
      .element(page.getByRole("menuitem", { name: "Rename" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("menuitem", { name: /share/i }))
      .not.toBeInTheDocument();
  });

  it("lists every community setup and applies by setup id", async () => {
    const onApply = vi.fn();
    render(
      SetupsPanel,
      props(
        fakeState({
          communitySetups: [
            communitySetup("austen", "a1", "Austen Cloud", "VTG 1:1"),
            communitySetup("austen", "a2", "Austen Cloud", "Diamond drills"),
          ],
        }),
        { onApply }
      )
    );

    await page.getByRole("tab", { name: "Community" }).click();
    await expect.element(page.getByText("VTG 1:1")).toBeVisible();
    await expect.element(page.getByText("Diamond drills")).toBeVisible();

    await page.getByRole("button", { name: /Diamond drills/ }).click();

    expect(onApply).toHaveBeenCalledWith({
      kind: "community",
      userId: "austen",
      setupId: "a2",
    });
  });

  it("asks guests to create an account before opening community setups", async () => {
    const onApply = vi.fn();
    const onRequestCommunityAccount = vi.fn();

    render(
      SetupsPanel,
      props(
        fakeState({
          communitySetups: [
            communitySetup("austen", "a1", "Austen Cloud", "VTG 1:1"),
          ],
        }),
        {
          isAnonymous: true,
          onApply,
          onRequestCommunityAccount,
        }
      )
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
    const screen = render(SetupsPanel, errorProps);

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

  it("keeps community load failure distinct from an empty list", async () => {
    const state = fakeState({
      communityLoadError: "Community setups could not load",
    });
    const screen = render(SetupsPanel, props(state));

    await page.getByRole("tab", { name: "Community" }).click();

    await expect
      .element(page.getByText("Community setups could not load"))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Try again" }))
      .toBeVisible();
    await expect
      .element(page.getByText("No setups shared yet"))
      .not.toBeInTheDocument();

    await page.getByRole("button", { name: "Try again" }).click();
    expect(state.loadCommunity).toHaveBeenCalledOnce();

    await screen.rerender(props(fakeState()));
    await page.getByRole("tab", { name: "Community" }).click();

    await expect.element(page.getByText("No setups shared yet")).toBeVisible();
    await expect
      .element(page.getByText("Setups people save appear here."))
      .toBeVisible();
    await expect
      .element(page.getByText("Community setups could not load"))
      .not.toBeInTheDocument();
  });

  it("disables Update on the active row and enables it elsewhere", async () => {
    const active = setup("1");
    const other = setup("2");
    render(
      SetupsPanel,
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

  it("explains that deleting removes the setup from the community", async () => {
    render(SetupsPanel, props(fakeState({ setups: [setup("1")] })));

    await page.getByRole("button", { name: "Actions for Setup 1" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();

    await expect
      .element(
        page.getByText(
          "This removes the saved setup from your list and the community. Your current generator settings will not change."
        )
      )
      .toBeVisible();
  });

  it("closes from the panel chrome", async () => {
    const onClose = vi.fn();
    render(SetupsPanel, props(fakeState(), { onClose }));

    await page.getByRole("button", { name: "Close generator setups" }).click();

    expect(onClose).toHaveBeenCalledOnce();
  });
});
