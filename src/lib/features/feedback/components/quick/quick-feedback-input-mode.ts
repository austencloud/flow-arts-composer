/**
 * QuickFeedbackPanel input-mode gate.
 *
 * Extracted so the rule is unit-testable without a real touch device or
 * on-screen keyboard.
 *
 * Feedback item AmvXbY8i: on a Galaxy Z Fold, dismissing the keyboard while
 * the textarea kept focus left the panel stuck in full-screen input mode,
 * suppressing the submit button. The old gate used device *capability*
 * (`isTouchDevice`), which stays true after the keyboard closes. It now
 * mirrors `FeedbackSubmitTab`'s `hasVirtualKeyboard` gate, which tracks
 * whether a keyboard is actually on screen (`keyboardHeight > 0`) so input
 * mode drops the moment the keyboard is dismissed, regardless of focus.
 *
 * iOS is the one deliberate exception. `MobileInputToolbar` (the source of
 * `keyboardHeight`) is never mounted on iOS — see FeedbackForm.svelte's
 * `deviceDetector.isTouchDevice() && !isIOSPlatform` guard — so
 * `keyboardHeight` never leaves 0 there. QuickFeedbackPanel instead syncs
 * iOS full-screen mode to the live visual viewport via its `ios-input-mode`
 * class, driven by focus alone, so iOS keeps using the capability gate here.
 * That path also preserves the panel's Z-Fold landscape side-drawer case
 * (touch device, non-bottom-sheet placement, on-screen keyboard) — Android
 * devices there still resolve through the `keyboardHeight > 0` branch,
 * since `MobileInputToolbar` mounts regardless of drawer placement.
 */
export interface QuickFeedbackInputModeParams {
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
  QuickFeedbackInputModeParams,
  "isIOSPlatform" | "isTouchDevice" | "keyboardHeight"
>): boolean {
  return isIOSPlatform ? isTouchDevice : keyboardHeight > 0;
}

export function computeQuickFeedbackInputMode(
  params: QuickFeedbackInputModeParams
): boolean {
  return (
    (params.isInputFocused || params.isSubmitting) &&
    hasVirtualKeyboardPresence(params)
  );
}

/**
 * Enter-key rule for the feedback textarea.
 *
 * Feedback item 90aeb63A: on a Galaxy Z Fold, Gboard's action key (shown as a
 * check mark for `enterkeyhint="done"`) only inserted a newline. Austen
 * expected it to send. The textarea now advertises `enterkeyhint="send"`, plain
 * Enter submits, and Shift+Enter inserts a newline. A physical keyboard
 * follows the same rule.
 *
 * Returns null for any key other than Enter so the caller leaves it alone.
 * keyCode 229 is the IME "still composing" signal (a desktop IME confirming a
 * candidate with Enter); that Enter belongs to the IME, not to the form.
 */
export type FeedbackEnterAction = "submit" | "newline" | "ignore";

export interface FeedbackEnterKeyEvent {
  key: string;
  shiftKey: boolean;
  keyCode?: number;
}

const IME_PROCESSING_KEY_CODE = 229;

export function resolveFeedbackEnterKey(
  event: FeedbackEnterKeyEvent
): FeedbackEnterAction | null {
  if (event.key !== "Enter") return null;
  if (event.keyCode === IME_PROCESSING_KEY_CODE) return "ignore";
  return event.shiftKey ? "newline" : "submit";
}

/**
 * Some Android keyboards deliver the action key without a usable Enter
 * keydown (key "Unidentified", keyCode 229) and only announce it as a
 * `beforeinput` line break. Treat that line break as a send, unless the
 * keydown just before it was Shift+Enter, which asked for the newline.
 */
export function resolveFeedbackLineBreakInput({
  inputType,
  newlineRequested,
}: {
  inputType: string;
  newlineRequested: boolean;
}): "submit" | "allow" {
  const isLineBreak =
    inputType === "insertLineBreak" || inputType === "insertParagraph";
  if (!isLineBreak || newlineRequested) return "allow";
  return "submit";
}
