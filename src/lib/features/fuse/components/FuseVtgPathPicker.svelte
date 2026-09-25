<!--
  FuseVtgPathPicker — 1D VTG-path picker for one Fuse hand.

  Lists the diamond-default flower axis as tiles painted by the canonical
  Shape Matrix artwork primitive. Picking a flower builds the single-hand solo
  (buildFlowerSequence over the shared archetype) and hands it back for
  setSource. BaseModal owns the shell; there is no page-level size control here
  (the SSR-fragile SegmentedControl stays out).
-->
<script lang="ts">
  import { browser } from "$app/environment";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ShapeMatrixMandalaArt from "$lib/shared/shape-matrix/components/ShapeMatrixMandalaArt.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import {
    flowerKey,
    flowerLabel,
    type Flower,
  } from "$lib/shared/shape-matrix/domain/flower-signature";
  import {
    loadShapeMatrix,
    type ShapeMatrixData,
  } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";
  import { headerArtworkSrc } from "$lib/shared/shape-matrix/services/shape-matrix-artwork";
  import { propTipEnds } from "$lib/shared/pictograph/prop/domain/prop-tip-ends";
  import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import {
    buildFuseFlowerPath,
    FUSE_FLOWER_PATHS,
  } from "../services/fuse-flower-path-source";

  let {
    side,
    onSelect,
    onClose,
  }: {
    side: FuseSide;
    onSelect: (sequence: SequenceData, label: string) => void;
    onClose: () => void;
  } = $props();

  const TILE_PX = 88;
  const label = $derived(side === "left" ? "Left" : "Right");
  const settings = getSettings();
  const propType = $derived(
    side === "left" ? settings.leftPropType : settings.rightPropType
  );
  const tipCount = $derived(propTipEnds(propType));
  const propLabel = $derived(
    tipCount === 2 ? "both prop ends" : "one prop tip"
  );

  // The flower list is deterministic and synchronous, so the complete grid is
  // present in the first frame. Artwork fills reserved squares after the
  // prop-aware Shape Matrix data arrives, with no modal reflow.
  const flowers = FUSE_FLOWER_PATHS;

  let shapeData = $state<ShapeMatrixData | null>(null);
  let previewError = $state<string | null>(null);
  let busy = $state(false);
  let open = $state(true);
  let pickError = $state<string | null>(null);

  $effect(() => {
    if (!browser) return;
    const selectedProp = propType;
    let cancelled = false;
    shapeData = null;
    previewError = null;
    void loadShapeMatrix(selectedProp)
      .then((data) => {
        if (!cancelled) shapeData = data;
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        previewError =
          "Shape previews couldn't load. You can still choose a path by name.";
        console.error("[FuseVtgPathPicker] preview load failed", error);
      });
    return () => {
      cancelled = true;
    };
  });

  async function pick(flower: Flower): Promise<void> {
    if (busy) return;
    busy = true;
    pickError = null;
    try {
      const solo = await buildFuseFlowerPath(flower, side);
      onSelect(solo, flowerLabel(flower));
      open = false;
      onClose();
    } catch (error) {
      // Without this the matrix/edge load or build throwing would be an unhandled
      // rejection with no user-facing signal — the modal would just sit there.
      pickError =
        "Couldn't build that path. Try another, or reopen the picker.";
      console.error("[FuseVtgPathPicker] pick failed", error);
    } finally {
      busy = false;
    }
  }

  function close(): void {
    open = false;
    onClose();
  }
</script>

<BaseModal
  bind:open
  size="lg"
  class="fuse-vtg-picker"
  onclose={close}
  labelledBy="fuse-vtg-picker-title"
>
  {#snippet header()}
    <div class="picker-header">
      <h2 id="fuse-vtg-picker-title" class="picker-title">
        Pick a {label} VTG path
      </h2>
      <p class="picker-sub">
        {flowers.length} paths, previewed with {propLabel} for your {propType}.
      </p>
      {#if pickError}
        <p class="picker-error" role="alert">{pickError}</p>
      {/if}
      {#if previewError}
        <p class="picker-error" role="alert">{previewError}</p>
      {/if}
    </div>
  {/snippet}

  <div class="picker-body {side}">
    <div class="tile-grid" aria-busy={busy || (!shapeData && !previewError)}>
      {#each flowers as flower (flowerKey(flower))}
        {@const artworkData = shapeData}
        <button
          type="button"
          class="tile"
          disabled={busy}
          title={flowerLabel(flower)}
          aria-label={flowerLabel(flower)}
          onclick={() => void pick(flower)}
        >
          <span class="tile-thumb" style="width:{TILE_PX}px;height:{TILE_PX}px">
            {#if artworkData}
              <ShapeMatrixMandalaArt
                paint={(sizePx) =>
                  headerArtworkSrc(artworkData, flower, side, sizePx)}
                artKey={`${artworkData.props[side]}:${side}:${flowerKey(flower)}`}
                alt=""
                instant
              />
            {:else if previewError}
              <span class="preview-unavailable" aria-hidden="true">!</span>
            {:else}
              <span class="preview-loading" aria-hidden="true"></span>
            {/if}
          </span>
          <span class="tile-label">{flowerLabel(flower)}</span>
        </button>
      {/each}
    </div>
  </div>
</BaseModal>

<style>
  .picker-header {
    padding: 20px 24px 12px;
  }

  .picker-title {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-lg, 1.25rem);
    font-weight: 700;
  }

  .picker-sub {
    margin: 4px 0 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 0.875rem);
  }

  .picker-error {
    margin: 6px 0 0;
    color: var(--semantic-error, #fca5a5);
    font-size: var(--font-size-min, 0.875rem);
  }

  .picker-body {
    --tile-color: var(--prop-blue, #2196f3);
    padding: 8px 24px 24px;
  }

  :global(dialog.base-modal.fuse-vtg-picker[data-size="lg"]) {
    width: min(88vw, 1180px);
    max-height: min(82dvh, 980px);
    background:
      linear-gradient(var(--theme-panel-bg), var(--theme-panel-bg)),
      color-mix(in srgb, var(--theme-text) 8%, black);
  }

  /* Short landscape and phone viewports still scroll the option list, but the
     app never exposes a browser-style rail as part of its visual language. */
  :global(dialog.base-modal.fuse-vtg-picker .modal-body) {
    scrollbar-width: none;
  }

  :global(dialog.base-modal.fuse-vtg-picker .modal-body::-webkit-scrollbar) {
    display: none;
  }

  .picker-body.red {
    --tile-color: var(--prop-red, #f44336);
  }

  .tile-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 12px;
  }

  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 8px;
    min-height: var(--min-touch-target, 44px);
    border: 1px solid
      color-mix(
        in srgb,
        var(--tile-color) 30%,
        var(--theme-stroke, rgba(255, 255, 255, 0.12))
      );
    border-radius: var(--settings-radius-md, 14px);
    background: color-mix(
      in srgb,
      var(--tile-color) 6%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    color: var(--theme-text, #fff);
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .tile:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .tile-thumb {
    display: grid;
    place-items: center;
    /* Reserve the square up front so the async image never shifts the grid. */
    border-radius: 8px;
    background: color-mix(in srgb, var(--theme-text, white) 4%, transparent);
  }

  .preview-loading {
    width: 46%;
    height: 46%;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--tile-color) 24%, transparent);
  }

  .preview-unavailable {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 1px solid var(--semantic-error, #fca5a5);
    border-radius: 50%;
    color: var(--semantic-error, #fca5a5);
    font-weight: 800;
  }

  .tile-label {
    font-size: var(--font-size-min, 14px);
    line-height: 1.2;
    text-align: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  @media (hover: hover) and (pointer: fine) {
    .tile:hover:not(:disabled) {
      transform: translateY(-1px);
      border-color: color-mix(in srgb, var(--tile-color) 60%, transparent);
      background: color-mix(
        in srgb,
        var(--tile-color) 14%,
        var(--theme-card-bg, rgba(255, 255, 255, 0.04))
      );
    }
  }

  .tile:focus-visible {
    outline: 2px solid var(--tile-color);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .tile {
      transition: none;
    }
  }

  @media (max-width: 520px) {
    :global(dialog.base-modal.fuse-vtg-picker[data-size="lg"]) {
      width: 100%;
      max-height: var(--viewport-height, 100dvh);
    }
  }
</style>
