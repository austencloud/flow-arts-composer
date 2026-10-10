<script lang="ts">
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import {
    archiveDocumentPageImage,
    type ArchiveDocument,
  } from "./_lib/archive-ledger";

  let {
    documents,
    active = false,
  }: { documents: ArchiveDocument[]; active?: boolean } = $props();

  let documentId = $state(documents[0]?.id ?? "");
  let pageNumber = $state(1);

  const currentDocument = $derived(
    documents.find((document) => document.id === documentId) ?? documents[0]
  );
  const documentOptions = $derived(
    documents.map((document) => ({
      value: document.id,
      label: document.title,
      shortLabel: document.shortTitle,
      ariaLabel: `${document.title}, ${document.pageCount} pages`,
      disabled: !active,
      tone: "accent" as const,
    }))
  );
  const pageImage = $derived(
    currentDocument
      ? archiveDocumentPageImage(currentDocument, pageNumber)
      : undefined
  );

  function chooseDocument(nextDocumentId: string) {
    if (!active || nextDocumentId === documentId) return;
    documentId = nextDocumentId;
    pageNumber = 1;
  }

  function choosePage(nextPageNumber: number) {
    if (!currentDocument || !active) return;
    pageNumber = Math.min(
      currentDocument.pageCount,
      Math.max(1, nextPageNumber)
    );
  }
</script>

<div class="document-reader" class:active>
  <SegmentedControl
    options={documentOptions}
    value={documentId}
    onchange={chooseDocument}
    color="accent"
    size="sm"
    density="tight"
    semantics="tabs"
    ariaLabel="Quarter Space Tech source documents"
  />

  {#if currentDocument && pageImage}
    <div
      class="page-stage"
      role="tabpanel"
      aria-label={`${currentDocument.title}, page ${pageNumber} of ${currentDocument.pageCount}`}
    >
      <div class="paper">
        <img
          src={pageImage}
          alt={`${currentDocument.title}, page ${pageNumber} of ${currentDocument.pageCount}. Quarter Space Tech grid diagrams by Mentive, based on Alex Kurowski's grid.`}
          width="1224"
          height="1584"
          loading={active ? "eager" : "lazy"}
          decoding="async"
        />
      </div>
      <div class="page-caption" aria-live="polite">
        <span
          >{currentDocument.title} · page {pageNumber} of {currentDocument.pageCount}</span
        >
        <strong>Mentive · based on Alex Kurowski's grid</strong>
      </div>
    </div>

    <nav class="page-controls" aria-label={`${currentDocument.title} pages`}>
      <PanelButton
        variant="secondary"
        disabled={!active || pageNumber === 1}
        ariaLabel={`Previous page of ${currentDocument.title}`}
        onclick={() => choosePage(pageNumber - 1)}
      >
        <span aria-hidden="true">←</span><span class="button-label"
          >Previous</span
        >
      </PanelButton>

      <label class="page-picker">
        <span class="sr-only">Choose a page of {currentDocument.title}</span>
        <select
          value={pageNumber}
          disabled={!active}
          onchange={(event) => choosePage(Number(event.currentTarget.value))}
        >
          {#each Array.from({ length: currentDocument.pageCount }, (_, index) => index + 1) as page}
            <option value={page}>{page}</option>
          {/each}
        </select>
        <span>of {currentDocument.pageCount}</span>
      </label>

      <PanelButton
        variant="secondary"
        disabled={!active || pageNumber === currentDocument.pageCount}
        ariaLabel={`Next page of ${currentDocument.title}`}
        onclick={() => choosePage(pageNumber + 1)}
      >
        <span class="button-label">Next</span><span aria-hidden="true">→</span>
      </PanelButton>

      <a
        class="pdf-link"
        href={currentDocument.pdfHref}
        target="_blank"
        rel="noopener"
      >
        Open PDF <span aria-hidden="true">↗</span>
      </a>
    </nav>
  {/if}
</div>

<style>
  .document-reader {
    display: grid;
    width: 100%;
    height: auto;
    min-width: 0;
    min-height: 0;
    grid-template-rows: auto auto auto;
    gap: 0.75rem;
    padding: clamp(0.4rem, 1.4cqi, 0.8rem);
    box-sizing: border-box;
  }

  .document-reader :global(.segmented-control) {
    width: min(100%, 32rem);
    margin-inline: auto;
  }

  .page-stage {
    display: grid;
    min-width: 0;
    min-height: 0;
    grid-template-rows: auto auto;
    place-items: center;
    gap: 0.35rem;
    margin: 0;
  }

  .paper {
    display: grid;
    width: 100%;
    height: auto;
    min-height: 0;
    place-items: center;
  }

  .paper img {
    display: block;
    width: 100%;
    height: auto;
    max-width: 100%;
    max-height: none;
    border: 1px solid oklch(0.82 0.015 270 / 0.5);
    border-radius: 10px;
    background: white;
    box-shadow: 0 0.8rem 2rem oklch(0 0 0 / 0.28);
  }

  .page-caption {
    display: flex;
    width: min(100%, 38rem);
    align-items: baseline;
    justify-content: space-between;
    gap: 0.7rem;
    color: var(--theme-text-dim, oklch(0.74 0.02 270));
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
  }

  .page-caption strong {
    color: var(--theme-text, oklch(0.9 0.015 270));
    font-weight: 650;
    text-align: right;
  }

  .page-controls {
    display: grid;
    width: min(100%, 38rem);
    grid-template-columns: auto auto auto minmax(max-content, 1fr);
    align-items: center;
    justify-self: center;
    gap: 0.45rem;
  }

  .page-controls :global(.panel-btn) {
    min-width: var(--min-touch-target, 44px);
    padding-inline: 0.75rem;
  }

  .page-picker {
    display: flex;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    gap: 0.35rem;
    padding-inline: 0.55rem;
    border: 1px solid var(--theme-stroke, oklch(1 0 0 / 0.13));
    border-radius: 8px;
    background: var(--theme-card-bg, oklch(0.18 0.015 270));
    color: var(--theme-text-dim, oklch(0.74 0.02 270));
    font-size: var(--font-size-min, 0.875rem);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .page-picker select {
    min-width: 3rem;
    border: 0;
    background: transparent;
    color: var(--theme-text, oklch(0.95 0.01 270));
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .pdf-link {
    display: inline-flex;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: center;
    justify-self: end;
    gap: 0.4rem;
    padding-inline: 0.9rem;
    border: 1px solid
      color-mix(in oklch, var(--artifact-accent) 55%, transparent);
    border-radius: 8px;
    background: color-mix(
      in oklch,
      var(--theme-card-bg, oklch(0.18 0.015 270)) 90%,
      var(--artifact-accent) 10%
    );
    color: var(--theme-text, oklch(0.95 0.01 270));
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    text-decoration: none;
  }

  .pdf-link:hover,
  .pdf-link:focus-visible {
    border-color: var(--artifact-accent);
    background: color-mix(
      in oklch,
      var(--theme-card-bg, oklch(0.18 0.015 270)) 82%,
      var(--artifact-accent) 18%
    );
    outline: none;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @container (max-width: 520px) {
    .page-controls {
      grid-template-columns: auto auto auto;
    }

    .pdf-link {
      grid-column: 1 / -1;
      width: 100%;
      box-sizing: border-box;
    }

    .page-caption {
      display: grid;
      justify-items: center;
      gap: 0.1rem;
      text-align: center;
    }

    .page-caption strong {
      text-align: center;
    }
  }
</style>
