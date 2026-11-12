<!--
  Two live, stateful sources share one fixed stage. The host prepares content in
  the hidden source, then changes `active` only after that source is ready. This
  keeps a canvas, editor, or other expensive surface alive while its replacement
  starts behind it. Cheap keyed swaps still belong in Crossfade.

  Both sources always fill the stage, so the hidden one is inert but still laid
  out: `data-inert-keeps-layout` tells a canvas inside it to keep following the
  stage size instead of freezing as it would in a collapsing pane.

  With `holdOutgoing`, a source that stops being active keeps the box it had
  until it is active again. A stage that resizes as the handoff starts then
  lays out only the incoming source. `hold` pins a source the same way before
  it stops being active, for a stage that resizes ahead of the handoff.
-->
<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import {
    EASE_STANDARD_OUT,
    motionDuration,
  } from "#lib/shared/transitions/motion.js";
  import { DURATION, STAGGER } from "#lib/shared/transitions/transitions.js";
  import { seekToPresent } from "#lib/shared/transitions/layout-flip.js";
  import {
    isInMovingPanelGroup,
    PANEL_SETTLE_EVENT,
  } from "#lib/shared/panels/panel-motion.js";

  type DualSource = "first" | "second";
  type CrossfadeProfile = "standard" | "soft-dissolve";

  interface Props {
    active: DualSource | null;
    first: Snippet;
    second: Snippet;
    duration?: number;
    /** The outgoing source's fade. Defaults to `duration`; a host can make
     *  a departure quicker than the arrival it answers. */
    exitDuration?: number;
    /** Allow a stage-owned toolbar to extend beyond its media slot. */
    clip?: boolean;
    /** Keeps additive/glowing media from becoming brighter at mid-handoff by
     *  letting the outgoing source recede before the incoming source arrives. */
    profile?: CrossfadeProfile;
    /** Fires when the active layer's opacity transition actually reaches its
     *  endpoint. Hosts use this to retire the outgoing stateful source without
     *  guessing when the compositor finished. */
    onsettled?: (active: DualSource) => void;
    /** Keep a source that stops being active at the box it had until it is
     *  active again, so a stage resize skips the surface nobody sees. The
     *  host's stage must clip overflow: a held source can outgrow a stage
     *  that shrinks. */
    holdOutgoing?: boolean;
    /** Keep this source at its current box from now on, even while it is
     *  still active, until `hold` lets it go. For a stage that resizes before
     *  the handoff: the source showing is not laid out at a size it will
     *  only be hidden at. */
    hold?: DualSource | null;
    /** This source comes forward as it arrives (scaling up from just below
     *  full size) and recedes slightly as it leaves, on the compositor. */
    depth?: DualSource | null;
    /** Move the `inert` and `aria-hidden` swap out of the handoff: pointer
     *  input follows `active` at once (CSS), and the attributes change once
     *  the fade has settled and any PanelGroup around the stage has come to
     *  rest. Flipping `inert` restyles the whole subtree, which for a grid
     *  of pictographs is a long task in the middle of the motion. */
    settleInert?: boolean;
  }

  let {
    active,
    first,
    second,
    duration = DURATION.normal,
    exitDuration,
    clip = true,
    profile = "standard",
    onsettled,
    holdOutgoing = false,
    hold = null,
    depth = null,
    settleInert = false,
  }: Props = $props();

  /** Arrival starts this far below full size; departure ends this far. */
  const DEPTH_ARRIVE_SCALE = 0.94;
  const DEPTH_LEAVE_SCALE = 0.97;

  let rootEl = $state<HTMLDivElement>();
  let firstEl = $state<HTMLDivElement>();
  let secondEl = $state<HTMLDivElement>();
  // Each source's last laid-out box, from ResizeObserver, so holding it never
  // forces a layout in the middle of a handoff.
  const lastBox = new WeakMap<Element, { width: number; height: number }>();
  let shown: DualSource | null = null;
  const holding = $derived(holdOutgoing || hold !== null);

  $effect(() => {
    if (!holding || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const box = entry.borderBoxSize?.[0];
        if (box)
          lastBox.set(entry.target, {
            width: box.inlineSize,
            height: box.blockSize,
          });
      }
    });
    if (firstEl) observer.observe(firstEl);
    if (secondEl) observer.observe(secondEl);
    return () => observer.disconnect();
  });

  function pin(el: HTMLElement): void {
    const box = lastBox.get(el);
    if (!box) return;
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.width = `${box.width}px`;
    el.style.height = `${box.height}px`;
  }

  function unpin(el: HTMLElement): void {
    el.style.removeProperty("right");
    el.style.removeProperty("bottom");
    el.style.removeProperty("width");
    el.style.removeProperty("height");
  }

  // Before the DOM update that swaps the active class, so the outgoing source
  // is pinned before anything can lay it out at a new stage size.
  $effect.pre(() => {
    const next = active;
    const keepOutgoing = holdOutgoing;
    const held = hold;
    untrack(() => {
      const outgoing = shown;
      shown = next;
      for (const [source, el] of [
        ["first", firstEl],
        ["second", secondEl],
      ] as const) {
        if (!el) continue;
        if (source === held) pin(el);
        else if (!keepOutgoing || source === next) unpin(el);
        else if (source === outgoing) pin(el);
      }
    });
  });

  let reducedMotion = $state(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  $effect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
    };
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  });

  // When CSS skips the fade, no transitionend arrives. Notify the host anyway
  // so a prepared canvas can start, including after a live preference change.
  const effectiveDuration = $derived(
    reducedMotion ? 0 : motionDuration(duration)
  );
  const effectiveExitDuration = $derived(
    reducedMotion ? 0 : motionDuration(exitDuration ?? duration)
  );
  // Reduced motion disables the whole CSS transition below, so the delay can
  // stay a plain token. Keeping it out of motionDuration also makes the style
  // declaration stable during hydration.
  const incomingDelay = $derived(
    profile === "soft-dissolve" ? STAGGER.micro : 0
  );

  /**
   * Which source keyboard and assistive technology can reach. It follows
   * `active` at once unless `settleInert` defers it to the settle.
   */
  let settledReachable = $state<DualSource | null>(untrack(() => active));
  const reachable = $derived(settleInert ? settledReachable : active);
  let reachToken = 0;
  let stopWaitingForPanels: (() => void) | null = null;

  function makeReachable(source: DualSource): void {
    if (!settleInert || settledReachable === source) return;
    const token = ++reachToken;
    stopWaitingForPanels?.();
    stopWaitingForPanels = null;
    const apply = () => {
      if (token === reachToken && active === source) settledReachable = source;
    };
    const stage = rootEl;
    if (!stage || !isInMovingPanelGroup(stage)) {
      apply();
      return;
    }
    // The stage sits in a PanelGroup that is still moving: restyling the
    // subtree now would land in its motion. Wait for it to come to rest.
    const onSettle = (event: Event) => {
      if (!(event.target instanceof Node) || !event.target.contains(stage))
        return;
      stopWaitingForPanels?.();
      stopWaitingForPanels = null;
      apply();
    };
    document.addEventListener(PANEL_SETTLE_EVENT, onSettle);
    stopWaitingForPanels = () =>
      document.removeEventListener(PANEL_SETTLE_EVENT, onSettle);
  }

  /** The arriving side fades in at `duration` after the stagger; the leaving
   * side fades out at `exitDuration` at once. */
  function fadeTiming(arriving: boolean): { duration: string; delay: string } {
    return arriving
      ? { duration: `${effectiveDuration}ms`, delay: `${incomingDelay}ms` }
      : { duration: `${effectiveExitDuration}ms`, delay: "0ms" };
  }

  $effect(() => () => stopWaitingForPanels?.());

  function sourceSettled(source: DualSource): void {
    makeReachable(source);
    onsettled?.(source);
  }

  // A fade that never reports its end (a reversal that ended where it began)
  // must not leave the shown source unreachable.
  $effect(() => {
    const source = active;
    if (!settleInert || !source) return;
    const safety = setTimeout(
      () => makeReachable(source),
      effectiveDuration + incomingDelay + DURATION.normal
    );
    return () => clearTimeout(safety);
  });

  function handleTransitionEnd(
    event: TransitionEvent,
    source: DualSource
  ): void {
    if (
      event.target !== event.currentTarget ||
      event.propertyName !== "opacity" ||
      active !== source
    )
      return;
    sourceSettled(source);
  }

  $effect(() => {
    const source = active;
    if (!source || effectiveDuration > 0) return;
    if (!onsettled && !settleInert) return;

    queueMicrotask(() => {
      if (active === source) sourceSettled(source);
    });
  });

  // The depth cue: the `scale` property alone, so it runs on the compositor
  // beside the opacity fade and leaves `transform` to the host.
  let depthShown: DualSource | null = untrack(() => active);
  let depthMotion: Animation | null = null;
  $effect(() => {
    const next = active;
    const source = depth;
    const el = source === "first" ? firstEl : secondEl;
    untrack(() => {
      const previous = depthShown;
      depthShown = next;
      if (!source || !el || previous === next) return;
      const arriving = next === source;
      const leaving = previous === source;
      if (!arriving && !leaving) return;
      const running = depthMotion;
      depthMotion = null;
      if (running) seekToPresent([running]);
      // Interrupted: start from the scale on screen, not from an endpoint.
      const from =
        running?.playState === "running"
          ? getComputedStyle(el).scale
          : arriving
            ? String(DEPTH_ARRIVE_SCALE)
            : "1";
      running?.cancel();
      const length = arriving ? effectiveDuration : effectiveExitDuration;
      if (length <= 0) return;
      const motion = el.animate(
        [
          { scale: from === "none" ? "1" : from },
          { scale: arriving ? "1" : String(DEPTH_LEAVE_SCALE) },
        ],
        {
          duration: length,
          delay: arriving ? incomingDelay : 0,
          easing: EASE_STANDARD_OUT,
          fill: "backwards",
        }
      );
      // A departed source is invisible at its end, so its scale can return.
      motion.onfinish = () => {
        if (depthMotion === motion) depthMotion = null;
      };
      depthMotion = motion;
    });
  });
</script>

<!-- The fade timing sits on each source as its own transition-duration and
     transition-delay, which do not inherit. Custom properties on this root
     did, so a host that changes exitDuration with the direction (Create's
     Play and Stop) restyled every element in both sources at the handoff. -->
<div bind:this={rootEl} class="dual-source">
  <div
    bind:this={firstEl}
    class="source"
    class:unclipped={!clip}
    class:active={active === "first"}
    style:transition-duration={fadeTiming(active === "first").duration}
    style:transition-delay={fadeTiming(active === "first").delay}
    inert={reachable !== "first"}
    data-inert-keeps-layout
    aria-hidden={reachable !== "first"}
    ontransitionend={(event) => handleTransitionEnd(event, "first")}
    ontransitioncancel={(event) => handleTransitionEnd(event, "first")}
  >
    {@render first()}
  </div>
  <div
    bind:this={secondEl}
    class="source"
    class:unclipped={!clip}
    class:active={active === "second"}
    style:transition-duration={fadeTiming(active === "second").duration}
    style:transition-delay={fadeTiming(active === "second").delay}
    inert={reachable !== "second"}
    data-inert-keeps-layout
    aria-hidden={reachable !== "second"}
    ontransitionend={(event) => handleTransitionEnd(event, "second")}
    ontransitioncancel={(event) => handleTransitionEnd(event, "second")}
  >
    {@render second()}
  </div>
</div>

<style>
  .dual-source {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    isolation: isolate;
  }

  .source {
    position: absolute;
    inset: 0;
    z-index: 0;
    min-width: 0;
    min-height: 0;
    opacity: 0;
    pointer-events: none;
    contain: layout paint;
    will-change: opacity;
    /* Duration and delay are inline per source (fadeTiming): a source
       transitions with the timing of the state it lands in. */
    transition-property: opacity;
    transition-timing-function: var(--transition-easing, var(--ease-standard));
  }

  .source.active {
    z-index: 1;
    opacity: 1;
    pointer-events: auto;
  }

  .source.unclipped {
    contain: layout;
  }

  @media (prefers-reduced-motion: reduce) {
    .source {
      transition: none;
    }
  }
</style>
