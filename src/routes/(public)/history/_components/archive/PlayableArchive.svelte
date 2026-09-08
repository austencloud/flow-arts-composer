<script lang="ts">
  import { onMount, tick } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { pushState } from "$app/navigation";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import {
    ARCHIVE_ENTRIES,
    ARCHIVE_START_YEAR,
    ARCHIVE_END_YEAR,
    type ArchiveEntry,
  } from "./_lib/archive-ledger";
  import { entryFromArchiveHash } from "./_lib/archive-presentation";
  import ArchiveChronologicalIndex from "./ArchiveChronologicalIndex.svelte";
  import ArchiveEntryDetail from "./ArchiveEntryDetail.svelte";

  const defaultEntry = ARCHIVE_ENTRIES[0]!;
  let activeEntry = $state(defaultEntry);
  let indexOpen = $state(false);
  let reader: HTMLElement;
  let indexRegion: HTMLElement;
  let indexScroll = $state<HTMLElement>();
  let indexViewportHeight = $state(0);
  const compact = new MediaQuery("(max-width: 1099px)");
  const activeIndex = $derived(
    ARCHIVE_ENTRIES.findIndex((entry) => entry.id === activeEntry.id)
  );
  const previous = $derived(ARCHIVE_ENTRIES[activeIndex - 1]);
  const next = $derived(ARCHIVE_ENTRIES[activeIndex + 1]);

  $effect(() => {
    const selectedId = activeEntry.id;
    const viewport = indexScroll;
    // Keep the selected row visible when a shorter record shrinks the index.
    if (!viewport || !indexViewportHeight) return;
    void tick().then(() => {
      const selected = viewport.querySelector<HTMLElement>(
        `a[href="#archive-record-${selectedId}"]`
      );
      if (!selected) return;
      const row = selected.getBoundingClientRect();
      const bounds = viewport.getBoundingClientRect();
      if (row.top < bounds.top || row.bottom > bounds.bottom) {
        viewport.scrollTop +=
          row.top - bounds.top - (bounds.height - row.height) / 2;
      }
    });
  });

  function scrollToEntry() {
    const target = compact.current ? indexRegion : reader;
    target?.scrollIntoView({ block: "start", behavior: "instant" });
  }

  async function selectEntry(entry: ArchiveEntry) {
    activeEntry = entry;
    indexOpen = false;
    const nextHash = `#archive-record-${entry.id}`;
    if (window.location.hash !== nextHash) pushState(nextHash, {});
    await tick();
    reader?.focus({ preventScroll: true });
    scrollToEntry();
  }

  onMount(() => {
    const restore = () => {
      const restored = entryFromArchiveHash(
        window.location.hash,
        ARCHIVE_ENTRIES
      );
      if (restored) activeEntry = restored;
      else if (!window.location.hash) activeEntry = defaultEntry;
      indexOpen = false;
    };
    restore();
    if (entryFromArchiveHash(window.location.hash, ARCHIVE_ENTRIES)) {
      void tick().then(scrollToEntry);
    }
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  });
</script>

<section class="archive-room" aria-label="Flow arts history archive">
  <header class="archive-header">
    <h1 class="room-title">Flow arts history</h1>
    <p>
      How people have recorded movement, shared techniques, and built a language
      for flow.
    </p>
    <div class="archive-context">
      <span
        >{ARCHIVE_ENTRIES.length} selected records, {ARCHIVE_START_YEAR}–{ARCHIVE_END_YEAR}</span
      >
      <a href="#about-this-archive">About this archive</a>
    </div>
  </header>

  <div class="archive-layout">
    <aside
      class="entry-index"
      bind:this={indexRegion}
      aria-label="Browse the archive"
    >
      {#if compact.current}
        <details bind:open={indexOpen}>
          <summary
            >Browse all {ARCHIVE_ENTRIES.length} entries
            <span aria-hidden="true">⌄</span></summary
          >
          <ArchiveChronologicalIndex
            activeEntryId={activeEntry.id}
            onselect={selectEntry}
          />
        </details>
      {:else}
        <div class="index-sticky">
          <h2>Browse the archive</h2>
          <p class="index-note">
            Dates refer to the evidence described in each entry.
          </p>
          <div
            class="index-scroll"
            bind:this={indexScroll}
            bind:clientHeight={indexViewportHeight}
          >
            <ArchiveChronologicalIndex
              activeEntryId={activeEntry.id}
              onselect={selectEntry}
            />
          </div>
        </div>
      {/if}
    </aside>

    <div
      id={`archive-record-${activeEntry.id}`}
      class="selected-reader"
      bind:this={reader}
      tabindex="-1"
      role="region"
      aria-labelledby={`entry-title-${activeEntry.id}`}
    >
      <Crossfade key={activeEntry.id} animateHeight mode="swap">
        <ArchiveEntryDetail entry={activeEntry} />
      </Crossfade>
      <nav
        class="entry-neighbors"
        aria-label="Previous and next entries by date"
      >
        {#if previous}
          <a
            href={`#archive-record-${previous.id}`}
            onclick={(event) => {
              if (
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              void selectEntry(previous);
            }}
            ><span>Earlier entry</span><strong>← {previous.shortTitle}</strong
            ></a
          >
        {:else}<span></span>{/if}
        {#if next}
          <a
            class="next-entry"
            href={`#archive-record-${next.id}`}
            onclick={(event) => {
              if (
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              void selectEntry(next);
            }}><span>Later entry</span><strong>{next.shortTitle} →</strong></a
          >
        {/if}
      </nav>
    </div>
  </div>

  <footer class="archive-about" id="about-this-archive">
    <h2>About this archive</h2>
    <div class="archive-about-columns">
      <p>
        This collection follows notation systems, teaching projects, and
        published research. The categories help you browse; they are not a
        ranking or a claim that one system replaced another.
      </p>
      <p>
        Each entry credits its contributors and links to the evidence behind its
        account. A date may mark a publication, a surviving source, or work
        recalled by its creator. The entry explains which.
      </p>
      <div class="archive-contact">
        <p>
          Curated by Austen Cloud, creator of The Kinetic Alphabet and Flow Arts
          Composer.
        </p>
        <a
          href="mailto:support@tkaflowarts.com?subject=Flow%20arts%20history%20correction"
          >Suggest an addition or correction</a
        >
        <small
          >Include the entry name, your correction or addition, and a source we
          can read.</small
        >
      </div>
    </div>
  </footer>
</section>

<style>
  .archive-room {
    max-width: 100rem;
    margin-inline: auto;
    padding: clamp(1.25rem, 3vw, 3.5rem);
    padding-bottom: 1.25rem;
    color: var(--theme-text);
  }
  .archive-header {
    max-width: 56rem;
    margin-bottom: clamp(2rem, 4vw, 4rem);
  }
  h1 {
    font:
      600 clamp(2.5rem, 4.2vw, 4.6rem) / 1.05 "Fraunces",
      Georgia,
      serif;
    margin: 0 0 1rem;
    letter-spacing: -0.035em;
  }
  .archive-header > p {
    max-width: 43rem;
    font-size: clamp(1rem, 1.25vw, 1.25rem);
    line-height: 1.6;
    color: var(--theme-text-dim);
    margin: 0;
  }
  .archive-context {
    display: flex;
    gap: 0.5rem 1.5rem;
    flex-wrap: wrap;
    margin-top: 1rem;
    font-size: var(--font-size-min, 0.875rem);
    color: var(--theme-text-dim);
  }
  a {
    color: var(--theme-text);
    text-underline-offset: 0.25em;
  }
  a:hover {
    color: var(--theme-accent);
  }
  a:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 4px;
    border-radius: 4px;
  }
  .archive-layout {
    display: grid;
    grid-template-columns: 17rem minmax(0, 1fr);
    gap: clamp(2rem, 4vw, 5rem);
    align-items: start;
  }
  .entry-index {
    /* Short records determine the row height. The full archive list must not
       hold the footer below an otherwise finished entry. */
    contain: size;
    align-self: stretch;
    min-width: 0;
  }
  .index-sticky {
    position: sticky;
    top: calc(var(--marketing-header-h, 64px) + 1rem);
    height: min(100%, calc(100dvh - var(--marketing-header-h, 64px) - 2rem));
    display: flex;
    flex-direction: column;
  }
  .entry-index h2 {
    flex-shrink: 0;
    margin: 0 0 0.5rem 0.85rem;
    font-size: 1rem;
    font-weight: 650;
  }
  .index-note {
    flex-shrink: 0;
    margin: 0 0.85rem 1rem;
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.5;
    color: var(--theme-text-dim);
  }
  .index-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    overscroll-behavior: contain;
    padding: 3px;
  }
  .selected-reader {
    min-width: 0;
    scroll-margin-top: calc(var(--marketing-header-h, 64px) + 1rem);
  }
  .selected-reader:focus {
    outline: none;
  }
  .entry-neighbors {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 1rem;
    border-top: 1px solid var(--theme-stroke);
    padding-top: 1.25rem;
    margin-top: 2.5rem;
  }
  .entry-neighbors a {
    display: grid;
    gap: 0.3rem;
    padding-block: 0.5rem;
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .entry-neighbors span {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim);
  }
  .entry-neighbors strong {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
  }
  .next-entry {
    text-align: right;
  }
  .archive-about {
    border-top: 1px solid var(--theme-stroke);
    padding-top: 1.25rem;
    margin-top: 2.5rem;
    scroll-margin-top: calc(var(--marketing-header-h, 64px) + 1rem);
  }
  .archive-about-columns {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem 2rem;
  }
  .archive-about h2 {
    font:
      550 1.125rem / 1.3 "Fraunces",
      Georgia,
      serif;
    margin: 0 0 0.75rem;
  }
  .archive-about p {
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.5;
    color: var(--theme-text-dim);
    margin: 0;
  }
  .archive-about a {
    display: flex;
    align-items: center;
    min-height: 44px;
    width: fit-content;
    font-size: var(--font-size-min, 0.875rem);
  }
  .archive-about small {
    display: block;
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.5;
    color: var(--theme-text-dim);
  }
  @media (max-width: 1099px) {
    .archive-layout {
      grid-template-columns: minmax(0, 1fr);
      gap: 1.5rem;
    }
    .archive-header {
      margin-bottom: 1.5rem;
    }
    .entry-index {
      contain: none;
      scroll-margin-top: calc(var(--marketing-header-h, 64px) + 1rem);
      position: static;
    }
    details {
      border: 1px solid var(--theme-stroke);
      border-radius: var(--radius-2026-md, 14px);
      padding: 0.25rem;
    }
    summary {
      display: flex;
      justify-content: space-between;
      align-items: center;
      min-height: 44px;
      padding: 0.5rem 0.75rem;
      cursor: pointer;
      font-size: var(--font-size-min, 0.875rem);
      list-style: none;
    }
    summary::-webkit-details-marker {
      display: none;
    }
  }
  @media (max-width: 899px) {
    .archive-about-columns {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .archive-contact {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 599px) {
    .archive-about-columns {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
