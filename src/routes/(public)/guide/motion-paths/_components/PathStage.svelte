<script lang="ts">
  /**
   * A small motion-path stage for the page's reading screens: the explorer's
   * own canvas (InlineAnimationPlayer with the explorer's scope settings)
   * playing the page's frozen example once, in one path kind, with the path
   * lines drawn. It mounts when its screen is near, plays once when it comes
   * into view and rests on the end pose; a tap replays it. Under reduced
   * motion it rests on the end pose at once, where the path lines show the
   * whole route.
   *
   * It reads the screen's scale (--fit) for its size, like every Guide
   * figure; the words around it keep their type roles.
   */
  import { onMount } from "svelte";
  import { browser } from "$app/env";
  import InlineAnimationPlayer from "#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import type { InlinePlayerControls } from "#lib/features/browse/sequences/display/components/media-viewer/inline-player-controls";
  import { createAnimationScope } from "#lib/shared/animation-engine/state/animation-scope.svelte.js";
  import {
    DEFAULT_TRAIL_SETTINGS,
    TrackingMode,
  } from "#lib/shared/animation-engine/domain/types/trail-types.js";
  import { foldTrailIntentIntoSettings } from "#lib/shared/effects/translators/canvas2d-translator.js";
  import { applySequencePathPreview } from "#lib/shared/sequence-viewer/services/sequence-path-policy.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { MandalaPathShape } from "#lib/shared/mandala/domain/mandala-types.js";
  import { motionPathExamples } from "../_data/motion-path-examples";

  let {
    kind,
    example = 2,
    pathLines = true,
    glyph = false,
    label,
    size = 240,
  }: {
    /** The path every motion takes; Hybrid is Arc for pro, Concave for anti. */
    kind: MandalaPathShape;
    /** Which frozen example plays (AAAA, BBBB, CCCC). */
    example?: number;
    /** Draw the hand's path lines on the canvas. */
    pathLines?: boolean;
    /** Draw the step's letter and element glyphs on the canvas. */
    glyph?: boolean;
    /** What a screen reader hears for the figure. */
    label: string;
    /** The size at the screen's designed scale; --fit grows or shrinks it. */
    size?: number;
  } = $props();

  const BPM = 48;
  const scope = createAnimationScope({ persistence: "ephemeral" });
  scope.visibility.setDarkMode(true);
  scope.visibility.setVisibility("stepNumbers", false);
  scope.settings.setBpm(BPM);
  scope.visibility.setBpm(BPM);
  scope.effects.replace({
    ...scope.effects.config,
    activeEffect: "none",
    tipEffectMap: {},
  });
  $effect(() => {
    scope.visibility.setVisibility("leftPathLines", pathLines);
    scope.visibility.setVisibility("rightPathLines", pathLines);
    scope.visibility.setVisibility("elementalGlyph", glyph);
    scope.visibility.setVisibility("propElementalGlyph", glyph);
    scope.visibility.setPathPolicy({
      pathShape: kind === "hybrid" ? "arc" : kind,
      motionAwarePaths: kind === "hybrid",
    });
  });

  const sequence = $derived.by(() => {
    const original = motionPathExamples[example]!;
    const previewed = applySequencePathPreview(original, {
      pathShape: kind === "hybrid" ? "arc" : kind,
      motionAwarePaths: kind === "hybrid",
    })!;
    return { ...previewed, id: `${original.id}-${kind}` };
  });
  const trail = $derived(
    foldTrailIntentIntoSettings(
      {
        ...DEFAULT_TRAIL_SETTINGS,
        usePathCache: false,
        trackingMode: TrackingMode.HAND,
      },
      scope.effects.trails
    )
  );

  let root: HTMLElement | undefined = $state();
  let near = $state(false);
  let seen = $state(false);
  let reduced = $state(false);
  let controls: InlinePlayerControls | null = null;

  onMount(() => {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = root;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      near = true;
      seen = true;
      return;
    }
    const nearIO = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) near = entry.isIntersecting;
      },
      { rootMargin: "100% 0px", threshold: 0 }
    );
    const viewIO = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) seen = true;
      },
      { threshold: 0.15 }
    );
    nearIO.observe(el);
    viewIO.observe(el);
    return () => {
      nearIO.disconnect();
      viewIO.disconnect();
    };
  });

  function ready() {
    if (reduced) controls?.restAtEnd();
  }
</script>

<div
  class="path-stage"
  role="img"
  aria-label={label}
  style:--stage={`${size}px`}
  bind:this={root}
>
  {#if browser && near}
    <InlineAnimationPlayer
      {sequence}
      sequenceLoadKey={sequence.id}
      visibilityManagerOverride={scope.visibility}
      effectsConfigState={scope.effects}
      trailSettingsOverride={trail}
      tipEffectMap={scope.effects.tipEffectMap}
      leftPropType={PropType.STAFF}
      rightPropType={PropType.STAFF}
      chrome="minimal"
      fill
      hoverHint="none"
      autoPlay={!reduced && seen}
      singlePlay
      externalBpm={BPM}
      backgroundAlpha={0}
      showControls={false}
      showPlacementGlyph={false}
      hideTkaGlyph={!glyph}
      beatIndicators={false}
      disableContextMenu
      onControlsRef={(c) => (controls = c)}
      onReady={ready}
    />
  {/if}
</div>

<style>
  .path-stage {
    position: relative;
    flex: none;
    width: min(calc(var(--stage) * var(--fit, 1)), 100%);
    aspect-ratio: 1;
    margin-inline: auto;
  }
</style>
