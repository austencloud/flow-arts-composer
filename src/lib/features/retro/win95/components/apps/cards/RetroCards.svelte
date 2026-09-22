<!--
  RetroCards - CARDS.EXE main component

  Choreo card viewer for TKA-OS. Displays real sequences from the user's
  library as choreo cards with pixelated pictograph beats rendered via
  RetroPictograph. Navigate between cards with Prev/Next buttons.
  Print button triggers a period-accurate LPT1 error.

  Fills its parent container (the RetroWindow body area).

  Domain: Retro Choreo Card Viewer
-->
<script lang="ts">
  import { onMount } from "svelte";
  import RetroMenuBar from "../../primitives/RetroMenuBar.svelte";
  import RetroToolbar from "../../primitives/RetroToolbar.svelte";
  import RetroStatusBar from "../../primitives/RetroStatusBar.svelte";
  import RetroButton from "../../primitives/RetroButton.svelte";
  import RetroPictograph from "../../rendering/RetroPictograph.svelte";
  import { loadCards } from "../../../adapters/cards-adapter";
  import type { RetroCard } from "../../../adapters/cards-adapter";
  import { RETRO_ICONS } from "../../rendering/retro-icons";
  import { parseWordNotation } from "$lib/shared/foundation/utils/word-notation";

  /* Props                                                               */

  let {
    onclose,
  }: {
    onclose?: () => void;
  } = $props();

  /* State                                                               */

  let cards = $state<RetroCard[]>([]);
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  let currentIndex = $state(0);
  let statusText = $state("");
  let zoom = $state(1);

  const currentCard = $derived(cards[currentIndex] ?? null);

  const beatSize = $derived(Math.round(64 * zoom));

  /* Load library on mount                                               */

  onMount(async () => {
    try {
      cards = await loadCards();
    } catch (err) {
      loadError =
        err instanceof Error ? err.message : "Failed to load library.";
    } finally {
      isLoading = false;
    }
  });

  /* Menu bar                                                            */

  const menus = $derived([
    {
      label: "File",
      items: [
        {
          label: "Open...",
          action: () => {
            statusText = "Open dialog not available in demo mode.";
          },
        },
        {
          label: "Print",
          shortcut: "Ctrl+P",
          action: () => handlePrint(),
        },
        { separator: true, label: "" },
        { label: "Exit", action: () => onclose?.() },
      ],
    },
    {
      label: "View",
      items: [
        {
          label: "Zoom In",
          shortcut: "+",
          action: () => handleZoomIn(),
        },
        {
          label: "Zoom Out",
          shortcut: "-",
          action: () => handleZoomOut(),
        },
      ],
    },
  ]);

  /* Toolbar                                                             */

  const toolbarButtons = $derived([
    {
      icon: RETRO_ICONS.arrowLeft,
      tooltip: "Previous Card",
      disabled: currentIndex === 0 || cards.length === 0,
      action: () => handlePrev(),
    },
    {
      icon: RETRO_ICONS.arrowRight,
      tooltip: "Next Card",
      disabled: currentIndex === cards.length - 1 || cards.length === 0,
      action: () => handleNext(),
    },
    { separator: true, icon: "", tooltip: "", action: () => {} },
    {
      icon: RETRO_ICONS.printer,
      tooltip: "Print",
      action: () => handlePrint(),
    },
  ]);

  /* Status bar                                                          */

  const statusPanels = $derived([
    {
      text: isLoading
        ? "Loading cards..."
        : cards.length === 0
          ? "No cards"
          : `Card ${currentIndex + 1} of ${cards.length}`,
      width: "120px",
    },
    {
      text: statusText || (currentCard ? `Sequence: ${currentCard.word}` : ""),
    },
  ]);

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */

  function handlePrev() {
    if (currentIndex > 0) {
      currentIndex--;
      statusText = "";
    }
  }

  function handleNext() {
    if (currentIndex < cards.length - 1) {
      currentIndex++;
      statusText = "";
    }
  }

  function handlePrint() {
    statusText = "Error: LPT1: not found. Please check printer connection.";
  }

  function handleZoomIn() {
    zoom = Math.min(2.5, zoom + 0.25);
    statusText = `Zoom: ${Math.round(zoom * 100)}%`;
  }

  function handleZoomOut() {
    zoom = Math.max(0.5, zoom - 0.25);
    statusText = `Zoom: ${Math.round(zoom * 100)}%`;
  }
</script>

<div class="cards-shell">
  <!-- Menu bar -->
  <div class="cards-menubar">
    <RetroMenuBar {menus} />
  </div>

  <!-- Toolbar with nav buttons -->
  <div class="cards-toolbar">
    <RetroToolbar buttons={toolbarButtons} />
  </div>

  <!-- Card display area -->
  <div class="cards-viewport sunken-panel">
    {#if isLoading}
      <div class="cards-message">
        <span class="cards-message-text">Loading sequences...</span>
      </div>
    {:else if loadError}
      <div class="cards-message">
        <span class="cards-message-text cards-message-error"
          >Error: {loadError}</span
        >
      </div>
    {:else if cards.length === 0}
      <div class="cards-message">
        <span class="cards-message-text"
          >No cards found. Generate sequences in TKA Notation System.</span
        >
      </div>
    {:else if currentCard}
      <div class="card-frame">
        <!-- Card title -->
        <div class="card-title">
          Sequence: {currentCard.word}
        </div>

        <!-- Beat row -->
        <div class="card-beats">
          {#each currentCard.beats as beat, i (i)}
            <div class="card-beat-cell">
              <div class="card-beat-border">
                <RetroPictograph data={beat} size={beatSize} />
              </div>
            </div>
          {/each}
        </div>

        <!-- Word label - individual letters spaced out -->
        <div class="card-word-label">
          {parseWordNotation(currentCard.word)
            .map((u) => u.letter)
            .join(" - ")}
        </div>

        <!-- Notes area -->
        {#if currentCard.notes}
          <div class="card-notes">
            <span class="card-notes-label">Notes:</span>
            {currentCard.notes}
          </div>
        {/if}

        <!-- Footer metadata -->
        <div class="card-footer">
          {#if currentCard.constraint}Constraint: {currentCard.constraint} |
          {/if}Generated: {currentCard.date}
        </div>
      </div>
    {/if}
  </div>

  <!-- Bottom navigation row -->
  <div class="cards-nav-row">
    <RetroButton
      label="◀ Prev"
      disabled={currentIndex === 0 || cards.length === 0}
      onclick={handlePrev}
    />
    <span class="nav-indicator">
      {cards.length === 0 ? "0 / 0" : `${currentIndex + 1} / ${cards.length}`}
    </span>
    <RetroButton
      label="Next ▶"
      disabled={currentIndex === cards.length - 1 || cards.length === 0}
      onclick={handleNext}
    />
  </div>

  <!-- Status bar -->
  <div class="cards-statusbar">
    <RetroStatusBar panels={statusPanels} />
  </div>
</div>

<style>
  /* Shell layout - fills parent window body                             */
  .cards-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--retro-button-face, #c0c0c0);
  }

  /* Menu bar                                                            */
  .cards-menubar {
    flex-shrink: 0;
    border-bottom: 1px solid var(--retro-button-shadow, #808080);
  }

  /* Toolbar                                                             */
  .cards-toolbar {
    flex-shrink: 0;
    border-bottom: 1px solid var(--retro-button-shadow, #808080);
  }

  /* Card viewport - sunken scrollable display area                      */
  .cards-viewport {
    flex: 1;
    min-height: 0;
    margin: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    background: var(--retro-field-bg, #fff);
  }

  /* Loading / empty / error message                                     */
  .cards-message {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .cards-message-text {
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    font-size: var(--retro-font-size, 11px);
    color: var(--retro-disabled-text, #808080);
    text-align: center;
    max-width: 280px;
  }

  .cards-message-error {
    color: var(--semantic-error, #cc0000);
  }

  /* Card frame - the actual card with border                            */
  .card-frame {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 16px;
    border: 2px solid var(--retro-black, #000);
    background: var(--retro-field-bg, #fff);
    min-width: 280px;
    max-width: 480px;
  }

  /* Card title                                                          */
  .card-title {
    font-family: var(--retro-font-mono, "Fixedsys", monospace);
    font-size: 14px;
    font-weight: bold;
    color: var(--retro-black, #000);
    text-align: center;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--retro-button-shadow, #808080);
    width: 100%;
  }

  /* Beat row                                                            */
  .card-beats {
    display: flex;
    gap: 4px;
    padding: 8px 0;
    flex-wrap: wrap;
    justify-content: center;
  }

  .card-beat-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .card-beat-border {
    border: 1px solid var(--retro-button-shadow, #808080);
    padding: 2px;
    background: var(--retro-button-face, #c0c0c0);
  }

  /* Word label                                                          */
  .card-word-label {
    font-family: var(--retro-font-mono, "Fixedsys", monospace);
    font-size: 13px;
    color: var(--retro-black, #000);
    letter-spacing: 2px;
    text-align: center;
  }

  /* Notes area                                                          */
  .card-notes {
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    font-size: var(--retro-font-size, 11px);
    color: var(--retro-black, #000);
    text-align: center;
    padding: 4px 8px;
    background: var(--retro-button-face, #c0c0c0);
    border: 1px inset var(--retro-button-face, #c0c0c0);
    width: 100%;
    box-sizing: border-box;
  }

  .card-notes-label {
    font-weight: bold;
  }

  /* Footer metadata line                                                */
  .card-footer {
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    font-size: 10px;
    color: var(--retro-disabled-text, #808080);
    text-align: center;
    padding-top: 4px;
    border-top: 1px solid var(--retro-button-shadow, #808080);
    width: 100%;
  }

  /* Bottom navigation row                                               */
  .cards-nav-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 4px;
    flex-shrink: 0;
  }

  .nav-indicator {
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    font-size: var(--retro-font-size, 11px);
    color: var(--retro-black, #000);
    min-width: 40px;
    text-align: center;
  }

  /* Status bar                                                          */
  .cards-statusbar {
    flex-shrink: 0;
  }
</style>
