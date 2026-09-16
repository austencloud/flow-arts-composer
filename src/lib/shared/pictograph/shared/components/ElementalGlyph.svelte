<!--
ElementalGlyph.svelte - Fused Elemental + VTG Glyph Component

Renders fused elemental/VTG symbols (water/SS, fire/SO, earth/TS, air/TO, sun/QS, moon/QO)
in a reserved right-side corner of pictographs. Each icon contains the VTG mode
text embedded within the elemental shape. Known non-Type1 letters are rejected.
-->
<script lang="ts">
  import {
    type ElementalType,
    getElementImagePath,
  } from "../domain/enums/pictograph-enums";
  import { LetterType } from "../../../foundation/domain/models/letter-type";
  import {
    type Letter,
    getLetterType,
  } from "../../../foundation/domain/models/letter";
  import {
    ELEMENTAL_GLYPH_VIEWBOX_SIZE,
    getElementalGlyphBox,
    type ElementalGlyphCorner,
  } from "../domain/constants/elemental-glyph-layout";

  let {
    elementalType = null,
    letter = null,
    hasValidData = true,
    visible = true,
    previewMode = false,
    animateVisibility = false,
    onToggle = undefined,
    xOffset = 0,
    corner = "bottom-right",
    ariaLabel = undefined,
  } = $props<{
    /** The elemental type to display (water, fire, earth, air, sun, moon) */
    elementalType?: ElementalType | null;
    /** The letter, when known, is used to reject non-Type1 steps. */
    letter?: Letter | null;
    /** Whether the pictograph has valid data */
    hasValidData?: boolean;
    /** Visibility control for fade effect */
    visible?: boolean;
    /** Preview mode: show at 50% opacity when off instead of hidden */
    previewMode?: boolean;
    /** Keep mounted while hidden so the opacity fade can play (live DOM only, not export) */
    animateVisibility?: boolean;
    /** Callback when glyph is clicked to toggle visibility */
    onToggle?: () => void;
    /** X offset for expanded timeline cells (shifts glyph right) */
    xOffset?: number;
    /** Which right-side corner owns this glyph. */
    corner?: ElementalGlyphCorner;
    /** Accessible relationship label when the host needs to distinguish two glyphs. */
    ariaLabel?: string;
  }>();

  // A known non-Type1 letter cannot carry an elemental relationship. Some
  // generated previews have complete two-hand geometry before letter lookup,
  // though, and that geometry is already enough for the canonical derivation.
  // NOTE: We check visibility here (not just CSS) because when exporting to SVG/image,
  // CSS classes don't carry over - only the raw SVG markup is captured.
  // Preview mode allows rendering at reduced opacity even when not visible.
  const shouldRender = $derived.by(() => {
    // Don't render if not visible (unless in preview mode which shows dimmed,
    // or animateVisibility which keeps it mounted in the live DOM to fade out)
    if (!visible && !previewMode && !animateVisibility) {
      return false;
    }
    if (!hasValidData || !elementalType) {
      return false;
    }
    // Only show for Type1 letters
    if (letter && getLetterType(letter) !== LetterType.TYPE1) {
      return false;
    }
    return true;
  });

  const imagePath = $derived.by(() => {
    if (!elementalType) return "";
    return getElementImagePath(elementalType);
  });

  // Every live and exported surface shares this slot. Keeping the geometry in
  // one pure module prevents a landing or video treatment from shrinking away
  // from the pictograph users already recognize.
  const glyphBox = $derived(
    getElementalGlyphBox(ELEMENTAL_GLYPH_VIEWBOX_SIZE, xOffset, corner)
  );

  // Center point for scale animation
  const centerX = $derived(glyphBox.x + glyphBox.width / 2);
  const centerY = $derived(glyphBox.y + glyphBox.height / 2);

  // Track when elemental type changes to trigger a subtle scale-pulse animation.

  let prevElementalType: ElementalType | null | undefined;
  let isAnimating = $state(false);

  $effect(() => {
    const previous = prevElementalType;
    prevElementalType = elementalType;

    // Skip initial mount (prevElementalType is undefined)
    // Animate when type changes to a new value
    if (
      previous !== undefined &&
      elementalType !== previous &&
      elementalType !== null
    ) {
      isAnimating = true;
      const timeout = setTimeout(() => {
        isAnimating = false;
      }, 180);
      return () => clearTimeout(timeout);
    }
    return undefined;
  });
</script>

{#if shouldRender}
  <g
    class="elemental-glyph"
    class:visible
    class:preview-mode={previewMode}
    class:interactive={onToggle !== undefined}
    onclick={onToggle}
    {...onToggle
      ? {
          role: "button",
          tabindex: 0,
          "aria-label": ariaLabel
            ? `Toggle ${ariaLabel} visibility`
            : "Toggle Elemental symbol visibility",
        }
      : {
          role: "img",
          "aria-label": ariaLabel ?? `Elemental symbol: ${elementalType}`,
        }}
  >
    <image
      class="elemental-image"
      class:animating={isAnimating}
      href={imagePath}
      x={glyphBox.x}
      y={glyphBox.y}
      width={glyphBox.width}
      height={glyphBox.height}
      preserveAspectRatio="xMidYMid meet"
      style="transform-origin: {centerX}px {centerY}px"
    />
  </g>
{/if}

<style>
  .elemental-glyph {
    /* Beautiful fade in/out effect */
    opacity: 0;
    transition: opacity var(--duration-normal) ease;
  }

  .elemental-glyph.visible {
    opacity: 1;
  }

  /* Preview mode: show "off" state at 40% opacity instead of hidden */
  .elemental-glyph.preview-mode:not(.visible) {
    opacity: 0.4;
  }

  .elemental-glyph.interactive {
    cursor: pointer;
    pointer-events: auto;
  }

  /* When visible, maintain full opacity even on hover */
  .elemental-glyph.visible.interactive:hover {
    opacity: 0.9;
  }

  /* When not visible in preview mode, dim on hover */
  .elemental-glyph.preview-mode:not(.visible).interactive:hover {
    opacity: 0.5;
  }

  /* Scale-pulse animation when elemental type changes */
  @keyframes elemental-pulse {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(0.91);
    }
    100% {
      transform: scale(1);
    }
  }

  .elemental-image.animating {
    animation: elemental-pulse 180ms ease-in-out;
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .elemental-image.animating {
      animation: none;
    }
  }
</style>
