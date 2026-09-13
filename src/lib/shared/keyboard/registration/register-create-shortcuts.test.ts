// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { registerCreateShortcuts } from "./register-create-shortcuts";
import type { KeyboardShortcutManager } from "../services/keyboard-shortcut-manager";
import type { ShortcutRegistrationOptions } from "../domain/types/keyboard-types";
import type { createKeyboardShortcutState } from "../state/keyboard-shortcut-state.svelte";

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
 * on its body: deleting the selected step is exactly what Backspace means there.
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
      <dialog open aria-modal="true" tabindex="-1" aria-label="Step editor panel">
        <div class="editor-body" data-keyboard-shortcuts-passthrough>
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
      <dialog open aria-modal="true" tabindex="-1" aria-label="Step editor panel">
        <div class="editor-body" data-keyboard-shortcuts-passthrough>
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
