/**
 * The option a pick came from, handed to the arrival stage.
 *
 * Tapping an option commits its step, and the arrival stage then plays that
 * step at a readable size before it lands in its cell. Without an origin the
 * stage fades up in the middle of the screen while the tapped card stays put,
 * so the eye has to find the step again. With one, the stage card starts as
 * the tapped card and grows into place: the finished pose the user tapped
 * fades into the start pose on the way, so it arrives ready to play.
 *
 * The card notes itself on tap; the stage takes the note when it enters. The
 * option sheet refreshes as soon as the step commits, so the note keeps the
 * card's box and a copy of its picture rather than the card itself. A note
 * older than the stage could plausibly take to prepare is stale (a pick made
 * some other way, after a tap that never committed) and is dropped.
 */
import {
  hasUsableArrivalRect,
  type ArrivalRect,
} from "../domain/pictograph-arrival-geometry";

/** Longer than the stage's slowest observed prepare, short of its own cap. */
const ORIGIN_MAX_AGE_MS = 1500;

export interface ArrivalOrigin {
  rect: ArrivalRect;
  /** A detached copy of the tapped card's picture, finished pose and arrows. */
  picture: HTMLElement | null;
}

let noted: (ArrivalOrigin & { notedAt: number }) | null = null;

/** Record the tapped option. Call before the pick commits. */
export function noteArrivalOrigin(card: HTMLElement): void {
  const box = card.getBoundingClientRect();
  const rect = {
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
  };
  if (!hasUsableArrivalRect(rect)) {
    noted = null;
    return;
  }
  const content = card.firstElementChild;
  let picture: HTMLElement | null = null;
  if (content instanceof HTMLElement) {
    picture = content.cloneNode(true) as HTMLElement;
    // The card sets its letter colours as custom properties on itself; the
    // copy no longer sits inside it, so it carries them along.
    for (const name of Array.from(card.style)) {
      if (name.startsWith("--")) {
        picture.style.setProperty(name, card.style.getPropertyValue(name));
      }
    }
  }
  noted = { rect, picture, notedAt: performance.now() };
}

/** The tapped option, once, if it was tapped recently enough to be this pick. */
export function takeArrivalOrigin(): ArrivalOrigin | null {
  const origin = noted;
  noted = null;
  if (!origin || performance.now() - origin.notedAt > ORIGIN_MAX_AGE_MS) {
    return null;
  }
  return { rect: origin.rect, picture: origin.picture };
}
