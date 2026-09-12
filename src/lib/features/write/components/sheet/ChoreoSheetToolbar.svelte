<script lang="ts">
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { growFade } from "$lib/shared/transitions/motion";

  let {
    name,
    sequenceCount,
    loopStatus,
    sheetMeta,
    actsOpen,
    playerOpen,
    browseOpen,
    rosterReady,
    saving,
    saveFlash,
    dirty,
    exporting,
    exportPct,
    onName,
    onToggleActs,
    onTogglePlayer,
    onToggleBrowse,
    onSave,
    onExport,
  }: {
    name: string;
    sequenceCount: number;
    loopStatus: "empty" | "loops" | "open";
    sheetMeta: string | null;
    actsOpen: boolean;
    playerOpen: boolean;
    browseOpen: boolean;
    rosterReady: boolean;
    saving: boolean;
    saveFlash: boolean;
    dirty: boolean;
    exporting: boolean;
    exportPct: number;
    onName: (name: string) => void;
    onToggleActs: () => void;
    onTogglePlayer: () => void;
    onToggleBrowse: () => void;
    onSave: () => void;
    onExport: () => void;
  } = $props();
</script>

<header class="sheet-toolbar">
  <div class="identity">
    <input
      class="name-input"
      type="text"
      name="sheet-name"
      value={name}
      oninput={(e) => onName(e.currentTarget.value)}
      aria-label="Sheet name"
      placeholder="Untitled Sheet"
    />
    {#if sequenceCount > 0}
      <span
        transition:growFade={{ axis: "x" }}
        class="loop-badge"
        class:loops={loopStatus === "loops"}
        class:open={loopStatus === "open"}
      >
        {loopStatus === "loops" ? "Loops ✓" : "Open"}
      </span>
    {/if}
    {#if sheetMeta}<span class="sheet-meta">{sheetMeta}</span>{/if}
  </div>
  <div class="actions">
    <div class="secondary">
      <button
        id="choreo-acts-trigger"
        type="button"
        class="btn acts"
        class:active={actsOpen}
        onclick={onToggleActs}
        aria-label="Saved acts"
        aria-controls="choreo-acts-dock"
        aria-expanded={actsOpen}
        ><i class="fa-solid fa-clapperboard" aria-hidden="true"></i><span
          >Acts</span
        ></button
      >
      <button
        id="choreo-play-act-trigger"
        type="button"
        class="btn"
        class:active={playerOpen}
        onclick={onTogglePlayer}
        disabled={!rosterReady || sequenceCount === 0}
        aria-label="Play act"
        aria-controls="choreo-act-player"
        aria-expanded={playerOpen}
        ><i class="fa-solid fa-play" aria-hidden="true"></i><span>Play act</span
        ></button
      >
    </div>
    <span class="divider" aria-hidden="true"></span>
    <div class="primary">
      <button
        id="choreo-browse-trigger"
        type="button"
        class="btn"
        class:active={browseOpen}
        onclick={onToggleBrowse}
        aria-controls="choreo-browse-dock"
        aria-expanded={browseOpen}
        ><i class="fa-solid fa-plus" aria-hidden="true"></i>Add sequences</button
      >
      <button
        data-save-shortcut
        type="button"
        class="btn save"
        class:success={saveFlash}
        onclick={onSave}
        disabled={saving || sequenceCount === 0}
        title={dirty ? "Unsaved changes" : undefined}
      >
        <Crossfade key={saveFlash}
          >{#if saveFlash}<i class="fa-solid fa-check" aria-hidden="true"
            ></i>{:else}<i class="fa-solid fa-floppy-disk" aria-hidden="true"
            ></i>{/if}</Crossfade
        >
        {saving ? "Saving…" : saveFlash ? "Saved" : "Save"}<span
          class="unsaved"
          class:show={dirty}
          aria-hidden="true"
        ></span>
      </button>
      <button
        type="button"
        class="btn export"
        onclick={onExport}
        disabled={exporting || !rosterReady || sequenceCount === 0}
        ><i class="fa-solid fa-file-pdf" aria-hidden="true"></i>{exporting
          ? `Exporting ${exportPct}%`
          : "Export PDF"}</button
      >
    </div>
  </div>
</header>

<style>
  .sheet-toolbar {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    min-height: 56px;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    background: var(--theme-panel-bg);
  }
  .identity,
  .actions,
  .secondary,
  .primary {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }
  .identity {
    flex: 1;
    min-width: 0;
  }
  .actions {
    margin-left: auto;
  }
  .name-input {
    field-sizing: content;
    min-width: 8ch;
    max-width: 28ch;
    min-height: 44px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--theme-text);
    font-size: 1.1rem;
    font-weight: 700;
  }
  .name-input:focus-visible {
    outline: 2px solid var(--theme-accent);
  }
  .sheet-meta {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    white-space: nowrap;
  }
  .loop-badge {
    padding: 2px 10px;
    border: 1px solid var(--theme-stroke);
    border-radius: 9999px;
    font-size: var(--font-size-compact);
    font-weight: 700;
  }
  .loop-badge.loops {
    color: var(--theme-success);
  }
  .loop-badge.open {
    color: var(--theme-text-dim);
  }
  .divider {
    width: 1px;
    height: 28px;
    background: var(--theme-stroke);
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 44px;
    padding: 0 var(--spacing-md);
    border: 1px solid var(--theme-stroke);
    border-radius: 7px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-weight: 650;
    cursor: pointer;
  }
  .btn:hover:not(:disabled),
  .btn.active {
    border-color: var(--theme-accent);
    background: var(--theme-card-bg-hover);
  }
  .btn.acts.active {
    color: var(--theme-accent);
    background: var(--theme-card-bg);
  }
  .btn.export {
    border-color: var(--theme-accent);
    background: var(--theme-accent);
    color: var(--theme-text-on-accent);
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .save {
    position: relative;
  }
  .save.success {
    color: var(--theme-success);
  }
  .unsaved {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--theme-accent);
    opacity: 0;
  }
  .unsaved.show {
    opacity: 1;
  }
  :global(.choreo-sheet-view.is-narrow) .sheet-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-xs);
  }
  :global(.choreo-sheet-view.is-narrow) .identity {
    width: 100%;
  }
  :global(.choreo-sheet-view.is-narrow) .actions {
    width: 100%;
    margin-left: 0;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  :global(.choreo-sheet-view.is-narrow) .name-input {
    field-sizing: fixed;
    flex: 1;
    width: auto;
    min-width: 0;
    max-width: none;
  }
  :global(.choreo-sheet-view.is-narrow) .sheet-meta {
    display: none;
  }
  @media (max-width: 1024px) {
    .sheet-meta,
    .secondary .btn span {
      display: none;
    }
    .secondary .btn {
      width: var(--min-touch-target, 44px);
      padding: 0;
    }
  }
  @media (max-width: 640px) {
    .divider {
      display: none;
    }
    .btn {
      padding-inline: var(--spacing-sm);
    }
  }
</style>
