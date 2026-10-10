<script lang="ts">
  import CopyForAIButton from "#lib/shared/foundation/ui/CopyForAIButton.svelte";
  import { simplifyAndTruncate } from "#lib/shared/foundation/utils/word-simplifier.js";
  import { scale } from "svelte/transition";
  import { backOut, cubicOut } from "svelte/easing";

  interface HistoryEntry {
    word: string;
    stepCount: number;
    gridMode?: string;
    timestamp: number;
    sequenceData: unknown;
  }

  interface Props {
    entries: HistoryEntry[];
    getEntryData?: (entry: HistoryEntry) => string | Promise<string>;
    onSave?: (entry: HistoryEntry) => void;
    onView?: (entry: HistoryEntry) => void;
  }

  let { entries, getEntryData, onSave, onView }: Props = $props();

  function defaultGetData(entry: HistoryEntry): string {
    return JSON.stringify(entry.sequenceData, null, 2);
  }

  let open = $state(false);

  function handleBackdropClick() {
    open = false;
  }
</script>

{#if entries.length > 0}
  <div class="history-anchor">
    <button
      class="history-trigger"
      onclick={() => (open = !open)}
      aria-expanded={open}
      aria-haspopup="dialog"
    >
      <i class="fas fa-history" aria-hidden="true"></i>
      <span>Recent</span>
      <span class="badge">{entries.length}</span>
    </button>

    {#if open}
      <button
        class="backdrop"
        type="button"
        aria-label="Close recent sequences"
        onclick={handleBackdropClick}
      ></button>
      <div
        class="popover"
        role="dialog"
        aria-label="Recent sequences"
        in:scale={{ duration: 220, start: 0.92, opacity: 0, easing: backOut }}
        out:scale={{ duration: 160, start: 0.95, opacity: 0, easing: cubicOut }}
      >
        <div class="pop-header">
          <span>Recent Sequences</span>
          <button class="close-btn" onclick={() => (open = false)} aria-label="Close">
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>
        <ul class="history-list" role="list">
          {#each entries as entry (entry.timestamp)}
            <li class="history-entry">
              <div class="entry-info">
                <span class="entry-name">{simplifyAndTruncate(entry.word)}</span>
                <span class="entry-meta">{entry.stepCount} steps</span>
              </div>
              <div class="entry-actions">
                {#if onView}
                  <button
                    class="entry-icon-btn"
                    onclick={() => { onView(entry); open = false; }}
                    aria-label="View {entry.word} in sequence viewer"
                    title="View"
                  >
                    <i class="fas fa-eye" aria-hidden="true"></i>
                  </button>
                {/if}
                {#if onSave}
                  <button
                    class="entry-icon-btn"
                    onclick={() => onSave(entry)}
                    aria-label="Save {entry.word} to library"
                    title="Save to library"
                  >
                    <i class="fas fa-bookmark" aria-hidden="true"></i>
                  </button>
                {/if}
                <CopyForAIButton
                  getData={() => (getEntryData ?? defaultGetData)(entry)}
                  variant="icon-only"
                  size="sm"
                  ariaLabel="Copy {entry.word} sequence data"
                  useToast
                  labels={{ success: "Copied {entry.word}" }}
                />
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}

<style>
  .history-anchor {
    position: relative;
  }

  .history-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-md, 8px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
    width: 100%;
  }

  .history-trigger:hover {
    color: var(--theme-text, white);
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .history-trigger:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .badge {
    margin-left: auto;
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 25%, transparent);
    color: var(--theme-accent, #6366f1);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 10px;
    min-width: 22px;
    text-align: center;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    cursor: default;
  }

  .popover {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    right: 0;
    min-width: 280px;
    background: var(--theme-panel-bg, rgba(20, 22, 32, 0.92));
    backdrop-filter: blur(24px) saturate(150%);
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    border-radius: 16px;
    z-index: 100;
    overflow: hidden;
  }

  .pop-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px 10px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.42));
  }

  .close-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 50%;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    cursor: pointer;
    transition: all 100ms ease;
  }

  .close-btn:hover {
    color: var(--theme-text, white);
    background: color-mix(in srgb, var(--theme-text, white) 10%, transparent);
  }

  .history-list {
    list-style: none;
    margin: 0;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 280px;
    overflow-y: auto;
  }

  .history-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    transition: background 100ms ease;
  }

  .history-entry:hover {
    background: color-mix(in srgb, var(--theme-text, white) 6%, transparent);
  }

  .entry-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .entry-name {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text, white);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .entry-meta {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .entry-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .entry-icon-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: transparent;
    border: 1px solid transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    cursor: pointer;
    transition: all 100ms ease;
    font-size: var(--font-size-compact, 12px);
  }

  .entry-icon-btn:hover {
    color: var(--theme-text, white);
    background: color-mix(in srgb, var(--theme-text, white) 10%, transparent);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .entry-icon-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .entry-icon-btn:active {
    transform: scale(0.92);
  }

  @media (prefers-reduced-motion: reduce) {
    .history-trigger,
    .close-btn,
    .history-entry,
    .entry-icon-btn {
      transition: none;
    }

    .entry-icon-btn:active {
      transform: none;
    }
  }
</style>
