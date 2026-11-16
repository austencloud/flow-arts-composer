import { describe, expect, it } from "vitest";
import {
  computeKeyboardOpenFrame,
  hasVirtualKeyboardPresence,
} from "./keyboard-open-frame";

describe("computeKeyboardOpenFrame", () => {
  it("stays out of input mode when nothing is focused or submitting", () => {
    expect(
      computeKeyboardOpenFrame({
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
      computeKeyboardOpenFrame({
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
      computeKeyboardOpenFrame({
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
      computeKeyboardOpenFrame({
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
      computeKeyboardOpenFrame({
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
      computeKeyboardOpenFrame({
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
      computeKeyboardOpenFrame({
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
