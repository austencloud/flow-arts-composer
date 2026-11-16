/**
 * Feedback Enter-key rules. The keyboard-open (input-mode) rule that lived
 * here moved to the shared owner `#lib/shared/mobile/utils/keyboard-open-frame.ts`.
 */

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
