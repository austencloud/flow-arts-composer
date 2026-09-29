// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { registerCreateShortcuts } from "./register-create-shortcuts";
import { KeyboardShortcutManager } from "../services/keyboard-shortcut-manager";
import { ShortcutRegistry } from "../services/shortcut-registry";
import { setCreateModuleStateRef } from "$lib/shared/create/state/create-module-state-ref.svelte";
import type { ShortcutRegistrationOptions } from "../domain/types/keyboard-types";
import type { createKeyboardShortcutState } from "../state/keyboard-shortcut-state.svelte";

vi.mock("$lib/shared/keyboard/keyboard-shortcut-analytics", () => ({
  logKeyboardShortcutExecuted: vi.fn(),
  logKeyboardShortcutFailed: vi.fn(),
}));

/**
 * The manager dismisses the top drawer and cancels the browser default for
 * every single-key match before the action runs, and it only skips a match
 * whose `condition` says no. So the condition is the one place these
 * placeholder navigation shortcuts can yield the arrow keys to a focused
 * widget: with the Customize drawer open, ArrowDown on a Hand Relationship
 * radio used to close the whole drawer and drop focus on <body>.
 */
const ARROW_SHORTCUT_IDS = [
  "create.grid-nav-up",
  "create.grid-nav-down",
  "create.grid-nav-left",
  "create.grid-nav-right",
  "create.edit-nav-left",
  "create.edit-nav-right",
] as const;

function registerAll(enableSingleKeyShortcuts = true) {
  const registered = new Map<string, ShortcutRegistrationOptions>();
  const service = {
    register: (options: ShortcutRegistrationOptions) => {
      registered.set(options.id, options);
      return () => {};
    },
  } as unknown as KeyboardShortcutManager;
  const state = {
    settings: { enableSingleKeyShortcuts },
  } as unknown as ReturnType<typeof createKeyboardShortcutState>;

  registerCreateShortcuts(service, state);
  return registered;
}

function conditionOf(
  registered: Map<string, ShortcutRegistrationOptions>,
  id: string
): boolean {
  const shortcut = registered.get(id);
  if (!shortcut) throw new Error(`${id} was not registered`);
  return shortcut.condition?.() ?? true;
}

// The shared vitest setup stubs document.createElement, so fixtures go in
// through innerHTML and come back out as real jsdom nodes.
function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe("create arrow shortcuts yield to a focused widget", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("run from neutral focus", () => {
    const registered = registerAll();
    (document.activeElement as HTMLElement | null)?.blur();

    for (const id of ARROW_SHORTCUT_IDS) {
      expect(conditionOf(registered, id), id).toBe(true);
    }
  });

  it("stay disabled when single-key shortcuts are turned off", () => {
    const registered = registerAll(false);

    expect(conditionOf(registered, "create.grid-nav-down")).toBe(false);
  });

  it("skip while a roving-tabindex radio inside an open drawer has focus", () => {
    const registered = registerAll();
    const host = mount(`
      <dialog open aria-modal="true" tabindex="-1">
        <div role="radiogroup" aria-label="Hand relationship">
          <button type="button" role="radio" aria-checked="true" tabindex="0">Free</button>
          <button type="button" role="radio" aria-checked="false" tabindex="-1">Mirrored</button>
        </div>
      </dialog>
    `);
    host.querySelector<HTMLButtonElement>('[role="radio"]')!.focus();

    for (const id of ARROW_SHORTCUT_IDS) {
      expect(conditionOf(registered, id), id).toBe(false);
    }
  });

  it("skip while the drawer container itself holds focus", () => {
    const registered = registerAll();
    const host = mount(
      `<dialog open aria-modal="true" tabindex="-1"></dialog>`
    );
    host.querySelector<HTMLDialogElement>("dialog")!.focus();

    expect(conditionOf(registered, "create.grid-nav-down")).toBe(false);
  });

  it("skip while a toggle chip inside a role=dialog layer has focus", () => {
    const registered = registerAll();
    const host = mount(`
      <div role="dialog" aria-label="Customize">
        <button type="button" aria-pressed="false">Inverted</button>
      </div>
    `);
    host.querySelector("button")!.focus();

    expect(conditionOf(registered, "create.grid-nav-down")).toBe(false);
  });

  it("skip while a radiogroup outside any dialog has focus", () => {
    const registered = registerAll();
    const host = mount(`
      <div role="radiogroup" aria-label="Options">
        <button type="button" role="radio" aria-checked="true" tabindex="0">Staff</button>
      </div>
    `);
    host.querySelector("button")!.focus();

    expect(conditionOf(registered, "create.grid-nav-down")).toBe(false);
  });

  it("skip while any focusable control has focus", () => {
    const registered = registerAll();
    const host = mount(`<input type="range" min="0" max="10" />`);
    host.querySelector("input")!.focus();

    expect(conditionOf(registered, "create.grid-nav-down")).toBe(false);
  });

  it("run when focus sits on a non-interactive landmark", () => {
    const registered = registerAll();
    const host = mount(`<main id="main-content" tabindex="-1"></main>`);
    host.querySelector("main")!.focus();

    expect(conditionOf(registered, "create.grid-nav-down")).toBe(true);
  });
});

/**
 * Backspace and Delete really delete the selected step, so they cannot use the
 * arrow boundary above: a step cell is a focusable control, and "focus a cell,
 * press Backspace" is the feature. They yield only when focus sits inside an
 * open dialog or drawer layer that has nothing to do with the sequence, such as
 * the Customize drawer on /create/generate. The step editor is a drawer on
 * every viewport, so it opts back in with `data-keyboard-shortcuts-passthrough`
 * on the drawer itself: deleting the selected step is exactly what Backspace
 * means there.
 */
const DELETE_SHORTCUT_IDS = [
  "create.delete-beat",
  "create.delete-beat-delete-key",
] as const;

describe("create delete shortcuts yield to a foreign open layer", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("run from neutral focus", () => {
    const registered = registerAll();
    (document.activeElement as HTMLElement | null)?.blur();

    for (const id of DELETE_SHORTCUT_IDS) {
      expect(conditionOf(registered, id), id).toBe(true);
    }
  });

  it("run while a step cell outside any layer has focus", () => {
    const registered = registerAll();
    const host = mount(
      `<div role="button" tabindex="0" aria-label="Step 3">step</div>`
    );
    host.querySelector<HTMLElement>('[role="button"]')!.focus();

    for (const id of DELETE_SHORTCUT_IDS) {
      expect(conditionOf(registered, id), id).toBe(true);
    }
  });

  it("skip while a toggle chip inside an open drawer has focus", () => {
    const registered = registerAll();
    const host = mount(`
      <dialog open aria-modal="true" tabindex="-1" aria-label="Customize">
        <button type="button" aria-pressed="false">Inverted</button>
      </dialog>
    `);
    host.querySelector("button")!.focus();

    for (const id of DELETE_SHORTCUT_IDS) {
      expect(conditionOf(registered, id), id).toBe(false);
    }
  });

  it("skip while the drawer container itself holds focus", () => {
    const registered = registerAll();
    const host = mount(
      `<dialog open aria-modal="true" tabindex="-1"></dialog>`
    );
    host.querySelector<HTMLDialogElement>("dialog")!.focus();

    for (const id of DELETE_SHORTCUT_IDS) {
      expect(conditionOf(registered, id), id).toBe(false);
    }
  });

  it("skip while a control inside a role=dialog layer has focus", () => {
    const registered = registerAll();
    const host = mount(`
      <div role="dialog" aria-label="Settings">
        <button type="button">Save</button>
      </div>
    `);
    host.querySelector("button")!.focus();

    for (const id of DELETE_SHORTCUT_IDS) {
      expect(conditionOf(registered, id), id).toBe(false);
    }
  });

  it("run while a control inside the step editor drawer has focus", () => {
    const registered = registerAll();
    const host = mount(`
      <dialog open aria-modal="true" tabindex="-1" aria-label="Step editor panel"
        data-keyboard-shortcuts-passthrough>
        <div class="editor-body">
          <button type="button" aria-label="Add blue turn">+</button>
        </div>
      </dialog>
    `);
    host.querySelector("button")!.focus();

    for (const id of DELETE_SHORTCUT_IDS) {
      expect(conditionOf(registered, id), id).toBe(true);
    }
  });

  it("skip while a layer nested inside the step editor has focus", () => {
    const registered = registerAll();
    const host = mount(`
      <dialog open aria-modal="true" tabindex="-1" aria-label="Step editor panel"
        data-keyboard-shortcuts-passthrough>
        <div class="editor-body">
          <div role="dialog" aria-label="Choose a prop">
            <button type="button">Staff</button>
          </div>
        </div>
      </dialog>
    `);
    host.querySelector("button")!.focus();

    for (const id of DELETE_SHORTCUT_IDS) {
      expect(conditionOf(registered, id), id).toBe(false);
    }
  });
});

/**
 * The condition is one of two gates. KeyboardShortcutManager also asks
 * NormalizedKeyboardEvent.shouldIgnore, which drops bare keys pressed inside a
 * Drawer's `data-drawer-id` dialog, and the step editor is a Drawer. These
 * cases press the key through the real manager so both gates have to agree.
 */
describe("create delete shortcuts through the shortcut manager", () => {
  const removeStep = vi.fn();
  let manager: KeyboardShortcutManager | null = null;

  function startCreateShortcuts() {
    manager = new KeyboardShortcutManager(new ShortcutRegistry());
    registerCreateShortcuts(manager, {
      settings: { enableSingleKeyShortcuts: true },
    } as unknown as ReturnType<typeof createKeyboardShortcutState>);
    manager.setContext("create");
    manager.initialize();
    // Step 3 is selected; the module's removal takes its array index. The
    // registry evaluates every create condition on each key, so the transform
    // shortcuts' sequence check needs an answer too.
    const sequenceState = {
      selectedStepData: { stepNumber: 3 },
      getSelectedStepIndex: () => 2,
      hasSequence: () => true,
    };
    setCreateModuleStateRef({
      CreateModuleState: {
        sequenceState,
        getActiveTabSequenceState: () => sequenceState,
      },
      constructTabState: {},
      panelState: {},
      removeStep,
    } as unknown as Parameters<typeof setCreateModuleStateRef>[0]);
  }

  function press(target: HTMLElement, key: "Delete" | "Backspace") {
    target.focus();
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
  }

  // Drawer.svelte stamps these attributes on its open <dialog>.
  function drawer(
    id: string,
    label: string,
    body: string,
    attributes = ""
  ): string {
    return `
      <dialog class="drawer-content" data-drawer-id="${id}" data-state="open"
        open tabindex="-1" aria-modal="true" aria-label="${label}" ${attributes}>
        ${body}
      </dialog>
    `;
  }

  function mountDrawer(label: string, body: string): HTMLElement {
    return mount(drawer("drawer-test", label, body));
  }

  // The step editor drawer as StepEditorCoordinator renders it.
  function stepEditor(body: string): string {
    return drawer(
      "drawer-step-editor",
      "Step editor panel",
      `<div class="editor-body">${body}</div>`,
      "data-keyboard-shortcuts-passthrough"
    );
  }

  afterEach(() => {
    manager?.dispose();
    manager = null;
    setCreateModuleStateRef(null);
    removeStep.mockReset();
    document.body.innerHTML = "";
  });

  it("remove the selected step from a control inside the step editor drawer", () => {
    startCreateShortcuts();
    const host = mount(
      stepEditor(
        `<button type="button" aria-label="Increase turns: Left">+</button>`
      )
    );
    const control = host.querySelector("button")!;

    for (const key of ["Delete", "Backspace"] as const) {
      removeStep.mockReset();
      const event = press(control, key);
      expect(removeStep, key).toHaveBeenCalledExactlyOnceWith(2);
      expect(event.defaultPrevented, key).toBe(true);
    }
  });

  // Clicking empty space in the editor, such as the step's pictograph, gives
  // focus to the nearest focusable ancestor: the Drawer's own tabindex="-1"
  // <dialog>, not anything inside the editor body.
  it("remove the selected step when the step editor drawer itself holds focus", () => {
    startCreateShortcuts();
    const host = mount(stepEditor(`<div class="step-pictograph"></div>`));
    const dialog = host.querySelector("dialog")!;

    for (const key of ["Delete", "Backspace"] as const) {
      removeStep.mockReset();
      const event = press(dialog, key);
      expect(removeStep, key).toHaveBeenCalledExactlyOnceWith(2);
      expect(event.defaultPrevented, key).toBe(true);
    }
  });

  it("leave the prop picker opened from the step editor alone", () => {
    startCreateShortcuts();
    const host = mount(
      stepEditor(`<div class="step-pictograph"></div>`) +
        drawer(
          "drawer-prop-picker",
          "Select Left Prop",
          `<button type="button">Staff</button>`
        )
    );
    const picker = host.querySelector<HTMLElement>(
      '[aria-label="Select Left Prop"]'
    )!;
    const option = picker.querySelector("button")!;

    for (const target of [picker, option]) {
      for (const key of ["Delete", "Backspace"] as const) {
        const event = press(target, key);
        expect(removeStep, `${key} on ${target.tagName}`).not.toHaveBeenCalled();
        expect(event.defaultPrevented, `${key} on ${target.tagName}`).toBe(
          false
        );
      }
    }
  });

  it("leave a control inside another drawer alone", () => {
    startCreateShortcuts();
    const host = mountDrawer(
      "Customize",
      `<button type="button" aria-pressed="false">Inverted</button>`
    );
    const chip = host.querySelector("button")!;

    for (const key of ["Delete", "Backspace"] as const) {
      const event = press(chip, key);
      expect(removeStep, key).not.toHaveBeenCalled();
      expect(event.defaultPrevented, key).toBe(false);
    }
  });

  it("leave a layer nested inside the step editor alone", () => {
    startCreateShortcuts();
    const host = mount(
      stepEditor(
        `<div role="dialog" aria-label="Choose a prop">
          <button type="button">Staff</button>
        </div>`
      )
    );
    const option = host.querySelector("button")!;

    for (const key of ["Delete", "Backspace"] as const) {
      const event = press(option, key);
      expect(removeStep, key).not.toHaveBeenCalled();
      expect(event.defaultPrevented, key).toBe(false);
    }
  });

  it("leave Backspace to a text field inside the step editor", () => {
    startCreateShortcuts();
    const host = mount(
      stepEditor(`<input type="text" aria-label="Step note" value="left" />`)
    );
    const field = host.querySelector("input")!;

    const event = press(field, "Backspace");
    expect(removeStep).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
