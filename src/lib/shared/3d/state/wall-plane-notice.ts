/**
 * What the viewer says when a sequence can't be done in wall plane (see
 * wall-plane-arm-cross.ts). Two moments: a wall request shown as dual wheel
 * when the sequence loads, and a refused tap on a Wall chip.
 */
import { showToast, toastQueue } from "#lib/shared/toast/state/toast-state.svelte.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";

const REASON = "The arms would pass through each other.";
/** Long enough to read the reason before it goes. */
const NOTICE_TOAST_DURATION_MS = 5_000;

// The word as the rest of the app shows it: AAAA reads "A", as on its card.
function shown(word: string | undefined): string | undefined {
  const trimmed = word?.trim();
  return trimmed ? simplifyRepeatedWord(trimmed) : undefined;
}

function named(word: string | undefined): string {
  return shown(word) ?? "This sequence";
}

// Several performers can hit the same block in one go. One notice covers them.
function showOnce(message: string, detail: string): void {
  if (toastQueue.some((toast) => toast.message === message)) return;
  showToast({ message, detail, type: "info", duration: NOTICE_TOAST_DURATION_MS });
}

export function noticeShownInDualWheel(word: string | undefined): void {
  showOnce("Shown in dual wheel", `${named(word)} can't be done in wall plane. ${REASON}`);
}

export function noticeWallRefused(word: string | undefined): void {
  const subject = shown(word) ?? "this one";
  showOnce(`Can't do ${subject} in wall plane`, REASON);
}

/** The one-line reason the Planes panel shows while wall is ruled out. */
export function wallPlaneBlockedHint(word: string | undefined): string {
  return `${named(word)} can't use wall on both hands. ${REASON}`;
}
