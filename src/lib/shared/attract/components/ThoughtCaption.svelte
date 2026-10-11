<!--
  ThoughtCaption — the ghost's visible monologue.

  This is the feature, not decoration. Without it a stranger fifteen feet away
  sees a dot clicking around and reads it as random, no matter how good the
  reasoning underneath is. With it, the same tour reads as someone curious.

  Layout stability (no-layout-shift.md): the bubble is a FIXED box — a fixed
  width band and a two-line reserved height — so a short thought and a long one
  occupy exactly the same space and nothing on the page moves when the ghost
  changes its mind. The text inside crossfades in `fill` mode against that
  sized box, which is the documented correct mode for a framed container
  (crossfade-primitive.md §The First-Time Failure). The bubble chrome stays
  OUTSIDE the crossfade so only the words fade.

  Placement follows the pointer but is clamped to the viewport and flips to
  whichever side keeps it off the control the ghost is about to press.

  The whole bubble fades on mount/unmount because the mind now deliberately
  BLANKS the thought during a savor beat (the ghost steps back and shuts up so
  the sequence or the effect can be watched). Popping in and out of existence
  every time it does that reads as a glitch. This is a single enter/exit, not a
  crossfade — plain `transition:fade` is the correct primitive for it
  (crossfade-primitive.md §The Routing Rule).
-->
<script lang="ts">
  import { fade } from "svelte/transition";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  let {
    thought,
    x,
    y,
    stage = false,
  }: {
    /** The current thought. Null hides the bubble entirely. */
    thought: string | null;
    /** Viewport coordinates of the pointer. */
    x: number;
    y: number;
    /**
     * Projection/TV mode (`?present=stage`). Viewport width cannot tell a
     * 1080p projector from a 1080p laptop, and the tiers below can only see
     * width — so on a projector the caption used to land in the LAPTOP tier,
     * which is the one case where it needed to be biggest. An explicit flag
     * beats a guess.
     */
    stage?: boolean;
  } = $props();

  // The bubble's fixed footprint per screen tier. Everything downstream of
  // these two numbers is stable by construction — no measuring, no reflow, no
  // shift — and the tiers step it up for a 4K panel or a TV across the room
  // rather than leaving a laptop-sized bubble stranded (4k-native-layout.md).
  // Bound, not read: window.innerWidth is not a reactive dependency, so a
  // $derived over it computes once at mount and then lies — which is exactly
  // how a 4K session ends up rendering 24px type inside the laptop-tier box.
  let viewportW = $state(1920);
  let viewportH = $state(1080);
  // Stage mode floors the tier at the largest one regardless of width — that
  // is the whole point of the flag.
  const tier = $derived(
    stage ? 2 : viewportW >= 2600 ? 2 : viewportW >= 1680 ? 1 : 0
  );
  const WIDTH = $derived(
    Math.min([300, 380, 620][tier]!, Math.max(260, viewportW - 2 * 16))
  );
  const HEIGHT = $derived([68, 84, 132][tier]!);
  const GAP = 34;
  const EDGE = 16;
  // The expanded desktop rail is 220px wide. When the Ghost is inspecting an
  // icon in that rail, centering the caption over its x coordinate hides the
  // labels it just revealed. Keep the bubble one edge-gap beyond the rail so a
  // visitor can watch both the thought and the menu-reading beat at once.
  const LEFT_RAIL_CLEARANCE = 220 + EDGE;

  // Sit above the pointer by default; below it near the top of the screen, so
  // the caption never leaves the viewport and never covers the target.
  const below = $derived(y < HEIGHT + GAP + EDGE);
  const top = $derived(
    below
      ? Math.min(y + GAP, Math.max(EDGE, viewportH - HEIGHT - EDGE))
      : y - GAP - HEIGHT
  );
  const left = $derived(
    x < LEFT_RAIL_CLEARANCE
      ? Math.min(LEFT_RAIL_CLEARANCE, Math.max(EDGE, viewportW - WIDTH - EDGE))
      : Math.min(
          Math.max(x - WIDTH / 2, EDGE),
          Math.max(EDGE, viewportW - WIDTH - EDGE)
        )
  );
</script>

<svelte:window bind:innerWidth={viewportW} bind:innerHeight={viewportH} />

{#if thought}
  <div
    class="caption"
    class:below
    class:stage
    style={`width:${WIDTH}px;height:${HEIGHT}px;transform:translate(${left}px, ${top}px)`}
    aria-live="polite"
    transition:fade={{ duration: DURATION.normal }}
  >
    <div class="body">
      <Crossfade key={thought} duration={DURATION.emphasis} fill>
        <p class="text">{thought}</p>
      </Crossfade>
    </div>
    <span class="tail" aria-hidden="true"></span>
  </div>
{/if}

<style>
  .caption {
    position: fixed;
    top: 0;
    left: 0;
    /* Sits with the pointer, above every app overlay — see PresenterHost. */
    z-index: 2147483001;
    pointer-events: none;
    border-radius: 16px;
    padding: 0.75rem 1rem;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #101018) 88%,
      transparent
    );
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(18px) saturate(140%);
    -webkit-backdrop-filter: blur(18px) saturate(140%);
    will-change: transform;
  }

  /* The sized box the crossfade fills. Both layers are absolute inside it, so
     a longer thought replacing a shorter one cannot change the bubble. */
  .body {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .text {
    margin: 0;
    /* Vertically centred inside the fixed box without flex, because the
       two-line clamp needs -webkit-box on this element. */
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    transform: translateY(-50%);
    font-size: 1.0625rem;
    line-height: 1.3;
    font-weight: 500;
    color: var(--theme-text, #f4f4f8);
    /* Two lines, then ellipsis — a thought that overflows would break the
       fixed height that makes this shift-proof. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .tail {
    position: absolute;
    left: 50%;
    width: 12px;
    height: 12px;
    margin-left: -6px;
    background: inherit;
    border: inherit;
    transform: rotate(45deg);
  }

  .caption:not(.below) .tail {
    bottom: -7px;
    border-top: none;
    border-left: none;
  }

  .caption.below .tail {
    top: -7px;
    border-bottom: none;
    border-right: none;
  }

  /* A TV across the room is the other target: step the bubble up with the
     4K ramp instead of leaving it phone-sized (4k-native-layout.md). */
  @media (min-width: 1680px) {
    .caption {
      border-radius: 20px;
    }
    .text {
      font-size: 1.25rem;
    }
  }

  /* Stage mode gets the big treatment at ANY width — a 1080p projector is
     1920 CSS px and needs exactly what a 4K TV needs. Same values as the
     2600px tier below, applied by flag instead of by measurement. */
  .caption.stage {
    border-radius: 26px;
    padding: 1rem 1.35rem;
  }
  .caption.stage .text {
    font-size: 2rem;
  }
  .caption.stage .tail {
    width: 18px;
    height: 18px;
    margin-left: -9px;
  }

  /* Nothing scales for you at 4K@100% or on a TV across the room — the type
     and the bubble both have to step (4k-native-layout.md). */
  @media (min-width: 2600px) {
    .caption {
      border-radius: 26px;
      padding: 1rem 1.35rem;
    }
    .text {
      font-size: 2rem;
    }
    .tail {
      width: 18px;
      height: 18px;
      margin-left: -9px;
    }
  }
</style>
