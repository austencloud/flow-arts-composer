<script lang="ts">
  import type {
    DeckRelease,
    DeckRecipe,
  } from "../../domain/models/DeckRelease";
  import { flip } from "svelte/animate";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { flipDuration, growFade } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";

  interface Props {
    releases: DeckRelease[];
    isLoading: boolean;
    activeDeckNumber: number | null;
    onSelectRelease: (release: DeckRelease) => void;
    /** Archive (soft-delete) a deck — hides it from this list; restorable. Omit
     *  to hide the archive affordance. */
    onDeleteRelease?: (deckNumber: number) => void;
    /** Restore a previously archived deck back into the default list. Presence
     *  switches this row's action to a one-click restore instead of archive. */
    onRestoreRelease?: (deckNumber: number) => void;
    /** Load a deck's stamped recipe back into Configure. Omit to hide reuse. */
    onReuseRecipe?: (recipe: DeckRecipe) => void;
    /** Section heading. Defaults to "Released Decks". */
    title?: string;
  }

  const {
    releases,
    isLoading,
    activeDeckNumber,
    onSelectRelease,
    onDeleteRelease,
    onRestoreRelease,
    onReuseRecipe,
    title = "Released Decks",
  }: Props = $props();

  function restore(e: MouseEvent, deckNumber: number) {
    e.stopPropagation();
    onRestoreRelease?.(deckNumber);
  }

  function reuse(e: MouseEvent, recipe: DeckRecipe) {
    e.stopPropagation();
    onReuseRecipe?.(recipe);
  }

  // Deck number currently in the two-step confirm state (trash → ✓/✗). Only one
  // row confirms at a time; selecting/confirming/cancelling clears it.
  let confirmingDelete = $state<number | null>(null);

  function startConfirm(e: MouseEvent, deckNumber: number) {
    e.stopPropagation();
    confirmingDelete = deckNumber;
  }

  function cancelConfirm(e: MouseEvent) {
    e.stopPropagation();
    confirmingDelete = null;
  }

  function confirmDelete(e: MouseEvent, deckNumber: number) {
    e.stopPropagation();
    confirmingDelete = null;
    onDeleteRelease?.(deckNumber);
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function distributionSummary(dist: Record<number, number>): string {
    return Object.entries(dist)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([step, count]) => `${step}s:${count}`)
      .join("  ");
  }

  function displayName(r: DeckRelease): string {
    return (
      r.name?.trim() ||
      r.notes?.trim() ||
      `Deck #${String(r.deckNumber).padStart(3, "0")}`
    );
  }

  const prettyProp = (p?: string) =>
    p ? p.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "";
</script>

<div class="release-history">
  <h3 class="panel-title">
    <i class="fas fa-archive" aria-hidden="true"></i>
    {title}
    {#if releases.length > 0}
      <span class="release-count">{releases.length}</span>
    {/if}
  </h3>

  {#if isLoading}
    <div class="panel-empty">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>Loading releases...</span>
    </div>
  {:else if releases.length === 0}
    <div class="panel-empty">
      <i class="fas fa-box-open" aria-hidden="true"></i>
      <span>No decks released yet</span>
    </div>
  {:else}
    <div class="release-list">
      {#each releases as release (release.deckNumber)}
        <div
          class="release-row"
          class:active={activeDeckNumber === release.deckNumber}
          animate:flip={{ duration: flipDuration() }}
          out:growFade
        >
          <button
            type="button"
            class="release-item"
            onclick={() => onSelectRelease(release)}
            aria-label="View Deck {release.deckNumber}: {displayName(release)}"
            aria-pressed={activeDeckNumber === release.deckNumber}
          >
            <div class="release-header">
              <span class="deck-badge"
                >#{String(release.deckNumber).padStart(3, "0")}</span
              >
              <span class="release-date">{formatDate(release.createdAt)}</span>
            </div>
            <div class="release-notes">{displayName(release)}</div>
            <div class="release-meta">
              <span class="card-count">{release.cardCount} cards</span>
              {#if release.leftPropType}
                <span class="prop">{prettyProp(release.leftPropType)}</span>
              {/if}
              <span class="distribution"
                >{distributionSummary(release.stepCountDistribution)}</span
              >
            </div>
          </button>

          {#if onDeleteRelease || onRestoreRelease || (onReuseRecipe && release.recipe)}
            <div class="row-actions">
              <Crossfade
                key={confirmingDelete === release.deckNumber}
                duration={DURATION.fast}
              >
                <span class="action-set">
                  {#if confirmingDelete === release.deckNumber}
                    <button
                      type="button"
                      class="confirm-btn confirm-yes"
                      onclick={(e) => confirmDelete(e, release.deckNumber)}
                      aria-label="Confirm archive Deck {release.deckNumber}"
                    >
                      <i class="fas fa-check" aria-hidden="true"></i>
                    </button>
                    <button
                      type="button"
                      class="confirm-btn confirm-no"
                      onclick={cancelConfirm}
                      aria-label="Cancel archive"
                    >
                      <i class="fas fa-times" aria-hidden="true"></i>
                    </button>
                  {:else}
                    {#if onReuseRecipe && release.recipe}
                      <button
                        type="button"
                        class="reuse-btn"
                        onclick={(e) => reuse(e, release.recipe!)}
                        aria-label="Reuse recipe from Deck {release.deckNumber}"
                        title="Reuse this deck's recipe"
                      >
                        <i class="fas fa-rotate" aria-hidden="true"></i>
                      </button>
                    {/if}
                    {#if onRestoreRelease}
                      <button
                        type="button"
                        class="reuse-btn"
                        onclick={(e) => restore(e, release.deckNumber)}
                        aria-label="Restore Deck {release.deckNumber}"
                        title="Restore deck to the active list"
                      >
                        <i class="fas fa-box-open" aria-hidden="true"></i>
                      </button>
                    {:else if onDeleteRelease}
                      <button
                        type="button"
                        class="trash-btn"
                        onclick={(e) => startConfirm(e, release.deckNumber)}
                        aria-label="Archive Deck {release.deckNumber}"
                        title="Archive deck (hides it here; restorable later)"
                      >
                        <i class="fas fa-box-archive" aria-hidden="true"></i>
                      </button>
                    {/if}
                  {/if}
                </span>
              </Crossfade>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .release-history {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .panel-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 16px 20px;
    font-size: 14px;
    font-weight: 700;
    color: var(--theme-text, #fff);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    flex-shrink: 0;
  }

  .panel-title i {
    color: var(--theme-accent, #8b5cf6);
    font-size: 13px;
  }

  .release-count {
    margin-left: auto;
    padding: 1px 8px;
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border-radius: 10px;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    color: var(--theme-accent, #a78bfa);
  }

  .panel-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 20px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    font-size: 13px;
  }

  .panel-empty i {
    font-size: 24px;
  }

  .release-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .release-row {
    position: relative;
    display: flex;
    align-items: stretch;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    transition:
      transform var(--transition-spring),
      border-color var(--transition-fast),
      background var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .release-row:hover {
    transform: translateX(2px);
    border-color: var(--theme-stroke-strong);
  }

  .release-row.active {
    border-color: var(--theme-accent, rgba(139, 92, 246, 0.5));
    background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
    box-shadow: inset 3px 0 0 var(--theme-accent, #8b5cf6);
  }

  .release-item {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    color: inherit;
    font: inherit;
  }

  .release-item:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .row-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    width: 6.5rem;
    padding-right: 8px;
    flex-shrink: 0;
  }

  .row-actions > :global(.crossfade) {
    width: 100%;
  }

  .action-set {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    width: 100%;
  }

  /* Row actions hidden until row hover/focus on pointer devices; shown on touch. */
  .trash-btn,
  .reuse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    cursor: pointer;
    opacity: 0;
    transition:
      opacity var(--transition-fast),
      color var(--transition-fast),
      background var(--transition-fast),
      transform var(--transition-spring);
  }

  .release-row:hover .trash-btn,
  .release-row:focus-within .trash-btn,
  .release-row:hover .reuse-btn,
  .release-row:focus-within .reuse-btn {
    opacity: 1;
  }

  .trash-btn:hover {
    transform: scale(1.08);
    color: var(--semantic-error);
    background: color-mix(in srgb, var(--semantic-error) 12%, transparent);
  }

  .reuse-btn:hover {
    transform: rotate(-12deg) scale(1.08);
    color: var(--theme-accent, #a78bfa);
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
  }

  .confirm-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    padding: 4px;
    border-radius: 8px;
    border: none;
    font: inherit;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    cursor: pointer;
  }

  .confirm-yes {
    background: var(--semantic-error);
    color: var(--theme-text);
  }
  .confirm-yes:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error) 85%,
      var(--theme-panel-bg)
    );
  }

  .confirm-no {
    background: var(--theme-card-bg);
    color: var(--theme-text-muted);
  }

  .confirm-no:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  @media (hover: none) {
    .trash-btn,
    .reuse-btn {
      opacity: 1;
    }
  }

  .release-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .deck-badge {
    font-size: 14px;
    font-weight: 700;
    color: var(--theme-accent, #a78bfa);
    font-variant-numeric: tabular-nums;
  }

  .release-date {
    margin-left: auto;
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.35));
  }

  .release-notes {
    font-size: 13px;
    font-weight: 600;
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
    line-height: 1.3;
  }

  .release-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .card-count {
    font-weight: 600;
  }

  .distribution {
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }

  @media (prefers-reduced-motion: reduce) {
    .release-row,
    .trash-btn,
    .reuse-btn {
      transition: none;
    }

    .panel-empty .fa-spin {
      animation: none;
    }
  }
</style>
