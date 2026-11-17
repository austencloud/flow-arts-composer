import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEscapeLayerManager } from "#lib/shared/keyboard/get-escape-layer-manager.js";
import SaveToLibraryView from "./SaveToLibraryView.svelte";

// The phone save screen arranges the save state; it never decides what is
// saved. So the state is a stand-in here, and these tests prove the screen
// sends Save, Cancel and the drill-downs to it and shows its notes.
const mocks = vi.hoisted(() => {
  const state = {
    isOpen: true,
    isSaving: false,
    saveStep: 0,
    saveSteps: [],
    headerTitle: "Save to Library",
    isExactDuplicate: false,
    hasDuplicate: false,
    duplicateCount: 0,
    isFlagged: false,
    moderationResult: null as null | {
      flaggedTerms: { category: string; matchedPattern: string }[];
    },
    isSolo: false,
    isMixed: false,
    requiresAccount: false,
    canSave: true,
    canPublishToCommunity: true,
    communityMinSteps: 4,
    publishToCommunity: false,
    currentUser: null as null | { uid: string },
    selectedCollectionIds: [] as string[],
    cardPresentation: { schemaVersion: 1, footer: { mode: "off" } },
    notes: "",
    showNotes: false,
    saveProps: { leftPropType: "staff", rightPropType: "staff" },
    sequence: null,
    tkaName: "",
    showAppealModal: false,
    showShameGate: false,
    isSubmittingToShame: false,
    shameSubmitError: null,
    panelWidth: 0,
    setPropsGetter: vi.fn(),
    handleSave: vi.fn(),
    handleClose: vi.fn(),
    handleOpenAppeal: vi.fn(),
    handleSubmitToShame: vi.fn(),
  };
  return { state, initial: { ...state }, stateArgs: [] as unknown[] };
});

vi.mock("../state/save-panel-state.svelte", () => ({
  createSavePanelState: (deps: unknown) => {
    mocks.stateArgs.push(deps);
    return mocks.state;
  },
}));

vi.mock("../context/create-module-context", () => ({
  getCreateModuleContext: () => ({
    panelState: {
      isWorkspacePreviewChosen: false,
      stopWorkspacePlayback: vi.fn(),
    },
  }),
}));

vi.mock("#lib/features/library/get-library-save-service.js", () => ({
  getLibrarySaveService: () => null,
}));
vi.mock("#lib/features/moderation/get-content-moderator.js", () => ({
  getContentModerator: () => null,
}));
vi.mock("#lib/features/hall-of-shame/get-hall-of-shame-submitter.js", () => ({
  getHallOfShameSubmitter: () => null,
}));
vi.mock("#lib/features/library/get-solo-prop-save-orchestrator.js", () => ({
  getSoloPropSaveOrchestrator: () => null,
}));
vi.mock("#lib/features/library/state/collections-state.svelte.js", () => ({
  collectionsState: {
    collections: [],
    loading: false,
    ensureStarted: vi.fn(),
    isIn: () => false,
  },
}));

function renderScreen(props: Record<string, unknown> = {}) {
  const result = render(SaveToLibraryView, { screen: true, ...props });
  // A phone-sized host: the screen fills its host the way the workspace
  // panel gives it the whole height.
  Object.assign(result.container.style, { height: "700px", width: "390px" });
  return result;
}

function resetState(): void {
  Object.assign(mocks.state, mocks.initial, {
    setPropsGetter: vi.fn(),
    handleSave: vi.fn(),
    handleClose: vi.fn(),
  });
}

describe("SaveToLibraryView phone screen", () => {
  beforeEach(() => {
    resetState();
    document.body.innerHTML = "";
  });

  it("puts the X in the header and sends Save and Cancel to the save state", async () => {
    renderScreen({ word: "AB" });

    const header = document.querySelector(".screen-header");
    expect(header?.querySelector('[aria-label="Close panel"]')).toBeTruthy();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    expect(mocks.state.handleSave).toHaveBeenCalledTimes(1);

    await page.getByRole("button", { name: "Cancel" }).click();
    expect(mocks.state.handleClose).toHaveBeenCalledTimes(1);
  });

  it("shows each row once with its value, and leaves out Collection for a guest", async () => {
    renderScreen();

    await expect
      .element(page.getByRole("switch", { name: /personal library/i }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Notes: Add" }))
      .toBeInTheDocument();
    // Saving asks about props, public and notes; the card footer is an
    // export choice and lives in the share sheet.
    expect(document.body.textContent).not.toMatch(/card footer/i);
    expect(document.querySelectorAll(".screen-row")).toHaveLength(3);
    expect(document.body.textContent).not.toContain("Collection");
  });

  it("still hands the save state the default card footer from the card settings", () => {
    renderScreen();

    const deps = mocks.stateArgs.at(-1) as {
      getDefaultCardPresentation: () => { schemaVersion: number };
    };
    expect(deps.getDefaultCardPresentation().schemaVersion).toBe(1);
  });

  it("opens a drill-down, and Escape leaves it before the save screen", async () => {
    renderScreen();

    await page.getByRole("button", { name: "Notes: Add" }).click();
    await expect
      .element(page.getByRole("textbox", { name: "Notes" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Done" }))
      .toBeInTheDocument();

    getEscapeLayerManager().dismissTopLayer();
    await expect
      .element(page.getByRole("button", { name: "Notes: Add" }))
      .toBeInTheDocument();
    expect(mocks.state.handleClose).not.toHaveBeenCalled();

    getEscapeLayerManager().dismissTopLayer();
    expect(mocks.state.handleClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the duplicate note and turns Save into Saved", async () => {
    Object.assign(mocks.state, { isExactDuplicate: true, canSave: false });
    renderScreen();

    await expect
      .element(page.getByText("Already saved"))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Saved" }))
      .toBeDisabled();
  });

  it("shows a flagged word above the rows and leaves out Public", async () => {
    Object.assign(mocks.state, {
      isFlagged: true,
      canSave: false,
      moderationResult: {
        flaggedTerms: [{ category: "profanity", matchedPattern: "xx" }],
      },
    });
    renderScreen();

    await expect
      .element(page.getByText('profanity: "xx"'))
      .toBeInTheDocument();
    expect(document.querySelector('[role="switch"]')).toBeNull();
    await expect
      .element(page.getByRole("button", { name: "Save", exact: true }))
      .toBeDisabled();
  });

  it("shows the sign-in ask on Save when a solo save needs an account", async () => {
    Object.assign(mocks.state, { isSolo: true, requiresAccount: true });
    renderScreen();

    const save = page.getByRole("button", { name: "Create account to save" });
    await save.click();
    expect(mocks.state.handleSave).toHaveBeenCalledTimes(1);
  });

  it("keeps Enter from saving while a drill-down is open", async () => {
    renderScreen();
    await page.getByRole("button", { name: "Notes: Add" }).click();
    await userEvent.keyboard("{Enter}");
    expect(mocks.state.handleSave).not.toHaveBeenCalled();
  });
});
