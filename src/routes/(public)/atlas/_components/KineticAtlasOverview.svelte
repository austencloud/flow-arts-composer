<script lang="ts">
  import { onMount } from "svelte";
  import ConceptLevelMap from "$lib/features/learn/components/ConceptLevelMap.svelte";
  import {
    getConceptPlace,
    type LearnConceptPlace,
  } from "$lib/features/learn/domain/concept-place-registry";
  import {
    readConceptPlaceId,
    writeConceptPlaceId,
  } from "$lib/features/learn/domain/concept-place-routes";
  import { buildConceptPath } from "$lib/features/learn/domain/concept-routes";
  import type { LearnConcept } from "$lib/features/learn/domain/types";
  import { mutateCurrentUrl } from "$lib/shared/navigation/services/url-state";

  let {
    totalTerms,
    query = $bindable(""),
    showMap = true,
    onBrowseAll,
  }: {
    totalTerms: number;
    query?: string;
    showMap?: boolean;
    onBrowseAll: () => void;
  } = $props();

  let selectedPlaceId = $state("1.1");

  function levelOnePlace(id: string | null): LearnConceptPlace | undefined {
    if (!id) return undefined;
    const place = getConceptPlace(id);
    return place?.tkaLevel === 1 ? place : undefined;
  }

  function selectPlace(conceptPlaceId: string): void {
    selectedPlaceId = conceptPlaceId;
    mutateCurrentUrl((url) => writeConceptPlaceId(url, conceptPlaceId), {
      mode: "push",
    });
  }

  function startLesson(lesson: LearnConcept, conceptPlaceId: string): void {
    const url = new URL(buildConceptPath(lesson.id), window.location.origin);
    writeConceptPlaceId(url, conceptPlaceId);
    window.location.assign(`${url.pathname}${url.search}`);
  }

  onMount(() => {
    const syncPlaceFromUrl = (): void => {
      const routePlaceId = readConceptPlaceId(
        new URLSearchParams(window.location.search)
      );
      const routePlace = levelOnePlace(routePlaceId);
      selectedPlaceId = routePlace?.id ?? "1.1";
    };

    syncPlaceFromUrl();
    window.addEventListener("popstate", syncPlaceFromUrl);
    return () => window.removeEventListener("popstate", syncPlaceFromUrl);
  });
</script>

<section class="atlas-overview" aria-labelledby="kinetic-atlas-title">
  <header class="atlas-hero">
    <div class="atlas-intro">
      <span class="atlas-kicker">One visual knowledge system</span>
      <h1 id="kinetic-atlas-title">The Kinetic Atlas</h1>
      <p>
        Explore how space, motion, letters, notation, patterns, and technique
        connect. Definitions stay underneath the experience instead of becoming
        the experience.
      </p>
    </div>

    <div class="atlas-search">
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      <input
        data-glossary-search
        name="atlas-search"
        type="search"
        placeholder="Find a letter, motion, placement, or pattern"
        aria-label="Find anything in the Kinetic Atlas"
        autocomplete="off"
        bind:value={query}
      />
      {#if query.trim()}
        <button
          type="button"
          class="atlas-search-clear"
          aria-label="Clear Atlas search"
          onclick={() => (query = "")}
        >
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      {/if}
      <span class="atlas-search-hint"
        >Press <kbd>/</kbd> to search {totalTerms} terms</span
      >
    </div>
  </header>

  {#if showMap}
    <div class="level-map-host">
      <ConceptLevelMap
        selectedId={selectedPlaceId}
        onSelect={selectPlace}
        onLessonStart={startLesson}
      />

      <button type="button" class="all-terms" onclick={onBrowseAll}>
        Browse all {totalTerms} terms
      </button>
    </div>
  {/if}
</section>

<style>
  .atlas-overview {
    container-type: inline-size;
    padding-top: 1rem;
  }

  .atlas-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(20rem, 0.75fr);
    align-items: end;
    gap: clamp(2rem, 4cqi, 5rem);
    margin-bottom: clamp(1.75rem, 3cqi, 3rem);
  }

  .atlas-kicker {
    display: block;
    color: color-mix(in oklch, var(--theme-accent) 78%, var(--theme-text));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 760;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .atlas-intro h1 {
    margin: 0.4rem 0 0.65rem;
    color: var(--theme-text);
    font-family: var(--page-title-font, "Fraunces", Georgia, serif);
    font-size: clamp(3rem, 2.35rem + 2.1cqi, 5rem);
    font-style: italic;
    font-variation-settings:
      "opsz" 144,
      "wght" 700,
      "SOFT" 0,
      "WONK" 1;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
  }

  .atlas-intro p {
    margin: 0;
    color: var(--theme-text-secondary, var(--theme-text-dim));
    font-size: clamp(1rem, 0.94rem + 0.2cqi, 1.18rem);
    line-height: 1.65;
    text-wrap: pretty;
  }

  .atlas-search {
    position: relative;
    align-self: end;
    padding-bottom: 1.45rem;
  }

  .atlas-search > i {
    position: absolute;
    top: 1rem;
    left: 1rem;
    color: var(--theme-text-secondary, var(--theme-text-dim));
    pointer-events: none;
  }

  .atlas-search input {
    width: 100%;
    min-height: 52px;
    padding: 0.7rem 3rem;
    color: var(--theme-text);
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke));
    border-radius: 999px;
    box-shadow: 0 14px 36px oklch(0.05 0.03 275 / 0.24);
    font: inherit;
    font-size: 1rem;
    outline: none;
    transition:
      border-color var(--duration-normal) ease,
      box-shadow var(--duration-normal) ease;
  }

  .atlas-search input::placeholder {
    color: color-mix(
      in oklch,
      var(--theme-text-secondary, var(--theme-text-dim)) 70%,
      transparent
    );
  }

  .atlas-search input:focus-visible {
    border-color: var(--theme-accent);
    box-shadow:
      0 0 0 3px color-mix(in oklch, var(--theme-accent) 25%, transparent),
      0 14px 36px oklch(0.05 0.03 275 / 0.24);
  }

  .atlas-search input::-webkit-search-cancel-button {
    appearance: none;
  }

  .atlas-search-clear {
    all: unset;
    box-sizing: border-box;
    position: absolute;
    top: 0.25rem;
    right: 0;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    color: var(--theme-text-secondary, var(--theme-text-dim));
    cursor: pointer;
  }

  .atlas-search-clear:focus-visible,
  .all-terms:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .atlas-search-hint {
    position: absolute;
    right: 1rem;
    bottom: 0;
    color: var(--theme-text-secondary, var(--theme-text-dim));
    font-size: var(--font-size-compact, 0.75rem);
  }

  kbd {
    color: var(--theme-text);
    font: inherit;
  }

  .level-map-host {
    display: grid;
    gap: 0.75rem;
  }

  .all-terms {
    justify-self: end;
    width: fit-content;
    min-height: var(--min-touch-target, 44px);
    padding: 0.7rem 1rem;
    color: var(--theme-text);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    cursor: pointer;
    transition:
      background-color var(--duration-normal) ease,
      border-color var(--duration-normal) ease;
  }

  .all-terms:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong, var(--theme-stroke));
  }

  @container (max-width: 58rem) {
    .atlas-hero {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }

    .atlas-search {
      padding-bottom: 1.35rem;
    }
  }

  @container (max-width: 34rem) {
    .atlas-overview {
      padding-top: 0;
    }

    .atlas-intro h1 {
      font-size: clamp(2.35rem, 12cqi, 3.35rem);
    }

    .atlas-intro p {
      font-size: var(--font-size-min, 0.875rem);
      line-height: 1.55;
    }

    .atlas-search-hint {
      right: 0.25rem;
    }

    .all-terms {
      justify-self: stretch;
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .atlas-search input,
    .all-terms {
      transition: none;
    }
  }
</style>
