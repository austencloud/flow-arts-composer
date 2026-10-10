<!--
  SaveFilmModal — name it, check the poster, save.

  Spec: docs/superpowers/specs/active/2026-08-24-film-collection-design.md
-->
<script lang="ts">
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

  import type { StoredFilmDocument } from "../domain/film-collection-types";
  import { filmCollectionState } from "../state/film-collection-state.svelte";

  let {
    open = $bindable(false),
    film,
    poster = "",
    durationSeconds,
    sceneCount,
    onsaved,
  }: {
    open?: boolean;
    /** The authored document, exactly as it will be stored. */
    film: StoredFilmDocument;
    /** Captured by the caller at the frame the user scrubbed to. */
    poster?: string;
    durationSeconds: number;
    sceneCount: number;
    onsaved?: (id: string) => void;
  } = $props();

  let saving = $state(false);
  let name = $state("");

  // Reset per open so a reopened modal never shows the previous film's name.
  $effect(() => {
    if (!open) return;
    name = film.title;
  });

  const sceneLabel = $derived(sceneCount === 1 ? "1 scene" : `${sceneCount} scenes`);
  const durationLabel = $derived(formatDuration(durationSeconds));

  function formatDuration(seconds: number): string {
    const whole = Math.round(seconds);
    const minutes = Math.floor(whole / 60);
    const rest = whole % 60;
    return minutes > 0 ? `${minutes}:${String(rest).padStart(2, "0")}` : `${rest}s`;
  }

  function closeModal(): void {
    if (saving) return;
    open = false;
  }

  async function save(): Promise<void> {
    if (saving) return;
    saving = true;
    try {
      const saved = await filmCollectionState.add({
        name: name.trim() || film.title,
        poster,
        film,
        durationSeconds,
        sceneCount,
      });
      toast.success("Film saved to your collection");
      onsaved?.(saved.id);
      open = false;
    } catch (error) {
      console.warn("[FilmCollection] Save failed:", error);
      toast.error("Couldn't save the film — try again");
    } finally {
      saving = false;
    }
  }
</script>

<BaseModal
  bind:open
  size="fit"
  class="save-film-modal"
  labelledBy="save-film-title"
  closeOnBackdrop={!saving}
  closeOnEscape={!saving}
>
  <div class="save-film">
    <header class="head">
      <h2 id="save-film-title">Save film</h2>
      <button
        class="close-button"
        type="button"
        aria-label="Close Save film"
        title="Close"
        onclick={closeModal}
        disabled={saving}
      >
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    </header>

    <div class="poster-frame">
      {#if poster}
        <img src={poster} alt="" aria-hidden="true" />
      {:else}
        <div class="poster-empty">
          <i class="fas fa-film" aria-hidden="true"></i>
          <span>No frame captured yet</span>
        </div>
      {/if}
    </div>

    <p class="poster-hint">
      {poster
        ? "This is the frame you scrubbed to. Close, move the playhead, and reopen to change it."
        : "Let the film paint a frame, then reopen this to capture a poster."}
    </p>

    <label class="name-field">
      <span>Name</span>
      <input
        type="text"
        bind:value={name}
        placeholder={film.title}
        aria-label="Film name"
        maxlength="80"
        disabled={saving}
      />
    </label>

    <p class="meta">
      <span>{sceneLabel}</span>
      <span aria-hidden="true">·</span>
      <span>{durationLabel}</span>
    </p>

    <footer class="actions">
      <button class="btn ghost" type="button" onclick={closeModal} disabled={saving}>
        Cancel
      </button>
      <button class="btn primary" type="button" onclick={save} disabled={saving}>
        {saving ? "Saving…" : "Save film"}
      </button>
    </footer>
  </div>
</BaseModal>

<style>
  /* size="fit" fits HEIGHT; width stays --modal-width-fit's flat 480px. This
     route ramps the root font from 1680px up, so rem content outgrew that px
     dialog and got clipped by its overflow:hidden. The dialog owns the width,
     and in rem so it ramps with what it contains. [data-size] beats the size
     rule's specificity, mobile rule included. */
  :global(dialog.base-modal.save-film-modal[data-size]) {
    width: min(28rem, calc(100vw - 2rem));
  }

  .save-film {
    display: grid;
    width: 100%;
    gap: 0.85rem;
    padding: 1.1rem 1.2rem 1.2rem;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  h2 {
    margin: 0;
    font-size: 1.15rem;
  }

  .close-button {
    display: inline-flex;
    width: 2.75rem;
    height: 2.75rem;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 50%;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    background: transparent;
    cursor: pointer;
  }

  .close-button:hover:not(:disabled) {
    color: var(--theme-text, #fff);
    background: color-mix(in srgb, var(--theme-text, #fff) 10%, transparent);
  }

  /* Fixed box: the image decodes async, and a content-sized one would reflow
     the modal when it lands. */
  .poster-frame {
    position: relative;
    overflow: hidden;
    aspect-ratio: 16 / 9;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0.7rem;
    background: #0a0b14;
  }

  .poster-frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .poster-empty {
    display: grid;
    width: 100%;
    height: 100%;
    align-content: center;
    justify-items: center;
    gap: 0.45rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-size: var(--font-size-compact, 0.8rem);
  }

  .poster-empty i {
    font-size: 1.5rem;
  }

  .poster-hint {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 0.8rem);
    line-height: 1.45;
  }

  .name-field {
    display: grid;
    gap: 0.35rem;
  }

  .name-field span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact, 0.8rem);
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .name-field input {
    min-height: 2.75rem;
    padding: 0 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.16));
    border-radius: 0.55rem;
    color: var(--theme-text, #fff);
    background: color-mix(in srgb, var(--theme-panel-bg, #10111b) 70%, transparent);
    font: inherit;
  }

  .name-field input:focus-visible {
    border-color: var(--theme-accent, #9d8cff);
    outline: 2px solid color-mix(in srgb, var(--theme-accent, #9d8cff) 55%, transparent);
    outline-offset: 1px;
  }

  .meta {
    display: flex;
    gap: 0.4rem;
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 0.8rem);
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 0.15rem;
  }

  .btn {
    min-height: 2.75rem;
    padding: 0 1.1rem;
    border: 1px solid transparent;
    border-radius: 0.6rem;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .btn:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .btn.ghost {
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.16));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.8));
    background: transparent;
  }

  .btn.ghost:hover:not(:disabled) {
    color: var(--theme-text, #fff);
    background: color-mix(in srgb, var(--theme-text, #fff) 8%, transparent);
  }

  .btn.primary {
    color: #10111b;
    background: var(--theme-accent, #9d8cff);
  }

  .btn.primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent, #9d8cff) 85%, #fff);
  }
</style>
