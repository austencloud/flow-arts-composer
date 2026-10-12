<script lang="ts">
  /**
   * Contextual edit palette - appears bottom-center ONLY while edit mode is on.
   * Owns init (from ?edit or the last localStorage choice) and the global
   * hotkeys (E, Ctrl+Z/Y, arrows, Esc, Del). Entry into edit mode lives in the
   * GuideDevBar toolbar (or the E hotkey).
   *
   * Layout is width-stable: the selection block and the Copy button are sized to
   * their widest state so changing the selection never shifts the neighbours
   * (no-layout-shift). Coords are tabular-nums.
   */
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import {
    guideEdit,
    hist,
    collectEditCoords,
    setEdit,
    undo,
    redo,
    deleteSelected,
    beginTextEdit,
    isEditable,
    selectedSnapshot,
    initEdit,
    installEditHotkeys,
  } from "../_data/guide-edit.svelte";

  let copied = $state(false);

  // Live coords of the selection (reactive - reads the page $state through the
  // registered movable). Updates as you drag or nudge.
  const coords = $derived(selectedSnapshot());
  const canEditText = $derived(isEditable(guideEdit.selectedId));
  const fmt = (n: number | undefined) =>
    (Math.round((n ?? 0) * 10) / 10).toFixed(1);

  onMount(() => {
    initEdit(page.url.searchParams.has("edit"));
    return installEditHotkeys();
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(collectEditCoords());
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      copied = false;
    }
  }
</script>

{#if guideEdit.on}
  <div class="edit-dock">
    <div class="edit-bar" role="toolbar" aria-label="Guide edit tools">
      <span class="brand"
        ><span class="dot" aria-hidden="true"></span>Editing</span
      >

      <span class="sep" aria-hidden="true"></span>

      <button
        class="btn"
        onclick={undo}
        disabled={hist.undo === 0}
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
      >
        <i class="fas fa-rotate-left" aria-hidden="true"></i>
      </button>
      <button
        class="btn"
        onclick={redo}
        disabled={hist.redo === 0}
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
      >
        <i class="fas fa-rotate-right" aria-hidden="true"></i>
      </button>

      <span class="sep" aria-hidden="true"></span>

      <div class="sel" class:empty={!guideEdit.selectedId}>
        {#if guideEdit.selectedId}
          <span class="sel-name">{guideEdit.selectedLabel}</span>
          {#if coords}
            <span class="sel-xy">
              {#if coords.length === 2}
                x {fmt(coords[0])}&nbsp;&nbsp;y {fmt(coords[1])}
              {:else}
                {coords.map(fmt).join(", ")}
              {/if}
            </span>
          {/if}
        {:else}
          <span class="sel-hint">click an element to select</span>
        {/if}
      </div>

      <button
        class="btn"
        onclick={() => beginTextEdit()}
        disabled={!canEditText}
        aria-label="Edit text"
        title="Edit text (or double-click the text)"
      >
        <i class="fas fa-pen-to-square" aria-hidden="true"></i><span class="lbl"
          >Text</span
        >
      </button>
      <button
        class="btn danger"
        onclick={deleteSelected}
        disabled={!guideEdit.selectedId}
        aria-label="Delete selected"
        title="Delete selected (Del). Undoable. Copy lists deletions"
      >
        <i class="fas fa-trash" aria-hidden="true"></i>
      </button>

      <span class="sep" aria-hidden="true"></span>

      <button
        class="btn primary"
        onclick={copy}
        title="Copy coords + text edits + deletions, to paste back into source"
      >
        <i class="fas {copied ? 'fa-check' : 'fa-copy'}" aria-hidden="true"></i>
        <span class="lbl">{copied ? "Copied" : "Copy changes"}</span>
      </button>
      <button
        class="btn"
        onclick={() => setEdit(false)}
        aria-label="Exit edit mode"
        title="Exit edit mode (Esc)"
      >
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    </div>

    <p class="hint">
      drag to move · <b>double-click text to retype</b> · arrows nudge
      <span class="k">Shift</span>
      ×10 ·
      <span class="k">Del</span> removes · <span class="k">E</span> toggles
    </p>
  </div>
{/if}

<style>
  .edit-dock {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-family: system-ui, sans-serif;
    pointer-events: none; /* dock is layout-only; children re-enable */
  }

  .edit-bar {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border-radius: 14px;
    background: #16161d;
    border: 1px solid #34343f;
    box-shadow: 0 10px 34px rgba(0, 0, 0, 0.55);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 6px 0 4px;
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.02em;
    color: #c7cbff;
    white-space: nowrap;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #6f8cff;
    box-shadow: 0 0 0 3px rgba(111, 140, 255, 0.18);
  }

  .sep {
    width: 1px;
    align-self: stretch;
    margin: 2px 2px;
    background: #34343f;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    height: 34px;
    min-width: 34px;
    padding: 0 10px;
    border-radius: 9px;
    border: 1px solid #3a3a48;
    background: #24242d;
    color: #d3d3e2;
    font:
      600 12px/1 system-ui,
      sans-serif;
    cursor: pointer;
    transition:
      background var(--duration-instant) var(--ease-standard),
      border-color var(--duration-instant) var(--ease-standard),
      color var(--duration-instant) var(--ease-standard);
  }
  .btn :global(i) {
    font-size: 13px;
  }
  .btn .lbl {
    white-space: nowrap;
  }
  .btn:hover:not(:disabled) {
    background: #30303b;
    border-color: #4a4a5a;
    color: #fff;
  }
  .btn:active:not(:disabled) {
    transform: translateY(1px);
  }
  .btn:disabled {
    opacity: 0.32;
    cursor: default;
  }

  .btn.primary {
    min-width: 138px; /* sized to "Copy changes" so "Copied" doesn't shift the bar */
    border-color: #4338ca;
    background: #4338ca;
    color: #fff;
  }
  .btn.primary:hover:not(:disabled) {
    background: #4f46e5;
    border-color: #6366f1;
  }

  .btn.danger {
    color: #f0a3a3;
  }
  .btn.danger:hover:not(:disabled) {
    background: #4a2530;
    border-color: #6e3745;
    color: #ffd4d4;
  }

  /* ── Selection readout (fixed width → no layout shift) ────────────────────── */
  .sel {
    width: 176px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    line-height: 1.15;
    overflow: hidden;
  }
  .sel-name {
    max-width: 100%;
    font-size: 12px;
    font-weight: 600;
    color: #e8e8f4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sel-xy {
    font-size: 11px;
    color: #9aa0c4;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .sel-hint {
    font-size: 11px;
    color: #7a7a90;
    font-style: italic;
  }

  .hint {
    pointer-events: auto;
    margin: 0;
    padding: 3px 12px;
    border-radius: 999px;
    background: rgba(22, 22, 29, 0.72);
    color: #9a9ab0;
    font-size: 11px;
    white-space: nowrap;
  }
  .hint b {
    color: #c7cbff;
    font-weight: 600;
  }
  .hint .k {
    padding: 0 4px;
    border-radius: 4px;
    background: #2a2a34;
    color: #cfcfe0;
    font:
      600 10px/1.6 ui-monospace,
      monospace;
  }

  @media print {
    .edit-dock {
      display: none;
    }
  }
</style>
