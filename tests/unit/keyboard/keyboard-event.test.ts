import { describe, expect, it } from "vitest";

import { NormalizedKeyboardEvent } from "#lib/shared/keyboard/domain/models/keyboard-event.js";

describe("NormalizedKeyboardEvent", () => {
  it("leaves application shortcuts alone when a local widget owns the key", () => {
    const testDocument = document.implementation.createHTMLDocument();
    const handle = testDocument.createElement("div");
    handle.setAttribute("data-keyboard-shortcuts-ignore", "");
    const grip = testDocument.createElement("span");
    handle.appendChild(grip);
    testDocument.body.appendChild(handle);

    let shouldIgnore = false;
    grip.addEventListener("keydown", (event) => {
      shouldIgnore = new NormalizedKeyboardEvent(event).shouldIgnore(true);
    });

    grip.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    );

    expect(shouldIgnore).toBe(true);
    handle.remove();
  });
});
