<!--
  Two live, stateful sources share one fixed stage. The host prepares content in
  the hidden source, then changes `active` only after that source is ready. This
  keeps a canvas, editor, or other expensive surface alive while its replacement
  starts behind it. Cheap keyed swaps still belong in Crossfade.svelte.

  Both sources always fill the stage, so the hidden one is inert but still laid
  out: `data-inert-keeps-layout` tells a canvas inside it to keep following the
  stage size instead of freezing as it would in a collapsing pane.

  With `holdOutgoing`, a source that stops being active keeps the box it had
  until it is active again. A stage that resizes as the handoff starts then
  lays out only the incoming source.
-->
<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import { motionDuration } from "#lib/shared/transitions/motion.js";
  import { DURATION, STAGGER } from "#lib/shared/transitions/transitions.js";

  type DualSource = "first" | "second";
  type CrossfadeProfile = "standard" | "soft-dissolve";

  interface Props {
    active: DualSource | null;
    first: Snippet;
    second: Snippet;
    duration?: number;
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
  }

  let {
    active,
    first,
    second,
    duration = DURATION.normal,
    clip = true,
    profile = "standard",
    onsettled,
    holdOutgoing = false,
  }: Props = $props();

  let firstEl = $state<HTMLDivElement>();
  let secondEl = $state<HTMLDivElement>();
  // Each source's last laid-out box, from ResizeObserver, so holding it never
  // forces a layout in the middle of a handoff.
  const lastBox = new WeakMap<Element, { width: number; height: number }>();
  let shown: DualSource | null = null;

  $effect(() => {
    if (!holdOutgoing || typeof ResizeObserver === "undefined") return;
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

  // Before the DOM update that swaps the active class, so the outgoing source
  // is pinned before anything can lay it out at a new stage size.
  $effect.pre(() => {
    const next = active;
    const hold = holdOutgoing;
    untrack(() => {
      const outgoing = shown;
      shown = next;
      for (const [source, el] of [
        ["first", firstEl],
        ["second", secondEl],
      ] as const) {
        if (!el) continue;
        const box = lastBox.get(el);
        if (!hold || source === next) {
          el.style.removeProperty("right");
          el.style.removeProperty("bottom");
          el.style.removeProperty("width");
          el.style.removeProperty("height");
        } else if (source === outgoing && box) {
          el.style.right = "auto";
          el.style.bottom = "auto";
          el.style.width = `${box.width}px`;
          el.style.height = `${box.height}px`;
        }
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
  // Reduced motion disables the whole CSS transition below, so the delay can
  // stay a plain token. Keeping it out of motionDuration also makes the style
  // declaration stable during hydration.
  const incomingDelay = $derived(
    profile === "soft-dissolve" ? STAGGER.micro : 0
  );

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
    onsettled?.(source);
  }

  $effect(() => {
    const source = active;
    const settled = onsettled;
    if (!source || effectiveDuration > 0 || !settled) return;

    queueMicrotask(() => {
      if (active === source) settled(source);
    });
  });
</script>

<div
  class="dual-source"
  style={`--dual-source-duration: ${effectiveDuration}ms; --dual-source-in-delay: ${incomingDelay}ms;`}
>
  <div
    bind:this={firstEl}
    class="source"
    class:unclipped={!clip}
    class:active={active === "first"}
    inert={active !== "first"}
    data-inert-keeps-layout
    aria-hidden={active !== "first"}
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
    inert={active !== "second"}
    data-inert-keeps-layout
    aria-hidden={active !== "second"}
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
    transition: opacity var(--dual-source-duration)
      var(--transition-easing, ease) 0ms;
  }

  .source.active {
    z-index: 1;
    opacity: 1;
    pointer-events: auto;
    transition-delay: var(--dual-source-in-delay, 0ms);
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
