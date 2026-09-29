import { afterEach, describe, expect, it } from "vitest";
import { createPostTimingSessionHarness } from "./post-timing-session-harness.svelte";

describe("Timing keys", () => {
  let dispose = () => {};
  afterEach(() => {
    dispose();
    document.body.innerHTML = "";
  });

  it("history cancels an unfinished adjustment before changing completed edits", () => {
    const harness = createPostTimingSessionHarness();
    dispose = harness.dispose;
    let cancellations = 0;
    const cancel = () => {
      cancellations += 1;
      harness.session.setAdjustmentCancel(null);
    };
    harness.session.setAdjustmentCancel(cancel);
    expect(harness.session.canUndo).toBe(true);
    expect(harness.session.canRedo).toBe(true);
    harness.session.undo();
    expect(cancellations).toBe(1);
    expect(harness.historyCalls()).toEqual({ undo: 0, redo: 0 });
    harness.session.setAdjustmentCancel(cancel);
    harness.session.redo();
    expect(cancellations).toBe(2);
    expect(harness.historyCalls()).toEqual({ undo: 0, redo: 0 });
    harness.session.undo();
    harness.session.redo();
    expect(harness.historyCalls()).toEqual({ undo: 1, redo: 1 });
  });

  function press(
    target: Element,
    key: string,
    handle: (event: KeyboardEvent) => void
  ): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    target.addEventListener("keydown", handle as EventListener, { once: true });
    target.dispatchEvent(event);
    return event;
  }

  it("taps on T with a checkbox focused and leaves it Space", () => {
    const harness = createPostTimingSessionHarness();
    dispose = harness.dispose;
    // The test setup stubs document.createElement; parsed markup is real.
    document.body.innerHTML = `<input type="checkbox" /><input type="text" />`;
    const [box, field] = document.body.querySelectorAll("input");

    // Austen clicked the checkbox, so it kept focus.
    const tap = press(box!, "t", harness.session.handleKey);
    expect(tap.defaultPrevented).toBe(true);
    expect(harness.tapCount()).toBe(1);
    // Space still toggles it from the keyboard.
    const space = press(box!, " ", harness.session.handleKey);
    expect(space.defaultPrevented).toBe(false);

    // A text field keeps its keys.
    const typed = press(field!, "t", harness.session.handleKey);
    expect(typed.defaultPrevented).toBe(false);
    expect(harness.tapCount()).toBe(1);
  });

  it("leaves Space to a focused disclosure so it opens", () => {
    const harness = createPostTimingSessionHarness();
    dispose = harness.dispose;
    document.body.innerHTML = `<details><summary>Keys</summary><p>T taps</p></details>`;
    const summary = document.body.querySelector("summary")!;

    const space = press(summary, " ", harness.session.handleKey);
    expect(space.defaultPrevented).toBe(false);
    // T still taps from there.
    const tap = press(summary, "t", harness.session.handleKey);
    expect(tap.defaultPrevented).toBe(true);
    expect(harness.tapCount()).toBe(1);
  });

  it("Escape leaves landing adjustment and Home restarts unless typing", () => {
    const harness = createPostTimingSessionHarness();
    dispose = harness.dispose;
    document.body.innerHTML = `<button type="button">Timeline</button><input type="text" />`;
    const button = document.body.querySelector("button")!;
    const field = document.body.querySelector("input")!;

    harness.session.adjustLandings = true;
    harness.session.selected = { sectionId: "part-1", position: 1 };
    harness.session.seek(12);
    expect(
      press(field, "Escape", harness.session.handleKey).defaultPrevented
    ).toBe(false);
    expect(harness.session.adjustLandings).toBe(true);
    expect(
      press(button, "Escape", harness.session.handleKey).defaultPrevented
    ).toBe(true);
    expect(harness.session.adjustLandings).toBe(false);
    expect(harness.session.selected).toBeNull();

    expect(
      press(field, "Home", harness.session.handleKey).defaultPrevented
    ).toBe(false);
    expect(harness.session.mediaSeconds).toBe(12);
    expect(
      press(button, "Home", harness.session.handleKey).defaultPrevented
    ).toBe(true);
    expect(harness.session.mediaSeconds).toBe(0);
  });

  it("clearing taps resets playback position and selection", () => {
    const harness = createPostTimingSessionHarness();
    dispose = harness.dispose;
    harness.session.seek(4);
    harness.session.tap();
    harness.session.adjustLandings = true;
    harness.session.selected = { sectionId: "part-1", position: 1 };
    harness.session.clearTaps();

    expect(harness.tapCount()).toBe(0);
    expect(harness.session.mediaSeconds).toBe(0);
    expect(harness.session.selected).toBeNull();
    expect(harness.session.adjustLandings).toBe(false);
  });
});
