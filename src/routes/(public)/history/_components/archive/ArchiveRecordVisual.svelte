<script lang="ts">
  import ArtifactVisual from "./ArtifactVisual.svelte";
  import ArchiveDocumentReader from "./ArchiveDocumentReader.svelte";
  import { archiveLane, type ArchiveEntry } from "./_lib/archive-ledger";

  let { entry, active = false }: { entry: ArchiveEntry; active?: boolean } =
    $props();

  const lane = $derived(archiveLane(entry.lane));
</script>

{#if entry.catalogEntry}
  <div
    class="artifact-visual"
    class:natural={entry.id === "poinotation" ||
      entry.id === "vtg" ||
      entry.id === "tka"}
  >
    <ArtifactVisual entry={entry.catalogEntry} {active} />
  </div>
{:else if entry.documents?.length}
  <div class="document-artifact">
    <ArchiveDocumentReader documents={entry.documents} {active} />
  </div>
{:else}
  <article class="source-record">
    <span class="record-year" aria-hidden="true"
      >{entry.firstDocumentedYear}</span
    >
    <header>
      <p>{lane.label}</p>
      <span>{entry.dateLabel}</span>
    </header>
    <div class="record-identity">
      <h3>{entry.title}</h3>
      <p>{entry.people}</p>
    </div>
    <footer>
      <strong
        >{entry.citations.length}
        {entry.citations.length === 1 ? "source" : "sources"}</strong
      >
      <span>Source visual not attached</span>
    </footer>
  </article>
{/if}

<style>
  .artifact-visual {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    place-items: center;
    container-type: size;
  }

  .artifact-visual.natural {
    height: auto;
    container-type: inline-size;
  }

  .document-artifact {
    display: grid;
    width: 100%;
    height: auto;
    min-width: 0;
    min-height: 0;
    place-items: center;
    container-type: inline-size;
  }

  .artifact-visual :global(.qft-artifact) {
    width: min(100%, 100cqh);
    height: min(100%, 100cqw);
    aspect-ratio: 1;
  }

  .source-record {
    position: relative;
    display: flex;
    width: min(100%, 45rem);
    height: min(100%, 34rem);
    min-height: 15rem;
    flex-direction: column;
    justify-content: space-between;
    padding: clamp(1.25rem, 4cqw, 3rem);
    overflow: hidden;
    border: 1px solid
      color-mix(
        in oklch,
        var(--slide-accent, var(--artifact-accent, oklch(0.72 0.12 270))) 42%,
        oklch(1 0 0 / 0.08)
      );
    border-radius: 18px;
    background: color-mix(
      in oklch,
      var(--artifact-accent, oklch(0.72 0.12 270)) 5%,
      var(--theme-card-bg, oklch(0.145 0.012 270))
    );
    color: var(--theme-text, oklch(0.95 0.01 270));
    box-sizing: border-box;
    container-type: size;
  }

  .source-record p,
  .source-record h3 {
    margin: 0;
  }

  .record-year {
    position: absolute;
    top: -0.18em;
    right: -0.02em;
    color: color-mix(
      in oklch,
      var(--slide-accent, var(--artifact-accent, oklch(0.72 0.12 270))) 52%,
      transparent
    );
    font:
      italic 700 clamp(5rem, min(28cqw, 26cqh), 12rem) / 1 "Fraunces",
      Georgia,
      serif;
    letter-spacing: -0.08em;
    opacity: 0.2;
    pointer-events: none;
    user-select: none;
  }

  header,
  footer {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }

  header p,
  header span {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  header p {
    color: var(--slide-accent, var(--artifact-accent, oklch(0.78 0.12 270)));
  }

  header span,
  .record-identity p,
  footer span {
    color: var(--theme-text-dim, oklch(0.74 0.02 270));
  }

  .record-identity {
    position: relative;
    z-index: 1;
    display: grid;
    gap: clamp(0.65rem, 2cqh, 1rem);
    align-content: center;
  }

  .record-identity h3 {
    max-width: 15ch;
    font:
      italic 700 clamp(2rem, min(9cqw, 9cqh), 5.5rem) / 0.98 "Fraunces",
      Georgia,
      serif;
    letter-spacing: -0.035em;
  }

  .record-identity p {
    max-width: 42rem;
    font-size: clamp(0.875rem, min(3cqw, 3cqh), 1.35rem);
    line-height: 1.45;
  }

  footer {
    padding-top: 0.8rem;
    border-top: 1px solid var(--theme-stroke, oklch(1 0 0 / 0.13));
  }

  footer strong {
    color: var(--theme-text, oklch(0.95 0.01 270));
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 750;
    font-variant-numeric: tabular-nums;
  }

  footer span {
    font-size: var(--font-size-compact, 0.75rem);
  }

  @container (max-height: 310px) {
    .record-identity p {
      display: none;
    }

    footer {
      padding-top: 0.45rem;
    }
  }
</style>
