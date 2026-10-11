<!--
  FilmCollectionModule — the shelf of saved films.

  Spec: docs/superpowers/specs/active/2026-08-24-film-collection-design.md
-->
<script lang="ts">
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

  import type { CollectedFilm } from "./domain/film-collection-types";
  import { openSavedFilm } from "./services/open-film";
  import { filmCollectionState } from "./state/film-collection-state.svelte";

  let {
    onopen,
    emptyHint = "Films you save from the director show up here.",
  }: {
    onopen?: (film: CollectedFilm) => void;
    emptyHint?: string;
  } = $props();

  // The Library mounts this shelf with no props, so opening has to work without
  // a host supplying it. A host already on the Director (the marquee) passes
  // `onopen` and swaps the stage in place rather than navigating to itself.
  function openFilm(film: CollectedFilm): void {
    if (onopen) {
      onopen(film);
      return;
    }
    void openSavedFilm(film);
  }

  const films = $derived(filmCollectionState.collection);
  const loading = $derived(filmCollectionState.loading);
  const readOnly = $derived(filmCollectionState.isReadOnlyPreview);

  let renamingId = $state<string | null>(null);
  let draftName = $state("");
  let pendingDeleteId = $state<string | null>(null);

  function formatDuration(seconds: number): string {
    const whole = Math.round(seconds);
    const minutes = Math.floor(whole / 60);
    const rest = whole % 60;
    return minutes > 0 ? `${minutes}:${String(rest).padStart(2, "0")}` : `${rest}s`;
  }

  function startRename(film: CollectedFilm): void {
    renamingId = film.id;
    draftName = film.name;
  }

  async function commitRename(): Promise<void> {
    const id = renamingId;
    if (!id) return;
    renamingId = null;
    const trimmed = draftName.trim();
    if (!trimmed) return;
    try {
      await filmCollectionState.rename(id, trimmed);
    } catch (error) {
      console.warn("[FilmCollection] Rename failed:", error);
      toast.error("Couldn't rename the film");
    }
  }

  async function confirmDelete(film: CollectedFilm): Promise<void> {
    if (pendingDeleteId !== film.id) {
      pendingDeleteId = film.id;
      return;
    }
    pendingDeleteId = null;
    try {
      await filmCollectionState.remove(film.id);
      toast.success("Film deleted");
    } catch (error) {
      console.warn("[FilmCollection] Delete failed:", error);
      toast.error("Couldn't delete the film");
    }
  }
</script>

<section class="film-collection" aria-label="Saved films">
  <header class="shelf-head">
    <h2>Saved films</h2>
    <span class="count" aria-live="polite">
      {loading ? "Loading…" : `${films.length}`}
    </span>
  </header>

  {#if loading && films.length === 0}
    <ul class="grid" aria-hidden="true">
      {#each Array.from({ length: 4 }) as _, index (index)}
        <li class="tile skeleton">
          <div class="poster"></div>
          <div class="tile-body">
            <span class="skeleton-line"></span>
            <span class="skeleton-line short"></span>
          </div>
        </li>
      {/each}
    </ul>
  {:else if films.length === 0}
    <p class="empty">{emptyHint}</p>
  {:else}
    <ul class="grid">
      {#each films as film (film.id)}
        <li class="tile">
          <button
            class="poster-button"
            type="button"
            onclick={() => openFilm(film)}
            aria-label={`Open ${film.name}`}
          >
            <span class="poster">
              {#if film.poster}
                <img src={film.poster} alt="" aria-hidden="true" loading="lazy" />
              {:else}
                <span class="poster-empty" aria-hidden="true">
                  <i class="fas fa-film"></i>
                </span>
              {/if}
            </span>
          </button>

          <div class="tile-body">
            {#if renamingId === film.id}
              <input
                class="rename-input"
                type="text"
                bind:value={draftName}
                onblur={commitRename}
                onkeydown={(event) => {
                  if (event.key === "Enter") commitRename();
                  if (event.key === "Escape") renamingId = null;
                }}
                aria-label={`Rename ${film.name}`}
                maxlength="80"
              />
            {:else}
              <span class="tile-name" title={film.name}>{film.name}</span>
            {/if}

            <span class="tile-meta">
              <span>{film.sceneCount === 1 ? "1 scene" : `${film.sceneCount} scenes`}</span>
              <span aria-hidden="true">·</span>
              <span>{formatDuration(film.durationSeconds)}</span>
            </span>
          </div>

          {#if !readOnly}
            <div class="tile-actions">
              <button
                type="button"
                onclick={() => startRename(film)}
                aria-label={`Rename ${film.name}`}
                title="Rename"
              >
                <i class="fas fa-pen" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                class:armed={pendingDeleteId === film.id}
                onclick={() => confirmDelete(film)}
                aria-label={pendingDeleteId === film.id
                  ? `Confirm delete ${film.name}`
                  : `Delete ${film.name}`}
                title={pendingDeleteId === film.id ? "Click again to delete" : "Delete"}
              >
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .film-collection {
    display: grid;
    gap: 0.85rem;
    container-type: inline-size;
  }

  .shelf-head {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .count {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 0.8rem);
    font-variant-numeric: tabular-nums;
  }

  .empty {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 0.85rem);
  }

  /* The film count is user-driven, so columns come from auto-fill — but the
     FLOOR steps up per container tier. A single floor would answer a wider host
     with more, thinner posters instead of bigger ones. Matches the sibling art
     galleries (Scene3DCollectionModule), which face the same open-ended count.
     Tiers are container-relative because this shelf has two very different
     hosts: the director's marquee and the Library's detail pane. */
  .grid {
    display: grid;
    /* auto-FIT, not auto-fill: a five-film shelf on a 3300px pane would
       otherwise leave three empty tracks of dead rail on the right. The upper
       bound is what keeps auto-fit honest in the other direction — without it,
       one saved film becomes a pane-wide billboard. */
    grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
    justify-content: start;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @container (min-width: 34rem) {
    .grid {
      /* No upper bound yet: only two or three columns fit at this size, so a
         cap would strand a column's worth of rail instead of a billboard. */
      grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
      gap: 1rem;
    }
  }

  @container (min-width: 64rem) {
    .grid {
      grid-template-columns: repeat(auto-fit, minmax(19rem, 24rem));
      gap: 1.25rem;
    }
  }

  @container (min-width: 100rem) {
    .grid {
      grid-template-columns: repeat(auto-fit, minmax(23rem, 34rem));
      gap: 1.5rem;
    }
  }

  .tile {
    position: relative;
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }

  .poster-button {
    display: block;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
  }

  .poster {
    position: relative;
    display: block;
    overflow: hidden;
    /* Reserved box: posters decode async and would reflow the grid one by one. */
    aspect-ratio: 16 / 9;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0.6rem;
    background: #0a0b14;
    transition: border-color 140ms ease;
  }

  .poster-button:hover .poster,
  .poster-button:focus-visible .poster {
    border-color: var(--theme-accent, #9d8cff);
  }

  .poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .poster-empty {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .tile-body {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  .tile-name {
    overflow: hidden;
    color: var(--theme-text, #fff);
    /* Not --font-size-compact: that resolves to 12px, and the film's name is
       the tile's essential text, not metadata. */
    font-size: 0.9rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile-meta {
    display: flex;
    gap: 0.3rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }

  .rename-input {
    min-width: 0;
    min-height: 2.25rem;
    padding: 0 0.5rem;
    border: 1px solid var(--theme-accent, #9d8cff);
    border-radius: 0.4rem;
    color: var(--theme-text, #fff);
    background: var(--theme-panel-bg, #10111b);
    font: inherit;
    /* Matches .tile-name, which it replaces in place. */
    font-size: 0.9rem;
  }

  .tile-actions {
    position: absolute;
    top: 0.35rem;
    right: 0.35rem;
    display: flex;
    gap: 0.25rem;
    opacity: 0;
    transition: opacity 140ms ease;
  }

  .tile:hover .tile-actions,
  .tile:focus-within .tile-actions {
    opacity: 1;
  }

  .tile-actions button {
    display: inline-flex;
    width: 2rem;
    height: 2rem;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.18));
    border-radius: 0.4rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.85));
    background: color-mix(in srgb, #0a0b14 82%, transparent);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .tile-actions button:hover {
    color: var(--theme-text, #fff);
    border-color: var(--theme-accent, #9d8cff);
  }

  .tile-actions button.armed {
    color: #10111b;
    border-color: var(--semantic-danger, #ff6b6b);
    background: var(--semantic-danger, #ff6b6b);
  }

  /* Touch has no hover, so the actions must always be reachable there. */
  @media (hover: none) {
    .tile-actions {
      opacity: 1;
    }
  }

  .skeleton .poster,
  .skeleton-line {
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.06),
      rgba(255, 255, 255, 0.12),
      rgba(255, 255, 255, 0.06)
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }

  .skeleton-line {
    height: 0.85rem;
    border-radius: 0.25rem;
  }

  .skeleton-line.short {
    width: 55%;
    height: 0.7rem;
  }

  @keyframes shimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton .poster,
    .skeleton-line {
      animation: none;
    }

    .poster,
    .tile-actions {
      transition: none;
    }
  }
</style>
