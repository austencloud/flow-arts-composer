<!--
  The tapped method card as it hands over to its workspace, drawn over both
  crossfade sources so neither of their fades touches it.

  - The name: at the tap, a copy of the card's icon and name files into that
    method's own drawer, just behind the other cards, so the tap also shows
    where this method lives.
  - The plate: in the card's colors, it picks the card up from wherever its
    shrink has got to and condenses onto the miniature of the workspace's
    pieces, then lets go of it. The pieces are the real ones, moved by the
    choreography, on a tray in the card's colors that it puts under them.

  The plate is laid out at the miniature's box and scaled back to the card's,
  so its move is one compositor transform. Scaling distorts corners, so its
  corners run the other way to stay round (the one thing here that repaints).
  The name rides at a uniform scale, so the type never squashes.

  - The button (Generate): a copy of the card's preview button lifts off at
    the tap, drifts while the workspace mounts with its dice tumbling, and
    grows into the workspace's real button (`lift`, `morph`). Its box moves
    like the plate; its icon and word ride at one uniform scale.
-->
<script lang="ts">
  import type { EmanateRect } from "#lib/shared/transitions/emanate.js";
  import {
    SPLIT_CONDENSE_MS,
    SPLIT_REVEAL_AT_MS,
    SPLIT_REVEAL_MS,
  } from "../services/create-entry-choreography";
  import {
    EASE_STANDARD,
    EASE_STANDARD_OUT,
  } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  let root = $state<HTMLDivElement>();
  let plate = $state<HTMLDivElement>();
  let label = $state<HTMLDivElement>();
  let ride = $state<HTMLDivElement>();
  let rideBox = $state<HTMLDivElement>();
  let rideContent = $state<HTMLDivElement>();
  let filing: Animation[] = [];
  let condensing: Animation[] = [];
  /** The lifted button's drift and its dice's tumble. */
  let riding: Animation[] = [];
  /** The lifted button's move onto the real one, and the swap. */
  let landing: Animation[] = [];
  /** The preview button the copy stands in for, hidden while it rides. */
  let lifted: HTMLElement | null = null;

  export function clear(): void {
    for (const animation of [...filing, ...condensing, ...riding, ...landing])
      animation.cancel();
    filing = [];
    condensing = [];
    riding = [];
    landing = [];
    lifted = null;
    if (root) root.style.visibility = "hidden";
    label?.replaceChildren();
    // The plate keeps the box and colors `fly` gave it. The next tap's `file`
    // shows this layer again for the name, and that leftover plate sat on the
    // card as a square block of its color until the new plate took over.
    plate?.removeAttribute("style");
    // The same for the lifted button's copy.
    ride?.removeAttribute("style");
    rideBox?.removeAttribute("style");
    rideContent?.removeAttribute("style");
    rideContent?.replaceChildren();
  }

  /** Whether a lifted button is riding, waiting for its landing. */
  export function isRiding(): boolean {
    return riding.length > 0 && landing.length === 0;
  }

  export function dismiss(): void {
    const live = filing.length + condensing.length + riding.length;
    if (!root || live === 0) return;
    const leaving = root.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: DURATION.fast,
      easing: EASE_STANDARD_OUT,
    });
    condensing.push(leaving);
    leaving.onfinish = clear;
  }

  /**
   * The card's icon and name file into the method's drawer: they shrink to
   * the drawer's size on the way and fade as they go in, as the other cards do.
   */
  export function file({
    card,
    name,
    drawer,
    delay,
    duration,
    fadeFrom,
  }: {
    card: HTMLElement;
    name: HTMLElement;
    drawer: EmanateRect;
    delay: number;
    duration: number;
    /** How far through the trip it starts to fade. */
    fadeFrom: number;
  }): Animation[] {
    if (!root || !label) return [];
    for (const animation of filing) animation.cancel();

    const stage = root.getBoundingClientRect();
    const nameBox = name.getBoundingClientRect();

    // The name as it reads on the card. Its styles come from the card's
    // container tier, which does not reach up here, so they travel with it.
    const cardStyle = getComputedStyle(card);
    const nameStyle = getComputedStyle(name);
    const rider = name.cloneNode(true) as HTMLElement;
    rider.style.setProperty(
      "--method-color",
      cardStyle.getPropertyValue("--method-color")
    );
    rider.style.font = nameStyle.font;
    rider.style.color = nameStyle.color;
    rider.style.letterSpacing = nameStyle.letterSpacing;
    rider.style.display = nameStyle.display;
    rider.style.gap = nameStyle.gap;
    rider.style.alignItems = nameStyle.alignItems;
    rider.style.whiteSpace = "nowrap";
    rider.style.width = `${nameBox.width}px`;
    rider.style.height = `${nameBox.height}px`;
    label.replaceChildren(rider);
    label.style.left = `${nameBox.left - stage.left}px`;
    label.style.top = `${nameBox.top - stage.top}px`;

    const scale = Math.max(
      0.05,
      Math.min(1, drawer.width / nameBox.width, drawer.height / nameBox.height)
    );
    const toX =
      drawer.left +
      drawer.width / 2 -
      (nameBox.width * scale) / 2 -
      nameBox.left;
    const toY =
      drawer.top +
      drawer.height / 2 -
      (nameBox.height * scale) / 2 -
      nameBox.top;

    root.style.visibility = "visible";
    // The card's own name goes at once: the copy is the one that travels.
    const hidden = name.animate([{ opacity: 0 }, { opacity: 0 }], {
      duration: 0,
      fill: "forwards",
    });
    filing = [
      hidden,
      label.animate(
        [
          { opacity: 1, transform: "none", offset: 0 },
          { opacity: 1, offset: fadeFrom },
          {
            opacity: 0,
            transform: `translate(${toX}px, ${toY}px) scale(${scale})`,
            offset: 1,
          },
        ],
        { duration, delay, easing: EASE_STANDARD, fill: "both" }
      ),
    ];
    return [...filing];
  }

  /**
   * The plate picks the card up where it is on screen and condenses onto the
   * miniature's tray, which has its colors, then lets go of it to show the
   * small pieces waiting there.
   */
  export function fly({
    card,
    miniature,
  }: {
    card: HTMLElement;
    miniature: EmanateRect;
  }): Animation[] {
    if (!root || !plate) return [];
    for (const animation of condensing) animation.cancel();

    const stage = root.getBoundingClientRect();
    const from = card.getBoundingClientRect();
    const to = miniature;
    const scaleX = from.width / to.width;
    const scaleY = from.height / to.height;

    const cardStyle = getComputedStyle(card);
    const cardRadius = parseFloat(cardStyle.borderTopLeftRadius) || 0;
    // The card is part way through its shrink, and its corners with it.
    const shrunk = from.width / (card.offsetWidth || from.width);
    const fromRadius = cardRadius * shrunk;

    plate.style.left = `${to.left - stage.left}px`;
    plate.style.top = `${to.top - stage.top}px`;
    plate.style.width = `${to.width}px`;
    plate.style.height = `${to.height}px`;
    plate.style.background = cardStyle.background;

    root.style.visibility = "visible";
    const timing: KeyframeAnimationOptions = {
      duration: SPLIT_CONDENSE_MS,
      easing: EASE_STANDARD,
      fill: "both",
    };
    // Two animations, not one: corners cannot run on the compositor, and in
    // the same animation they held the plate's movement on the main thread,
    // where it stalled whenever the workspace was busy.
    condensing = [
      plate.animate(
        [
          {
            transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scaleX}, ${scaleY})`,
          },
          { transform: "none" },
        ],
        timing
      ),
      plate.animate(
        [
          {
            borderRadius: `${fromRadius / scaleX}px / ${fromRadius / scaleY}px`,
          },
          { borderRadius: `${cardRadius}px` },
        ],
        timing
      ),
      plate.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: SPLIT_REVEAL_MS,
        delay: SPLIT_REVEAL_AT_MS,
        easing: EASE_STANDARD_OUT,
        fill: "both",
      }),
    ];
    return [...condensing];
  }

  /**
   * Lifts a button off the tapped card: a copy of it, in its green and its
   * corners with its icon and word, takes its place in this layer and drifts
   * toward `toward`, slowing and never quite stopping, while its icon tumbles
   * in quarter turns. It waits there for `morph`.
   */
  export function lift({
    button,
    toward,
    holdMs,
  }: {
    button: HTMLElement;
    toward: { x: number; y: number };
    /** How long the drift takes to come (nearly) to rest. */
    holdMs: number;
  }): boolean {
    if (!root || !ride || !rideBox || !rideContent) return false;
    const box = button.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return false;
    for (const animation of [...riding, ...landing]) animation.cancel();
    landing = [];

    const stage = root.getBoundingClientRect();
    const style = getComputedStyle(button);
    const radius = Math.min(
      parseFloat(style.borderTopLeftRadius) || 0,
      box.height / 2
    );
    rideBox.style.left = `${box.left - stage.left}px`;
    rideBox.style.top = `${box.top - stage.top}px`;
    rideBox.style.width = `${box.width}px`;
    rideBox.style.height = `${box.height}px`;
    rideBox.style.background = style.background;
    rideBox.style.borderRadius = `${radius}px`;

    // The icon and word as they read on the card; the card's styles do not
    // reach up here, so they travel with them.
    const parts = [...button.children] as HTMLElement[];
    rideContent.replaceChildren(
      ...parts.map((part) => part.cloneNode(true) as HTMLElement)
    );
    rideContent.style.font = style.font;
    rideContent.style.color = style.color;
    rideContent.style.letterSpacing = style.letterSpacing;
    rideContent.style.gap = style.columnGap;
    const content = unionBox(parts) ?? box;
    rideContent.style.left = `${content.left - stage.left}px`;
    rideContent.style.top = `${content.top - stage.top}px`;
    rideContent.style.height = `${content.height}px`;

    root.style.visibility = "visible";
    lifted = button;
    const hidden = button.animate([{ opacity: 0 }, { opacity: 0 }], {
      duration: 0,
      fill: "forwards",
    });

    // Halfway to `toward`, on a curve that slows all the way.
    const dx = (toward.x - (box.left + box.width / 2)) / 2;
    const dy = (toward.y - (box.top + box.height / 2)) / 2;
    const steps = 8;
    const drift = ride.animate(
      Array.from({ length: steps + 1 }, (_, step) => {
        const eased = 1 - (1 - step / steps) ** 3;
        return {
          transform: `translate(${dx * eased}px, ${dy * eased}px)`,
          offset: step / steps,
        };
      }),
      { duration: holdMs, easing: "linear", fill: "forwards" }
    );

    riding = [hidden, drift];
    const icon = rideIcon();
    if (icon) riding.push(icon.animate(tumbleFrames(), tumbleTiming()));
    return true;
  }

  /**
   * The lifted button glides from wherever its drift has got to onto `to`,
   * the real button, and grows into it: its box changes size and corners, its
   * icon and word ride at one uniform scale onto the real ones. In the frame
   * it lands, the real button shows and the copy goes.
   */
  export function morph({
    to,
    duration,
  }: {
    to: HTMLElement;
    duration: number;
  }): Animation[] {
    if (!root || !ride || !rideBox || !rideContent || !isRiding()) return [];
    const target = to.getBoundingClientRect();
    if (target.width <= 0 || target.height <= 0) return [];

    // Where the copy is on screen now, drift and tumble included.
    const fromBox = rideBox.getBoundingClientRect();
    // The icon's middle on screen, which its tumble does not move, and its
    // laid-out height, which the tumble's turn would inflate.
    const fromIcon = rideIcon()?.getBoundingClientRect() ?? null;
    const fromIconHeight = rideIcon()?.offsetHeight ?? 0;
    const fromContent = rideContent.getBoundingClientRect();
    const angle = rideIcon() ? rotationOf(rideIcon()!) : 0;
    const hadWord = rideContent.children.length > 1;
    // The preview stays hidden; the drift and tumble stop here.
    const keeps = (animation: Animation) =>
      (animation.effect as KeyframeEffect | null)?.target === lifted;
    for (const animation of riding) {
      if (!keeps(animation)) animation.cancel();
    }
    riding = riding.filter(keeps);

    const stage = root.getBoundingClientRect();
    const style = getComputedStyle(to);
    const toRadius = Math.min(
      parseFloat(style.borderTopLeftRadius) || 0,
      target.height / 2
    );
    const fromRadius = parseFloat(rideBox.style.borderRadius) || 0;
    const fromScale = fromBox.width / (rideBox.offsetWidth || fromBox.width);

    rideBox.style.left = `${target.left - stage.left}px`;
    rideBox.style.top = `${target.top - stage.top}px`;
    rideBox.style.width = `${target.width}px`;
    rideBox.style.height = `${target.height}px`;
    rideBox.style.background = style.background;
    rideBox.style.borderRadius = `${toRadius}px`;

    // The real button's own icon and word, at its own size, so the copy lands
    // on exactly what replaces it.
    const realContent = to.querySelector<HTMLElement>(".button-content") ?? to;
    const realParts = [...realContent.children] as HTMLElement[];
    const realUnion = unionBox(realParts) ?? target;
    const realStyle = getComputedStyle(realContent);
    rideContent.replaceChildren(
      ...realParts.map((part) => part.cloneNode(true) as HTMLElement)
    );
    rideContent.style.font = realStyle.font;
    rideContent.style.color = realStyle.color;
    rideContent.style.letterSpacing = realStyle.letterSpacing;
    rideContent.style.gap = realStyle.columnGap;
    rideContent.style.left = `${realUnion.left - stage.left}px`;
    rideContent.style.top = `${realUnion.top - stage.top}px`;
    rideContent.style.height = `${realUnion.height}px`;

    // The content rides from its box on screen, anchored on the icon so a
    // dice-only preview lands its dice on the real dice.
    const realIcon = realParts[0]?.getBoundingClientRect() ?? realUnion;
    const anchorFrom = fromIcon ?? fromContent;
    const anchorHeight = fromIcon ? fromIconHeight : fromContent.height;
    const scale = anchorHeight / (realIcon.height || anchorHeight);
    const fromX =
      anchorFrom.left +
      anchorFrom.width / 2 -
      realUnion.left -
      scale * (realIcon.left + realIcon.width / 2 - realUnion.left);
    const fromY =
      anchorFrom.top +
      anchorFrom.height / 2 -
      realUnion.top -
      scale * (realIcon.top + realIcon.height / 2 - realUnion.top);

    const scaleX = fromBox.width / target.width;
    const scaleY = fromBox.height / target.height;
    const timing: KeyframeAnimationOptions = {
      duration,
      easing: EASE_STANDARD_OUT,
      fill: "both",
    };
    const swap: KeyframeAnimationOptions = {
      duration,
      easing: "step-end",
      fill: "both",
    };
    const shownRadius = fromRadius * fromScale;
    // The ride wrapper's drift is cancelled; nothing else moves it.
    ride.style.transform = "none";

    landing = [
      rideBox.animate(
        [
          {
            transform: `translate(${fromBox.left - target.left}px, ${fromBox.top - target.top}px) scale(${scaleX}, ${scaleY})`,
          },
          { transform: "none" },
        ],
        timing
      ),
      // Corners on their own, as the plate's, so the move composites.
      rideBox.animate(
        [
          {
            borderRadius: `${shownRadius / scaleX}px / ${shownRadius / scaleY}px`,
          },
          { borderRadius: `${toRadius}px` },
        ],
        timing
      ),
      rideContent.animate(
        [
          { transform: `translate(${fromX}px, ${fromY}px) scale(${scale})` },
          { transform: "none" },
        ],
        timing
      ),
      // The copy goes and the real button shows in the same frame.
      ride.animate([{ opacity: 1 }, { opacity: 0 }], swap),
      to.animate([{ opacity: 0 }, { opacity: 1 }], {
        ...swap,
        fill: "backwards",
      }),
    ];
    const icon = rideIcon();
    if (icon) {
      // The icon is a pair of dice, upright only once a full turn round, so
      // it rolls on into place as it lands rather than turning back.
      const upright = angle === 0 ? 0 : 360;
      landing.push(
        icon.animate(
          [
            { transform: `rotate(${angle}deg)` },
            { transform: `rotate(${upright}deg)` },
          ],
          timing
        )
      );
    }
    if (!hadWord) {
      // A dice-only preview: the word fades in as it lands.
      const word = rideContent.children[1] as HTMLElement | undefined;
      if (word) {
        landing.push(
          word.animate(
            [
              { opacity: 0, offset: 0 },
              { opacity: 0, offset: 0.4 },
              { opacity: 1, offset: 1 },
            ],
            timing
          )
        );
      }
    }
    return [...landing];
  }

  function rideIcon(): HTMLElement | null {
    return rideContent?.querySelector<HTMLElement>("i, svg") ?? null;
  }

  function unionBox(parts: readonly Element[]): DOMRect | null {
    const boxes = parts
      .map((part) => part.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0);
    if (boxes.length === 0) return null;
    const left = Math.min(...boxes.map((box) => box.left));
    const top = Math.min(...boxes.map((box) => box.top));
    const right = Math.max(...boxes.map((box) => box.right));
    const bottom = Math.max(...boxes.map((box) => box.bottom));
    return new DOMRect(left, top, right - left, bottom - top);
  }

  /** Quarter turns with a rest between, round and round. */
  function tumbleFrames(): Keyframe[] {
    const turn = DURATION.dramatic;
    const rest = DURATION.emphasis;
    const period = 4 * (turn + rest);
    const frames: Keyframe[] = [];
    for (let quarter = 0; quarter < 4; quarter++) {
      const start = (quarter * (turn + rest)) / period;
      frames.push({
        transform: `rotate(${quarter * 90}deg)`,
        offset: start,
        easing: EASE_STANDARD,
      });
      frames.push({
        transform: `rotate(${(quarter + 1) * 90}deg)`,
        offset: start + turn / period,
      });
    }
    frames.push({ transform: "rotate(360deg)", offset: 1 });
    return frames;
  }

  function tumbleTiming(): KeyframeAnimationOptions {
    return {
      duration: 4 * (DURATION.dramatic + DURATION.emphasis),
      iterations: Infinity,
    };
  }

  /** The icon's turn now, from 0 up to 360 degrees. */
  function rotationOf(icon: HTMLElement): number {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(icon).transform);
    const degrees = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
    return (degrees + 360) % 360;
  }
</script>

<div class="create-entry-flight" bind:this={root} aria-hidden="true">
  <div class="plate" bind:this={plate}></div>
  <div class="label" bind:this={label}></div>
  <div class="ride" bind:this={ride}>
    <div class="ride-box" bind:this={rideBox}></div>
    <div class="ride-content" bind:this={rideContent}></div>
  </div>
</div>

<style>
  .create-entry-flight {
    position: absolute;
    inset: 0;
    z-index: 2;
    visibility: hidden;
    pointer-events: none;
    overflow: hidden;
  }

  .plate,
  .label,
  .ride,
  .ride-box,
  .ride-content {
    position: absolute;
    transform-origin: 0 0;
    will-change: transform, opacity;
  }

  .ride {
    left: 0;
    top: 0;
  }

  .ride-content {
    display: inline-flex;
    align-items: center;
    line-height: 1;
    white-space: nowrap;
  }

  .ride-content :global(i) {
    transform-origin: 50% 50%;
  }
</style>
