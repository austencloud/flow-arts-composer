<!--
LOOPIconStrip.svelte - Horizontal strip of Font Awesome icons for LOOP visualization

Shows only the active LOOP primitives as a compact icon strip.
Uses the user's chosen icons from the Design Lab (2026-01-21):
- Rotated: fa-rotate (halved / 180°) or fa-arrows-spin (quartered / 90°)
- Reflection: fa-left-right rotated to match the selected axis
- Swapped: fa-shuffle
- Inverted: fa-adjust
- Rewound: fa-backward
- Freeform: fa-infinity

The rotated icon swaps based on rotationPeriod so a performer can tell
at a glance whether the sequence rotates every half (2 reps, 180° each) or
every quarter (4 reps, 90° each) without reading the label.

Used in:
1. Sequence cards (badge overlay)
2. Export headers (choreo card image)
3. Layered sequence preview
-->
<script lang="ts">
  import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
  import { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
  import {
    getReflectionIconTransform,
    LOOP_ICON_COLORS,
    LOOP_ICON_GAP_SCALE,
    LOOP_ICON_DOT_SIZE_SCALE,
    LOOP_ICON_DOT_OPACITY,
    type LOOPComponentId,
    type LoopReflectionAxis,
    type ReflectionIconTransform,
  } from "@tka/render-composition";
  import CheckerboardCircleIcon from "$lib/shared/icons/CheckerboardCircleIcon.svelte";
  import { loopComponentLabel } from "$lib/features/create/generate/components/loop-component-presentation";
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";

  interface Props {
    activeComponents: Set<LOOPComponent>;
    /**
     * When the ROTATED component is active, this decides between fa-rotate
     * (halved / 180°) and fa-arrows-spin (quartered / 90°). Undefined keeps
     * the legacy fa-rotate default, so any caller that hasn't been updated
     * continues to look the same as before.
     */
    rotationPeriod?: Period;
    inversionPeriod?: Period;
    /** Exact axis used by the Reflection component. */
    reflectionAxis?: LoopReflectionAxis;
    /**
     * Components rendered LAST, after one faded separator dot — same
     * segment grammar as the word display's group-dot (TKAWordGlyph /
     * WordHeader). Absent or empty renders pixel-identical to before this
     * prop existed.
     */
    overlayComponents?: Set<LOOPComponent>;
    size?: number;
    darkMode?: boolean;
    showFreeformWhenEmpty?: boolean;
  }

  let {
    activeComponents,
    rotationPeriod,
    inversionPeriod,
    reflectionAxis,
    overlayComponents,
    size = 16,
    darkMode = true,
    showFreeformWhenEmpty = true,
  }: Props = $props();

  // Icon configuration - matches Design Lab choices.
  // Rotated's icon + label gets overridden at render time based on
  // rotationPeriod (quartered → fa-arrows-spin). Keeping the map entry
  // as the halved-default means every non-rotated primitive stays driven
  // from a single source of truth.
  // Reserved orientation primitives (ZONE_HOLD_INVERT / FLIP / CROSS) are
  // intentionally absent - see primitive-discovery rule and Phase 2 filter.
  const primitiveIcons: Partial<
    Record<
      LOOPComponent,
      {
        faClass: string;
        color: string;
      }
    >
  > & {
    freeform: { faClass: string; color: string };
  } = {
    [LOOPComponent.ROTATED]: {
      faClass: "fas fa-rotate",
      color: LOOP_ICON_COLORS.rotated,
    },
    [LOOPComponent.MIRRORED]: {
      faClass: "fas fa-left-right",
      color: LOOP_ICON_COLORS.mirrored,
    },
    [LOOPComponent.FLIPPED]: {
      faClass: "fas fa-left-right",
      color: LOOP_ICON_COLORS.flipped,
    },
    [LOOPComponent.SWAPPED]: {
      faClass: "fas fa-shuffle",
      color: LOOP_ICON_COLORS.swapped,
    },
    [LOOPComponent.INVERTED]: {
      faClass: "fas fa-adjust",
      color: LOOP_ICON_COLORS.inverted,
    },
    [LOOPComponent.REWOUND]: {
      faClass: "fas fa-backward",
      color: LOOP_ICON_COLORS.rewound,
    },
    freeform: {
      faClass: "fas fa-infinity",
      color: LOOP_ICON_COLORS.freeform,
    },
  };

  // Display order for icons (consistent ordering)
  const displayOrder: LOOPComponent[] = [
    LOOPComponent.ROTATED,
    LOOPComponent.MIRRORED,
    LOOPComponent.FLIPPED,
    LOOPComponent.SWAPPED,
    LOOPComponent.INVERTED,
    LOOPComponent.REWOUND,
  ];

  // Filter to only active components, maintaining display order
  const activeList = $derived(
    displayOrder.filter((comp) => activeComponents.has(comp))
  );

  // Split into expand-mode (rendered first) and overlay-mode (rendered
  // last, after a faded separator dot) — same segment grammar as the word
  // display's group-dot. Absent/empty overlayComponents puts everything in
  // expandList and renders no dot, i.e. pixel-identical to before.
  const overlaySet = $derived(overlayComponents ?? new Set<LOOPComponent>());
  const expandList = $derived(activeList.filter((c) => !overlaySet.has(c)));
  const overlayList = $derived(activeList.filter((c) => overlaySet.has(c)));
  const showOverlayDot = $derived(
    expandList.length > 0 && overlayList.length > 0
  );
  const dotSize = $derived(size * LOOP_ICON_DOT_SIZE_SCALE);

  // Show freeform icon if no components active and flag is set
  const showFreeform = $derived(
    showFreeformWhenEmpty && activeList.length === 0
  );

  const isQuarteredRotation = $derived(rotationPeriod === Period.QUARTERED);

  const isQuarteredInversion = $derived(inversionPeriod === Period.QUARTERED);

  const reflectionLabelKeys: Record<LoopReflectionAxis, string> = {
    "north-south": "loop_reflection_north_south",
    "east-west": "loop_reflection_east_west",
    "northeast-southwest": "loop_reflection_northeast_southwest",
    "northwest-southeast": "loop_reflection_northwest_southeast",
  };

  function iconFor(component: LOOPComponent): {
    faClass: string;
    color: string;
    label: string;
    customSvg?: "checkerboard";
    reflectionTransform?: ReflectionIconTransform;
  } | null {
    const base = primitiveIcons[component];
    if (!base) return null;
    const reflectionTransform = getReflectionIconTransform(
      component as LOOPComponentId,
      reflectionAxis
    );
    if (reflectionTransform) {
      return {
        ...base,
        faClass: "fas fa-left-right",
        color: LOOP_ICON_COLORS.mirrored,
        label: tDynamic(reflectionLabelKeys[reflectionTransform.axis]),
        reflectionTransform,
      };
    }
    if (component === LOOPComponent.ROTATED && isQuarteredRotation) {
      return {
        faClass: "fas fa-arrows-spin",
        color: base.color,
        label: tDynamic("loop_icon_rotated_quartered"),
      };
    }
    if (component === LOOPComponent.INVERTED && isQuarteredInversion) {
      return {
        ...base,
        label: tDynamic("loop_icon_inverted_quartered"),
        customSvg: "checkerboard",
      };
    }
    return { ...base, label: loopComponentLabel(component) };
  }

  // Generate aria label. When rotation is quartered the label reads
  // "Rotated (quartered)" so screen readers pick up the 90° vs 180°
  // distinction, matching what the icon now communicates visually.
  const ariaLabel = $derived(
    activeList.length > 0
      ? `LOOP: ${activeList
          .map((c) => iconFor(c)?.label)
          .filter((l): l is string => typeof l === "string")
          .join(", ")}`
      : tDynamic("loop_icon_freeform_loop")
  );

  // Gap uses shared constant from @tka/render-composition
  const gap = $derived(Math.max(2, Math.round(size * LOOP_ICON_GAP_SCALE)));
</script>

<div
  class="loop-icon-strip"
  class:dark={darkMode}
  role="img"
  aria-label={ariaLabel}
  style="gap: {gap}px;"
>
  {#if showFreeform}
    <i
      class={primitiveIcons.freeform.faClass}
      style="font-size: {size}px; color: {primitiveIcons.freeform.color};"
      aria-hidden="true"
      title={tDynamic("loop_icon_freeform")}
    ></i>
  {:else}
    {#each expandList as component}
      {@render iconCell(component)}
    {/each}
    {#if showOverlayDot}
      <span
        class="overlay-dot"
        style="width: {dotSize}px; height: {dotSize}px; opacity: {LOOP_ICON_DOT_OPACITY};"
        aria-hidden="true"
      ></span>
    {/if}
    {#each overlayList as component}
      {@render iconCell(component)}
    {/each}
  {/if}
</div>

{#snippet iconCell(component: LOOPComponent)}
  {@const icon = iconFor(component)}
  {#if icon}
    <span
      class="icon-cell"
      style="width: {size}px; height: {size}px;"
      title={icon.label}
    >
      {#if icon.customSvg === "checkerboard"}
        <span
          class="custom-icon"
          style="filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));"
        >
          <CheckerboardCircleIcon size="{size}px" color={icon.color} />
        </span>
      {:else}
        <i
          class={icon.faClass}
          style="font-size: {size}px; color: {icon.color};{icon.reflectionTransform
            ? ` transform: rotate(${icon.reflectionTransform.rotationDegrees}deg) scale(${icon.reflectionTransform.scale});`
            : ''}"
          aria-hidden="true"
        ></i>
      {/if}
    </span>
  {/if}
{/snippet}

<style>
  .loop-icon-strip {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }

  .loop-icon-strip i {
    display: inline-block;
    flex-shrink: 0;
    transform-origin: center;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
  }

  .loop-icon-strip.dark i {
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  }

  .icon-cell {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .custom-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* Overlay separator dot — same grammar as the word display's group-dot
     (TKAWordGlyph.svelte / WordHeader.svelte): currentColor, faded, round. */
  .overlay-dot {
    display: inline-block;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }
</style>
