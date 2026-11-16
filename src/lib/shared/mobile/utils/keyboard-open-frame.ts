/**
 * Keyboard-open frame: when a surface should show only what typing needs.
 *
 * A surface with typing fields switches to its keyboard-open frame while a
 * field has focus (or the form is sending) and an on-screen keyboard is
 * present. The frame keeps a slim header, the field or fields, and the one
 * main action; everything else steps aside until the keyboard drops. This is
 * the rule only. `createKeyboardInset` (beside this file) stays the one source
 * of keyboard height; the rule never measures anything itself.
 *
 * Promoted from the feedback module, where it was first written for
 * QuickFeedbackPanel; sign-in is its second consumer.
 *
 * Feedback item AmvXbY8i: on a Galaxy Z Fold, dismissing the keyboard while
 * the textarea kept focus left the feedback panel stuck in full-screen input
 * mode, suppressing the submit button. The gate used device *capability*
 * (`isTouchDevice`), which stays true after the keyboard closes. It now
 * tracks whether a keyboard is actually on screen (`keyboardHeight > 0`), so
 * the frame drops the moment the keyboard is dismissed, regardless of focus.
 *
 * iOS is the one deliberate exception: keyboard height is not reported there
 * reliably, so iOS keeps the capability gate and the frame follows focus
 * alone. That path also preserves the feedback panel's Z-Fold landscape
 * side-drawer case: Android devices there still resolve through the
 * `keyboardHeight > 0` branch.
 */
export interface KeyboardOpenFrameParams {
  isInputFocused: boolean;
  isSubmitting: boolean;
  isIOSPlatform: boolean;
  isTouchDevice: boolean;
  keyboardHeight: number;
}

export function hasVirtualKeyboardPresence({
  isIOSPlatform,
  isTouchDevice,
  keyboardHeight,
}: Pick<
  KeyboardOpenFrameParams,
  "isIOSPlatform" | "isTouchDevice" | "keyboardHeight"
>): boolean {
  return isIOSPlatform ? isTouchDevice : keyboardHeight > 0;
}

export function computeKeyboardOpenFrame(
  params: KeyboardOpenFrameParams
): boolean {
  return (
    (params.isInputFocused || params.isSubmitting) &&
    hasVirtualKeyboardPresence(params)
  );
}

