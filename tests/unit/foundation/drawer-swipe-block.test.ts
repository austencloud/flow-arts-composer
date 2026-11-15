// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwipeToDismiss } from "@austencloud/drawer";

/**
 * Every app sheet runs the package's swipe handler. A visitor on a 387 px
 * phone closed the sequence viewer while scrolling the prop picker inside its
 * tray: the picker is marked `data-swipe-block`, but the package handler never
 * read the marker, so the drag fell through to the viewer sheet and dismissed
 * it. Nothing on screen shows which handler owns a drag, so these cases pin it.
 *
 * Elements come from innerHTML because the shared test setup stubs
 * document.createElement.
 */

type Kind = "mouse" | "touch";

function drag(kind: Kind, target: Element, fromY: number, toY: number) {
  const fire = (type: string, y: number) => {
    if (kind === "mouse") {
      target.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: y,
        })
      );
      return;
    }
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", {
      value: type === "touchend" ? [] : [{ clientX: 100, clientY: y }],
    });
    target.dispatchEvent(event);
  };
  const [start, move, end] =
    kind === "mouse"
      ? ["mousedown", "mousemove", "mouseup"]
      : ["touchstart", "touchmove", "touchend"];
  fire(start, fromY);
  // Two moves: a mouse drag only starts once it clears the movement threshold.
  fire(move, fromY + 20);
  fire(move, toY);
  fire(end, toY);
}

const handlers: SwipeToDismiss[] = [];

function sheetHandler(el: HTMLElement, options: Record<string, unknown> = {}) {
  const onDismiss = vi.fn();
  const onDragChange = vi.fn();
  const handler = new SwipeToDismiss({
    placement: "bottom",
    dismissible: true,
    onDismiss,
    onDragChange,
    ...options,
  });
  handler.attach(el);
  handlers.push(handler);
  const moved = () =>
    onDragChange.mock.calls.some(([offset, , dragging]) => dragging && offset > 0);
  return { onDismiss, moved };
}

afterEach(() => {
  for (const handler of handlers.splice(0)) handler.detach();
  document.body.innerHTML = "";
});

describe.each<Kind>(["mouse", "touch"])("package swipe-to-dismiss (%s)", (kind) => {
  it("leaves the sheet alone when the drag starts in a not-a-swipe region", () => {
    document.body.innerHTML = `
      <div id="sheet">
        <div data-swipe-block><div id="blocked">Picker</div></div>
        <div id="content">Content</div>
      </div>`;
    const sheet = sheetHandler(document.querySelector<HTMLElement>("#sheet")!);

    drag(kind, document.querySelector("#blocked")!, 100, 400);
    expect(sheet.moved()).toBe(false);
    expect(sheet.onDismiss).not.toHaveBeenCalled();

    drag(kind, document.querySelector("#content")!, 100, 400);
    expect(sheet.onDismiss).toHaveBeenCalledOnce();
  });

  it("leaves range inputs and sliders to scrub", () => {
    document.body.innerHTML = `
      <div id="sheet">
        <input id="range" type="range" />
        <div role="slider" aria-valuenow="0"><span id="thumb"></span></div>
      </div>`;
    const sheet = sheetHandler(document.querySelector<HTMLElement>("#sheet")!);

    drag(kind, document.querySelector("#range")!, 100, 400);
    drag(kind, document.querySelector("#thumb")!, 100, 400);
    expect(sheet.moved()).toBe(false);
    expect(sheet.onDismiss).not.toHaveBeenCalled();
  });

  it("Change Prop sheet: a drag on a prop tile leaves the sheet still, its header still dismisses", () => {
    // The prop grid carries data-swipe-block in every layout; the sheet keeps
    // its handle and header for closing.
    document.body.innerHTML = `
      <div id="sheet">
        <header id="sheet-header">Change Prop</header>
        <div class="prop-grid-root" data-swipe-block>
          <button id="tile">Staff</button>
        </div>
      </div>`;
    const sheet = sheetHandler(document.querySelector<HTMLElement>("#sheet")!);

    drag(kind, document.querySelector("#tile")!, 100, 400);
    expect(sheet.moved()).toBe(false);
    expect(sheet.onDismiss).not.toHaveBeenCalled();

    drag(kind, document.querySelector("#sheet-header")!, 100, 400);
    expect(sheet.onDismiss).toHaveBeenCalledOnce();
  });

  describe("tray inside the viewer sheet", () => {
    function mount() {
      // Mirrors the viewer: the dock root is blocked against the sheet, the
      // tray handler lives inside it, and the prop picker is blocked again.
      document.body.innerHTML = `
        <div id="sheet">
          <div id="sheet-content">Sequence</div>
          <div class="dock" data-swipe-block>
            <div id="tray">
              <div data-swipe-block><button id="prop">Prop</button></div>
              <div id="tray-handle">Handle</div>
            </div>
          </div>
        </div>`;
      const sheet = sheetHandler(document.querySelector<HTMLElement>("#sheet")!);
      const tray = sheetHandler(document.querySelector<HTMLElement>("#tray")!, {
        ignoreSwipeBlock: true,
      });
      return { sheet, tray };
    }

    it("a drag in the blocked picker moves neither", () => {
      const { sheet, tray } = mount();
      drag(kind, document.querySelector("#prop")!, 100, 400);
      expect(sheet.moved()).toBe(false);
      expect(tray.moved()).toBe(false);
      expect(sheet.onDismiss).not.toHaveBeenCalled();
      expect(tray.onDismiss).not.toHaveBeenCalled();
    });

    it("a drag on the tray's own handle moves only the tray", () => {
      const { sheet, tray } = mount();
      drag(kind, document.querySelector("#tray-handle")!, 100, 400);
      expect(tray.onDismiss).toHaveBeenCalledOnce();
      expect(sheet.moved()).toBe(false);
      expect(sheet.onDismiss).not.toHaveBeenCalled();
    });

    it("a drag on ordinary sheet content still dismisses the sheet", () => {
      const { sheet, tray } = mount();
      drag(kind, document.querySelector("#sheet-content")!, 100, 400);
      expect(sheet.onDismiss).toHaveBeenCalledOnce();
      expect(tray.onDismiss).not.toHaveBeenCalled();
    });
  });
});
