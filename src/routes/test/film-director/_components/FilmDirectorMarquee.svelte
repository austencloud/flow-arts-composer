<!--
  The front door: every capability the director can do, as a list you read.

  It used to be a shelf of nine film posters. A film is a bad index — finding
  out whether the camera can leave the tripod meant knowing which film, then
  which scene, then waiting through the ones in front of it. The films are gone.
  What is left is the thing they were evidence for: one row per capability, a
  name, a line, and a click that plays it.

  No 3D mounts here, so the whole list is on screen while the stage is cold.
-->
<script lang="ts">
  import FilmCollectionModule from "#lib/features/film-collection/FilmCollectionModule.svelte";
  import type { CollectedFilm } from "#lib/features/film-collection/domain/film-collection-types.js";
  import { CAPABILITY_LIBRARY } from "../_capabilities/index";
  import {
    DIRECTOR_SCENE_CATEGORIES,
    DIRECTOR_SCENE_CATEGORY_LABELS,
  } from "../_lib/film-director-schema";

  let {
    onOpenCapability,
    onOpenSavedFilm,
  }: {
    onOpenCapability: (id: string) => void;
    onOpenSavedFilm: (entry: CollectedFilm) => void;
  } = $props();

  // Declared category order, empty groups dropped. Static: the library is a
  // module constant, so this is computed once rather than per render.
  const groups = DIRECTOR_SCENE_CATEGORIES.map((category) => ({
    category,
    label: DIRECTOR_SCENE_CATEGORY_LABELS[category],
    demos: CAPABILITY_LIBRARY.filter((demo) => demo.category === category),
  })).filter((group) => group.demos.length > 0);
</script>

<main class="marquee" data-film-director-marquee>
  <header>
    <span class="kicker">Director</span>
    <h1>Capabilities</h1>
    <p>
      {CAPABILITY_LIBRARY.length} things the director can do, one demo each. Pick
      one and it plays on its own, looping.
    </p>
  </header>

  <section aria-labelledby="capability-list">
    <h2 id="capability-list" class="visually-hidden">Capabilities</h2>
    {#each groups as group (group.category)}
      <h3 class="group">
        <span>{group.label}</span>
        <span class="count">{group.demos.length}</span>
      </h3>
      <ul>
        {#each group.demos as capability (capability.id)}
          <li>
            <button
              type="button"
              onclick={() => onOpenCapability(capability.id)}
            >
              <strong>{capability.label}</strong>
              <span>{capability.demonstrates}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/each}
  </section>

  <!-- No heading here: the module carries its own "Saved films" header. -->
  <FilmCollectionModule onopen={onOpenSavedFilm} />
</main>

<style>
  /* The route pins `body { overflow: hidden }` for the stage, so the marquee
     owns its own scroll rather than growing a clipped page. Grid rather than
     flow: the saved-films shelf is another component's root, which scoped CSS
     cannot reach with a sibling margin. */
  .marquee {
    position: fixed;
    inset: 0;
    display: grid;
    justify-items: center;
    /* safe center: with an empty shelf the list is shorter than a 4K viewport,
       and pinning it to the top dead-ends the page a third of the way down.
       Once it fills past the viewport, `safe` falls back to start so the top
       stays reachable. */
    align-content: safe center;
    row-gap: clamp(1.75rem, 3vw, 2.75rem);
    padding: clamp(1.5rem, 4vw, 3rem) 0 clamp(3rem, 8vw, 6rem);
    overflow-y: auto;
    color: var(--theme-text, #fff);
    background: #070812;
  }

  .marquee > :global(*) {
    width: var(--shell-w, min(1720px, 92vw));
  }

  .kicker {
    color: var(--theme-accent, #b0a4ff);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0.25rem 0 0;
    font-size: clamp(1.9rem, 4vw, 3rem);
    line-height: 1.1;
  }

  header p {
    max-width: 46ch;
    margin: 0.5rem 0 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-min, 0.875rem);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Baseline-aligned count and a rule filling the rest of the row: enough to
     read as a divider without a heavier weight. */
  .group {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin: 0 0 0.55rem;
    color: var(--theme-accent, #b0a4ff);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .group + ul {
    margin-bottom: 1.4rem;
  }

  .group .count {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-variant-numeric: tabular-nums;
  }

  .group::after {
    flex: 1 1 auto;
    height: 1px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.14));
    content: "";
  }

  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The whole tile carries state: a full perimeter and a wash, never a strip
     down one edge. */
  button {
    display: grid;
    width: 100%;
    height: 100%;
    align-content: start;
    gap: 0.2rem;
    padding: 0.7rem 0.85rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0.75rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--transition-fast, 120ms) ease,
      background-color var(--transition-fast, 120ms) ease;
  }

  button:hover {
    border-color: var(--theme-accent, #9d8cff);
    background: color-mix(
      in srgb,
      var(--theme-accent, #7869eb) 14%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.05))
    );
  }

  button:focus-visible {
    outline: 3px solid var(--theme-accent, #9d8cff);
    outline-offset: 2px;
  }

  strong {
    font-size: 1rem;
    font-weight: 750;
    line-height: 1.3;
  }

  button span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.4;
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
