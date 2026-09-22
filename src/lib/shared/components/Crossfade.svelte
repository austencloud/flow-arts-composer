<!--
  Crossfade.svelte

  Generic, zero-layout-shift crossfade for arbitrary keyed content — icons,
  labels, status words, panels, small images. Change `key` and the old content
  fades out while the new content fades in, both pinned to the same cell so
  neither reflows the other and nothing downstream jitters during the transition.

  Three sizing modes:
  - default (grid-stack): a single-cell grid sizes to its largest child, and
    every `.layer` is forced to `grid-area: 1 / 1`. While the old layer is still
    outro-ing and the new layer is intro-ing, both occupy that one cell, so the
    box is the max of the two and siblings don't move. Use for CONTENT-SIZED
    things (labels, icons, status words) — the box hugs the content.
  - `fill`: layers become `position: absolute; inset: 0` inside a `relative`,
    parent-sized wrapper. Use when the crossfade must fill a sized parent (a
    panel, a fixed-size stage) rather than hug its content.
  - `animateHeight`: the box takes an explicit measured height and EASES between
    the outgoing and incoming natural heights on the same clock as the fade.
    Default mode's jump-to-the-taller-of-the-two is right when the two layers
    are close (a label, a status word): the box barely moves and siblings hold
    still. It is wrong when they differ a lot — a 550px roster swapping for an
    1130px inspector teleports the box on the first frame and then fades inside
    an already-arrived container, which reads as a broken transition rather than
    a transition. Turn this on when the layers differ by more than a hair.

  Two motion treatments:
  - `motion="fade"` is the ordinary same-place crossfade.
  - `mode="swap" motion="step" direction={1 | -1}` is the canonical sequential
    decision-screen transition. Copy exits before the next copy becomes
    readable, while a short shared directional drift communicates forward/back.

  Both are the same no-layout-shift guarantee as the ghost-sizer idiom
  (PipelineEditorDock `.dock-title`), generalized to transitioning content.

  REMOUNT — read before reaching for this on heavy content: `{#key}` REMOUNTS
  children on every change. Cheap for icons/labels/light panels; wasteful (and
  state-losing: scroll, focus, in-progress work) for canvases, large pictograph
  renders, or stateful heavy panels. Those route through
  `DualSourceCrossfade.svelte`, which keeps two host-prepared sources mounted.
  CellRenderer retains its specialized image/bitmap dual-source path. The
  remount cost (not the sizing) is the carve-out line.

  Boundary + rationale: docs/architecture/crossfade-primitive.md
  Routing rule: .claude/rules/crossfade-primitive.md
  Spec: docs/superpowers/specs/active/2026-06-30-crossfade-consolidation-design.md
-->
<script lang="ts">
  import { fade, type TransitionConfig } from "svelte/transition";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import {
    flyFade,
    reducedMotion as prefersReducedMotion,
  } from "$lib/shared/transitions/motion";
  import type { Snippet } from "svelte";

  type Mode = "crossfade" | "swap";
  type Motion = "fade" | "step";

  let {
    key,
    duration = DURATION.normal,
    mode = "crossfade",
    motion = "fade",
    direction = 1,
    fill = false,
    animateHeight = false,
    delay = 0,
    children,
  }: {
    /** Change this to trigger a transition. The discriminator for the content. */
    key: unknown;
    /** Fade length in ms. Pass a DURATION.* token, not a raw number. */
    duration?: number;
    /** "crossfade" overlaps in+out; "swap" runs out fully, then in. */
    mode?: Mode;
    /** "step" adds a short direction-aware drift for wizard-like navigation. */
    motion?: Motion;
    /** Forward is 1, back is -1. Only used by `motion="step"`. */
    direction?: -1 | 1;
    /** Layers fill a sized parent (absolute/inset:0) instead of hugging content. */
    fill?: boolean;
    /**
     * Ease the box between the outgoing and incoming natural heights instead of
     * snapping to the taller of the two. Ignored under `fill`, which is already
     * sized by its parent.
     */
    animateHeight?: boolean;
    /** Deliberate in-transition stagger (ms) for `crossfade` mode. Ignored in
        `swap` mode, which computes its own delay (= out duration). */
    delay?: number;
    /** Content to render for the current `key`. */
    children: Snippet;
  } = $props();

  let reducedMotion = $state(prefersReducedMotion());

  $effect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => {
      reducedMotion = prefersReducedMotion();
      if (reducedMotion) {
        for (const animation of box?.getAnimations({ subtree: true }) ?? []) {
          if (animation.effect?.getTiming().iterations !== Infinity)
            animation.finish();
        }
      }
    };
    mql.addEventListener("change", handler);
    const preferenceObserver = new MutationObserver(handler);
    preferenceObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion-preference"],
    });
    return () => {
      mql.removeEventListener("change", handler);
      preferenceObserver.disconnect();
    };
  });

  // Svelte's `fade` is a JS/CSS transition, so a CSS `transition: none` media
  // query can't disable it — collapse the duration to 0 instead for an instant,
  // animation-free swap under reduced motion.
  const effDuration = $derived(reducedMotion ? 0 : duration);
  // Swap mode holds the incoming layer until the outgoing fade has finished
  // (delay = out duration), mirroring CellRenderer's sequential swap timing.
  // Crossfade mode uses the explicit `delay` prop (0 = pure overlap).
  const inDelay = $derived(
    reducedMotion ? 0 : mode === "swap" ? duration : delay
  );

  const heightEnabled = $derived(animateHeight && !fill);

  // A step should tell the eye where the next decision came from without
  // turning the modal into a carousel. The sequential swap keeps old and new
  // copy from becoming readable at the same time; this small drift carries
  // direction while the shared helper owns easing and reduced motion.
  const STEP_DRIFT_PX = 12;

  function enterLayer(node: Element): TransitionConfig {
    return motion === "step"
      ? flyFade(node as HTMLElement, {
          duration: effDuration,
          delay: inDelay,
          x: direction * STEP_DRIFT_PX,
          y: 0,
        })
      : fade(node, { duration: effDuration, delay: inDelay });
  }

  function leaveLayer(node: Element): TransitionConfig {
    return motion === "step"
      ? flyFade(node as HTMLElement, {
          duration: effDuration,
          x: -direction * STEP_DRIFT_PX,
          y: 0,
        })
      : fade(node, { duration: effDuration });
  }

  function setLayerInteractive(event: Event, interactive: boolean): void {
    const layer = event.currentTarget as HTMLElement;
    // Outgoing controls stay painted during the fade but must stop accepting
    // input. A reversed transition restores the returning layer immediately.
    layer.inert = !interactive;
    if (interactive) layer.removeAttribute("aria-hidden");
    else layer.setAttribute("aria-hidden", "true");
  }

  // The box is driven off the INCOMING layer's natural height. The outgoing
  // layer shares the same grid cell but is pinned to the top (`align-self:
  // start`) and no longer contributes, so a measurement taken mid-overlap is
  // the destination height rather than the max of the two.
  let box: HTMLElement | null = null;
  let liveLayer: HTMLElement | null = null;
  let heightAnimation: Animation | null = null;
  let observer: ResizeObserver | null = null;
  let measureFrame: number | null = null;
  /** Set for exactly one measurement after a key change: the swap animates,
   *  a content reflow at rest (a panel resize, a wrapped row gained) does not. */
  let animateNextMeasure = false;

  const HEIGHT_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

  function applyHeight(target: number): void {
    if (!box) return;
    const shouldAnimate = animateNextMeasure && effDuration > 0;
    animateNextMeasure = false;

    const expected = Number.parseFloat(box.style.height);
    if (Number.isFinite(expected) && Math.abs(expected - target) < 0.5) return;

    // Layout height must stay in the element's own coordinate space. A modal
    // may scale its whole subtree while entering; getBoundingClientRect() then
    // reports that temporary visual scale and freezes the box too short after
    // the modal settles.
    const from = box.offsetHeight;
    box.style.height = `${target}px`;
    if (!shouldAnimate || Math.abs(from - target) < 0.5) return;

    heightAnimation?.cancel();
    heightAnimation = box.animate(
      [{ height: `${from}px` }, { height: `${target}px` }],
      {
        duration: effDuration,
        // Move the box on the same clock as the arriving content. In `swap`
        // that means holding the old height while the old layer fades out, then
        // resizing as the new one appears — resize it during the fade-out
        // instead and the box sits empty at its new size for a beat.
        delay: inDelay,
        // The inline height is already the destination, so without a backwards
        // fill the box would jump there and only then animate away from it.
        fill: "backwards",
        easing: HEIGHT_EASING,
      }
    );
  }

  function measure(): void {
    if (!liveLayer) return;
    applyHeight(liveLayer.offsetHeight);
  }

  function cancelScheduledMeasure(): void {
    if (measureFrame === null) return;
    cancelAnimationFrame(measureFrame);
    measureFrame = null;
  }

  function scheduleMeasure(): void {
    if (measureFrame !== null) return;
    // ResizeObserver runs inside the browser's layout delivery loop. Writing a
    // parent height from that same callback can resize this layer again before
    // paint, which Safari reports as an undelivered-notification loop. Move the
    // write to the next frame and collapse repeated notifications into one.
    measureFrame = requestAnimationFrame(() => {
      measureFrame = null;
      measure();
    });
  }

  function claimLayer(node: HTMLElement): void {
    liveLayer = node;
    if (heightEnabled) {
      cancelScheduledMeasure();
      observer?.disconnect();
      observer = new ResizeObserver(scheduleMeasure);
      observer.observe(node);
      measure();
    }
  }

  /**
   * The layer the current key put on screen. Svelte marks a leaving layer
   * `inert` on the same commit that mounts or resumes the arriving one, so the
   * one layer that is not inert is the one the user is about to see.
   */
  function shownLayer(): HTMLElement | null {
    if (!box) return null;
    for (const child of box.children) {
      const layer = child as HTMLElement;
      if (layer.classList.contains("layer") && !layer.inert) return layer;
    }
    return null;
  }

  /**
   * Claims the currently-mounted layer. `bind:this` cannot be used here: the
   * outgoing block's binding tears down AFTER its outro, which would null out
   * the reference to the layer that replaced it. Clearing only when the node
   * being destroyed is still the live one keeps the newest layer authoritative.
   */
  function trackLayer(node: HTMLElement) {
    claimLayer(node);
    return {
      destroy() {
        if (liveLayer !== node) return;
        liveLayer = null;
        cancelScheduledMeasure();
        observer?.disconnect();
        observer = null;
      },
    };
  }

  // Runs before the DOM swaps in the new layer, so the box still reports the
  // height the user can currently see — the frame the animation starts from,
  // even when a previous swap was interrupted partway.
  $effect.pre(() => {
    void key;
    if (!heightEnabled || !box) return;
    animateNextMeasure = true;
  });

  // A key that returns to a layer still fading out RESUMES that layer's block
  // instead of remounting it, so `use:trackLayer` never runs again and the box
  // would stay tracked to the layer now leaving — frozen at its height once
  // that layer is destroyed. This runs after the block has committed: the
  // resumed layer is the one not inert, so claim it and ease the box back to
  // its height on the same clock as its fade-in.
  $effect(() => {
    void key;
    const shown = shownLayer();
    if (!shown || shown === liveLayer) return;
    if (heightEnabled) animateNextMeasure = true;
    claimLayer(shown);
  });

  $effect(() => {
    if (!heightEnabled) {
      // Releasing control has to hand the box back to content sizing, or it
      // stays frozen at whatever pixel height the last measurement wrote.
      heightAnimation?.cancel();
      heightAnimation = null;
      cancelScheduledMeasure();
      observer?.disconnect();
      observer = null;
      if (box) box.style.height = "";
      return;
    }
    if (!observer && liveLayer) claimLayer(liveLayer);
    return () => {
      heightAnimation?.cancel();
      heightAnimation = null;
      cancelScheduledMeasure();
      observer?.disconnect();
      observer = null;
    };
  });
</script>

<div
  bind:this={box}
  class="crossfade"
  class:fill
  class:animate-height={heightEnabled}
>
  {#key key}
    <div
      class="layer"
      use:trackLayer
      in:enterLayer
      out:leaveLayer
      onintrostart={(event) => setLayerInteractive(event, true)}
      onoutrostart={(event) => setLayerInteractive(event, false)}
    >
      {@render children()}
    </div>
  {/key}
</div>

<style>
  /* Content-sized stack: both layers share one implicit grid cell, so the box
     is the max of the two during the transition and neither reflows the other. */
  .crossfade {
    display: grid;
  }
  .crossfade > .layer {
    grid-area: 1 / 1;
    /* Grid items default to `min-width: auto`, so a layer whose content has a
       wide min-content (a list row with fixed-width action buttons, a nowrap
       label) sizes the track past the container and overflows it — the layer
       stops being a pass-through box. Zero here makes the layer honour whatever
       width its parent gives it, which is what every consumer assumes. */
    min-width: 0;
    min-height: 0;
  }

  /* Fill: layers stack absolutely inside a parent-sized box. Same zero-shift
     guarantee — both occupy inset:0 of the same relative wrapper. */
  .crossfade.fill {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .crossfade.fill > .layer {
    position: absolute;
    inset: 0;
  }

  /* The box height is written from script; clipping keeps a taller outgoing
     layer inside it while the box eases down. `clip` over `hidden` so the
     margin below can let shadows and focus rings bleed — a hard clip would
     shave the glow off a tile sitting on the boundary. */
  .crossfade.animate-height {
    overflow: clip;
    overflow-clip-margin: 1rem;
  }
  /* Both layers keep their own intrinsic height instead of stretching to the
     track, so the incoming layer measures as its natural size even while the
     outgoing one is still stacked on top of it. */
  .crossfade.animate-height > .layer {
    align-self: start;
  }
</style>
