<!--
  BakeCoversButton — admin-only utility shown above the shop grid. Renders
  every unbaked cover card through the print pipeline once, uploads the PNGs
  to Storage, and writes imageUrl back onto the product docs so public
  visitors load covers as plain images (no in-browser pipeline).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { Product } from "../domain/models/product";
  import { loadAllProducts } from "../services/product-loader";
  import {
    bakeCoverImages,
    countUnbaked,
    type BakeProgress,
  } from "../services/cover-baker";

  let products = $state<readonly Product[]>([]);
  let baking = $state(false);
  let progress = $state<BakeProgress | null>(null);

  onMount(async () => {
    try {
      products = await loadAllProducts();
    } catch (e) {
      console.error("[BakeCoversButton] product load failed:", e);
    }
  });

  const remaining = $derived(
    progress
      ? progress.totalCards - progress.bakedCards
      : countUnbaked(products)
  );

  async function bake() {
    baking = true;
    try {
      progress = await bakeCoverImages(products, (p) => (progress = p));
    } finally {
      baking = false;
    }
  }
</script>

{#if remaining > 0 || baking || (progress && progress.errors.length)}
  <div class="bake-bar">
    <button
      class="bake-btn"
      onclick={bake}
      disabled={baking || remaining === 0}
    >
      <i class="fas fa-fire" aria-hidden="true"></i>
      {#if baking}
        Baking {progress?.bakedCards ?? 0}/{progress?.totalCards ?? "?"}
        {progress?.currentProduct ? `· ${progress.currentProduct}` : ""}
      {:else}
        Bake {remaining} cover{remaining === 1 ? "" : "s"}
      {/if}
    </button>
    {#if progress && progress.errors.length}
      <span class="bake-errors"
        >{progress.errors.length} failed — see console</span
      >
    {/if}
  </div>
{/if}

<style>
  .bake-bar {
    /* Floating admin dock: the bar used to render at page top UNDERNEATH the
       fixed SiteHeader, where it was invisible and unclickable. */
    position: fixed;
    bottom: 18px;
    right: 18px;
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: center;
  }

  .bake-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    font-size: 0.95rem;
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-standard);
  }
  .bake-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.16);
  }
  .bake-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .bake-errors {
    color: #ff8a8a;
    font-size: 0.85rem;
  }
</style>
