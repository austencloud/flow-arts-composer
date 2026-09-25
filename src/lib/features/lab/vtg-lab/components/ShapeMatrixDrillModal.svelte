<script lang="ts">
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "$lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import { buildModeCards, type ModeCard } from "$lib/shared/shape-matrix/services/build-realization-cards";
  import { renderCell } from "$lib/shared/shape-matrix/services/shape-matrix-render";
  import { flowerKey, flowerLabel, type Flower } from "$lib/shared/shape-matrix/domain/flower-signature";
  import type { ShapeMatrixData } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";

  interface Props {
    open: boolean;
    pair: { left: Flower; right: Flower } | null;
    data: ShapeMatrixData;
    onClose: () => void;
  }
  let { open, pair, data, onClose }: Props = $props();

  let cards = $state<ModeCard[]>([]);
  let loading = $state(false);

  // The chosen cell's overlaid mandala (the grid cell's render), pinned above.
  const mandalaUrl = $derived.by(() => {
    if (!pair) return "";
    const b = data.left.get(flowerKey(pair.left));
    const r = data.right.get(flowerKey(pair.right));
    return b && r ? renderCell(b, r, 200, data.clubTipDx) : "";
  });

  $effect(() => {
    const p = pair;
    if (!open || !p) {
      cards = [];
      return;
    }
    const overlay = {
      left: data.left.get(flowerKey(p.left))?.left ?? [],
      right: data.right.get(flowerKey(p.right))?.right ?? [],
      tips: data.tips,
    };
    let cancelled = false;
    loading = true;
    cards = [];
    (async () => {
      const built = await buildModeCards(p, overlay);
      if (!cancelled) {
        cards = built;
        loading = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  });
</script>

<BaseModal {open} onclose={onClose} size="xl">
  {#snippet header()}
    <ModalHeader
      title={pair ? `${flowerLabel(pair.left)}  ⊕  ${flowerLabel(pair.right)}` : ""}
      subtitle="Six VTG modes that trace this overlay — front + back, rendered with clubs"
      showClose
      {onClose}
    />
  {/snippet}

  <div class="drill">
    {#if mandalaUrl}
      <figure class="chosen">
        <img src={mandalaUrl} alt="Chosen overlay mandala" />
        <figcaption>this overlay</figcaption>
      </figure>
    {/if}

    {#if loading && cards.length === 0}
      <div class="empty">Rendering deck cards…</div>
    {:else if cards.length === 0}
      <div class="empty">No base words for this style pair.</div>
    {:else}
      <div class="modes">
        {#each cards as c (c.mode)}
          <article class="mode" style="--el: {c.accent}">
            <header class="cap">
              {#if c.iconPath}
                <img class="icon" src={c.iconPath} alt={c.element} />
              {/if}
              <span class="ml">{c.modeLabel}</span>
              <span class="vtg">{c.mode}</span>
              <span class="parity" class:ok={c.matched} title={c.matched ? "Reproduces the overlay" : `Closest fit — ${c.maxDist.toFixed(1)}px off`}>
                {#if c.matched}<i class="fas fa-check"></i> match{:else}<i class="fas fa-triangle-exclamation"></i> {c.maxDist.toFixed(0)}px{/if}
              </span>
              <strong class="word">{c.word}</strong>
            </header>
            <div class="faces">
              <img class="face" src={c.frontUrl} alt={`${c.word} front`} />
              <img class="face" src={c.backUrl} alt={`${c.word} back`} />
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</BaseModal>

<style>
  .drill {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px;
  }
  .chosen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin: 0;
  }
  .chosen img {
    width: 140px;
    height: 140px;
    border-radius: 12px;
    background: #0a0f14;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .chosen figcaption {
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.66);
  }

  .modes {
    display: grid;
    /* Each entry holds a front+back pair (~10:7). Fit as many as the 4K modal
       allows, never narrower than one legible pair. */
    grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
    gap: 18px;
  }
  .mode {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--el) 40%, transparent);
    border-left: 3px solid var(--el);
    border-radius: 12px;
    background: color-mix(in srgb, var(--el) 7%, transparent);
  }
  /* Intentional mode header: element icon + timing/direction + VTG code + word. */
  .cap {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .icon {
    width: 26px;
    height: 26px;
    object-fit: contain;
    flex-shrink: 0;
  }
  .ml {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.01em;
    color: #eef4fa;
  }
  .vtg {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--el);
    border: 1px solid color-mix(in srgb, var(--el) 60%, transparent);
    border-radius: 6px;
    padding: 1px 6px;
  }
  /* Computed parity verdict: green check = realization reproduces the overlay,
     amber = closest orientation still off (px). Auto-marks correctness — no
     hand-marking. */
  .parity {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
    padding: 2px 7px;
    border-radius: 6px;
    color: #ffcf8a;
    background: rgba(255, 176, 92, 0.14);
    border: 1px solid rgba(255, 176, 92, 0.5);
  }
  .parity.ok {
    color: #7ef0b0;
    background: rgba(52, 211, 153, 0.14);
    border-color: rgba(52, 211, 153, 0.5);
  }
  .word {
    font-size: 14px;
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.82);
  }
  .faces {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .face {
    /* Reserve the box so each PNG paints without shoving the grid (no-layout-shift). */
    width: 100%;
    aspect-ratio: 5 / 7;
    object-fit: contain;
    border-radius: 6px;
    background: #fff;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
  }
  .empty {
    color: #7e93a6;
    padding: 24px;
    text-align: center;
  }
</style>
