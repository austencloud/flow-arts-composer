/**
 * The seam for "the chosen start placement becomes the workspace's start cell".
 *
 * Picking a start placement in Construct swaps the picker for the option picker
 * and slides the workspace open. Rather than letting the tapped card fade out
 * with the picker, the card itself travels into the start cell, shrinking on
 * the same clock as the workspace slide, so the start the user chose is the
 * start they see arrive.
 *
 * It is a same-document view transition through `startMorph`, like the
 * Generate card morph (canonical-capabilities.md: "Do not FLIP a card into a
 * panel by hand"). The name lives in two phases so it has exactly one owner at
 * each capture, even while re-picking the start of an existing sequence (when
 * the old start cell is already on screen):
 *
 * - FROM: before the old snapshot, the tapped card is the only named element.
 * - TO: inside the update callback, the card gives the name up (and hides, so
 *   its fading copy in the outgoing picker doesn't ghost at the origin) and the
 *   workspace start cell takes it.
 *
 * The root is left out of the capture, as in the Generate card morph, so the
 * workspace slide and the picker swap keep playing live underneath the flight.
 */
import { startMorph } from "#lib/shared/transitions/results-morph.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";

export const START_MORPH_SOURCE_ATTRIBUTE = "data-start-morph-source";
const ACTIVE_CLASS = "construct-start-morph-active";
const FROM_CLASS = "construct-start-morph-from";
const TO_CLASS = "construct-start-morph-to";
const TARGET_SELECTOR = ".workspace-container [data-history-start-placement]";

/**
 * How long the page may stay frozen on the old frame while the start cell
 * mounts and draws. The workspace area is lazily mounted and its pictograph
 * paints a frame or two later; past this the morph gives up on the landing
 * (the card then just fades) rather than holding the tap any longer.
 */
const TARGET_WAIT_CAP_MS = DURATION.normal;

let capturing = false;
/** A morph is between the tap and the swap; see the guard below. */
let pending = false;

/**
 * True while the morph's update callback runs, between the picker swap and the
 * browser capturing the new frame. Rendering is suppressed for that whole span,
 * so no ResizeObserver fires: a layout that sizes itself from one must measure
 * synchronously now, or the card lands where the settled layout no longer is.
 */
export function isStartPlacementMorphCapturing(): boolean {
  return capturing;
}

function findTarget(): HTMLElement | null {
  const targets = document.querySelectorAll<HTMLElement>(TARGET_SELECTOR);
  return targets.length === 1 ? (targets[0] ?? null) : null;
}

function isDrawn(target: HTMLElement): boolean {
  return (
    !target.classList.contains("awaiting-reveal") &&
    target.querySelector(".pictograph-container") !== null &&
    target.querySelector('.pictograph-container[aria-busy="true"]') === null
  );
}

/** Poll interval while waiting: about a frame. */
const TARGET_POLL_MS = 16;

/**
 * Resolves once the workspace start cell exists and has drawn, or at the cap.
 * It polls on a timer, not on frames: the browser runs no animation frames
 * while a view transition's update callback is pending, so a frame loop here
 * would never get a second look.
 */
function waitForTarget(): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    (function check() {
      const target = findTarget();
      if (target && isDrawn(target)) {
        resolve(target);
      } else if (performance.now() - startedAt >= TARGET_WAIT_CAP_MS) {
        resolve(null);
      } else {
        setTimeout(check, TARGET_POLL_MS);
      }
    })();
  });
}

const GROUP_PSEUDO = "::view-transition-group(construct-start-placement)";

/**
 * Re-key the flight as transform only, so the compositor runs it. The browser
 * animates the group's width and height on the main thread, and the option
 * picker mounts in a long task (~250ms) right after the flight starts: the
 * card would stall mid-air. Card and start cell are both square, so a scale
 * from the old size reads the same. The group rests at the new size and
 * position (the browser's own base style); view-transitions.css pins its
 * transform origin to the corner so the scale grows from where it sits.
 */
function flyOnCompositor(): void {
  const flight = document
    .getAnimations()
    .find(
      (animation) =>
        animation.effect instanceof KeyframeEffect &&
        animation.effect.pseudoElement === GROUP_PSEUDO
    );
  const effect = flight?.effect;
  if (!(effect instanceof KeyframeEffect)) return;
  const frames = effect.getKeyframes();
  const from = frames[0];
  const to = frames.at(-1);
  const scaleX =
    parseFloat(String(from?.width)) / parseFloat(String(to?.width));
  const scaleY =
    parseFloat(String(from?.height)) / parseFloat(String(to?.height));
  if (
    typeof from?.transform !== "string" ||
    typeof to?.transform !== "string" ||
    !Number.isFinite(scaleX) ||
    !Number.isFinite(scaleY)
  ) {
    return;
  }
  effect.setKeyframes([
    { transform: `${from.transform} scale(${scaleX}, ${scaleY})` },
    { transform: to.transform },
  ]);
}

/**
 * Apply a start placement, carrying `source` (the tapped card) into the
 * workspace start cell when a transition can run. `mutate` returns false when
 * the placement was refused (it doesn't connect to step 1): the picker stays,
 * so the card stays with it instead of flying off and snapping back. Resolves
 * after `mutate` has run, whichever way it ran.
 */
export async function morphStartPlacementIntoWorkspace(
  source: HTMLElement | null,
  mutate: () => boolean
): Promise<void> {
  if (!source) {
    mutate();
    return;
  }

  // The swap runs a frame after the tap, once the old frame is captured. A
  // second tap in that frame would apply its placement first and then be
  // overwritten by this one, so the card already in flight wins and the
  // later tap is dropped.
  if (pending) return;
  pending = true;

  const root = document.documentElement;
  source.setAttribute(START_MORPH_SOURCE_ATTRIBUTE, "");
  root.classList.add(ACTIVE_CLASS, FROM_CLASS);

  const release = () => {
    capturing = false;
    root.classList.remove(ACTIVE_CLASS, FROM_CLASS, TO_CLASS);
    source.removeAttribute(START_MORPH_SOURCE_ATTRIBUTE);
  };

  let landing = true;
  let transition: ViewTransition | null;
  try {
    transition = startMorph(
      () => {
        root.classList.replace(FROM_CLASS, TO_CLASS);
        // The workspace mounts in startMorph's flush after this returns and
        // in the microtasks that follow, so the flag holds until the wait ends.
        capturing = true;
        landing = mutate();
        if (!landing) {
          // Refused: the card keeps the name and morphs onto itself in place.
          capturing = false;
          root.classList.replace(TO_CLASS, FROM_CLASS);
        }
      },
      async () => {
        if (!landing) return;
        const target = await waitForTarget();
        capturing = false;
        // No single drawn start cell to land on: drop the name so the card
        // simply fades out instead of shrinking into an empty capture.
        if (!target) root.classList.remove(TO_CLASS);
      }
    );
  } catch (error) {
    pending = false;
    release();
    throw error;
  }

  if (!transition) {
    pending = false;
    release();
    return;
  }
  void transition.ready.then(flyOnCompositor, () => {});
  void transition.finished.then(release, release);
  await transition.updateCallbackDone.catch(() => {});
  pending = false;
}
