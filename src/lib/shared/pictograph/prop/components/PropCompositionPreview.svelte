<!--
  PropCompositionPreview.svelte

  Renders a paired prop composition (blue + red) using SVG.
  Each prop is positioned according to the composition recipe for its family.

  Used in:
  - PropIndicatorButton (button panel in Create module)
  - PropTypeButton (prop selection drawer)
  - PropButtonLab (visual tuning lab tab)
-->
<script lang="ts">
  import { PropType } from "../domain/enums/prop-type";
  import {
    getPropTypeDisplayInfo,
    getBasePropType,
  } from "../domain/prop-type-display-registry";
  import {
    getCompositionRecipe,
    type CompositionRecipe,
  } from "../domain/prop-composition-recipes";
  import {
    propTileArtwork,
    propGlyphArtwork,
    type PropTileArtwork,
  } from "../domain/prop-look";
  import { onMount } from "svelte";
  import type { PropRenderAppearance } from "../domain/prop-look";
  import {
    resolveViewerCustomColorPair,
    type ViewerCustomColorPair,
  } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { assetFetch } from "$lib/shared/net/asset-fetch";
  import {
    colorPropPreview,
    modelPreviewColorMatrix,
  } from "../domain/prop-preview-color";
  import { isFanPropType } from "../domain/fan-appearance";

  let {
    propType,
    size = 64,
    recipeOverride = undefined,
    darkBackground = false,
    neutral = false,
    useSavedOverrides = true,
    pairedGlyph = false,
    singleHand,
    rightPropType = propType,
    appearanceOverride,
    colors,
    leftFlipped = false,
    rightFlipped = false,
  }: {
    propType: PropType;
    size?: number;
    /** Override the default recipe (used by lab tab for live tuning) */
    recipeOverride?: CompositionRecipe;
    darkBackground?: boolean;
    /** Render a single white silhouette instead of blue+red pair */
    neutral?: boolean;
    /** Standalone review surfaces can use the canonical recipe without loading
     *  the authenticated app settings graph. */
    useSavedOverrides?: boolean;
    /** Compact navigation shows two recolorable silhouettes, including fan builds. */
    pairedGlyph?: boolean;
    /** Per-hand pickers preview only the hand they change. */
    singleHand?: "left" | "right";
    rightPropType?: PropType;
    appearanceOverride?: PropRenderAppearance;
    colors?: ViewerCustomColorPair | null;
    leftFlipped?: boolean;
    rightFlipped?: boolean;
  } = $props();

  const id = $props.id();
  const palette = $derived(
    resolveViewerCustomColorPair(colors, {
      left: getMotionColor(HandSide.LEFT, darkBackground ? "dark" : "light"),
      right: getMotionColor(HandSide.RIGHT, darkBackground ? "dark" : "light"),
    })
  );

  type GetSettings =
    (typeof import("$lib/shared/application/state/app-state.svelte"))["getSettings"];
  let getSettings = $state<GetSettings | null>(null);

  onMount(() => {
    if (!useSavedOverrides) return;
    let mounted = true;
    void import("$lib/shared/application/state/app-state.svelte").then(
      (module) => {
        if (mounted) getSettings = module.getSettings;
      }
    );
    return () => {
      mounted = false;
    };
  });

  const displayInfo = $derived(getPropTypeDisplayInfo(propType));

  // The tile shows the prop the way the user has chosen to see it: the fan
  // build, the 3D model capture, or the notation glyph. Settings load lazily;
  // until they arrive the tile draws the plain glyph rather than guessing a
  // look and flashing to another one a moment later.
  const settingsReady = $derived(!useSavedOverrides || getSettings !== null);
  const lookAppearance = $derived(
    appearanceOverride ?? {
      propLook: getSettings?.().propArtwork ?? null,
      fanAppearance: getSettings?.().fanAppearance ?? null,
    }
  );
  const leftGlyph = $derived(
    propGlyphArtwork(propType, "left", lookAppearance, displayInfo.image)
  );
  const rightGlyph = $derived(
    propGlyphArtwork(
      rightPropType,
      "right",
      lookAppearance,
      getPropTypeDisplayInfo(rightPropType).image
    )
  );
  let sources = $state<Record<string, string>>({});
  $effect(() => {
    if (!pairedGlyph) return;
    const paths = [
      ...new Set(
        [leftGlyph, rightGlyph]
          .filter((art) => !art.prelit)
          .map((art) => art.href)
      ),
    ];
    let current = true;
    void Promise.all(
      paths.map(async (path) => {
        const response = await assetFetch(path);
        if (!response.ok)
          throw new Error(`Prop preview artwork: ${response.status}`);
        return [path, await response.text()] as const;
      })
    )
      .then((entries) => {
        if (current) sources = Object.fromEntries(entries);
      })
      .catch((error) =>
        console.warn("Could not load detailed prop preview", error)
      );
    return () => {
      current = false;
    };
  });

  function coloredArtwork(
    art: PropTileArtwork,
    type: PropType,
    color: string
  ): PropTileArtwork {
    if (art.prelit) return art;
    const source = sources[art.href];
    return {
      ...art,
      href: source
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colorPropPreview(source, type, color))}`
        : "",
    };
  }
  const coloredLeft = $derived(
    coloredArtwork(leftGlyph, propType, palette.left)
  );
  const coloredRight = $derived(
    coloredArtwork(rightGlyph, rightPropType, palette.right)
  );
  const smallLeftFan = $derived(size <= 40 && isFanPropType(propType));
  const smallRightFan = $derived(size <= 40 && isFanPropType(rightPropType));
  // Different families need separate slots; a crossed staff recipe can hide a fan.
  const mixedPair = $derived(propType !== rightPropType);
  const plainArt = $derived({
    href: displayInfo.image,
    styled: false,
    prelit: false,
  });
  const leftArt = $derived(
    settingsReady
      ? propTileArtwork(propType, "left", lookAppearance, displayInfo.image)
      : plainArt
  );
  const rightArt = $derived(
    settingsReady
      ? propTileArtwork(propType, "right", lookAppearance, displayInfo.image)
      : plainArt
  );

  // Check for persisted overrides from the Prop Button Lab
  const savedOverrides = $derived(
    getSettings?.().compositionRecipeOverrides ?? {}
  );
  const recipe = $derived.by(() => {
    if (recipeOverride) return recipeOverride;
    const base = getBasePropType(propType);
    return (
      savedOverrides[base] ??
      savedOverrides[propType] ??
      getCompositionRecipe(propType, pairedGlyph)
    );
  });

  // Build transform strings for each prop
  const leftTransform = $derived(
    `translate(${recipe.left.x}, ${recipe.left.y}) ` +
      `rotate(${recipe.left.rotation}) ` +
      `scale(${recipe.left.scale * recipe.pairScale})`
  );

  const rightTransform = $derived(
    `translate(${recipe.right.x}, ${recipe.right.y}) ` +
      `rotate(${recipe.right.rotation}) ` +
      `scale(${recipe.right.scale * recipe.pairScale})`
  );

  // Image dimensions in viewBox units - props are placed relative to their center
  // Using a square bounding box that gets scaled by the recipe
  const imgSize = 158;
  const imgOffset = -(imgSize / 2);
</script>

{#snippet propImage(art: PropTileArtwork, red: boolean)}
  {#if art.crop}
    <!-- A capture of the whole box: draw only the window that holds the
         prop, fitted to the glyph square, so a one-sided prop is not half
         margin. -->
    <svg
      x={imgOffset}
      y={imgOffset}
      width={imgSize}
      height={imgSize}
      viewBox="{art.crop.x} {art.crop.y} {art.crop.width} {art.crop.height}"
      preserveAspectRatio="xMidYMid meet"
    >
      <image
        class:red-prop={red}
        class:prelit={red && art.prelit}
        href={art.href}
        x="0"
        y="0"
        width={art.crop.imageWidth}
        height={art.crop.imageHeight}
      />
    </svg>
  {:else}
    <image
      class:red-prop={red}
      class:prelit={red && art.prelit}
      href={art.href}
      x={imgOffset}
      y={imgOffset}
      width={imgSize}
      height={imgSize}
    />
  {/if}
{/snippet}

{#if pairedGlyph}
  <svg
    class="prop-composition-preview"
    width={size}
    height={size}
    viewBox="0 0 100 100"
    aria-hidden="true"
  >
    <defs>
      {#each ["left", "right"] as hand}
        <filter
          id={`${id}-${hand}`}
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          color-interpolation-filters="sRGB"
        >
          <feColorMatrix
            type="matrix"
            values={modelPreviewColorMatrix(
              hand === "left" ? palette.left : palette.right,
              hand as "left" | "right"
            )}
          />
        </filter>
      {/each}
      <!-- Only tiny fan spokes need extra alpha coverage. Preserve their RGB
           detail and never expand the edges of the larger picker artwork. -->
      <filter id={`${id}-fan-coverage`} color-interpolation-filters="sRGB">
        <feComponentTransfer
          ><feFuncA type="linear" slope="3" /></feComponentTransfer
        >
      </filter>
    </defs>
    {#if singleHand !== "right"}
      <g
        transform={singleHand
          ? "translate(50, 50) scale(0.55)"
          : mixedPair
            ? "translate(28, 42) scale(0.34)"
            : leftTransform}
        filter={leftGlyph.prelit
          ? `url(#${id}-left)`
          : smallLeftFan
            ? `url(#${id}-fan-coverage)`
            : undefined}
      >
        <g
          transform={`rotate(${leftGlyph.rotation ?? 0}) scale(${leftFlipped ? -1 : 1}, 1)`}
        >
          {@render propImage(coloredLeft, false)}
        </g>
      </g>
    {/if}
    {#if singleHand !== "left"}
      <g
        transform={singleHand
          ? "translate(50, 50) scale(0.55)"
          : mixedPair
            ? "translate(72, 58) scale(0.34)"
            : rightTransform}
        filter={rightGlyph.prelit
          ? `url(#${id}-right)`
          : smallRightFan
            ? `url(#${id}-fan-coverage)`
            : undefined}
      >
        <g
          transform={`rotate(${rightGlyph.rotation ?? 0}) scale(${rightFlipped ? -1 : 1}, 1)`}
        >
          {@render propImage(coloredRight, false)}
        </g>
      </g>
    {/if}
  </svg>
{:else if neutral}
  <svg
    class="prop-composition-preview neutral"
    class:dark-bg={darkBackground}
    class:styled={leftArt.styled}
    width={size}
    height={size}
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    {#if leftArt.fill}
      {@const crop = leftArt.fill}
      <svg
        x="4"
        y="4"
        width="92"
        height="92"
        viewBox="{crop.x} {crop.y} {crop.width} {crop.height}"
        preserveAspectRatio="xMidYMid meet"
      >
        <image
          class="fill-photo"
          href={leftArt.href}
          x="0"
          y="0"
          width={crop.imageWidth}
          height={crop.imageHeight}
        />
      </svg>
    {:else}
      <g transform={leftTransform}>
        {@render propImage(leftArt, false)}
      </g>
    {/if}
  </svg>
{:else}
  <svg
    class="prop-composition-preview"
    class:dark-bg={darkBackground}
    class:styled={leftArt.styled}
    width={size}
    height={size}
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    {#if leftArt.fill}
      {@const crop = leftArt.fill}
      <svg
        x="4"
        y="4"
        width="92"
        height="92"
        viewBox="{crop.x} {crop.y} {crop.width} {crop.height}"
        preserveAspectRatio="xMidYMid meet"
      >
        <image
          class="fill-photo"
          href={leftArt.href}
          x="0"
          y="0"
          width={crop.imageWidth}
          height={crop.imageHeight}
        />
      </svg>
    {:else}
      <g transform={leftTransform}>
        {@render propImage(leftArt, false)}
      </g>

      <g transform={rightTransform}>
        {@render propImage(rightArt, true)}
      </g>
    {/if}
  </svg>
{/if}

<style>
  .prop-composition-preview {
    display: block;
    pointer-events: none;
    -webkit-user-select: none;
    user-select: none;
  }

  .red-prop {
    filter: hue-rotate(125deg) saturate(1.2);
  }

  /* Rendered previews sit on a near-black ground; screening them onto the
     tile makes that ground vanish without a cutout. */
  .fill-photo {
    mix-blend-mode: screen;
  }

  /* Model captures are already lit red; a hue shift would ruin them. */
  .red-prop.prelit {
    filter: none;
  }

  .prop-composition-preview.dark-bg {
    filter: brightness(1.8) saturate(1.4);
  }

  .prop-composition-preview.neutral {
    filter: brightness(0) invert(1);
  }

  /* A chosen look is shown as itself, never flattened to a silhouette. */
  .prop-composition-preview.neutral.styled,
  .prop-composition-preview.dark-bg.styled {
    filter: none;
  }
</style>
