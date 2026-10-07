/**
 * Resting a mouse or pen on a Create method card, or reaching it by
 * keyboard, asks the turn coordinator for that card's turn. Touch never
 * does: on a touch screen a tap opens the method. A click ends a pointer
 * hold, because a locked method's sign-up dialog opens over the card.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { methodPreviewHold } from "$lib/features/create/shared/components/method-previews/method-preview-hold";

// vitest-setup.ts stubs document.createElement; listeners need a real node.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

const pointer = (type: string, pointerType: string): Event =>
  Object.assign(new Event(type), { pointerType });

let node: HTMLButtonElement;
let turns: {
  hold: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
};
let keyboardFocus = false;

beforeEach(() => {
  node = realCreateElement.call(document, "button") as HTMLButtonElement;
  // jsdom cannot tell keyboard focus from pointer focus; the test decides.
  node.matches = (selector: string) =>
    selector === ":focus-visible" ? keyboardFocus : false;
  turns = { hold: vi.fn(), release: vi.fn() };
  keyboardFocus = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("methodPreviewHold", () => {
  it("holds a card while a mouse or pen rests on it", () => {
    methodPreviewHold(node, { turns, id: "generate" });
    node.dispatchEvent(pointer("pointerenter", "mouse"));
    expect(turns.hold).toHaveBeenCalledWith("generate");
    node.dispatchEvent(pointer("pointerleave", "mouse"));
    expect(turns.release).toHaveBeenCalledWith("generate");
    node.dispatchEvent(pointer("pointerenter", "pen"));
    expect(turns.hold).toHaveBeenCalledTimes(2);
  });

  it("ignores touch", () => {
    methodPreviewHold(node, { turns, id: "generate" });
    node.dispatchEvent(pointer("pointerenter", "touch"));
    node.dispatchEvent(pointer("pointerleave", "touch"));
    expect(turns.hold).not.toHaveBeenCalled();
    expect(turns.release).not.toHaveBeenCalled();
  });

  it("holds a card reached by keyboard, not one focused by a tap", () => {
    methodPreviewHold(node, { turns, id: "fuse" });
    node.dispatchEvent(new Event("focus"));
    expect(turns.hold).not.toHaveBeenCalled();
    node.dispatchEvent(new Event("blur"));
    keyboardFocus = true;
    node.dispatchEvent(new Event("focus"));
    expect(turns.hold).toHaveBeenCalledWith("fuse");
    node.dispatchEvent(new Event("blur"));
    expect(turns.release).toHaveBeenCalledWith("fuse");
  });

  it("lets go of a pointer hold when the card is clicked", () => {
    methodPreviewHold(node, { turns, id: "assemble" });
    node.dispatchEvent(pointer("pointerenter", "mouse"));
    node.dispatchEvent(new Event("click"));
    expect(turns.release).toHaveBeenCalledWith("assemble");
    node.dispatchEvent(pointer("pointerleave", "mouse"));
    expect(turns.release).toHaveBeenCalledTimes(1);
  });

  it("lets go when destroyed and stops listening", () => {
    const action = methodPreviewHold(node, { turns, id: "tunnel" });
    node.dispatchEvent(pointer("pointerenter", "mouse"));
    action.destroy();
    expect(turns.release).toHaveBeenCalledTimes(1);
    node.dispatchEvent(pointer("pointerenter", "mouse"));
    expect(turns.hold).toHaveBeenCalledTimes(1);
  });

  it("moves a held card's hold to its new id", () => {
    const action = methodPreviewHold(node, { turns, id: "construct" });
    node.dispatchEvent(pointer("pointerenter", "mouse"));
    action.update({ turns, id: "assemble" });
    expect(turns.release).toHaveBeenCalledWith("construct");
    node.dispatchEvent(pointer("pointerenter", "mouse"));
    expect(turns.hold).toHaveBeenLastCalledWith("assemble");
  });
});
