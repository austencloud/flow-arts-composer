<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import { goto } from "$app/navigation";
  import SaveFilmModal from "#lib/features/film-collection/components/SaveFilmModal.svelte";
  import type {
    CollectedFilm,
    StoredFilmDocument,
  } from "#lib/features/film-collection/domain/film-collection-types.js";
  import { captureFilmPoster } from "#lib/features/film-collection/services/capture-film-poster.js";
  import { filmCollectionState } from "#lib/features/film-collection/state/film-collection-state.svelte.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import { setFilmDirectorContext } from "../_lib/film-director-context";
  import { createFilmDirectorState } from "../_lib/film-director-state.svelte";
  import type { FilmDirectorInput } from "../_lib/film-director-schema";
  import {
    filmOriginIsSaved,
    filmOriginUrlKey,
    type FilmOrigin,
  } from "../_lib/film-origin";
  import FilmDirectorChannelEditor from "./FilmDirectorChannelEditor.svelte";
  import FilmDirectorFilmPanel from "./FilmDirectorFilmPanel.svelte";
  import FilmDirectorJsonEditor from "./FilmDirectorJsonEditor.svelte";
  import FilmDirectorScene from "./FilmDirectorScene.svelte";
  import FilmDirectorSceneIndex from "./FilmDirectorSceneIndex.svelte";
  import FilmDirectorTransport from "./FilmDirectorTransport.svelte";

  let {
    film,
    initialOrigin,
    initialSceneId = null,
    onExit,
  }: {
    film: FilmDirectorInput;
    initialOrigin: FilmOrigin;
    /**
     * A scene to open soloed, from `?scene=` in the address bar. Every
     * capability the film demonstrates gets a link that lands on it directly,
     * so showing one costs opening a URL rather than watching to its mark.
     */
    initialSceneId?: string | null;
    /** Back to the marquee. The route owns which surface is showing. */
    onExit: () => void;
  } = $props();

  // The soloed scene is handed to the state at construction, not from onMount:
  // the scene component is a child, and its warmup plan is read during its own
  // first render, well before a parent mount handler could narrow it.
  const director = createFilmDirectorState(film, {
    soloSceneId: initialSceneId,
  });
  setFilmDirectorContext(director);

  // The scene's performer bar pins itself to the stage's top-left corner,
  // which is exactly where the back-to-Films button sits. Publish how far in
  // the button reaches so the bar can start clear of it rather than render
  // underneath — same arrangement the transport uses for the rail below.
  let workbenchEl = $state<HTMLElement | null>(null);
  let exitButtonEl = $state<HTMLElement | null>(null);
  let exitButtonWidth = $state(0);
  $effect(() => {
    void exitButtonWidth;
    if (!workbenchEl || !exitButtonEl) return;
    workbenchEl.style.setProperty(
      "--director-exit-reserve",
      `${exitButtonEl.offsetLeft + exitButtonEl.offsetWidth}px`
    );
  });

  const multiScene = $derived(director.film.scenes.length > 1);

  // True whenever exactly one scene is being warmed: a capability demo, which
  // only has one, or a soloed boot inside a longer film.
  const oneSceneWarming = $derived(
    director.warmupSceneIndex !== null || director.preparation.totalScenes <= 1
  );

  let origin = $state<FilmOrigin>(initialOrigin);
  let saveOpen = $state(false);
  let sceneIndexOpen = $state(false);
  let channelsOpen = $state(false);
  let poster = $state("");

  // Takes the origin rather than a bare key so the URL can never disagree with
  // what Save will do. The soloed scene rides along in the same write: two
  // separate shallow `goto` calls would race, and the second would drop whatever
  // the first had just put in the address bar.
  function syncFilmToUrl(next: FilmOrigin): void {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("film", filmOriginUrlKey(next));
    const soloed =
      director.soloSceneIndex === null
        ? null
        : (director.film.scenes[director.soloSceneIndex]?.id ?? null);
    if (soloed) url.searchParams.set("scene", soloed);
    else url.searchParams.delete("scene");
    goto(url, { shallow: true, replace: true });
  }

  // Solo is reachable from the index, the timeline, and the exit button, so the
  // URL follows the state rather than each of those call sites remembering to
  // update it.
  $effect(() => {
    void director.soloSceneIndex;
    syncFilmToUrl(origin);
  });

  function openSaveModal(): void {
    // Capture before the modal paints over the canvas, so the poster is the
    // frame the user was actually looking at.
    poster = captureFilmPoster(director.readPosterSource());
    saveOpen = true;
  }

  function handleSaved(id: string): void {
    const entry = filmCollectionState.collection.find((item) => item.id === id);
    origin = { kind: "saved", id, name: entry?.name ?? director.film.title };
    syncFilmToUrl(origin);
  }

  let saveBusy = $state(false);
  const previousVersionAvailable = $derived(
    Boolean(currentEntry()?.previousFilm)
  );

  /**
   * The saved entry the stage is editing, or null when the film has never been
   * saved. Reads `origin` into a const first: TypeScript drops the narrowing
   * from `filmOriginIsSaved` inside a callback that captures a mutable `let`.
   */
  function currentEntry(): CollectedFilm | null {
    const current = origin;
    if (!filmOriginIsSaved(current)) return null;
    return (
      filmCollectionState.collection.find((entry) => entry.id === current.id) ??
      null
    );
  }

  /** The fields an overwrite replaces. Identity — id, name, createdAt — is
   *  exactly what it preserves, so a link to this entry survives an edit. */
  function currentFilmPatch() {
    return {
      film: $state.snapshot(
        director.sourceInput
      ) as unknown as StoredFilmDocument,
      poster: captureFilmPoster(director.readPosterSource()),
      durationSeconds: director.film.durationSeconds,
      sceneCount: director.film.scenes.length,
    };
  }

  async function saveFilm(): Promise<void> {
    const entry = currentEntry();
    if (!entry) {
      openSaveModal();
      return;
    }
    if (saveBusy) return;
    saveBusy = true;
    try {
      // previousFilm is always a real document here. Never pass it as
      // undefined: update() spreads the patch, and Firestore rejects an
      // explicit undefined field.
      await filmCollectionState.update(entry.id, {
        ...currentFilmPatch(),
        previousFilm: $state.snapshot(entry.film),
      });
      toast.success("Film saved");
    } catch (error) {
      console.warn("[Director] Overwrite failed:", error);
      toast.error("Couldn't save the film");
    } finally {
      saveBusy = false;
    }
  }

  async function restorePreviousFilm(): Promise<void> {
    if (saveBusy) return;
    const entry = currentEntry();
    const restored = entry?.previousFilm;
    if (!entry || !restored) return;
    saveBusy = true;
    try {
      // Swap rather than drop, so Restore is itself undoable.
      const document = $state.snapshot(
        restored
      ) as unknown as StoredFilmDocument;
      await filmCollectionState.update(entry.id, {
        film: document,
        previousFilm: $state.snapshot(entry.film),
      });
      director.loadFilm(document as unknown as FilmDirectorInput);
      toast.success("Previous version restored");
    } catch (error) {
      console.warn("[Director] Restore failed:", error);
      toast.error("Couldn't restore that version");
    } finally {
      saveBusy = false;
    }
  }

  // The id of the scene the curtain is warming. Read from the film rather than
  // carried on `preparation`, which describes progress and not identity.
  const preparingSceneId = $derived(
    director.film.scenes[director.preparation.sceneIndex]?.id ?? null
  );

  onMount(() => {
    // A ?scene= that names no scene in this film was already ignored by the
    // state constructor rather than treated as an error: the film still opens,
    // from the top, and the sync below rewrites the address to match.
    // The URL always names what is on screen, including when the address bar
    // arrived bare and the route picked the film.
    syncFilmToUrl(origin);
    // Drive seam for debugging over CDP: seek, solo a scene, read the frame.
    // Dev only.
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__filmDirector = director;
    }
    return director.start();
  });
  onDestroy(() => director.destroy());
</script>

<main
  class="director-workbench"
  data-film-director-workbench
  bind:this={workbenchEl}
>
  <FilmDirectorScene />

  {#if !director.preparation.complete}
    <div class="film-preparation" role="status" aria-live="polite">
      <div class="preparation-card">
        <span class="preparation-kicker">
          {oneSceneWarming ? "Preparing the scene" : "Preparing the film"}
        </span>
        <strong>{director.preparation.sceneTitle}</strong>
        <!-- A capability demo, and a soloed boot inside a longer film, each
             warm exactly one scene, so a position in the film is not what is
             being waited on. Printing "Scene 11 of 23" there describes a
             23-scene load that is not happening; the scene id is both true and
             the address the viewer would type to come back. -->
        <span class="preparation-count">
          {#if oneSceneWarming}
            {preparingSceneId ?? "One scene, on its own"}
          {:else}
            Scene {director.preparation.sceneIndex + 1} of {director.preparation
              .totalScenes}
          {/if}
        </span>
        <!-- One warmup step has no interior to report, and a determinate bar
             pinned at 0% for the length of a scene boot reads as stuck rather
             than as busy. A sweep claims only that work is happening, which is
             all this phase knows. -->
        <div
          class="preparation-track"
          class:indeterminate={director.preparation.totalSteps <= 1}
          aria-hidden="true"
        >
          <span
            style:width={director.preparation.totalSteps <= 1
              ? undefined
              : `${(director.preparation.preparedSteps / director.preparation.totalSteps) * 100}%`}
          ></span>
        </div>
      </div>
    </div>
  {/if}

  <button
    type="button"
    class="exit-button"
    onclick={onExit}
    bind:this={exitButtonEl}
    bind:clientWidth={exitButtonWidth}
  >
    <i class="fas fa-arrow-left" aria-hidden="true"></i>
    Capabilities
  </button>

  {#if director.lastEditError}
    <div class="edit-error" role="alert">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      {director.lastEditError}
    </div>
  {/if}

  <FilmDirectorTransport>
    {#snippet trailing()}
      <div class="transport-actions">
        {#if director.soloSceneIndex !== null}
          <!-- Leaving solo is a one-click move out of the loop and back into the
               film, so it does not hide behind the index it was entered from.
               growFade on x so the row widens into it rather than snapping. -->
          <button
            type="button"
            class="solo-exit"
            aria-label="Exit solo and play the whole film"
            transition:growFade={{ axis: "x" }}
            onclick={() => director.setSoloScene(null)}
          >
            <i class="fas fa-repeat" aria-hidden="true"></i>
            <span>Exit solo</span>
          </button>
        {/if}

        <!-- The dock is a peer of the transport rather than a popover, because
             it is a work surface: it stays up while the film plays and while
             the rig answers a drag. -->
        <button
          type="button"
          class="scenes-button"
          class:soloing={channelsOpen}
          aria-label="Camera channels"
          aria-pressed={channelsOpen}
          onclick={() => (channelsOpen = !channelsOpen)}
        >
          <i class="fas fa-sliders" aria-hidden="true"></i>
          <span>Channels</span>
        </button>

        <!-- A one-scene demo has nothing to pick between, so the control that
             picks does not appear at all. -->
        {#if multiScene}
          <button
            type="button"
            class="scenes-button"
            class:soloing={director.soloSceneIndex !== null}
            aria-label="Scenes"
            aria-haspopup="dialog"
            aria-expanded={sceneIndexOpen}
            onclick={() => (sceneIndexOpen = true)}
          >
            <i class="fas fa-list-ol" aria-hidden="true"></i>
            <span>Scenes</span>
          </button>
        {/if}

        <FilmDirectorFilmPanel
          {origin}
          hasPreviousVersion={previousVersionAvailable}
          busy={saveBusy}
          onSave={saveFilm}
          onSaveAsNew={openSaveModal}
          onRestore={restorePreviousFilm}
        />
      </div>
    {/snippet}
  </FilmDirectorTransport>
  <FilmDirectorChannelEditor bind:open={channelsOpen} />
  <FilmDirectorJsonEditor />
  {#if multiScene}
    <FilmDirectorSceneIndex bind:open={sceneIndexOpen} />
  {/if}
</main>

<SaveFilmModal
  bind:open={saveOpen}
  film={director.sourceInput}
  {poster}
  durationSeconds={director.film.durationSeconds}
  sceneCount={director.film.scenes.length}
  onsaved={handleSaved}
/>

<style>
  @media (min-width: 1680px) {
    :global(html:has([data-film-director-workbench])) {
      font-size: clamp(1rem, 0.61rem + 0.37vw, 1.5rem);
    }
  }

  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #070812;
  }

  .director-workbench {
    position: fixed;
    inset: 0;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    color: var(--theme-text, #fff);
    background: #070812;
    container-type: size;
  }

  .film-preparation {
    position: absolute;
    inset: 0;
    z-index: 90;
    display: grid;
    place-items: center;
    padding: 1rem;
    background:
      radial-gradient(
        circle at 50% 42%,
        rgba(157, 140, 255, 0.12),
        transparent 34rem
      ),
      #070812;
  }

  .preparation-card {
    display: grid;
    width: min(28rem, calc(100vw - 2rem));
    gap: 0.55rem;
    padding: 1.2rem 1.3rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 1rem;
    background: var(--theme-panel-bg, #10111b);
    box-shadow: 0 1.5rem 5rem rgba(0, 0, 0, 0.45);
  }

  .preparation-kicker {
    color: var(--theme-accent, #b0a4ff);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .preparation-card strong {
    font-size: clamp(1.1rem, 3cqi, 1.45rem);
  }

  .preparation-count {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
  }

  .preparation-track {
    height: 0.3rem;
    margin-top: 0.35rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
  }

  .preparation-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--theme-accent, #9d8cff);
    transition: width 180ms ease-out;
  }

  .preparation-track.indeterminate span {
    width: 40%;
    transition: none;
    animation: preparation-sweep 1.25s ease-in-out infinite;
  }

  @keyframes preparation-sweep {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(250%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .preparation-track span {
      transition: none;
    }

    /* No sweep, but the bar still has to read as "working" rather than as a
       stalled 0%. A steady partial fill says that without motion. */
    .preparation-track.indeterminate span {
      width: 100%;
      opacity: 0.45;
      animation: none;
    }
  }

  /* Two controls in the transport's trailing cell. Grouping them here rather
     than adding a fifth grid column keeps the transport's own template, which
     the compact layout below 60rem re-flows as a whole. */
  .transport-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .scenes-button {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0 0.9rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0.7rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 750;
    white-space: nowrap;
    cursor: pointer;
  }

  .scenes-button:hover {
    border-color: var(--theme-accent, #9d8cff);
  }

  .scenes-button:focus-visible {
    outline: 3px solid var(--theme-accent, #9d8cff);
    outline-offset: 2px;
  }

  .scenes-button.soloing {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #9d8cff) 70%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #7869eb) 26%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.08))
    );
  }

  .solo-exit {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0 0.9rem;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #9d8cff) 60%, transparent);
    border-radius: 0.7rem;
    color: var(--theme-text, #fff);
    background: color-mix(
      in srgb,
      var(--theme-accent, #7869eb) 26%,
      transparent
    );
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 750;
    white-space: nowrap;
    cursor: pointer;
  }

  .solo-exit:hover {
    border-color: var(--theme-accent, #9d8cff);
  }

  .solo-exit:focus-visible {
    outline: 3px solid var(--theme-accent, #9d8cff);
    outline-offset: 2px;
  }

  /* Narrow transports drop the words from both trailing controls; the icons
     carry them, and each keeps its accessible name. */
  @media (max-width: 34rem) {
    .scenes-button span,
    .solo-exit span {
      display: none;
    }
  }

  .exit-button {
    position: absolute;
    top: max(0.85rem, env(safe-area-inset-top));
    left: max(0.85rem, env(safe-area-inset-left));
    z-index: 65;
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.9rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0.7rem;
    color: var(--theme-text, #fff);
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #10111b) 88%,
      transparent
    );
    box-shadow: 0 0.8rem 2.5rem rgba(0, 0, 0, 0.3);
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 750;
    cursor: pointer;
  }

  .exit-button:hover {
    border-color: var(--theme-accent, #9d8cff);
  }

  .exit-button:focus-visible {
    outline: 3px solid var(--theme-accent, #9d8cff);
    outline-offset: 2px;
  }

  /* Below the exit button and clear of the right rail: the top band holds one
     control now, so the message needs no breakpoint to find room. It is the
     highest-priority thing on screen while it is up, and it clears on the next
     accepted edit. */
  .edit-error {
    position: absolute;
    top: calc(max(0.85rem, env(safe-area-inset-top)) + 3.6rem);
    right: max(4.75rem, calc(env(safe-area-inset-right) + 4.75rem));
    left: max(0.85rem, env(safe-area-inset-left));
    z-index: 72;
    display: flex;
    gap: 0.55rem;
    align-items: center;
    padding: 0.65rem 0.9rem;
    border: 1px solid
      color-mix(in srgb, var(--semantic-danger, #ff6b6b) 55%, transparent);
    border-radius: 0.7rem;
    color: var(--theme-text, #fff);
    background: color-mix(
      in srgb,
      var(--semantic-danger, #ff6b6b) 22%,
      var(--theme-panel-bg, #10111b)
    );
    box-shadow: 0 0.75rem 2rem rgba(0, 0, 0, 0.42);
    font-size: var(--font-size-min, 0.875rem);
  }

  .edit-error i {
    color: var(--semantic-danger, #ff6b6b);
  }

  @media (min-width: 64rem) {
    .edit-error {
      max-width: 34rem;
    }
  }
</style>
