import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";

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
