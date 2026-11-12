/**
 * The seam for "a generate bento card grows into its workspace".
 *
 * Customize, LOOP and Setups open through here. The card wrapper in
 * CardBasedSettingsContainer claims `generate-card-<id>` while the panel is
 * closed and ExpandedCardStage claims it while open, so wrapping the state
 * change in a same-document view transition makes the browser carry the card
 * from its grid slot to the stage (or the viewport) and back. See
 * docs/superpowers/specs/2026-09-17-generate-card-morph-design.md.
 *
 * `startMorph` already answers "can a transition run": no View Transitions
 * support, reduced motion, or one already in flight all fall back to a plain
 * mutation. This module adds one more: no wrapper has claimed the name, which
 * is the public Composer demo (its own grid, no claims), where a transition
 * would snapshot the page for nothing.
 *
 * `lastRan` is set before `mutate()` runs, not after, so a panel that mounts
 * synchronously inside the mutation and reads `lastGenerateCardMorphRan` sees
 * this call's answer instead of the previous call's. On the transition path
 * that holds because `document.startViewTransition` runs its update callback
 * (where `mutate` lands) asynchronously, after `startMorph` has returned and
 * `lastRan` is assigned below.
 */
import { holdDeferredWorkForMotion } from "#lib/shared/foundation/utils/background-scheduling.js";
import { startMorph } from "#lib/shared/transitions/results-morph.js";
import { generateCardFlight } from "../state/generate-card-flight.svelte";
import { STAGGER } from "#lib/shared/transitions/transitions.js";
import { countViewTransitionNameClaims } from "#lib/shared/transitions/view-transition-name-registry.js";
import type { GenerateCardPanelId } from "#lib/shared/create/state/panel-coordination-state.svelte.js";

/** The cards that grow. Order is irrelevant; membership is the contract. */
export const GENERATE_CARD_MORPH_HOSTS = [
  "customize",
  "loop",
  "preset",
  "tnd",
] as const satisfies readonly GenerateCardPanelId[];
export type GenerateCardMorphHost = GenerateCardPanelId;

/**
 * The view-transition name a card id claims, or "" for cards that do not
 * grow. `claimedViewTransitionName` treats "" as "no claim", so callers can
 * pass this straight through for every card.
 */
export function generateCardMorphName(cardId: string): string {
  return (GENERATE_CARD_MORPH_HOSTS as readonly string[]).includes(cardId)
    ? `generate-card-${cardId}`
    : "";
}

let lastRan = false;

const ACTIVE_MORPH_CLASS = "generate-card-morph-active";

function claimMorphLayer(host: GenerateCardMorphHost): () => void {
  const hostClass = `generate-card-morph-${host}`;
  document.documentElement.classList.add(ACTIVE_MORPH_CLASS, hostClass);

  return () => {
    document.documentElement.classList.remove(ACTIVE_MORPH_CLASS, hostClass);
  };
}

interface GenerateCardMorphOptions {
  /**
   * Runs once the card is visually at its destination. Plain/reduced-motion
   * paths settle on one tight state-stabilization beat; a real View Transition
   * waits for `finished`. This is the seam for handing the shared workspace to
   * the next surface without letting two major entrances compete for it.
   */
  onSettled?: () => void;
}

function schedulePlainSettlement(onSettled: () => void): void {
  // Leave one tight choreography beat for selection-derived effects to settle.
  // This is not visible motion; it prevents the destination drawer from being
  // opened and then closed again inside the same reactive turn.
  setTimeout(onSettled, STAGGER.micro);
}

function runWhenSettled(
  transition: ViewTransition | null,
  onSettled: (() => void) | undefined
): void {
  if (!onSettled) return;
  if (!transition) {
    // Even an instant/reduced-motion handoff waits until the initiating click
    // has finished propagating. Opening the destination synchronously here
    // lets later selection effects from that same click close it again before
    // it ever paints.
    schedulePlainSettlement(onSettled);
    return;
  }

  // A skipped transition still completed the state mutation. Continue the
  // handoff on either outcome so the destination panel can never get stuck.
  void transition.finished.then(onSettled, onSettled);
}

const SHAPE = [
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
  "boxShadow",
] as const;
type Shape = Record<(typeof SHAPE)[number], string>;

function hasRoundCorner(style: CSSStyleDeclaration): boolean {
  return SHAPE.slice(0, 4).some((corner) => parseFloat(style[corner]) > 0);
}

/**
 * The corners and shadow of whatever the eye reads as the card or the panel.
 * The name sits on the card wrapper, the stage, a panel directly inside the
 * stage (LOOP, during its own morph) or the tapped tile. That element is often
 * a plain wrapper, so this steps down through first children, at most two
 * levels, to the first one that is drawn: rounded, or filled.
 */
function surfaceShape(name: string): Shape | null {
  const named = [
    ...document.querySelectorAll<HTMLElement>(
      "[data-card-id], [data-card-id] > *, .tnd-tile[data-morph-source]"
    ),
  ].find((element) => getComputedStyle(element).viewTransitionName === name);
  let element: Element | null | undefined = named;
  for (let depth = 0; element && depth < 3; depth += 1) {
    const style = getComputedStyle(element);
    const filled = style.backgroundColor !== "rgba(0, 0, 0, 0)";
    if (hasRoundCorner(style) || filled || depth === 2) {
      return Object.fromEntries(
        SHAPE.map((property) => [property, style[property]])
      ) as Shape;
    }
    element = element.firstElementChild;
  }
  return null;
}

/** Where the arriving surface's fade first reaches full strength, 0 to 1. */
function fullStrengthAt(fade: Animation): number {
  const keyframes = (fade.effect as KeyframeEffect).getKeyframes();
  const full = keyframes.find(
    (keyframe) => keyframe.opacity == null || Number(keyframe.opacity) >= 1
  );
  return full?.computedOffset ?? 1;
}

/**
 * The moving box is clipped (view-transitions.css), so it needs corners, and
 * the card and its panel do not share them: the card is rounded all round,
 * while a phone's bottom panel is square where it meets the screen edge. The
 * clip also cuts off the shadow drawn into the panel's picture, so the box
 * wears the shadow itself.
 *
 * The shape belongs to the surface the eye reads, so it changes on the
 * arriving surface's fade, not the box's flight: once LOOP's card has faded
 * fully in over the dark panel (a quarter of the way), the box has the card's
 * corners, and the panel still under it cannot show past them.
 */
function carryShape(
  transition: ViewTransition,
  name: string,
  from: Shape | null
): void {
  if (!from || !transition.ready) return;
  void transition.ready.then(
    () => {
      const to = surfaceShape(name);
      if (!to || SHAPE.every((property) => from[property] === to[property])) {
        return;
      }
      // The arriving surface also runs the browser's blend animation, which
      // has no opacity; the fade is the one that does.
      const surface = `::view-transition-new(${name})`;
      const fade = document.getAnimations().find((animation) => {
        const effect = animation.effect as KeyframeEffect | null;
        return (
          effect?.pseudoElement === surface &&
          effect.getKeyframes().some((keyframe) => keyframe.opacity != null)
        );
      });
      const timing = fade?.effect?.getTiming();
      if (!fade || !timing) return;
      // A CSS animation's curve lives on its keyframes, not its timing.
      const easing =
        (fade.effect as KeyframeEffect).getKeyframes()[0]?.easing ?? "linear";
      const shape = document.documentElement.animate(
        [
          { ...from, offset: 0 },
          { ...to, offset: Math.max(fullStrengthAt(fade), 0.01) },
          { ...to, offset: 1 },
        ],
        {
          pseudoElement: `::view-transition-group(${name})`,
          duration: timing.duration,
          delay: timing.delay,
          easing,
          fill: "both",
        }
      );
      // Ride the fade's clock. At ready the fade may not have started yet,
      // and copying its empty start time would freeze the shape in place.
      const sync = (): void => {
        if (fade.startTime !== null) shape.startTime = fade.startTime;
      };
      if (fade.startTime !== null) sync();
      else void fade.ready.then(sync, () => {});
      // It holds its last frame, and the next morph of this card makes a box
      // of the same name, so it must not outlive this one.
      const release = (): void => shape.cancel();
      void transition.finished.then(release, release);
    },
    () => {}
  );
}

/**
 * Open or close `host` by running `mutate` inside the card morph when one can
 * run. Returns true when a transition is carrying the change, false when the
 * mutation applied plainly. ExpandedCardStage reads the same answer through
 * `lastGenerateCardMorphRan` to pick its entrance.
 */
export function morphGenerateCard(
  host: GenerateCardMorphHost,
  mutate: () => void,
  options: GenerateCardMorphOptions = {}
): boolean {
  if (countViewTransitionNameClaims(generateCardMorphName(host)) === 0) {
    lastRan = false;
    mutate();
    if (options.onSettled) schedulePlainSettlement(options.onSettled);
    return false;
  }

  // All four expandable cards have named snapshots so any one of them can be
  // the next source. During a morph, the chosen card must paint above those
  // stationary siblings; otherwise a later card such as LOOP briefly crosses
  // in front of the workspace growing out of Timing and direction.
  const fromShape = surfaceShape(generateCardMorphName(host));
  const releaseMorphLayer = claimMorphLayer(host);
  // The page's start-up jobs wait for the card to land. This morph has no frame
  // time to spare, and a job landing inside it was the first-open stutter.
  const releaseDeferredWork = holdDeferredWorkForMotion();
  // An open stage for this card means the morph is closing it.
  const opening = !document.querySelector(
    `.expanded-card-stage[data-card-id="${host}"]`
  );
  let started = false;
  const land = (): void => {
    releaseMorphLayer();
    releaseDeferredWork();
    if (generateCardFlight.opening === host) generateCardFlight.opening = null;
  };
  lastRan = false;
  let transition: ViewTransition | null;
  try {
    transition = startMorph(() => {
      // startMorph runs the change at once when no transition can run, and
      // only later, inside the transition, when one can. Only a card that is
      // really flying shows its stand-in.
      if (started && opening) generateCardFlight.opening = host;
      mutate();
    });
    started = true;
  } catch (error) {
    land();
    throw error;
  }
  lastRan = transition !== null;
  if (transition) {
    carryShape(transition, generateCardMorphName(host), fromShape);
    void transition.finished.then(land, land);
  } else {
    land();
  }
  runWhenSettled(transition, options.onSettled);
  return lastRan;
}

/** Whether the most recent morphGenerateCard call ran as a transition. */
export function lastGenerateCardMorphRan(): boolean {
  return lastRan;
}
