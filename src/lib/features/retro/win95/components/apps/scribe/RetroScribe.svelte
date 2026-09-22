<!--
  RetroScribe - TKA Notation System main component

  The flagship TKA-OS application. Retro version of the Create module
  rendered inside a RetroWindow. Contains a full Win95-style app shell:
  menu bar, toolbar, tab control, and status bar.

  Fills its parent container (the RetroWindow body area).

  Domain: Retro Notation App
-->
<script lang="ts">
  import RetroMenuBar from "../../primitives/RetroMenuBar.svelte";
  import RetroToolbar from "../../primitives/RetroToolbar.svelte";
  import RetroTabControl from "../../primitives/RetroTabControl.svelte";
  import RetroStatusBar from "../../primitives/RetroStatusBar.svelte";
  import RetroGenerateTab from "./RetroGenerateTab.svelte";
  import RetroConstructTab from "./RetroConstructTab.svelte";
  import RetroAssembleTab from "./RetroAssembleTab.svelte";
  import RetroSaveDialog from "./RetroSaveDialog.svelte";
  import { RETRO_ICONS } from "../../rendering/retro-icons";
  import { saveRetroSequence } from "../../../adapters/notation-adapter";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

  /* Props                                                               */

  let {
    onclose,
  }: {
    onclose?: () => void;
  } = $props();

  /* State                                                               */

  let activeTab = $state("construct");
  let showToolbar = $state(true);
  let showStatusBar = $state(true);
  let showSaveDialog = $state(false);
  let saveFilename = $state("UNTITLED");
  let stepCount = $state(0);
  let statusText = $state("Ready");

  /**
   * The most recently generated SequenceData. Populated whenever the Generate
   * tab fires onsequencegenerated. Needed by File > Save / Save As so we can
   * persist to the library without re-running generation.
   */
  let currentSequenceData = $state<SequenceData | null>(null);

  /** True once the user has saved under a specific filename this session. */
  let hasSavedOnce = $state(false);
  let isSaving = $state(false);

  /* Tab definitions                                                     */

  const tabs = [
    { id: "construct", label: "Construct" },
    { id: "assemble", label: "Assemble" },
    { id: "generate", label: "Generate" },
  ];

  /* Menu bar                                                            */

  const menus = $derived([
    {
      label: "File",
      items: [
        { label: "New", shortcut: "Ctrl+N", action: () => handleNew() },
        { label: "Open...", shortcut: "Ctrl+O", action: () => {} },
        {
          label: isSaving ? "Saving..." : "Save",
          shortcut: "Ctrl+S",
          disabled: isSaving || !currentSequenceData,
          action: () => handleSave(),
        },
        {
          label: "Save As...",
          disabled: isSaving || !currentSequenceData,
          action: () => {
            if (currentSequenceData) showSaveDialog = true;
          },
        },
        { separator: true, label: "" },
        { label: "Exit", action: () => onclose?.() },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", shortcut: "Ctrl+Z", disabled: true },
        { label: "Redo", shortcut: "Ctrl+Y", disabled: true },
        { separator: true, label: "" },
        { label: "Cut", shortcut: "Ctrl+X", disabled: true },
        { label: "Copy", shortcut: "Ctrl+C", disabled: true },
        { label: "Paste", shortcut: "Ctrl+V", disabled: true },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Toolbar", action: () => (showToolbar = !showToolbar) },
        { label: "Status Bar", action: () => (showStatusBar = !showStatusBar) },
      ],
    },
    {
      label: "Sequence",
      items: [
        {
          label: "Add Beat...",
          action: () => {
            activeTab = "construct";
          },
        },
        { label: "Clear All", action: () => handleClear() },
      ],
    },
    {
      label: "Generate",
      items: [
        {
          label: "Freeform...",
          shortcut: "F5",
          action: () => {
            activeTab = "generate";
          },
        },
        {
          label: "Spell Word...",
          action: () => {
            activeTab = "generate";
          },
        },
      ],
    },
    {
      label: "Help",
      items: [{ label: "About TKA Notation System", action: () => showAbout() }],
    },
  ]);

  /* Toolbar buttons                                                     */

  const toolbarButtons = $derived([
    { icon: RETRO_ICONS.newDoc, tooltip: "New", action: () => handleNew() },
    { icon: RETRO_ICONS.folderOpen, tooltip: "Open", action: () => {} },
    {
      icon: RETRO_ICONS.save,
      tooltip: isSaving ? "Saving..." : "Save",
      disabled: isSaving || !currentSequenceData,
      saveShortcut: true,
      action: () => handleSave(),
    },
    { separator: true, icon: "", tooltip: "", action: () => {} },
    {
      icon: RETRO_ICONS.play,
      tooltip: "Generate",
      action: () => {
        activeTab = "generate";
      },
    },
  ]);

  /* Status bar panels                                                   */

  const statusPanels = $derived([
    { text: `Beats: ${stepCount}`, width: "100px" },
    { text: statusText },
  ]);

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */

  function handleNew() {
    stepCount = 0;
    currentSequenceData = null;
    hasSavedOnce = false;
    statusText = "New sequence";
  }

  /**
   * File > Save - saves immediately if a name was already set this session,
   * otherwise falls through to Save As so the user can pick a name first.
   */
  async function handleSave() {
    if (!currentSequenceData) {
      statusText = "Nothing to save - generate a sequence first.";
      return;
    }
    if (!hasSavedOnce) {
      showSaveDialog = true;
      return;
    }
    await persistSave(saveFilename);
  }

  /**
   * Callback from RetroSaveDialog - user confirmed a filename.
   */
  async function handleSaveAs(name: string) {
    showSaveDialog = false;
    saveFilename = name;
    await persistSave(name);
  }

  /**
   * Core save logic shared by Save and Save As. Calls the real library repo
   * via the notation adapter and updates the status bar with the result.
   */
  async function persistSave(name: string) {
    if (!currentSequenceData || isSaving) return;

    isSaving = true;
    statusText = `Saving ${name}.SEQ...`;

    try {
      await saveRetroSequence(currentSequenceData, name);
      hasSavedOnce = true;
      statusText = `Saved: ${name}.SEQ`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      statusText = `Save failed: ${message}`;
      console.error("[RetroScribe] Save failed", error);
    } finally {
      isSaving = false;
    }
  }

  function handleSequenceGenerated(sequenceData: SequenceData) {
    currentSequenceData = sequenceData;
    hasSavedOnce = false;
    saveFilename = stripWordNotation(sequenceData.word).slice(0, 8).toUpperCase() || "UNTITLED";
  }

  function handleClear() {
    stepCount = 0;
    currentSequenceData = null;
    hasSavedOnce = false;
    statusText = "Cleared";
  }

  function showAbout() {
    statusText = "TKA Notation System v1.0 - TKA-OS";
  }

  function handleStatusChange(status: string) {
    statusText = status;

    /* Parse beat count from status if available */
    const match = status.match(/Beats:\s*(\d+)/);
    if (match) {
      stepCount = parseInt(match[1]!, 10);
    }
  }
</script>

<div class="scribe-shell">
  <!-- Menu bar -->
  <div class="scribe-menubar">
    <RetroMenuBar {menus} />
  </div>

  <!-- Toolbar (toggle-able) -->
  {#if showToolbar}
    <div class="scribe-toolbar">
      <RetroToolbar buttons={toolbarButtons} />
    </div>
  {/if}

  <!-- Tab control + content area -->
  <div class="scribe-content">
    <RetroTabControl {tabs} bind:activeTab>
      {#snippet children()}
        {#if activeTab === "generate"}
          <RetroGenerateTab
            onstatuschange={handleStatusChange}
            onsequencegenerated={handleSequenceGenerated}
          />
        {:else if activeTab === "construct"}
          <RetroConstructTab onstatuschange={handleStatusChange} />
        {:else if activeTab === "assemble"}
          <RetroAssembleTab onstatuschange={handleStatusChange} />
        {/if}
      {/snippet}
    </RetroTabControl>
  </div>

  <!-- Status bar (toggle-able) -->
  {#if showStatusBar}
    <div class="scribe-statusbar">
      <RetroStatusBar panels={statusPanels} />
    </div>
  {/if}

  <!-- Save As dialog overlay -->
  {#if showSaveDialog}
    <div class="save-overlay">
      <div class="save-dialog-frame">
        <div class="save-dialog-titlebar">
          <span class="save-dialog-title">Save As</span>
          <button
            class="save-dialog-close"
            type="button"
            aria-label="Close"
            onclick={() => (showSaveDialog = false)}
          >
            &#10005;
          </button>
        </div>
        <RetroSaveDialog
          bind:filename={saveFilename}
          onsave={handleSaveAs}
          oncancel={() => (showSaveDialog = false)}
        />
      </div>
    </div>
  {/if}
</div>

<style>
  /* Shell layout - fills parent window body                             */
  .scribe-shell {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--retro-button-face, #c0c0c0);
  }

  /* Menu bar                                                            */
  .scribe-menubar {
    flex-shrink: 0;
    border-bottom: 1px solid var(--retro-button-shadow, #808080);
  }

  /* Toolbar                                                             */
  .scribe-toolbar {
    flex-shrink: 0;
    border-bottom: 1px solid var(--retro-button-shadow, #808080);
  }

  /* Content area (tabs + body)                                          */
  .scribe-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 4px 4px 0;
    overflow: hidden;
  }

  /* Make the tab control fill available space */
  .scribe-content :global(.retro-tab-control) {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .scribe-content :global(.retro-tab-body) {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  /* Status bar                                                          */
  .scribe-statusbar {
    flex-shrink: 0;
  }

  /* Save As dialog overlay                                              */
  .save-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.25);
    z-index: 10;
  }

  .save-dialog-frame {
    background: var(--retro-button-face, #c0c0c0);
    border: 2px outset var(--retro-button-face, #c0c0c0);
    box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
    min-width: 340px;
    max-width: 90%;
  }

  .save-dialog-titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--retro-navy, #000080);
    color: #fff;
    padding: 2px 4px;
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    font-size: var(--retro-font-size, 11px);
    font-weight: bold;
  }

  .save-dialog-title {
    flex: 1;
  }

  .save-dialog-close {
    width: 16px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    padding: 0;
    border: 1px outset var(--retro-button-face, #c0c0c0);
    background: var(--retro-button-face, #c0c0c0);
    color: var(--retro-black, #000);
    cursor: default;
    line-height: 1;
  }
</style>
