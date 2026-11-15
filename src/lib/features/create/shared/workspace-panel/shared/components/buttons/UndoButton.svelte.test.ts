import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/application/get-haptic-feedback.js", () => ({
  getHapticFeedback: () => null,
}));

vi.mock("#lib/shared/navigation/state/navigation-state.svelte.js", () => ({
  navigationState: {
    activeTab: "construct",
  },
}));

import UndoButton from "./UndoButton.svelte";

const createModuleState = {
  canUndo: true,
  canRedo: false,
  assembleTabState: null,
  undoController: {
    nextUndoEntry: {
      metadata: { description: "Add step 1" },
    },
    nextRedoEntry: {
      metadata: { description: "Add step 1" },
    },
  },
  undo: vi.fn(() => true),
  redo: vi.fn(() => false),
};

async function waitForLayout(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

describe("UndoButton roomy workspace label", () => {
  it("adds a stable Undo label at 768 CSS pixels", async () => {
    const screen = render(UndoButton, {
      props: {
        CreateModuleState: createModuleState as never,
      },
    });
    screen.container.style.setProperty("--min-touch-target", "44px");
    screen.container.style.setProperty("container-type", "inline-size");
    screen.container.style.setProperty("container-name", "create-workspace");
    const label = screen.container.querySelector<HTMLElement>(
      ".workspace-action-label"
    );
    const button = page.getByRole("button", { name: "Undo Add step 1" });

    expect(label).not.toBeNull();
    expect(label?.textContent?.trim()).toBe("Undo");

    screen.container.style.width = "767px";
    await waitForLayout();

    expect(getComputedStyle(label!).display).toBe("none");
    expect(button.element().getBoundingClientRect().width).toBe(44);

    screen.container.style.width = "768px";
    await waitForLayout();

    expect(getComputedStyle(label!).display).not.toBe("none");
    expect(button.element().getBoundingClientRect().width).toBeGreaterThan(44);
  });

  it("uses the redo action, shortcut target, and mirrored glyph", async () => {
    const redo = vi.fn(() => true);
    const screen = render(UndoButton, {
      props: {
        CreateModuleState: {
          ...createModuleState,
          canRedo: true,
          redo,
        } as never,
        direction: "redo",
      },
    });
    const button = page.getByRole("button", { name: "Redo Add step 1" });

    expect(button.element().hasAttribute("data-redo-shortcut")).toBe(true);
    expect(button.element().hasAttribute("data-undo-shortcut")).toBe(false);
    expect(
      screen.container.querySelector(".undo-glyph")?.classList.contains("redo")
    ).toBe(true);

    await button.click();

    expect(redo).toHaveBeenCalledOnce();
  });
});

// A visitor on a phone kept tapping Undo with nothing to undo: the off button
// was the same purple disc at 40% opacity, which reads as a softer live
// button, and taps went straight through it. Off must look flat and grey, and
// must still catch the tap.
describe("UndoButton with nothing to act on", () => {
  const DIM = "rgb(120, 121, 122)";
  const THEME: Record<string, string> = {
    "--min-touch-target": "44px",
    "--theme-accent-strong": "rgb(124, 58, 237)",
    "--theme-text": "rgb(255, 255, 255)",
    "--theme-text-dim": DIM,
    "--theme-stroke": "rgb(60, 61, 62)",
    "--theme-card-bg": "rgb(30, 31, 32)",
    "--theme-card-hover-bg": "rgb(40, 41, 42)",
  };

  // On the root before the first render, so every colour resolves at once.
  beforeAll(() => {
    for (const [name, value] of Object.entries(THEME)) {
      document.documentElement.style.setProperty(name, value);
    }
  });

  afterAll(() => {
    for (const name of Object.keys(THEME)) {
      document.documentElement.style.removeProperty(name);
    }
  });

  function renderWithTheme(props: Record<string, unknown>) {
    return render(UndoButton, { props: props as never });
  }

  function look(screen: ReturnType<typeof renderWithTheme>) {
    const button = screen.container.querySelector<HTMLButtonElement>(
      ".undo-button"
    )!;
    const glyph = screen.container.querySelector<SVGElement>(".undo-glyph")!;
    const buttonStyle = getComputedStyle(button);
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2
    );
    return {
      button,
      backgroundImage: buttonStyle.backgroundImage,
      backgroundColor: buttonStyle.backgroundColor,
      boxShadow: buttonStyle.boxShadow,
      opacity: buttonStyle.opacity,
      glyphColor: getComputedStyle(glyph).color,
      catchesTap: !!hit && button.contains(hit),
    };
  }

  it("sits flat and grey instead of a faded purple disc", async () => {
    const live = renderWithTheme({ CreateModuleState: createModuleState });
    await waitForLayout();
    const liveLook = look(live);
    expect(liveLook.backgroundImage).toContain("gradient");
    expect(liveLook.glyphColor).not.toBe(DIM);
    live.unmount();

    const off = renderWithTheme({
      CreateModuleState: { ...createModuleState, canUndo: false },
    });
    await waitForLayout();
    const offLook = look(off);

    expect(offLook.button.disabled).toBe(true);
    expect(offLook.button.getAttribute("aria-label")).toBe("Nothing to Undo");
    expect(offLook.backgroundImage).toBe("none");
    expect(offLook.boxShadow).toBe("none");
    expect(offLook.opacity).toBe("1");
    expect(offLook.glyphColor).toBe(DIM);
    expect(offLook.catchesTap).toBe(true);
  });

  it("drops the card surface and purple glyph on the quiet phone rail", async () => {
    const live = renderWithTheme({
      CreateModuleState: { ...createModuleState, canRedo: true },
      direction: "redo",
      quiet: true,
    });
    await waitForLayout();
    const liveLook = look(live);
    // Card or card-hover: an earlier click can leave the mouse resting here.
    expect(["rgb(30, 31, 32)", "rgb(40, 41, 42)"]).toContain(
      liveLook.backgroundColor
    );
    expect(liveLook.glyphColor).not.toBe(DIM);
    live.unmount();

    const off = renderWithTheme({
      CreateModuleState: createModuleState,
      direction: "redo",
      quiet: true,
    });
    await waitForLayout();
    const offLook = look(off);

    expect(offLook.button.disabled).toBe(true);
    expect(offLook.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(offLook.glyphColor).toBe(DIM);
    expect(offLook.catchesTap).toBe(true);
  });

  it("shows the same off look while its wrapper is inert", async () => {
    const screen = renderWithTheme({ CreateModuleState: createModuleState });
    screen.container.setAttribute("inert", "");
    await waitForLayout();
    const inertLook = look(screen);

    expect(inertLook.button.disabled).toBe(false);
    expect(inertLook.backgroundImage).toBe("none");
    expect(inertLook.glyphColor).toBe(DIM);
  });
});
