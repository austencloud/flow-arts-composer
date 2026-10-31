import { describe, expect, it } from "vitest";
import {
  computeQuickFeedbackInputMode,
  hasVirtualKeyboardPresence,
  resolveFeedbackEnterKey,
  resolveFeedbackLineBreakInput,
} from "./quick-feedback-input-mode";

describe("computeQuickFeedbackInputMode", () => {
  it("stays out of input mode when nothing is focused or submitting", () => {
    expect(
      computeQuickFeedbackInputMode({
        isInputFocused: false,
        isSubmitting: false,
        isIOSPlatform: false,
        isTouchDevice: true,
        keyboardHeight: 240,
      })
    ).toBe(false);
  });

  it("enters input mode on Android once the on-screen keyboard is up", () => {
    expect(
      computeQuickFeedbackInputMode({
        isInputFocused: true,
        isSubmitting: false,
        isIOSPlatform: false,
        isTouchDevice: true,
        keyboardHeight: 300,
      })
    ).toBe(true);
  });

  it("regression AmvXbY8i: drops out of input mode when the Android keyboard closes but focus is retained", () => {
    // Galaxy Z Fold repro: textarea keeps focus after the on-screen keyboard
    // is dismissed. The old capability-based gate (isTouchDevice) stayed
    // true here, stranding the panel in full-screen mode with the submit
    // button suppressed.
    expect(
      computeQuickFeedbackInputMode({
        isInputFocused: true,
        isSubmitting: false,
        isIOSPlatform: false,
        isTouchDevice: true,
        keyboardHeight: 0,
      })
    ).toBe(false);
  });

  it("never enters input mode on non-touch desktop, regardless of focus", () => {
    expect(
      computeQuickFeedbackInputMode({
        isInputFocused: true,
        isSubmitting: false,
        isIOSPlatform: false,
        isTouchDevice: false,
        keyboardHeight: 0,
      })
    ).toBe(false);
  });

  it("stays in input mode while submitting on Android as long as the keyboard is still up", () => {
    expect(
      computeQuickFeedbackInputMode({
        isInputFocused: false,
        isSubmitting: true,
        isIOSPlatform: false,
        isTouchDevice: true,
        keyboardHeight: 300,
      })
    ).toBe(true);
  });

  it("iOS keeps the capability gate: input mode follows focus even with keyboardHeight stuck at 0", () => {
    // MobileInputToolbar (the keyboardHeight source) never mounts on iOS,
    // so keyboardHeight is always 0 there. iOS must keep resolving input
    // mode from focus/touch capability alone.
    expect(
      computeQuickFeedbackInputMode({
        isInputFocused: true,
        isSubmitting: false,
        isIOSPlatform: true,
        isTouchDevice: true,
        keyboardHeight: 0,
      })
    ).toBe(true);
  });

  it("iOS never enters input mode when unfocused, even though the capability gate is touch-only", () => {
    expect(
      computeQuickFeedbackInputMode({
        isInputFocused: false,
        isSubmitting: false,
        isIOSPlatform: true,
        isTouchDevice: true,
        keyboardHeight: 0,
      })
    ).toBe(false);
  });
});

describe("hasVirtualKeyboardPresence", () => {
  it("uses touch capability on iOS", () => {
    expect(
      hasVirtualKeyboardPresence({
        isIOSPlatform: true,
        isTouchDevice: true,
        keyboardHeight: 0,
      })
    ).toBe(true);
    expect(
      hasVirtualKeyboardPresence({
        isIOSPlatform: true,
        isTouchDevice: false,
        keyboardHeight: 0,
      })
    ).toBe(false);
  });

  it("uses keyboardHeight on non-iOS touch devices, matching FeedbackSubmitTab's hasVirtualKeyboard gate", () => {
    expect(
      hasVirtualKeyboardPresence({
        isIOSPlatform: false,
        isTouchDevice: true,
        keyboardHeight: 0,
      })
    ).toBe(false);
    expect(
      hasVirtualKeyboardPresence({
        isIOSPlatform: false,
        isTouchDevice: true,
        keyboardHeight: 1,
      })
    ).toBe(true);
  });
});

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
