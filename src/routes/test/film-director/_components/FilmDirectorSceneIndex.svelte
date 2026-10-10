<!--
  FilmDirectorSceneIndex — pick one scene out of a multi-scene film and loop it.

  A capability demo is one scene, so the workbench hides the button that opens
  this entirely. What is left needing it: a demo that has to establish something
  first (the tempo change needs a slow count to change away from), and a saved
  film the user cut themselves. Both are short lists of titles.

  Scenes here carry no written intent and no category — that vocabulary moved to
  the capability library, which is a better index than a film ever was. So this
  is a list of titles and durations, not a card grid.
-->
<script lang="ts">
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";

  import { getFilmDirectorContext } from "../_lib/film-director-context";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  const director = getFilmDirectorContext();

  function soloScene(index: number): void {
    director.setSoloScene(index);
    director.play();
    open = false;
  }

  function playWholeFilm(): void {
    director.setSoloScene(null);
    director.seek(0);
    director.play();
    open = false;
  }
</script>

<BaseModal bind:open size="md" labelledBy="scene-index-title">
  {#snippet header()}
    <div class="index-header">
      <div>
        <span class="kicker">{director.film.title}</span>
        <h2 id="scene-index-title">
          {director.film.scenes.length}
          {director.film.scenes.length === 1 ? "scene" : "scenes"}
        </h2>
      </div>
      <button type="button" class="index-close" onclick={() => (open = false)}>
        <i class="fas fa-xmark" aria-hidden="true"></i>
        Close
      </button>
    </div>
  {/snippet}

  <div class="index-body">
    {#if director.soloSceneIndex !== null}
      <button type="button" class="release-solo" onclick={playWholeFilm}>
        <i class="fas fa-list-ol" aria-hidden="true"></i>
        <span>Playing one scene on a loop. Play from the top instead.</span>
      </button>
    {/if}

    <ul>
      {#each director.film.scenes as scene, index (scene.id)}
        <li>
          <button
            type="button"
            class:soloed={index === director.soloSceneIndex}
            aria-current={index === director.frame.sceneIndex
              ? "true"
              : undefined}
            onclick={() => soloScene(index)}
          >
            <span class="ordinal">{index + 1}</span>
            <span class="title">{scene.title}</span>
            <span class="seconds">{scene.durationSeconds}s</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>
</BaseModal>

<style>
  .index-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.15rem 1.25rem 0.9rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
  }

  .kicker {
    color: var(--theme-accent, #b0a4ff);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0.15rem 0 0;
    font-size: 1.3rem;
  }

  .index-close {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.9rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.16));
    border-radius: 0.7rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 750;
    white-space: nowrap;
    cursor: pointer;
  }

  .index-close:hover {
    border-color: var(--theme-accent, #9d8cff);
  }

  .index-close:focus-visible,
  .release-solo:focus-visible,
  li button:focus-visible {
    outline: 3px solid var(--theme-accent, #9d8cff);
    outline-offset: 2px;
  }

  .index-body {
    padding: 0.9rem 1.25rem 1.25rem;
  }

  .release-solo {
    display: flex;
    width: 100%;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.65rem;
    margin-bottom: 0.75rem;
    padding: 0.6rem 0.9rem;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #9d8cff) 55%, transparent);
    border-radius: 0.7rem;
    color: var(--theme-text, #fff);
    background: color-mix(
      in srgb,
      var(--theme-accent, #7869eb) 20%,
      transparent
    );
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    text-align: left;
    cursor: pointer;
  }

  .release-solo:hover {
    border-color: var(--theme-accent, #9d8cff);
  }

  .release-solo i {
    flex: 0 0 auto;
    color: var(--theme-accent, #b0a4ff);
  }

  ul {
    display: grid;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li button {
    display: flex;
    width: 100%;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.85rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0.7rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  li button:hover {
    border-color: var(--theme-accent, #9d8cff);
  }

  /* Full perimeter and a wash, never a strip down one edge. */
  li button.soloed {
    border-color: var(--theme-accent, #9d8cff);
    background: color-mix(
      in srgb,
      var(--theme-accent, #7869eb) 22%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.05))
    );
  }

  .ordinal {
    flex: 0 0 1.6rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-size: var(--font-size-min, 0.875rem);
    font-variant-numeric: tabular-nums;
  }

  .title {
    flex: 1 1 auto;
    font-weight: 700;
  }

  .seconds {
    flex: 0 0 auto;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 0.875rem);
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 34rem) {
    .index-header {
      padding: 0.9rem 1rem 0.75rem;
    }

    .index-body {
      padding: 0.75rem 1rem 1rem;
    }
  }
</style>
