<script lang="ts">
  import EffectPresetThumbnail from "./EffectPresetThumbnail.svelte";
  import type { EffectCatalogLook } from "./effect-catalog-looks";

  /**
   * The painted picture of the effect that is on, in the chip format (3:2,
   * painted for a box this small rather than shrunk from the card), for a
   * button that names the effect. It knows nothing about rails or docks: the
   * caller gives the box, and with no effect on it draws nothing, so the
   * caller keeps whatever glyph it wore.
   *
   * `look` is the effect's active look, as `effectCatalogLooks(state).get(id)`
   * returns it.
   */
  interface Props {
    effectId: string | null | undefined;
    look: EffectCatalogLook | undefined;
    /** Box in CSS px. The picture is painted for about 29x20. */
    width?: number;
    height?: number;
    radius?: number;
  }

  const {
    effectId,
    look,
    width = 29,
    height = 20,
    radius = 4,
  }: Props = $props();

  const shown = $derived(!!effectId && effectId !== "none" && !!look);
</script>

{#if shown && effectId && look}
  <span
    class="active-effect-chip"
    aria-hidden="true"
    style:width="{width}px"
    style:height="{height}px"
    style:border-radius="{radius}px"
  >
    <EffectPresetThumbnail
      effectType={effectId}
      preset={look.preset}
      legacyModel={look.model}
      format="chip"
    />
  </span>
{/if}

<style>
  .active-effect-chip {
    position: relative;
    display: block;
    flex: none;
    overflow: hidden;
    pointer-events: none;
  }

  /* A quiet 1px edge so a dark picture still has a shape on a dark button. */
  .active-effect-chip::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
    pointer-events: none;
  }

  .active-effect-chip > :global(div) {
    border: 0;
    border-radius: 0;
  }
</style>
