<script lang="ts">
  import { getPrintCardRenderer } from "$lib/features/choreo-card/getPrintCardRenderer";
  import { TND_ELEMENTS, type TnDElement } from "$lib/features/choreo-card/domain/tnd-element";
  import { loadCatalogs, loadSequencesByIds } from "$lib/features/choreo-card/services/catalog-loader";
  import type { Catalog } from "$lib/features/choreo-card/domain/models/Catalog";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PrintRenderOptions } from "$lib/features/choreo-card/services/types";

  interface ElementCard {
    element: TnDElement;
    frontUrl: string | null;
    sequence: SequenceData | null;
    catalogName: string;
    familyLabel: string;
  }

  let cards: ElementCard[] = $state(
    TND_ELEMENTS.map(el => ({ element: el, frontUrl: null, sequence: null, catalogName: "", familyLabel: "" }))
  );
  let isRendering = $state(false);
  let statusMessage = $state("Loading TnD catalogs...");

  function findFamilyMatch(
    catalogs: Catalog[],
    familyId: string,
  ): { catalog: Catalog; familyEntry: Catalog["families"][number] } | null {
    const tndCatalogs = catalogs.filter(c => c.collection === "TnD");

    for (const catalog of tndCatalogs) {
      for (const fam of catalog.families) {
        if (fam.id.toLowerCase().includes(familyId) && fam.sequenceIds.length > 0) {
          return { catalog, familyEntry: fam };
        }
      }
    }
    return null;
  }

  async function renderAllCards() {
    isRendering = true;
    statusMessage = "Loading TnD catalogs...";

    let catalogs: Catalog[];
    try {
      catalogs = await loadCatalogs();
    } catch (e) {
      statusMessage = `Failed to load catalogs: ${e}`;
      isRendering = false;
      return;
    }

    const tndCount = catalogs.filter(c => c.collection === "TnD").length;
    statusMessage = `Found ${tndCount} TnD catalogs. Fetching sequences...`;

    const renderer = getPrintCardRenderer();

    for (let i = 0; i < TND_ELEMENTS.length; i++) {
      const el = TND_ELEMENTS[i]!;
      statusMessage = `Rendering ${el.name}...`;

      const match = findFamilyMatch(catalogs, el.familyId);
      if (!match) {
        console.warn(`No TnD family found for ${el.name} (${el.familyId})`);
        continue;
      }

      const seqIds = match.familyEntry.sequenceIds.slice(0, 1);
      const sequences = await loadSequencesByIds(match.catalog.id, seqIds as string[]);
      if (sequences.length === 0) {
        console.warn(`No sequences loaded for ${el.name}`);
        continue;
      }

      const seq = sequences[0]!;
      const options: PrintRenderOptions = {
        showMandala: true,
        includeStartPlacement: true,
        startPlacementLayout: "row",
        tndElement: el,
        notes: el.name,
        iconPath: el.iconPath,
      };

      try {
        const canvas = await renderer.renderFront(seq, options);
        cards[i] = {
          element: el,
          frontUrl: canvas.toDataURL("image/png"),
          sequence: seq,
          catalogName: match.catalog.name,
          familyLabel: match.familyEntry.label,
        };
      } catch (e) {
        console.error(`Failed to render ${el.name}:`, e);
      }
    }
    statusMessage = "Done";
    isRendering = false;
  }

  $effect(() => {
    renderAllCards();
  });
</script>

<svelte:head>
  <title>TnD Elemental Card Fronts</title>
</svelte:head>

<div class="page">
  <div class="toolbar">
    <h1>TnD Elemental Card Fronts</h1>
    <span class="status">{statusMessage}</span>
    <button class="rerender-btn" type="button" onclick={renderAllCards} disabled={isRendering}>
      Re-render
    </button>
  </div>

  <div class="cards-grid">
    {#each cards as card}
      <div class="card-frame">
        {#if card.frontUrl}
          <img
            src={card.frontUrl}
            alt="{card.element.name} card front"
            class="card-img"
          />
        {:else}
          <div class="card-placeholder">Loading...</div>
        {/if}
        <div class="card-label" style="color: {card.element.accentColor}">
          {card.element.element} — {card.element.name}
        </div>
        {#if card.sequence}
          <div class="card-word">{card.sequence.word || card.sequence.name || ""}</div>
        {/if}
        {#if card.familyLabel}
          <div class="card-catalog">{card.familyLabel} ({card.catalogName})</div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .page {
    width: 100vw;
    height: 100vh;
    background: #111;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 24px;
    gap: 12px;
    box-sizing: border-box;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
  }

  .toolbar h1 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #fff;
  }

  .status {
    color: #8af;
    font-size: 12px;
  }

  .rerender-btn {
    padding: 4px 12px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.15);
    background: rgba(99,102,241,0.3);
    color: #fff;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .rerender-btn:hover:not(:disabled) {
    background: rgba(99,102,241,0.5);
  }

  .rerender-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 12px;
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: 1800px;
  }

  .card-frame {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-height: 0;
  }

  .card-img {
    max-height: calc(100vh - 100px);
    width: 100%;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  }

  .card-placeholder {
    width: 100%;
    aspect-ratio: 822 / 1122;
    background: #222;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #555;
    font-size: 13px;
  }

  .card-label {
    font-size: 11px;
    font-weight: 600;
    text-align: center;
  }

  .card-word {
    font-size: 10px;
    color: #888;
    text-align: center;
  }

  .card-catalog {
    font-size: 9px;
    color: #555;
    text-align: center;
  }
</style>
