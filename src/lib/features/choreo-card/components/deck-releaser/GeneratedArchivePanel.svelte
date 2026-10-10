<!--
  GeneratedArchivePanel — the "Generated" half of the Browse sidebar. Lists every
  deck ever generated (from the local IndexedDB archive), newest first. Open
  re-loads a deck's exact cards into Review; Delete removes it. Mirrors
  ReleaseHistoryPanel's row/button styling so the two sections read as one Browse.
-->
<script lang="ts">
  import type { ArchivedDeckMeta } from "../../services/deck-archive-store";
  import { flip } from "svelte/animate";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import { flipDuration, growFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  interface Props {
    decks: ArchivedDeckMeta[];
    isLoading: boolean;
    activeRefNumber: number | null;
    onOpen: (refNumber: number) => void;
    onDelete: (refNumber: number) => void;
  }

  const { decks, isLoading, activeRefNumber, onOpen, onDelete }: Props =
    $props();

  let confirmingDelete = $state<number | null>(null);

  function startConfirm(e: MouseEvent, ref: number) {
    e.stopPropagation();
    confirmingDelete = ref;
  }
  function cancelConfirm(e: MouseEvent) {
    e.stopPropagation();
    confirmingDelete = null;
  }
  function confirmDelete(e: MouseEvent, ref: number) {
    e.stopPropagation();
    confirmingDelete = null;
    onDelete(ref);
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    );
  }

  const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

  const prettyProp = (p: string) =>
    p.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

  function summary(d: ArchivedDeckMeta): string {
    const parts: string[] = [];
    if (d.deckMode === "tnd") parts.push("TnD");
    else if (d.deckMode === "gallery") parts.push("Gallery");
    else {
      if (d.loopType) parts.push(cap(d.loopType));
      if (d.length) parts.push(`${d.length}-step`);
      if (d.level) parts.push(`L${d.level}`);
      if (d.period) parts.push(cap(d.period));
    }
    if (d.prop) parts.push(prettyProp(d.prop));
    return parts.join(" · ");
  }
</script>

<div class="archive-panel">
  <h3 class="panel-title">
    <i class="fas fa-clock-rotate-left" aria-hidden="true"></i>
    Generated
    {#if decks.length > 0}
      <span class="count">{decks.length}</span>
    {/if}
  </h3>

  {#if isLoading}
    <div class="panel-empty">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>Loading…</span>
    </div>
  {:else if decks.length === 0}
    <div class="panel-empty">
      <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
      <span>No decks generated yet</span>
    </div>
  {:else}
    <div class="archive-list">
      {#each decks as d (d.refNumber)}
        <div
          class="archive-row"
          class:active={activeRefNumber === d.refNumber}
          animate:flip={{ duration: flipDuration() }}
          out:growFade
        >
          <button
            type="button"
            class="archive-item"
            onclick={() => onOpen(d.refNumber)}
            aria-label="Open generated Deck {d.refNumber}"
            aria-pressed={activeRefNumber === d.refNumber}
          >
            <div class="row-header">
              <span class="deck-badge"
                >#{String(d.refNumber).padStart(3, "0")}</span
              >
              <span class="row-date">{formatDate(d.createdAt)}</span>
            </div>
            <div class="row-summary">{summary(d)}</div>
            <div class="row-meta">
              <span class="card-count">{d.cardCount} cards</span>
              <span class="word-count">{d.words.length} words</span>
            </div>
          </button>

          <div class="row-actions">
            <Crossfade
              key={confirmingDelete === d.refNumber}
              duration={DURATION.fast}
            >
              <span class="action-set">
                {#if confirmingDelete === d.refNumber}
                  <button
                    type="button"
                    class="confirm-btn confirm-yes"
                    onclick={(e) => confirmDelete(e, d.refNumber)}
                    aria-label="Confirm delete"
                  >
                    <i class="fas fa-check" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    class="confirm-btn confirm-no"
                    onclick={cancelConfirm}
                    aria-label="Cancel delete"
                  >
                    <i class="fas fa-times" aria-hidden="true"></i>
                  </button>
                {:else}
                  <button
                    type="button"
                    class="trash-btn"
                    onclick={(e) => startConfirm(e, d.refNumber)}
                    aria-label="Delete generated Deck {d.refNumber}"
                    title="Delete from archive"
                  >
                    <i class="fas fa-trash" aria-hidden="true"></i>
                  </button>
                {/if}
              </span>
            </Crossfade>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .archive-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
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
  .count {
    margin-left: auto;
    padding: 1px 8px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 15%,
      transparent
    );
    border-radius: 10px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-accent, #a78bfa);
  }
  .panel-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 32px 20px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    font-size: 13px;
  }
  .panel-empty i {
    font-size: 22px;
  }
  .archive-list {
    overflow-y: auto;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .archive-row {
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
  .archive-row:hover {
    transform: translateX(2px);
    border-color: var(--theme-stroke-strong);
  }
  .archive-row.active {
    border-color: var(--theme-accent, rgba(139, 92, 246, 0.5));
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 8%,
      transparent
    );
    box-shadow: inset 3px 0 0 var(--theme-accent, #8b5cf6);
  }
  .archive-item {
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
  .archive-item:focus-visible {
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
  .trash-btn {
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
  .archive-row:hover .trash-btn,
  .archive-row:focus-within .trash-btn {
    opacity: 1;
  }
  .trash-btn:hover {
    transform: scale(1.08);
    color: var(--semantic-error, #f87171);
    background: color-mix(
      in srgb,
      var(--semantic-error, #f87171) 12%,
      transparent
    );
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
    background: var(--semantic-error, #ef4444);
    color: var(--theme-text, #fff);
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
    .trash-btn {
      opacity: 1;
    }
  }
  .row-header {
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
  .row-date {
    margin-left: auto;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.35));
  }
  .row-summary {
    font-size: 13px;
    font-weight: 600;
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
    line-height: 1.3;
  }
  .row-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }
  .card-count {
    font-weight: 600;
  }
  .word-count {
    font-variant-numeric: tabular-nums;
  }
  @media (prefers-reduced-motion: reduce) {
    .archive-row,
    .trash-btn {
      transition: none;
    }
    .panel-empty .fa-spin {
      animation: none;
    }
  }
</style>
