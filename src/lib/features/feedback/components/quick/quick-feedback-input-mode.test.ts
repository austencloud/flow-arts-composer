import { describe, expect, it } from "vitest";
import {
  resolveFeedbackEnterKey,
  resolveFeedbackLineBreakInput,
} from "./quick-feedback-input-mode";

describe("resolveFeedbackEnterKey", () => {
  it("regression 90aeb63A: plain Enter (Gboard's action key) sends instead of adding a newline", () => {
    // The old rule only submitted on Shift+Enter, so the keyboard's action
    // key fell through to the textarea and inserted a line break.
    expect(
      resolveFeedbackEnterKey({ key: "Enter", shiftKey: false, keyCode: 13 })
    ).toBe("submit");
  });

  it("regression 90aeb63A: Shift+Enter is the newline, not the send", () => {
    expect(
      resolveFeedbackEnterKey({ key: "Enter", shiftKey: true, keyCode: 13 })
    ).toBe("newline");
  });

  it("leaves an IME's confirming Enter to the IME", () => {
    expect(
      resolveFeedbackEnterKey({ key: "Enter", shiftKey: false, keyCode: 229 })
    ).toBe("ignore");
  });

  it("ignores every other key", () => {
    expect(resolveFeedbackEnterKey({ key: "a", shiftKey: false })).toBeNull();
    expect(
      resolveFeedbackEnterKey({ key: "Unidentified", shiftKey: false, keyCode: 229 })
    ).toBeNull();
  });
});

describe("resolveFeedbackLineBreakInput", () => {
  it("sends a line break that arrived without a Shift+Enter keydown (Android action key)", () => {
    expect(
      resolveFeedbackLineBreakInput({
        inputType: "insertLineBreak",
        newlineRequested: false,
      })
    ).toBe("submit");
    expect(
      resolveFeedbackLineBreakInput({
        inputType: "insertParagraph",
        newlineRequested: false,
      })
    ).toBe("submit");
  });

  it("keeps the newline Shift+Enter asked for", () => {
    expect(
      resolveFeedbackLineBreakInput({
        inputType: "insertLineBreak",
        newlineRequested: true,
      })
    ).toBe("allow");
  });

  it("lets ordinary typing through", () => {
    expect(
      resolveFeedbackLineBreakInput({
        inputType: "insertText",
        newlineRequested: false,
      })
    ).toBe("allow");
  });
});
