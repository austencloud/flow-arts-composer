<!--
  RetroConstructTab - Visual sequence builder for SCRIBE.EXE

  Two-phase flow matching the real Construct tab:
  Phase 1: Start Position Picker - choose Alpha, Beta, or Gamma
  Phase 2: Option Picker - grid of pictographs to add beats

  The workspace (beat display) runs along the top as beats accumulate.

  Domain: Retro SCRIBE App
-->
<script lang="ts">
  import RetroButton from "../../primitives/RetroButton.svelte";
  import RetroPictograph from "../../rendering/RetroPictograph.svelte";
  import { createMockPictographData } from "../../../../shared/data/mock-pictograph-data";
  import type { RetroPictographData } from "../../../../shared/domain/pictograph-types";

  let {
    onstatuschange,
  }: {
    onstatuschange?: (status: string) => void;
  } = $props();

  /* Types                                                               */

  interface Beat {
    letter: string;
    pictograph: RetroPictographData;
  }

  /* State                                                               */

  let phase = $state<"start" | "build">("start");
  let startPlacement = $state<string | null>(null);
  let beats = $state<Beat[]>([]);
  let selectedStepIndex = $state(-1);

  /* Start positions (Alpha / Beta / Gamma)                              */

  const startPlacements = [
    { id: "alpha", label: "Alpha", description: "Hands opposite" },
    { id: "beta", label: "Beta", description: "Hands together" },
    { id: "gamma", label: "Gamma", description: "Hands at right angle" },
  ];

  function selectStartPlacement(posId: string) {
    startPlacement = posId;
    phase = "build";
    onstatuschange?.(`Beats: 0 | Start: ${posId.charAt(0).toUpperCase() + posId.slice(1)}`);
  }

  /* ------------------------------------------------------------------ */
  /* Option picker - available next letters                              */
  /* ------------------------------------------------------------------ */

  const ALL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  /**
   * Generate 6-8 "available" options based on what the last beat was.
   * In the real app this comes from motion continuity logic.
   * Here we pick a deterministic subset based on current state.
   */
  const availableOptions = $derived.by(() => {
    const lastLetter = beats.length > 0
      ? beats[beats.length - 1]!.letter
      : (startPlacement === "beta" ? "B" : startPlacement === "gamma" ? "G" : "A");

    const seed = lastLetter.charCodeAt(0);
    const options: string[] = [];

    /* Pick 8 letters starting from a seed offset, wrapping around */
    for (let i = 0; i < 8; i++) {
      const idx = (seed + i * 3) % ALL_LETTERS.length;
      options.push(ALL_LETTERS[idx]!);
    }

    return [...new Set(options)].slice(0, 8);
  });

  /* ------------------------------------------------------------------ */
  /* Beat operations                                                     */
  /* ------------------------------------------------------------------ */

  function addStep(letter: string) {
    beats.push({
      letter,
      pictograph: createMockPictographData(letter),
    });
    selectedStepIndex = beats.length - 1;
    onstatuschange?.(`Beats: ${beats.length} | Added: ${letter}`);
  }

  function removeStep(index: number) {
    if (index < 0 || index >= beats.length) return;
    beats.splice(index, 1);
    selectedStepIndex = Math.min(selectedStepIndex, beats.length - 1);
    onstatuschange?.(`Beats: ${beats.length} | Beat removed`);
  }

  function removeLastBeat() {
    if (beats.length === 0) return;
    removeStep(beats.length - 1);
  }

  function clearAll() {
    beats = [];
    selectedStepIndex = -1;
    phase = "start";
    startPlacement = null;
    onstatuschange?.("Beats: 0 | Cleared");
  }

  /* ------------------------------------------------------------------ */
  /* Word derivation                                                     */
  /* ------------------------------------------------------------------ */

  const word = $derived(beats.map((b) => b.letter).join(""));
</script>

<div class="construct-tab">
  {#if phase === "start"}
    <!-- Phase 1: Start Position Picker                                  -->
    <div class="start-picker">
      <fieldset class="start-fieldset">
        <legend>Choose Start Placement</legend>
        <div class="start-grid">
          {#each startPlacements as pos (pos.id)}
            <button
              class="start-tile"
              type="button"
              onclick={() => selectStartPlacement(pos.id)}
              aria-label={`Start with ${pos.label}`}
            >
              <RetroPictograph
                data={createMockPictographData(pos.id === "alpha" ? "A" : pos.id === "beta" ? "B" : "G")}
                size={56}
              />
              <span class="start-label">{pos.label}</span>
              <span class="start-desc">{pos.description}</span>
            </button>
          {/each}
        </div>
      </fieldset>

      <div class="start-hint">
        <p class="hint-text">Select a hand starting position to begin building.</p>
      </div>
    </div>
  {:else}
    <!-- Phase 2: Build Mode - workspace + option picker                 -->

    <!-- Workspace: beat display strip -->
    <div class="workspace">
      <div class="workspace-header">
        <span class="workspace-word">{word || "(empty)"}</span>
        <div class="workspace-actions">
          <RetroButton
            label="Undo"
            disabled={beats.length === 0}
            onclick={removeLastBeat}
          />
          <RetroButton
            label="Clear"
            disabled={beats.length === 0}
            onclick={clearAll}
          />
        </div>
      </div>

      <div class="beat-strip sunken-panel">
        <!-- Start position tile -->
        <div class="beat-cell start-cell">
          <RetroPictograph
            data={createMockPictographData(startPlacement === "beta" ? "B" : startPlacement === "gamma" ? "G" : "A")}
            size={36}
          />
          <span class="beat-number">0</span>
        </div>

        <!-- Beat tiles -->
        {#each beats as beat, i (i)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="beat-cell"
            class:beat-selected={selectedStepIndex === i}
            onclick={() => (selectedStepIndex = i)}
          >
            <RetroPictograph data={beat.pictograph} size={36} />
            <span class="beat-number">{i + 1}</span>
          </div>
        {/each}

        {#if beats.length === 0}
          <div class="beat-placeholder">
            <span class="placeholder-text">Pick an option below to add beats</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- Option picker: grid of available next pictographs -->
    <fieldset class="options-fieldset">
      <legend>Available Options</legend>
      <div class="option-grid">
        {#each availableOptions as letter (letter)}
          <button
            class="option-tile"
            type="button"
            onclick={() => addStep(letter)}
            aria-label={`Add letter ${letter}`}
          >
            <RetroPictograph
              data={createMockPictographData(letter)}
              size={48}
            />
            <span class="option-label">{letter}</span>
          </button>
        {/each}
      </div>
    </fieldset>
  {/if}
</div>

<style>
  .construct-tab {
    display: flex;
    flex-direction: column;
    gap: 6px;
    height: 100%;
    padding: 4px;
  }

  /* Phase 1: Start Position Picker                                      */
  .start-picker {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 12px;
  }

  .start-fieldset {
    padding: 8px 12px;
    margin: 0;
  }

  .start-fieldset legend {
    font-size: var(--retro-font-size, 11px);
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    color: var(--retro-black, #000);
  }

  .start-grid {
    display: flex;
    gap: 12px;
    justify-content: center;
  }

  .start-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px;
    min-width: 80px;
    min-height: auto;
    background: var(--retro-field-bg, #fff);
    border: 2px inset var(--retro-button-face, #c0c0c0);
    cursor: pointer;
    color: transparent;
    text-shadow: none;
  }

  .start-tile:hover {
    background: var(--retro-selection-bg, #000080);
  }

  .start-tile:hover .start-label,
  .start-tile:hover .start-desc {
    color: var(--retro-selection-text, #fff);
  }

  .start-label {
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    font-size: var(--retro-font-size, 11px);
    font-weight: bold;
    color: var(--retro-black, #000);
    text-shadow: 0 0 var(--retro-black, #000);
  }

  .start-desc {
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    font-size: 9px;
    color: var(--retro-dark-gray, #808080);
    text-shadow: 0 0 var(--retro-dark-gray, #808080);
  }

  .start-hint {
    text-align: center;
  }

  .hint-text {
    color: var(--retro-dark-gray, #808080);
    font-size: var(--retro-font-size, 11px);
    font-style: italic;
    margin: 0;
  }

  /* Phase 2: Workspace (beat strip)                                     */
  .workspace {
    flex-shrink: 0;
  }

  .workspace-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2px;
  }

  .workspace-word {
    font-family: var(--retro-font-mono, "Fixedsys", monospace);
    font-size: var(--retro-font-size, 11px);
    color: var(--retro-black, #000);
    font-weight: bold;
    letter-spacing: 1px;
  }

  .workspace-actions {
    display: flex;
    gap: 4px;
  }

  .beat-strip {
    display: flex;
    gap: 3px;
    padding: 4px;
    min-height: 56px;
    overflow-x: auto;
    overflow-y: hidden;
    background: var(--retro-field-bg, #fff);
    align-items: center;
  }

  .beat-number {
    font-family: var(--retro-font-mono, "Fixedsys", monospace);
    font-size: 8px;
    color: var(--retro-dark-gray, #808080);
    text-align: center;
  }

  .beat-placeholder {
    display: flex;
    align-items: center;
    padding: 0 8px;
  }

  .placeholder-text {
    color: var(--retro-disabled-text, #808080);
    font-size: var(--retro-font-size, 11px);
    font-style: italic;
    white-space: nowrap;
  }

  /* Option Picker                                                       */
  .options-fieldset {
    flex: 1;
    min-height: 0;
    padding: 4px 6px;
    margin: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .options-fieldset legend {
    font-size: var(--retro-font-size, 11px);
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    color: var(--retro-black, #000);
  }

  .option-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px;
    overflow-y: auto;
    overflow-x: hidden;
    flex: 1;
    min-height: 0;
    align-content: flex-start;
    justify-content: center;
  }

  .option-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 4px;
    min-width: 56px;
    min-height: auto;
    background: var(--retro-field-bg, #fff);
    border: 2px outset var(--retro-button-face, #c0c0c0);
    cursor: pointer;
    color: transparent;
    text-shadow: none;
  }

  .option-tile:hover {
    background: #e8e8ff;
    border-color: var(--retro-navy, #000080);
  }

  .option-tile:active {
    border-style: inset;
  }

  .option-label {
    font-family: var(--retro-font-mono, "Fixedsys", monospace);
    font-size: 9px;
    color: var(--retro-black, #000);
    font-weight: bold;
    text-shadow: 0 0 var(--retro-black, #000);
  }
</style>
