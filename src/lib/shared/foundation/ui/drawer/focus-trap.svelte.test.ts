/**
 * FocusTrap's Tab cycle against real layout.
 *
 * The trap decides where Tab wraps from its own list of focusable elements.
 * When that list disagrees with the browser's real Tab order, the trap thinks
 * the reader is not on the last control and lets the key through, so focus
 * leaves the dialog. Two disagreements did that, and neither shows in a
 * screenshot:
 *
 * - a `position: fixed` control (a modal's corner Close button) has no
 *   `offsetParent`, so the rendered check dropped it from the list;
 * - a `tabindex="-1"` input (the hidden colour input behind a swatch button)
 *   matched the selector's tag clauses, though Tab never visits it.
 *
 * Named `.svelte.test.ts` to run in the browser project: jsdom has no layout,
 * so neither case can be reproduced there.
 */
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { FocusTrap } from "./focus-trap";

let host: HTMLElement | null = null;
let trap: FocusTrap | null = null;

function open(html: string): HTMLElement {
  host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  const dialog = host.firstElementChild as HTMLElement;
  trap = new FocusTrap({ returnFocusOnDeactivate: false });
  trap.activate(dialog);
  return dialog;
}

function control(dialog: HTMLElement, id: string): HTMLElement {
  return dialog.querySelector<HTMLElement>(`#${id}`)!;
}

afterEach(() => {
  trap?.deactivate();
  trap = null;
  host?.remove();
  host = null;
});

describe("FocusTrap Tab cycle", () => {
  it("keeps a position: fixed control in the cycle", async () => {
    const dialog = open(`
      <div role="dialog" aria-modal="true">
        <button id="first">First</button>
        <button id="second">Second</button>
        <button id="close" style="position: fixed; top: 8px; right: 8px">
          Close
        </button>
      </div>
    `);

    control(dialog, "close").focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(control(dialog, "first"));

    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(control(dialog, "close"));
  });

  it("wraps from the last control Tab can reach, past a tabindex=-1 input", async () => {
    const dialog = open(`
      <div role="dialog" aria-modal="true">
        <button id="first">First</button>
        <button id="swatch">Swatch</button>
        <input id="hidden-colour" type="color" tabindex="-1" />
      </div>
    `);

    control(dialog, "swatch").focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(control(dialog, "first"));

    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(control(dialog, "swatch"));
  });

  it("still leaves out controls inside a display: none subtree", async () => {
    const dialog = open(`
      <div role="dialog" aria-modal="true">
        <button id="first">First</button>
        <button id="second">Second</button>
        <div style="display: none"><button id="hidden">Hidden</button></div>
      </div>
    `);

    control(dialog, "second").focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(control(dialog, "first"));
  });
});
