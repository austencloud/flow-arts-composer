<!--
  Two live, stateful sources share one fixed stage. The host prepares content in
  the hidden source, then changes `active` only after that source is ready. This
  keeps a canvas, editor, or other expensive surface alive while its replacement
  starts behind it. Cheap keyed swaps still belong in Crossfade.svelte.

  Both sources always fill the stage, so the hidden one is inert but still laid
  out: `data-inert-keeps-layout` tells a canvas inside it to keep following the
  stage size instead of freezing as it would in a collapsing pane.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { DURATION, STAGGER } from "$lib/shared/transitions/transitions";

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
  }

  let {
    active,
    first,
    second,
    duration = DURATION.normal,
    clip = true,
    profile = "standard",
    onsettled,
  }: Props = $props();

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
