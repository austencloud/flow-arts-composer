import { afterEach, describe, expect, it } from "vitest";
import { createPostTimingSessionHarness } from "./post-timing-session-harness.svelte";

describe("Timing keys", () => {
  let dispose = () => {};
  afterEach(() => {
    dispose();
    document.body.innerHTML = "";
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
});
