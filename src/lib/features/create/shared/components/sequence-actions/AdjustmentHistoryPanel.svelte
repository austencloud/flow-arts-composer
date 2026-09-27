<!--
  AdjustmentHistoryPanel.svelte

  Generic adjustment-history list with per-row revert. Domain-agnostic — the
  caller injects `load` (where rows come from) and `onRevert` (what reverting a
  row does). Two presentations share one row/revert core:
    - variant="inline"  (default): a collapsible disclosure for roomy editors
      (the global override editor).
    - variant="popover": a compact trigger button that floats the list above it
      (the dense PipelineEditorDock footer) — no layout shift in the row.
  Admin-only by virtue of its mount points.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { Popover } from "bits-ui";
  import { scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { createComponentLogger } from "$lib/shared/utils/debug-logger";

  /** Neutral row shape both domains map their Firestore docs into. */
  export interface HistoryEntry {
    id: string;
    action: string; // "save" | "delete" | "reset" | "undo"
    x: number | null;
    y: number | null;
    prevX: number | null;
    prevY: number | null;
    timestamp: Date | null;
    updatedBy: string;
    label: string;
  }

  interface Props {
    load: () => Promise<HistoryEntry[]>;
    onRevert: (entry: HistoryEntry) => Promise<void>;
    /** Re-run `load` when this changes (e.g. the selected arrow key). */
    reloadKey?: unknown;
    variant?: "inline" | "popover";
    /** Popover accent (matches the active arrow color). */
    accentColor?: string;
  }
  let {
    load,
    onRevert,
    reloadKey,
    variant = "inline",
    accentColor,
  }: Props = $props();

  const logger = createComponentLogger("AdjustmentHistoryPanel");

  let open = $state(false);
  let entries = $state<HistoryEntry[]>([]);
  let loading = $state(false);
  let reverting = $state<string | null>(null);

  async function loadHistory() {
    loading = true;
    try {
      entries = await load();
    } catch (error) {
      logger.error("Failed to load history:", error);
      entries = [];
    } finally {
      loading = false;
    }
  }

  // Reload when opened, or when the caller's reloadKey changes while open.
  $effect(() => {
    void reloadKey;
    if (open) loadHistory();
  });

  function toggleInline() {
    open = !open;
  }

  async function handleRevert(entry: HistoryEntry) {
    reverting = entry.id;
    try {
      await onRevert(entry);
      await loadHistory();
    } catch (error) {
      logger.error("Failed to revert:", error);
    } finally {
      reverting = null;
    }
  }

  function formatTime(date: Date | null): string {
    if (!date) return "?";
    const diff = Date.now() - date.getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return date.toLocaleDateString();
  }

  function coords(entry: HistoryEntry): string {
    if (entry.x === null || entry.y === null) return "—";
    return `(${entry.x}, ${entry.y})`;
  }
</script>

{#snippet list()}
  <div class="history-list">
    {#if loading}
      <span class="status-msg"
        ><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Loading…</span
      >
    {:else if entries.length === 0}
      <span class="status-msg">{t("create_ui_no_changes_recorded_yet")}</span>
    {:else}
      {#each entries as entry (entry.id)}
        <div class="history-row">
          <span
            class="action-badge"
            class:save={entry.action === "save"}
            class:delete={entry.action === "delete"}
            class:undo={entry.action === "undo"}
            class:reset={entry.action === "reset"}>{entry.action}</span
          >
          <span class="coords">
            {#if entry.prevX !== null && entry.prevY !== null}
              <span class="prev">({entry.prevX}, {entry.prevY})</span>
              <i class="fas fa-arrow-right sep" aria-hidden="true"></i>
            {/if}
            <span class="new">{coords(entry)}</span>
          </span>
          <span class="time">{formatTime(entry.timestamp)}</span>
          <button
            class="revert-btn"
            onclick={() => handleRevert(entry)}
            disabled={reverting === entry.id}
            title={`Revert to ${coords(entry)}`}
          >
            {#if reverting === entry.id}
              <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            {:else}
              <i class="fas fa-undo" aria-hidden="true"></i>
            {/if}
          </button>
        </div>
      {/each}
    {/if}
  </div>
{/snippet}

{#if variant === "popover"}
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          class="trigger-btn"
          class:active={open}
          aria-label={t("create_ui_edit_history_for_this_arrow")}
          title={t("create_ui_edit_history")}
        >
          <i class="fas fa-history" aria-hidden="true"></i>
        </button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content
      side="top"
      align="end"
      sideOffset={10}
      collisionPadding={12}
      forceMount
    >
      {#snippet child({ open: isOpen, wrapperProps, props })}
        <div {...wrapperProps}>
          {#if isOpen}
            <div
              {...props}
              class="history-pop"
              style:--accent={accentColor ?? "var(--theme-accent, #58a6ff)"}
              in:scale={{
                duration: 160,
                start: 0.96,
                opacity: 0,
                easing: cubicOut,
              }}
              out:scale={{
                duration: 110,
                start: 0.97,
                opacity: 0,
                easing: cubicOut,
              }}
            >
              <header class="pop-header">
                <i class="fas fa-history" aria-hidden="true"></i>
                <span>{t("create_ui_edit_history")}</span>
              </header>
              {@render list()}
            </div>
          {/if}
        </div>
      {/snippet}
    </Popover.Content>
  </Popover.Root>
{:else}
  <div class="history-panel">
    <button class="toggle-btn" onclick={toggleInline} aria-expanded={open}>
      <i class="fas fa-history" aria-hidden="true"></i>
      {#if open}Hide{:else}History{/if}
    </button>
    {#if open}{@render list()}{/if}
  </div>
{/if}

<style>
  .history-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 260px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2))
      transparent;
  }
  .history-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 9px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-radius: 8px;
    font-size: var(--font-size-compact, 12px);
  }
  .action-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 6px;
    border-radius: 5px;
    min-width: 44px;
    text-align: center;
    flex: none;
  }
  .action-badge.save {
    background: rgba(34, 197, 94, 0.18);
    color: #34d399;
  }
  .action-badge.delete,
  .action-badge.reset {
    background: rgba(239, 68, 68, 0.18);
    color: #f87171;
  }
  .action-badge.undo {
    background: rgba(96, 165, 250, 0.18);
    color: #60a5fa;
  }
  .coords {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
  }
  .coords .prev {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }
  .coords .sep {
    font-size: 9px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.35));
  }
  .coords .new {
    color: var(--theme-text, #fff);
    font-weight: 600;
  }
  .time {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
    font-size: 11px;
    flex: none;
  }
  .revert-btn {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    flex: none;
    border: 1px solid
      color-mix(in srgb, var(--accent, #fbbf24) 35%, transparent);
    background: transparent;
    color: var(--accent, #fbbf24);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    padding: 0;
    transition: all var(--duration-fast, 120ms) ease;
  }
  .revert-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent, #fbbf24) 18%, transparent);
  }
  .revert-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .status-msg {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
    padding: 10px 8px;
    text-align: center;
  }

  /* Icon-only, square — sits in the dense actions row next to Revert/Save and
     adds minimal width (a labelled button tipped the footer onto a 2nd line). */
  .trigger-btn {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    flex: none;
    border-radius: 10px;
    padding: 0;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-family: inherit;
    font-size: 15px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast, 120ms) ease;
  }
  .trigger-btn:hover {
    color: var(--theme-text, #fff);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.28));
  }
  .trigger-btn.active {
    color: var(--theme-text, #fff);
    border-color: var(--theme-accent, #58a6ff);
    background: color-mix(
      in srgb,
      var(--theme-accent, #58a6ff) 10%,
      transparent
    );
  }
  .history-pop {
    width: 360px;
    max-width: min(360px, calc(100vw - 24px));
    padding: 10px;
    border-radius: 14px;
    /* Solid, opaque — a translucent panel over the busy pictograph behind it was
       unreadable. Slight elevation lift over the dock's own background. */
    background: #11151e;
    border: 1px solid
      color-mix(in srgb, var(--accent) 30%, rgba(255, 255, 255, 0.14));
    box-shadow: 0 18px 56px rgba(0, 0, 0, 0.78);
    z-index: 100;
  }
  .pop-header {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 2px 4px 9px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }
  .pop-header i {
    color: var(--accent);
  }

  /* ── inline variant (global editor — unchanged behavior) ──────────────── */
  .history-panel {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .toggle-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.65rem;
    transition: all var(--duration-fast) ease;
  }
  .toggle-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: white;
  }

  @media (prefers-reduced-motion: reduce) {
    .toggle-btn,
    .revert-btn,
    .trigger-btn {
      transition: none;
    }
  }
</style>
