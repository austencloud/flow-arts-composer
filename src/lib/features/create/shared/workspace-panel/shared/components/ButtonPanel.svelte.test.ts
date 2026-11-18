import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { CreateModuleContext } from "#lib/features/create/shared/context/create-module-context.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { createStartPlacementData } from "#lib/shared/foundation/domain/factories/create-start-placement-data.js";
import { locales, setLocale } from "#lib/shared/i18n/i18n.svelte.js";
import ButtonPanel from "./ButtonPanel.svelte";
import appCss from "../../../../../../../app.css?inline";

vi.mock("#lib/shared/mobile/share-action.svelte.js", () => ({
  shareTarget: {
    get isMobile() {
      return true;
    },
  },
}));

vi.mock("#lib/shared/navigation/state/navigation-state.svelte.js", () => ({
  navigationState: {
    activeTab: "construct",
  },
}));

vi.mock("#lib/shared/application/get-haptic-feedback.js", () => ({
  getHapticFeedback: () => null,
}));

vi.mock("#lib/shared/share/get-sharer.js", () => ({
  getSharer: () => ({
    getCardImageBlob: vi.fn().mockResolvedValue(
      new Blob(["card"], {
        type: "image/png",
      })
    ),
    generateFilename: vi.fn(() => "sequence.png"),
  }),
}));

vi.mock("#lib/shared/share/state/image-composition-state.svelte.js", () => ({
  getImageCompositionManager: () => ({
    darkMode: true,
    registerObserver: vi.fn(),
    unregisterObserver: vi.fn(),
  }),
}));

vi.mock(
  "#lib/shared/pictograph/shared/state/visibility-state.svelte.js",
  () => ({
    getVisibilityStateManager: () => ({
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
    }),
  })
);

vi.mock("#lib/shared/qr/get-short-code-manager.js", () => ({
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
    | "isExportPanelOpen"
    | "openSequenceActionsPanel"
    | "handoffWorkspacePlaybackToViewer"
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
      handoffWorkspacePlaybackToViewer: vi.fn(),
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
    const actions = rect("Sequence Actions");
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

  it("keeps five controls in one centered row at 320 CSS pixels", async () => {
    const screen = render(ButtonPanel, {
      props: {
        onClearSequence: vi.fn(),
        onViewSequence: vi.fn(),
        // Measured at rest: an arriving control is still scaled down.
        animateControls: () => false,
      },
      context: new Map([["createModule", createContext()]]),
    });
    screen.container.style.width = "320px";

    await waitForLayout();

    const containerBounds = screen.container.getBoundingClientRect();
    const play = rect("Play sequence");
    const buttons = [
      rect("Clear sequence"),
      rect("Open sequence viewer"),
      play,
      rect("Sequence Actions"),
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

  it("steps Clear aside while a step is selected, keeping Play in place", async () => {
    const screen = render(ButtonPanel, {
      props: {
        onClearSequence: vi.fn(),
        onViewSequence: vi.fn(),
        stepSelected: true,
      },
      context: new Map([["createModule", createContext()]]),
    });
    screen.container.style.width = "392px";
    await waitForLayout();

    // A tap meant for one step must never land on the whole-sequence eraser.
    await expect
      .element(page.getByRole("button", { name: "Clear sequence" }))
      .not.toBeInTheDocument();
    const containerBounds = screen.container.getBoundingClientRect();
    const play = rect("Play sequence");
    expect(play.left + play.width / 2).toBeCloseTo(
      containerBounds.left + containerBounds.width / 2,
      0
    );
  });

  it("puts Viewer beside Construct's in-place Play and opens the full viewer", async () => {
    const context = createContext();
    render(ButtonPanel, {
      props: {
        onClearSequence: vi.fn(),
        onViewSequence: vi.fn(),
      },
      context: new Map([["createModule", context]]),
    });

    const viewer = page.getByRole("button", {
      name: "Open sequence viewer",
      exact: true,
    });
    await expect.element(viewer).toBeInTheDocument();
    await waitForLayout();
    // Directly left of Play, so the viewer (and its 3D view) is one tap away.
    expect(rect("Open sequence viewer").right).toBeLessThanOrEqual(
      rect("Play sequence").left
    );

    await viewer.click();
    expect(
      context.panelState.handoffWorkspacePlaybackToViewer
    ).toHaveBeenCalledTimes(1);
  });
});

// Every width the guard lays the row out at, either side of the 480px grid
// tier and across phone, tablet and desktop rails.
const GUARD_WIDTHS = [
  320, 360, 392, 480, 481, 520, 560, 600, 640, 686, 720, 760, 800, 860, 927,
  1100, 1280,
];
const GRID_TIER_MAX = 480;
const MIN_WORDED_GAP = 10;

function renderRow(props: { stepSelected?: boolean } = {}) {
  return render(ButtonPanel, {
    props: {
      onClearSequence: vi.fn(),
      onViewSequence: vi.fn(),
      animateControls: () => false,
      ...props,
    },
    context: new Map([["createModule", createContext()]]),
  });
}

/** The real row, never the hidden worded copy beside it. */
function realRow(container: HTMLElement): HTMLElement {
  const row = container.querySelector<HTMLElement>(
    ".button-panel-container > .button-panel"
  );
  if (!row) throw new Error("no button row");
  return row;
}

function rowLabels(row: HTMLElement): HTMLElement[] {
  return [
    ...row.querySelectorAll<HTMLElement>(
      ".workspace-action-label, .share-action-trigger-label"
    ),
  ];
}

function labelShown(label: HTMLElement): boolean {
  return getComputedStyle(label).display !== "none";
}

function wordsShown(row: HTMLElement): boolean {
  const labels = rowLabels(row);
  return labels.length > 0 && labels.every(labelShown);
}

function wordsHidden(row: HTMLElement): boolean {
  const labels = rowLabels(row);
  return labels.length > 0 && !labels.some(labelShown);
}

async function layOut(container: HTMLElement, width: number): Promise<void> {
  container.style.width = `${width}px`;
  await document.fonts.ready;
  await waitForLayout();
}

/** Everything wrong with the real row as laid out now; empty when sound. */
function rowProblems(container: HTMLElement, width: number): string[] {
  const problems: string[] = [];
  const row = realRow(container);
  const bounds = container.getBoundingClientRect();
  const minGap = width <= GRID_TIER_MAX ? 0 : MIN_WORDED_GAP;
  const buttons = [...row.querySelectorAll<HTMLButtonElement>("button")]
    .map((button) => ({
      name: button.getAttribute("aria-label") ?? button.className,
      box: button.getBoundingClientRect(),
    }))
    .filter(({ box }) => box.width > 0)
    .sort((a, b) => a.box.left - b.box.left);

  if (buttons.length !== 5) problems.push(`${buttons.length} buttons, not 5`);
  for (let index = 1; index < buttons.length; index++) {
    const previous = buttons[index - 1]!;
    const current = buttons[index]!;
    const gap = current.box.left - previous.box.right;
    if (gap < minGap - 0.5) {
      problems.push(`${previous.name} / ${current.name} gap ${gap.toFixed(1)}`);
    }
  }
  for (const { name, box } of buttons) {
    if (box.left < bounds.left - 0.5 || box.right > bounds.right + 0.5) {
      problems.push(`${name} leaves the row`);
    }
  }

  const play = row.querySelector<HTMLElement>(
    ".play-controls > :not(.viewer-action) button"
  );
  if (!play) {
    problems.push("no Play");
  } else {
    const playBox = play.getBoundingClientRect();
    const offset =
      playBox.left + playBox.width / 2 - (bounds.left + bounds.width / 2);
    if (Math.abs(offset) > 1) {
      problems.push(`Play off centre by ${offset.toFixed(1)}`);
    }
  }

  const labels = rowLabels(row);
  const shown = labels.filter(labelShown);
  if (labels.length !== 5) problems.push(`${labels.length} labels, not 5`);
  if (shown.length !== 0 && shown.length !== labels.length) {
    problems.push(`${shown.length} of ${labels.length} labels shown`);
  }
  for (const label of shown) {
    const button = label.closest("button");
    if (!button) continue;
    const text = label.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    if (
      text.width === 0 ||
      text.left < box.left - 0.5 ||
      text.right > box.right + 0.5
    ) {
      problems.push(`"${label.textContent?.trim()}" cut by its button`);
    }
  }
  return problems.map((problem) => `${width}px: ${problem}`);
}

describe("ButtonPanel words fit in every language", () => {
  const added: HTMLElement[] = [];

  // The row is measured as the app draws it: the app's tokens and icon font
  // (which this harness does not load otherwise) and the system fonts each
  // script really uses. Transitions are off so every reading is at rest, and
  // a control under the test pointer does not grow by its hover scale.
  beforeAll(async () => {
    const tokens = document.createElement("style");
    tokens.textContent = appCss;
    const still = document.createElement("style");
    still.textContent = `*, *::before, *::after { transition: none !important; animation: none !important; }
      button { transform: none !important; }`;
    added.push(tokens, still);
    const sheets = [
      "/fonts/css/fontawesome.min.css",
      "/fonts/css/solid.min.css",
    ].map((href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      added.push(link);
      return new Promise<void>((resolve, reject) => {
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`${href} did not load`));
      });
    });
    document.head.append(...added);
    await Promise.all(sheets);
    await document.fonts.load('900 16px "Font Awesome 7 Free"');
  });

  afterAll(() => {
    for (const element of added) element.remove();
  });

  afterEach(async () => {
    await setLocale("en");
    document.cookie = "PARAGLIDE_LOCALE=; max-age=0; path=/";
  });

  for (const locale of locales) {
    it(`never overlaps in ${locale} at any width`, async () => {
      await setLocale(locale);
      const screen = renderRow();
      const problems: string[] = [];
      for (const width of GUARD_WIDTHS) {
        await layOut(screen.container, width);
        problems.push(...rowProblems(screen.container, width));
      }
      expect(problems).toEqual([]);

      // Every catalog's words fit a desktop rail.
      await layOut(screen.container, 1280);
      expect(wordsShown(realRow(screen.container))).toBe(true);
    });
  }

  it("shows English words at 720 and none at 500", async () => {
    const screen = renderRow();
    await layOut(screen.container, 720);
    expect(wordsShown(realRow(screen.container))).toBe(true);
    await layOut(screen.container, 500);
    expect(wordsHidden(realRow(screen.container))).toBe(true);
  });

  it("puts Viewer on Clear's side of Play right to left", async () => {
    await setLocale("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    const screen = renderRow();
    await layOut(screen.container, 1280);
    const row = realRow(screen.container);
    const centre = (element: Element | null) => {
      const box = element!.getBoundingClientRect();
      return box.left + box.width / 2;
    };
    const clear = centre(row.querySelector(".left-zone button"));
    const viewer = centre(row.querySelector(".viewer-action button"));
    const play = centre(
      row.querySelector(".play-controls > :not(.viewer-action) button")
    );
    expect(wordsShown(row)).toBe(true);
    expect(clear).toBeGreaterThan(play);
    expect(viewer).toBeGreaterThan(play);
    expect(viewer).toBeLessThan(clear);
    expect(rowProblems(screen.container, 1280)).toEqual([]);
  });

  it("keeps words off when Clear steps aside at a width only the shorter row fits", async () => {
    // Found from real layout, so it holds whatever fonts the test browser
    // has: a language and width where the row without Clear fits its words
    // but the full row does not.
    let found: { locale: (typeof locales)[number]; width: number } | null =
      null;
    for (const locale of ["it", "ru", "pt", "de", "es", "en"] as const) {
      await setLocale(locale);
      const full = renderRow();
      const short = renderRow({ stepSelected: true });
      for (let width = 1100; width > GRID_TIER_MAX; width -= 10) {
        full.container.style.width = `${width}px`;
        await layOut(short.container, width);
        if (
          wordsHidden(realRow(full.container)) &&
          wordsShown(realRow(short.container))
        ) {
          found = { locale, width };
          break;
        }
      }
      full.unmount();
      short.unmount();
      if (found) break;
    }
    expect(found).not.toBeNull();
    if (!found) return;

    await setLocale(found.locale);
    const screen = renderRow();
    await layOut(screen.container, found.width);
    expect(wordsHidden(realRow(screen.container))).toBe(true);

    await screen.rerender({ stepSelected: true });
    await waitForLayout();
    await waitForLayout();
    const row = realRow(screen.container);
    expect(row.querySelector(".left-zone button")).toBeNull();
    expect(wordsHidden(row)).toBe(true);
  });

  it("keeps the hidden worded copy out of reach", async () => {
    const screen = renderRow();
    await layOut(screen.container, 1280);
    const copy = screen.container.querySelector(".button-row-measure");
    expect(copy?.querySelector(".button-panel")).not.toBeNull();
    expect(copy?.querySelectorAll("[data-testid]")).toHaveLength(0);
    expect(copy?.querySelectorAll("[id]")).toHaveLength(0);
    expect(copy?.querySelectorAll("[data-panel-flip]")).toHaveLength(0);
    expect(
      page.getByRole("button", { name: "Clear sequence", exact: true }).all()
    ).toHaveLength(1);
  });
});
