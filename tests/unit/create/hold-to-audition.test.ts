// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHoldToAuditionAttachment } from "#lib/features/create/construct/option-picker/services/hold-to-audition.js";

function pointer(
  type: string,
  {
    x = 20,
    y = 20,
    pointerType = "touch",
  }: { x?: number; y?: number; pointerType?: string } = {}
) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
    isPrimary: true,
    pointerId: 1,
    pointerType,
  });
}

describe("hold-to-audition attachment", () => {
  let button: HTMLButtonElement;
  let cleanup: (() => void) | undefined;
  let onStart: ReturnType<typeof vi.fn>;
  let onEnd: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.insertAdjacentHTML(
      "beforeend",
      '<button data-hold-test="true"></button>'
    );
    button = document.querySelector<HTMLButtonElement>(
      '[data-hold-test="true"]'
    )!;
    onStart = vi.fn(() => true);
    onEnd = vi.fn();
    cleanup =
      createHoldToAuditionAttachment({
        onStart,
        onEnd,
      })(button) ?? undefined;
  });

  afterEach(() => {
    cleanup?.();
    button.remove();
    vi.useRealTimers();
  });

  it("leaves a short press as an ordinary click", () => {
    const onClick = vi.fn();
    button.addEventListener("click", onClick);

    button.dispatchEvent(pointer("pointerdown"));
    vi.advanceTimersByTime(200);
    button.dispatchEvent(pointer("pointerup"));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("starts at the hold threshold and ends on release without clicking", () => {
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    button.focus();

    button.dispatchEvent(pointer("pointerdown"));
    vi.advanceTimersByTime(350);

    expect(onStart).toHaveBeenCalledOnce();
    expect(button.classList.contains("option-audition-active")).toBe(true);
    expect(document.activeElement).not.toBe(button);

    button.dispatchEvent(pointer("pointerup"));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onEnd).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
    expect(button.classList.contains("option-audition-active")).toBe(false);
  });

  it("cancels for carousel movement and suppresses the drag's click", () => {
    const onClick = vi.fn();
    button.addEventListener("click", onClick);

    button.dispatchEvent(pointer("pointerdown"));
    button.dispatchEvent(pointer("pointermove", { x: 40 }));
    vi.advanceTimersByTime(500);
    button.dispatchEvent(pointer("pointerup", { x: 40 }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("prevents the touch callout while preserving mouse context menus", () => {
    const onContextMenu = vi.fn();
    button.addEventListener("contextmenu", onContextMenu);

    button.dispatchEvent(pointer("pointerdown"));
    vi.advanceTimersByTime(350);
    const touchContextMenu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(touchContextMenu);

    expect(touchContextMenu.defaultPrevented).toBe(true);
    expect(onContextMenu).not.toHaveBeenCalled();

    button.dispatchEvent(pointer("pointerup"));
    vi.advanceTimersByTime(701);
    const mouseContextMenu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(mouseContextMenu);

    expect(mouseContextMenu.defaultPrevented).toBe(false);
    expect(onContextMenu).toHaveBeenCalledOnce();
  });

  it("supports Shift+Space as a hold-and-release keyboard equivalent", () => {
    button.focus();
    button.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: " ",
        shiftKey: true,
      })
    );

    expect(onStart).toHaveBeenCalledOnce();
    expect(button.classList.contains("option-audition-active")).toBe(true);
    expect(document.activeElement).toBe(button);

    button.dispatchEvent(
      new KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        key: " ",
      })
    );

    expect(onEnd).toHaveBeenCalledOnce();
    expect(button.classList.contains("option-audition-active")).toBe(false);
  });
});
