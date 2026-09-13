/**
 * A bare key pressed inside an open drawer belongs to that drawer.
 *
 * `KeyboardShortcutManager.handleKeydown` calls `dismissTopDrawer()` before
 * running any matching single-key shortcut that has not opted out with
 * `preserveDrawers`. That is deliberate for a key pressed with a drawer open
 * but focus elsewhere. It was NOT deliberate for a key pressed inside the
 * drawer: on /create the bare Arrow keys are registered as single-key
 * shortcuts whose actions are still stubs, so pressing an arrow inside the
 * prop sheet did nothing except delete the sheet.
 *
 * `shouldIgnore()` is the gate — it runs before the dismiss step — so these
 * cases decide the whole behavior.
 */
import { describe, it, expect, afterEach } from "vitest";
import { NormalizedKeyboardEvent } from "../keyboard-event";

function keydownOn(target: Element, key: string, modifiers: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, ...modifiers });
  Object.defineProperty(event, "target", { value: target, configurable: true });
  return new NormalizedKeyboardEvent(event);
}

function mountDrawer(): HTMLButtonElement {
  document.body.innerHTML = `
    <button id="outside">Outside</button>
    <dialog data-drawer-id="drawer-test-1" open>
      <button id="inside">Inside</button>
    </dialog>
  `;
  return document.querySelector<HTMLButtonElement>("#inside")!;
}

describe("NormalizedKeyboardEvent.shouldIgnore inside an open drawer", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("ignores a single-key shortcut for a key pressed inside the drawer", () => {
    const inside = mountDrawer();
    expect(keydownOn(inside, "ArrowRight").shouldIgnore(true)).toBe(true);
  });

  it("still runs a single-key shortcut for a key pressed outside the drawer", () => {
    mountDrawer();
    const outside = document.querySelector<HTMLButtonElement>("#outside")!;
    // The existing dismiss-then-execute behavior for a key pressed with a
    // drawer open but focus elsewhere is deliberate and must survive.
    expect(keydownOn(outside, "ArrowRight").shouldIgnore(true)).toBe(false);
  });

  it("still runs modifier combos pressed inside the drawer", () => {
    const inside = mountDrawer();
    // Ctrl+S (save) and Ctrl+Z (undo) are not single-key shortcuts and must
    // keep working inside a sheet. This is why the drawer scope is narrower
    // than `data-keyboard-shortcuts-ignore`, which suppresses everything.
    expect(
      keydownOn(inside, "s", { ctrlKey: true }).shouldIgnore(false),
      "Ctrl+S inside a drawer"
    ).toBe(false);
    expect(
      keydownOn(inside, "z", { ctrlKey: true }).shouldIgnore(false),
      "Ctrl+Z inside a drawer"
    ).toBe(false);
  });

  it("is unaffected when no drawer is open", () => {
    document.body.innerHTML = `<button id="lone">Lone</button>`;
    const lone = document.querySelector<HTMLButtonElement>("#lone")!;
    expect(keydownOn(lone, "ArrowRight").shouldIgnore(true)).toBe(false);
  });
});
