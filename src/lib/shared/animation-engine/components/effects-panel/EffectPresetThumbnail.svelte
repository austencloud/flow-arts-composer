<script lang="ts">
  import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import type { EffectPreset } from "./presets/types";
  import type { EffectLookPreviewModel } from "./effect-look-preview";
  import EffectLookPreview from "./EffectLookPreview.svelte";
  import BloomThumbnail from "./thumbnails/BloomThumbnail.svelte";
  import FireThumbnail from "./thumbnails/FireThumbnail.svelte";
  import TrailThumbnail from "./thumbnails/TrailThumbnail.svelte";
  import CoalThumbnail from "./thumbnails/CoalThumbnail.svelte";
  import LedThumbnail from "./thumbnails/LedThumbnail.svelte";
  import PortraitTile from "./thumbnails/PortraitTile.svelte";
  import { tilePainterFor } from "./thumbnails/tile-registry";

  interface Props {
    effectType: string;
    preset: EffectPreset;
    legacyModel: EffectLookPreviewModel;
    /** The prop Ghost and Silk portray; null means the current prop. */
    propType?: string | null;
    active?: boolean;
  }

  const {
    effectType,
    preset,
    legacyModel,
    propType = null,
    active = false,
  }: Props = $props();
</script>

{#if effectType === "bloom"}
  <BloomThumbnail preset={preset as EffectPreset<"bloom">} {active} />
{:else if effectType === "fire"}
  <FireThumbnail preset={preset as EffectPreset<"fire">} {active} />
{:else if effectType === "trails"}
  <TrailThumbnail preset={preset as EffectPreset<"trails">} {active} />
{:else if effectType === "charcoal"}
  <CoalThumbnail preset={preset as EffectPreset<"charcoal">} {active} />
{:else if effectType === "led"}
  <!-- The one effect whose tile runs the shipping renderer rather than a 2D
       portrait of it. LED's look is a flux budget, a splat kernel, a streak
       integral, a shutter and a bloom pyramid, all of which live in GLSL - a
       hand-drawn tile is a second implementation free to drift, and the last
       one did: it read as convincing LEDs for weeks while the effect on stage
       was a formless blob. See led-thumbnail-renderer.ts. -->
  <LedThumbnail preset={preset as EffectPreset<"led">} {active} />
{:else if tilePainterFor(effectType)}
  <!-- A stylised portrait of the look, composed from the preset's own
       parameters, exposed so it reads at ~304x114. Each painter lives in
       thumbnails/<effect>-tile.ts and is registered in tile-registry.ts. -->
  <PortraitTile
    effectType={effectType as keyof EffectConfigMap}
    {preset}
    {propType}
    {active}
  />
{:else}
  <!-- Frost is the one effect left on the generic card; it is retired from
       the strip. Every other effect has a portrait in tile-registry.ts. -->
  <EffectLookPreview model={legacyModel} {active} />
{/if}
