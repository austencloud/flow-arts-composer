// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createSheetDismiss } from "../sheet-dismiss";

// The suite runs jsdom-global, but tests/setup/vitest-setup.ts stubs
// document.createElement (non-canvas tags) and document.body. createElementNS is
// NOT stubbed and yields real jsdom nodes; panel.contains() works on a detached
// tree, so this test never touches document.body and stays self-contained.
const XHTML = "http://www.w3.org/1999/xhtml";
const el = (tag: string) => document.createElementNS(XHTML, tag) as HTMLElement;

describe("createSheetDismiss", () => {
  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    const d = createSheetDismiss(onClose);
    d.onKeydown(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("ignores other keys", () => {
    const onClose = vi.fn();
    const d = createSheetDismiss(onClose);
    d.onKeydown(new KeyboardEvent("keydown", { key: "a" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("leaves an already-owned Escape press to the nested surface", () => {
    const onClose = vi.fn();
    const d = createSheetDismiss(onClose);
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    event.preventDefault();

    d.onKeydown(event);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when a pointerdown lands outside the panel", () => {
    const onClose = vi.fn();
    const panel = el("div");
    const outside = el("div");
    const d = createSheetDismiss(onClose, () => panel);
    d.onBackdropPointerDown({ target: outside } as unknown as PointerEvent);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does NOT close when pointerdown is inside the panel", () => {
    const onClose = vi.fn();
    const panel = el("div");
    const child = el("button");
    panel.append(child);
    const d = createSheetDismiss(onClose, () => panel);
    d.onBackdropPointerDown({ target: child } as unknown as PointerEvent);
    expect(onClose).not.toHaveBeenCalled();
  });

  describe("isExempt predicate", () => {
    it("does NOT close on outside pointerdown when the target is exempt", () => {
      const onClose = vi.fn();
      const panel = el("div");
      const modalTarget = el("div");
      const d = createSheetDismiss(onClose, () => panel, () => true);
      d.onBackdropPointerDown({ target: modalTarget } as unknown as PointerEvent);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("does NOT close on Escape when the target is exempt", () => {
      const onClose = vi.fn();
      const panel = el("div");
      const modalTarget = el("div");
      const d = createSheetDismiss(onClose, () => panel, () => true);
      d.onKeydown({
        key: "Escape",
        target: modalTarget,
      } as unknown as KeyboardEvent);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("still closes on outside pointerdown when the target is NOT exempt", () => {
      const onClose = vi.fn();
      const panel = el("div");
      const outside = el("div");
      const d = createSheetDismiss(onClose, () => panel, () => false);
      d.onBackdropPointerDown({ target: outside } as unknown as PointerEvent);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("still closes on Escape when the target is NOT exempt", () => {
      const onClose = vi.fn();
      const panel = el("div");
      const outside = el("div");
      const d = createSheetDismiss(onClose, () => panel, () => false);
      d.onKeydown({ key: "Escape", target: outside } as unknown as KeyboardEvent);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("defaults to non-exempt when no predicate is passed (BottomSheet's own usage is unchanged)", () => {
      const onClose = vi.fn();
      const panel = el("div");
      const outside = el("div");
      const d = createSheetDismiss(onClose, () => panel);
      d.onBackdropPointerDown({ target: outside } as unknown as PointerEvent);
      d.onKeydown({
        key: "Escape",
        target: outside,
      } as unknown as KeyboardEvent);
      expect(onClose).toHaveBeenCalledTimes(2);
    });
  });
});
