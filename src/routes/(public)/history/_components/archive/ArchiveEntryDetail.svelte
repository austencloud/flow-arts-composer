<script lang="ts">
  import { archiveLane, type ArchiveEntry } from "./_lib/archive-ledger";
  import { archiveArtifact } from "./_lib/archive-presentation";
  import { archiveSections } from "./_lib/archive-sections";
  import VtgReleaseVisual from "./VtgReleaseVisual.svelte";
  import ArchiveEntryResources from "./ArchiveEntryResources.svelte";
  import ArchiveRecordVisual from "./ArchiveRecordVisual.svelte";

  let { entry }: { entry: ArchiveEntry } = $props();
  const artifact = $derived(archiveArtifact(entry));
  let selectedSectionId = $state<string | null>(null);
  const selectedSection = $derived(
    archiveSections(entry).find(
      (section) => section.id === selectedSectionId
    ) ?? archiveSections(entry)[0]
  );
  const explore = $derived(entry.catalogEntry?.explore);
  const applications = $derived(entry.catalogEntry?.applications ?? []);
  const works = $derived(entry.catalogEntry?.subWorks ?? []);
  const videos = $derived(entry.catalogEntry?.videos ?? []);
</script>

<article
  class="archive-entry"
  style:--artifact-accent="var(--theme-accent)"
  aria-labelledby={`entry-title-${entry.id}`}
>
  <div
    class="entry-composition"
    class:tka-composition={entry.id === "tka"}
    class:release-browser={entry.id === "vtg"}
    class:explorable={applications.length > 0 ||
      works.length > 0 ||
      videos.length > 0}
    class:with-artifact={artifact !== null}
    class:balanced-visual={artifact?.kind === "demonstration" &&
      !applications.length &&
      !works.length &&
      !videos.length}
  >
    <header class="entry-heading">
      <p class="entry-meta">
        <span>{entry.dateLabel}</span><span
          >{archiveLane(entry.lane).label}</span
        >
      </p>
      <h2 id={`entry-title-${entry.id}`}>{entry.title}</h2>
      <p class="entry-people">{entry.people}</p>
    </header>

    <div class="entry-introduction" class:with-artifact={artifact !== null}>
      <div class="entry-copy">
        <p class="entry-summary">{entry.summary}</p>
        {#if entry.evidenceBasis === "unresolved" && entry.evidenceNote}
          <p class="source-caution">{entry.evidenceNote}</p>
        {/if}
        {#if explore && entry.id !== "vtg"}
          <a
            class="explore-link"
            href={explore.href}
            target={explore.href.startsWith("/") ? undefined : "_blank"}
            rel={explore.href.startsWith("/")
              ? undefined
              : "noopener noreferrer"}
          >
            {explore.label}
            <span aria-hidden="true"
              >{explore.kind === "original" ? "↗" : "→"}</span
            >
          </a>
          {#if explore.kind === "tool"}<p class="link-context">
              An interactive viewer built for this archive.
            </p>{/if}
        {/if}
      </div>
      {#if entry.id === "vtg"}
        <div class="entry-details">
          <ArchiveEntryResources {entry} bind:selectedId={selectedSectionId} />
        </div>
      {/if}
      {#if entry.id === "vtg" && selectedSection}
        <div class="entry-artifact release-artifact">
          <VtgReleaseVisual sectionId={selectedSection.id} />
        </div>
      {:else if artifact}
        <figure
          class="entry-artifact"
          class:sheet={entry.id === "lorq"}
          data-artifact-kind={artifact.kind}
        >
          {#if entry.id !== "tka"}
            <div class="artifact-label">{artifact.label}</div>
          {/if}
          <div
            class="artifact-stage"
            class:portrait={entry.id === "lorq"}
            class:landscape={entry.id === "nine-square"}
            class:intrinsic={entry.id === "poinotation" ||
              entry.id === "vtg" ||
              entry.id === "tka"}
            class:document={artifact.kind === "document"}
          >
            <ArchiveRecordVisual {entry} active />
          </div>
          <figcaption>{artifact.note}</figcaption>
        </figure>
      {/if}
      {#if entry.id !== "vtg"}
        <div class="entry-details">
          <ArchiveEntryResources {entry} />
        </div>
      {/if}
    </div>
  </div>
</article>

<style>
  .archive-entry {
    /* The host supplies the available space after its navigation and footer.
       Content remains intrinsically sized when it needs more room. */
    min-height: var(--archive-entry-space, 0px);
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    container-type: inline-size;
  }
  .entry-composition {
    display: grid;
    gap: clamp(1.75rem, calc(var(--archive-entry-space, 0px) * 0.04), 3.5rem);
    min-width: 0;
  }
  .entry-composition:not(.with-artifact) {
    width: 100%;
    max-width: 48rem;
    align-self: center;
  }
  .entry-heading {
    padding-top: 0.15rem;
  }
  .entry-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.875rem);
    margin: 0 0 0.85rem;
  }
  .entry-meta span:first-child {
    color: var(--theme-accent);
    font-weight: 650;
  }
  h2 {
    font:
      550 clamp(2rem, 4.5cqi, 3.4rem) / 1.1 "Fraunces",
      Georgia,
      serif;
    letter-spacing: -0.025em;
    text-wrap: balance;
    margin: 0 0 1rem;
  }
  .entry-people {
    margin: 0;
    max-width: 68ch;
    color: var(--theme-text-dim);
    font-size: 1rem;
    line-height: 1.6;
  }
  .entry-introduction {
    display: grid;
    gap: 2rem;
    align-items: start;
  }
  .entry-copy {
    min-width: 0;
  }
  .explorable .entry-details {
    order: 1;
  }
  .explorable .entry-artifact {
    order: 2;
  }
  .entry-summary {
    font-size: 1.0625rem;
    line-height: 1.75;
    max-width: 65ch;
    margin: 0;
  }
  a {
    color: var(--theme-text);
    text-underline-offset: 0.25em;
    text-decoration-thickness: 1px;
  }
  a:hover {
    color: var(--theme-accent);
  }
  a:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 4px;
    border-radius: 2px;
  }
  .explore-link {
    display: inline-flex;
    gap: 0.6rem;
    align-items: center;
    min-height: 44px;
    margin-top: 0.8rem;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 650;
  }
  .link-context {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
  }
  .entry-artifact {
    margin: 0;
    min-width: 0;
    width: 100%;
    max-width: 38rem;
    justify-self: center;
  }
  .artifact-label {
    margin-bottom: 0.75rem;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 650;
    color: var(--theme-text-dim);
  }
  .artifact-stage {
    width: 100%;
    aspect-ratio: 1;
    container-type: size;
    min-width: 0;
  }
  .artifact-stage.document {
    aspect-ratio: auto;
    container-type: inline-size;
  }
  .artifact-stage.portrait {
    aspect-ratio: 3 / 4;
  }
  .artifact-stage.landscape {
    aspect-ratio: 4 / 3;
  }
  .artifact-stage.intrinsic {
    aspect-ratio: auto;
    container-type: inline-size;
  }
  .entry-artifact.sheet {
    max-width: 28rem;
  }
  figcaption {
    margin-top: 0.85rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.55;
  }
  .source-caution {
    margin-top: 1.5rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.65;
    max-width: 68ch;
  }
  @container (min-width: 760px) {
    .entry-composition.with-artifact {
      align-items: start;
      grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
      /* Equal outer tracks center the title, copy and sources beside a taller visual
         without stretching the individual paragraphs or citation rows. */
      grid-template-rows: 1fr auto auto auto 1fr;
      gap: 0 2rem;
    }
    .entry-introduction.with-artifact {
      display: contents;
    }
    .with-artifact .entry-heading {
      grid-column: 1;
      grid-row: 2;
      margin-bottom: clamp(
        1.75rem,
        calc(var(--archive-entry-space, 0px) * 0.04),
        3.5rem
      );
    }
    .with-artifact .entry-copy {
      grid-column: 1;
      grid-row: 3;
    }
    .with-artifact .entry-details {
      grid-column: 1;
      grid-row: 4;
      margin-top: clamp(
        1.5rem,
        calc(var(--archive-entry-space, 0px) * 0.03),
        3rem
      );
    }
    .with-artifact .entry-artifact {
      grid-column: 2;
      grid-row: 1 / span 5;
      position: sticky;
      top: calc(var(--marketing-header-h, 64px) + 1rem);
    }
    .balanced-visual .entry-artifact {
      align-self: center;
      position: static;
    }
    .explorable.with-artifact {
      grid-template-rows: auto auto 1fr;
    }
    .explorable .entry-heading {
      grid-column: 1 / -1;
      grid-row: 1;
      margin-bottom: 1.5rem;
    }
    .explorable .entry-people {
      max-width: 90ch;
    }
    .explorable .entry-copy {
      grid-row: 2;
    }
    .explorable .entry-details {
      grid-row: 3;
      margin-top: 1.5rem;
    }
    .explorable .entry-artifact {
      grid-row: 2 / span 2;
      max-width: 32rem;
    }
    .release-browser.with-artifact {
      grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
    }
    .release-browser .release-artifact {
      max-width: none;
    }
    .explorable .entry-artifact.sheet {
      max-width: 28rem;
    }
  }
  @container (min-width: 1400px) {
    .entry-composition.with-artifact {
      grid-template-columns: minmax(26rem, 42rem) minmax(0, 1fr);
      column-gap: clamp(3rem, 4cqi, 7rem);
    }
    .with-artifact .entry-artifact {
      max-width: min(100%, max(38rem, calc(100dvh - 32rem)));
    }
    .release-browser.with-artifact {
      grid-template-columns: minmax(26rem, 42rem) minmax(0, 1fr);
      grid-template-rows: 1fr auto auto auto 1fr;
    }
    .release-browser .entry-heading {
      grid-column: 1;
      grid-row: 2;
    }
    .release-browser .entry-copy {
      grid-row: 3;
    }
    .release-browser .entry-details {
      grid-row: 4;
    }
    .release-browser .release-artifact {
      grid-row: 1 / span 5;
      max-width: none;
    }
    .entry-summary {
      font-size: 1.25rem;
    }
  }
  @container (min-width: 760px) {
    .tka-composition.with-artifact {
      width: 100%;
      max-width: 108rem;
      margin-inline: auto;
      grid-template-rows: 1fr auto auto auto 1fr;
    }
    .tka-composition .entry-heading {
      grid-column: 1;
      grid-row: 2;
    }
    .tka-composition .entry-copy {
      grid-row: 3;
    }
    .tka-composition .entry-details {
      grid-row: 4;
    }
    .tka-composition .entry-artifact {
      grid-row: 1 / span 5;
      align-self: center;
      position: static;
      max-width: min(60rem, max(38rem, calc(100dvh - 32rem)));
    }
  }
  .tka-composition .artifact-stage {
    --tka-preview-max-width: 60rem;
  }
</style>
