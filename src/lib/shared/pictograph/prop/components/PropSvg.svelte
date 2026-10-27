<!--
Renders one prop at its prepared position.

The prop paints exactly where it is told. Motion between drawings belongs to
the caller: a sequence edit travels through PictographContainer's shared edit
clock, playback and the step editor drive per-frame positions. Only the brief
fade and scale settle when the prop's artwork itself changes live here.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { DURATION, EASE_STANDARD } from "@austencloud/motion";
  import { reducedMotion } from "../../../transitions/motion";
  import { artworkSwapRatio, PropSwapRelease } from "./prop-swap-scale";
  import { HandSide } from "../../shared/domain/enums/pictograph-enums";
  import { PropType } from "../domain/enums/prop-type";
  import type { MotionData } from "../../shared/domain/models/motion-data";
  import type { PropAssets } from "../domain/models/prop-assets";
  import type { PropPosition } from "../domain/models/prop-position";
  import { getSettings } from "../../../application/state/app-state.svelte";
  import { applyHandColorOverride } from "../domain/prop-preview-color";
  import {
    glideRotation,
    turnsChangeDirection,
  } from "../../shared/services/glide-rotation";

  // Buugeng family - asymmetric props that can be flipped
  const BUUGENG_FAMILY = new Set([
    PropType.BUUGENG,
    PropType.BIGBUUGENG,
    PropType.TRIGENG,
  ]);

  // Track SVG content changes for fade transition on prop type swap
  let propFading = $state(false);
  let previousImageSrc: string | null = null;
  let fadeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  let swapScale = $state(1);
  let swapSnapping = $state(false);
  let previousCenter: { x: number; y: number } | null = null;
  const swapRelease = new PropSwapRelease();

  $effect(() => {
    const currentSrc = propAssets?.imageSrc;
    const center = propAssets?.center;
    if (previousImageSrc !== null && currentSrc !== previousImageSrc) {
      swapRelease.start(
        artworkSwapRatio(previousCenter, center),
        reducedMotion() || directPositioning,
        (scale, snapping) => {
          swapScale = scale;
          swapSnapping = snapping;
        }
      );
      // SVG content actually changed (prop type swap) - trigger a brief fade.
      // Schedule the reset ONLY inside this branch. Do NOT clear the pending
      // reset from the effect teardown: this effect re-runs whenever the parent
      // hands down a new propAssets object, even when imageSrc is byte-identical
      // (regeneration). If the teardown cleared the timeout on such a re-run,
      // the `if` above would be skipped (same src) and no new reset would be
      // scheduled, stranding propFading = true and leaving the prop at opacity
      // 0.45 permanently. Keeping the timer alive lets it reset the fade even
      // across unrelated re-runs.
      propFading = true;
      if (fadeTimeoutId !== null) clearTimeout(fadeTimeoutId);
      fadeTimeoutId = setTimeout(() => {
        propFading = false;
        fadeTimeoutId = null;
      }, DURATION.fast);
    }
    previousImageSrc = currentSrc ?? null;
    previousCenter = center ? { ...center } : null;
  });

  // Unmount cleanup only. Deliberately not the effect teardown (see above).
  onDestroy(() => {
    swapRelease.destroy();
    if (fadeTimeoutId !== null) clearTimeout(fadeTimeoutId);
  });

  let {
    motionData,
    propAssets,
    propPosition,
    showProp = true,
    isClickable = false,
    isSelected = false,
    onPropClick,
    // Per-frame motion is moving this prop; an artwork swap snaps instead of
    // settling its scale behind the motion.
    directPositioning = false,
    glide = false,
    colorOverride = undefined,
    buugengFlippedOverride = undefined,
  } = $props<{
    motionData: MotionData;
    propAssets: PropAssets;
    propPosition: PropPosition;
    showProp?: boolean;
    isClickable?: boolean;
    isSelected?: boolean;
    onPropClick?: () => void;
    /** Per-frame motion is moving this prop. */
    directPositioning?: boolean;
    /** Ease a new resting position in (a hand shown or hidden beside this one,
     *  or an option card whose turns changed). */
    glide?: boolean;
    /** Optional display-only color. The motion remains blue/red semantically. */
    colorOverride?: string;
    buugengFlippedOverride?: boolean;
  }>();

  const renderedPropType = $derived(propAssets.propType ?? motionData.propType);
  const colorizedArtwork = $derived(
    colorOverride
      ? applyHandColorOverride(
          propAssets.imageSrc,
          motionData.hand,
          String(renderedPropType ?? ""),
          colorOverride
        )
      : propAssets.imageSrc
  );
  const renderedArtwork = $derived(colorizedArtwork);

  // Check if this prop should be mirrored (flipped horizontally)
  // - Red HAND is always mirrored (left/right hands are anatomically mirrored)
  // - Buugeng family can be flipped via user preference (asymmetric prop)
  //
  // IMPORTANT: We call getSettings() directly inside $derived.by to ensure
  // Svelte 5 tracks the reactive settings properties. Using an intermediate
  // $derived(getSettings()) doesn't preserve reactivity for property access.
  //
  // NOTE: We check BOTH motionData.propType AND the settings prop type because
  // motionData may have a stored prop type (e.g., "staff") while settings has
  // the actual rendered prop type (e.g., "buugeng"). The flip applies to the
  // RENDERED prop, so we need to check settings.
  const shouldMirror = $derived.by(() => {
    const settings = getSettings();

    // Determine the actual prop type being rendered. When the assets don't
    // say, the settings prop type is what the user chose to display.
    const settingsPropType =
      motionData.hand === HandSide.LEFT
        ? settings.leftPropType
        : motionData.hand === HandSide.RIGHT
          ? settings.rightPropType
          : undefined;
    // The preparer records the prop it actually drew on its assets. A page
    // that draws its own prop (the Codex, guides, export) must not take the
    // reader's saved prop's mirroring: a flipped buugeng in settings would
    // otherwise mirror a red staff and reverse its thumb end.
    const actualPropType: PropType | string | undefined =
      propAssets.propType ?? settingsPropType ?? motionData.propType;

    // Red hand is always mirrored (left/right hands are anatomically mirrored).
    // Also check the prepared motion's own prop type: a per-pictograph override
    // (export, guide pages) forces HAND onto the motion via the preparer, but the
    // user's global settings.rightPropType would otherwise mask it through
    // `actualPropType` and leave the red hand looking like an un-mirrored left hand.
    if (
      motionData.hand === HandSide.RIGHT &&
      (actualPropType === PropType.HAND ||
        motionData.propType === PropType.HAND)
    ) {
      return true;
    }

    // Check buugeng flip preference based on hand color
    const flipPropType =
      buugengFlippedOverride !== undefined
        ? motionData.propType
        : actualPropType;
    if (BUUGENG_FAMILY.has(flipPropType as PropType)) {
      if (motionData.hand === HandSide.LEFT) {
        return buugengFlippedOverride ?? settings.leftBuugengFlipped ?? false;
      } else if (motionData.hand === HandSide.RIGHT) {
        return buugengFlippedOverride ?? settings.rightBuugengFlipped ?? false;
      }
    }

    return false;
  });

  // A gliding prop turns the short way round, or with the motion when its
  // turns changed, rather than along the raw degrees.
  let lastRotation: number | null = null;
  let lastTurns: MotionData["turns"] | undefined;
  const displayedRotation = $derived.by(() => {
    const target = propPosition?.rotation ?? 0;
    const turns = motionData.turns;
    const rotation =
      glide && !directPositioning && lastRotation !== null
        ? glideRotation(
            lastRotation,
            target,
            turnsChangeDirection(lastTurns, turns, motionData.rotationDirection)
          )
        : target;
    lastRotation = rotation;
    lastTurns = turns;
    return rotation;
  });

  const transformString = $derived(
    `translate(${propPosition?.x ?? 0}px, ${propPosition?.y ?? 0}px) ` +
      `rotate(${displayedRotation}deg) ` +
      (shouldMirror ? "scaleX(-1) " : "")
  );
  const centeringTransform = $derived(
    `translate(${-propAssets.center.x}px, ${-propAssets.center.y}px)`
  );
</script>

{#snippet propArtwork()}
  {@html renderedArtwork}
{/snippet}

{#if showProp}
  {#if isClickable && onPropClick}
    <!-- Interactive prop - clickable button -->
    <g
      class="prop-svg {motionData.hand}-prop-svg clickable"
      class:selected={isSelected}
      class:prop-fading={propFading}
      class:glide={glide && !directPositioning}
      data-prop-type={motionData?.propType}
      data-direct-positioning={directPositioning || undefined}
      style="transform: {transformString};"
      onclick={onPropClick}
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPropClick();
        }
      }}
      role="button"
      tabindex="0"
    >
      <g
        class="prop-swap"
        class:swap-snapping={swapSnapping}
        style="transform: scale({swapScale}); --swap-duration: {DURATION.normal}ms; --swap-easing: {EASE_STANDARD};"
      >
        <g class="prop-artwork" style="transform: {centeringTransform};">
          {@render propArtwork()}
          {#if isSelected}
            <circle
              class="selection-ring"
              cx={propPosition.x}
              cy={propPosition.y}
              r="32"
              fill="none"
              stroke="var(--semantic-info, #3b82f6)"
              stroke-width="3"
              opacity="0.8"
            />
          {/if}
        </g>
      </g>
    </g>
  {:else}
    <!-- Non-interactive prop - display only -->
    <g
      class="prop-svg {motionData.hand}-prop-svg"
      class:selected={isSelected}
      class:prop-fading={propFading}
      class:glide={glide && !directPositioning}
      data-prop-type={motionData?.propType}
      data-direct-positioning={directPositioning || undefined}
      style="transform: {transformString};"
    >
      <g
        class="prop-swap"
        class:swap-snapping={swapSnapping}
        style="transform: scale({swapScale}); --swap-duration: {DURATION.normal}ms; --swap-easing: {EASE_STANDARD};"
      >
        <g class="prop-artwork" style="transform: {centeringTransform};">
          {@render propArtwork()}
          {#if isSelected}
            <circle
              class="selection-ring"
              cx={propPosition.x}
              cy={propPosition.y}
              r="32"
              fill="none"
              stroke="var(--semantic-info, #3b82f6)"
              stroke-width="3"
              opacity="0.8"
            />
          {/if}
        </g>
      </g>
    </g>
  {/if}
{/if}

<style>
  .prop-svg {
    pointer-events: none;
    /* Only the artwork-swap fade eases; position comes from the caller. */
    transition: opacity var(--duration-fast) var(--ease-standard);
  }

  /* A resting prop whose place shifts (its partner shown or hidden) eases there. */
  .prop-svg.glide {
    transition:
      opacity var(--duration-fast) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard);
  }

  /* Brief fade when prop type changes (SVG content swap) */
  .prop-svg.prop-fading {
    opacity: 0.45;
  }

  .prop-swap {
    transition: transform var(--swap-duration) var(--swap-easing);
  }

  .prop-swap.swap-snapping,
  .prop-artwork {
    transition: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .prop-svg,
    .prop-svg.glide,
    .prop-swap {
      transition: none;
    }
  }

  .prop-svg.clickable {
    pointer-events: auto;
    cursor: pointer;
  }

  .prop-svg.clickable:hover {
    filter: brightness(1.15);
  }

  .selection-ring {
    pointer-events: none;
  }

  @media (forced-colors: active) {
    .prop-svg :global([data-torch-shaft]),
    .prop-svg :global([data-torch-metal]),
    .prop-svg :global([data-torch-flame-part]) {
      fill: CanvasText !important;
      stroke: CanvasText !important;
    }
  }
</style>
