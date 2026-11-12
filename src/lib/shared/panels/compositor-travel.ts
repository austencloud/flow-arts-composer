/**
 * The travel behind PanelGroup's compositor edge.
 *
 * A change takes its end layout at once; each mover (the moving panel's
 * wrapper and every `[data-panel-flip]` rider inside the group) then travels
 * from where it stood to where it now is, by `transform` or `translate`
 * alone, so no frame of the motion lays the page out.
 *
 * An interrupting change never replaces a travel that is running. Each mover
 * is measured before the layout change and again after it, in the same task,
 * without cancelling or seeking anything in between. The document timeline
 * does not advance inside a task, so a running travel adds the same offset to
 * both readings and `before - after` is the pure layout shift, however stale
 * the main thread is. A new animation from that shift to zero then runs on the
 * mover's other channel, beside the old one. The layout change and the new
 * animation reach the screen in the same commit while the old travel plays
 * on, so the position on screen is continuous by construction, and so is the
 * velocity: a reversal curves instead of bouncing.
 *
 * Channels are the separate CSS `translate` property and `transform`.
 * `composite: "add"` on one property would do the same arithmetic, but Chrome
 * does not composite it, and a main-thread animation on a property pulls the
 * composited one on that property down with it. A third change while both
 * channels of a mover are busy measures from the present and replaces them.
 */
import { seekToPresent } from "#lib/shared/transitions/layout-flip.js";

type Channel = "transform" | "translate";

/** The moving panel's wrapper. A rider is keyed by its `data-panel-flip`. */
const PANEL = Symbol("panel");

export interface TravelMover {
  key: string | typeof PANEL;
  element: HTMLElement;
  before: DOMRect;
  /** Both channels were busy: the mover was brought to the present and is
   * measured and replaced instead of corrected. */
  replace: boolean;
}

export interface CompositorTravel {
  /** Measure every mover before the layout change. */
  capture(panel: HTMLElement): TravelMover[];
  /** After the layout change, in the same task: start each mover's correction.
   * Returns how many animations started. */
  play(movers: TravelMover[]): number;
  /** Cancel every channel of every mover. */
  cancel(): void;
  readonly running: boolean;
}

/** The order a mover tries its channels in. A rider rests on its own
 * `transform` (a zone centred with -50%), so `translate` is its first. */
const PANEL_CHANNELS: readonly Channel[] = ["transform", "translate"];
const RIDER_CHANNELS: readonly Channel[] = ["translate", "transform"];
const RIDER_SELECTOR = "[data-panel-flip]";
const MIN_SHIFT_PX = 0.5;
/** How far ahead a correction's start is parked while the frame that first
 * shows it is drawn. Longer than any frame; the start is pulled back to the
 * real clock on the frame after, so this is never waited out in practice. */
const CORRECTION_HOLD_MS = 2000;

export function createCompositorTravel(options: {
  getRoot: () => HTMLElement | null;
  getDuration: () => number;
  easing: string;
  /** Every channel has come to rest. */
  onIdle: () => void;
}): CompositorTravel {
  const channels = new Map<HTMLElement, Map<Channel, Animation>>();

  function busy(element: HTMLElement): Map<Channel, Animation> {
    let held = channels.get(element);
    if (!held) {
      held = new Map();
      channels.set(element, held);
    }
    return held;
  }

  function release(
    element: HTMLElement,
    channel: Channel,
    animation: Animation
  ) {
    const held = channels.get(element);
    if (held?.get(channel) !== animation) return;
    held.delete(channel);
    if (held.size === 0) channels.delete(element);
  }

  function cancelMover(element: HTMLElement): void {
    const held = channels.get(element);
    if (!held) return;
    channels.delete(element);
    for (const animation of held.values()) animation.cancel();
  }

  function moversIn(panel: HTMLElement): [TravelMover["key"], HTMLElement][] {
    const found: [TravelMover["key"], HTMLElement][] = [[PANEL, panel]];
    const root = options.getRoot();
    for (const rider of root?.querySelectorAll<HTMLElement>(RIDER_SELECTOR) ??
      []) {
      const key = rider.dataset.panelFlip;
      if (key) found.push([key, rider]);
    }
    return found;
  }

  function shiftOf(mover: TravelMover, after: DOMRect): [number, number] {
    // The wrapper changes size as its panel folds, and its content holds its
    // size, so it travels by its leading edge. A rider keeps its size and
    // travels by its centre.
    if (mover.key === PANEL)
      return [mover.before.left - after.left, mover.before.top - after.top];
    return [
      mover.before.left +
        mover.before.width / 2 -
        (after.left + after.width / 2),
      mover.before.top +
        mover.before.height / 2 -
        (after.top + after.height / 2),
    ];
  }

  function keyframes(
    element: HTMLElement,
    channel: Channel,
    dx: number,
    dy: number
  ): Keyframe[] {
    if (channel === "translate")
      return [{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }];
    // The resting transform stays in place behind the offset, and the offset
    // comes first so it is in screen space. Same function list at both ends,
    // so it interpolates function by function.
    const resting = getComputedStyle(element).transform;
    const rest = resting && resting !== "none" ? ` ${resting}` : "";
    return [
      { transform: `translate(${dx}px, ${dy}px)${rest}` },
      { transform: `translate(0px, 0px)${rest}` },
    ];
  }

  return {
    capture(panel) {
      return moversIn(panel).map(([key, element]) => {
        const order = key === PANEL ? PANEL_CHANNELS : RIDER_CHANNELS;
        const held = channels.get(element);
        const replace = order.every((channel) => held?.has(channel));
        if (replace && held) seekToPresent(held.values());
        return {
          key,
          element,
          before: element.getBoundingClientRect(),
          replace,
        };
      });
    },

    play(movers) {
      const duration = options.getDuration();
      const root = options.getRoot();
      // Every mover is read before any is animated: a new animation dirties
      // style, and reading the next mover after it forced another layout.
      const moves: {
        element: HTMLElement;
        channel: Channel;
        frames: Keyframe[];
      }[] = [];
      for (const mover of movers) {
        let element = mover.element;
        if (!element.isConnected && mover.key !== PANEL) {
          const found = root?.querySelector<HTMLElement>(
            `[data-panel-flip="${CSS.escape(mover.key as string)}"]`
          );
          // A rider that is new after the change has nothing to travel from.
          if (!found) continue;
          element = found;
        }
        if (!element.isConnected) continue;
        if (mover.replace) cancelMover(element);
        const [dx, dy] = shiftOf(mover, element.getBoundingClientRect());
        if (duration <= 0) continue;
        if (Math.abs(dx) <= MIN_SHIFT_PX && Math.abs(dy) <= MIN_SHIFT_PX)
          continue;
        const order = mover.key === PANEL ? PANEL_CHANNELS : RIDER_CHANNELS;
        const channel = order.find(
          (candidate) => !channels.get(element)?.has(candidate)
        );
        if (!channel) continue;
        moves.push({
          element,
          channel,
          frames: keyframes(element, channel, dx, dy),
        });
      }
      let started = 0;
      const joining: Animation[] = [];
      for (const { element, channel, frames } of moves) {
        const held = busy(element);
        const joins = held.size > 0;
        const animation = element.animate(frames, {
          duration,
          easing: options.easing,
          fill: "backwards",
        });
        held.set(channel, animation);
        started++;
        if (joins) joining.push(animation);
        animation.finished.then(
          () => {
            release(element, channel, animation);
            if (channels.size === 0) options.onIdle();
          },
          () => release(element, channel, animation)
        );
      }
      // The page's animation clock, and the time a frame reports, stand still
      // through a long task, and Chrome gives a correction that joins a
      // running travel the frame's reported time, not the time the
      // compositor first shows it. Stop tapped while Play's player mounts got
      // a start from before the mount and landed in one step. Starting it on
      // the next animation frame was still early: that frame can spend 150 ms
      // drawing the player's arrival or departure, and the correction then
      // appeared half done, a 213 px jump on a phone. So a correction holds
      // its first keyframe (its start is pushed out, and `fill: backwards`
      // shows the first keyframe until then) through the frame that first
      // shows it, and its clock starts on the frame after. The running travel
      // plays on meanwhile, so the screen stays continuous; the turn shows at
      // most one frame late. A first travel keeps the compositor's own start.
      if (joining.length > 0) {
        const holdUntil = performance.now() + CORRECTION_HOLD_MS;
        for (const animation of joining) animation.startTime = holdUntil;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const now = performance.now();
            for (const animation of joining)
              if (
                animation.playState !== "finished" &&
                animation.playState !== "idle" &&
                Number(animation.startTime) > now
              )
                animation.startTime = now;
          })
        );
      }
      return started;
    },

    cancel() {
      for (const element of Array.from(channels.keys())) cancelMover(element);
    },

    get running() {
      return channels.size > 0;
    },
  };
}
