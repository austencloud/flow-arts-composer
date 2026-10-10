<!--
  RetroGenerateTab - Generate tab for SCRIBE.EXE

  Two modes matching the real Generate tab:
  - FREEFORM: settings cards (level, length, turn intensity, etc.) + Generate
  - SPELL: word input + generate (spell mode merged in, no separate tab)

  Domain: Retro SCRIBE App
-->
<script lang="ts">
  import RetroButton from "../../primitives/RetroButton.svelte";
  import RetroTextInput from "../../primitives/RetroTextInput.svelte";
  import RetroDropdown from "../../primitives/RetroDropdown.svelte";
  import RetroProgressBar from "../../primitives/RetroProgressBar.svelte";
  import RetroRadioButton from "../../primitives/RetroRadioButton.svelte";
  import RetroPictograph from "../../rendering/RetroPictograph.svelte";
  import { createMockPictographData } from "../../../../shared/data/mock-pictograph-data";
  import type { RetroPictographData } from "../../../../shared/domain/pictograph-types";
  import { generateRetroSequence } from "../../../adapters/notation-adapter";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  let {
    onstatuschange,
    onsequencegenerated,
  }: {
    onstatuschange?: (status: string) => void;
    /** Fires after a successful generation with the raw SequenceData so the
     *  parent (RetroScribe) can offer File > Save without re-running generation. */
    onsequencegenerated?: (sequenceData: SequenceData) => void;
  } = $props();

  /* State                                                               */

  let mode = $state<"freeform" | "spell">("freeform");

  /* Freeform settings */
  let level = $state("2");
  let length = $state("8");
  let turnIntensity = $state("1");
  let gridMode = $state("diamond");
  let continuity = $state("continuous");
  let constraint = $state("smooth");

  /* Spell settings */
  let spellWord = $state("");

  /* Generation state */
  let isGenerating = $state(false);
  let generatedBeats = $state<
    { letter: string; pictograph: RetroPictographData }[]
  >([]);
  let generateProgress = $state(0);
  let generateStatus = $state("Ready");
  let generatedWord = $state("");

  /* Dropdown options                                                    */

  const levelOptions = [
    { value: "1", label: "Level 1 - Beginner" },
    { value: "2", label: "Level 2 - Intermediate" },
    { value: "3", label: "Level 3 - Advanced" },
    { value: "4", label: "Level 4 - Interradials" },
  ];

  const lengthOptions = [
    { value: "4", label: "4 beats" },
    { value: "6", label: "6 beats" },
    { value: "8", label: "8 beats" },
    { value: "12", label: "12 beats" },
    { value: "16", label: "16 beats" },
  ];

  const turnOptions = [
    { value: "0", label: "0 - No turns" },
    { value: "1", label: "1 - Mild" },
    { value: "2", label: "2 - Moderate" },
    { value: "3", label: "3 - Extreme" },
  ];

  const gridOptions = [
    { value: "diamond", label: "Diamond" },
    { value: "box", label: "Box" },
  ];

  const continuityOptions = [
    { value: "continuous", label: "Continuous" },
    { value: "random", label: "Random" },
  ];

  const constraintOptions = [
    { value: "smooth", label: "Smooth" },
    { value: "reversal", label: "Reversal" },
    { value: "none", label: "None" },
  ];

  /* Generation                                                          */

  async function handleGenerate() {
    if (isGenerating) return;
    if (mode === "spell" && !spellWord.trim()) return;

    isGenerating = true;
    generateProgress = 0;
    generatedBeats = [];
    generateStatus = "Computing kinetic path...";
    onstatuschange?.("Generating...");

    // Theatrical progress bar runs in parallel with real generation
    const messages = [
      "Computing kinetic path...",
      "Resolving bridges...",
      "Calibrating prop physics...",
      "Rendering notation...",
    ];
    let msgIdx = 0;

    const interval = setInterval(() => {
      generateProgress = Math.min(95, generateProgress + Math.random() * 20);
      msgIdx = (msgIdx + 1) % messages.length;
      generateStatus = messages[msgIdx]!;
    }, 500);

    try {
      const result = await generateRetroSequence({
        mode,
        word: mode === "spell" ? spellWord.toUpperCase() : undefined,
        length: parseInt(length),
        level: parseInt(level),
        turnIntensity: parseInt(turnIntensity),
        gridMode,
        constraintPreset: constraint === "none" ? undefined : constraint,
      });

      clearInterval(interval);
      generateProgress = 100;

      generatedWord = result.word;
      generateStatus = `Generated: ${result.word} (${result.stepCount} beats)`;
      onstatuschange?.(`Beats: ${result.stepCount} | Generated`);
      generatedBeats = result.beats;
      onsequencegenerated?.(result.sequenceData);
    } catch (error) {
      clearInterval(interval);
      generateProgress = 0;

      // Fall back to mock data so the UI still works if the engine fails
      const fallbackWord =
        mode === "spell"
          ? spellWord.toUpperCase()
          : Array.from({ length: parseInt(length) }, () =>
              "ABCDEFGHIJKLMNOPQRSTUVWXYZ".charAt(
                Math.floor(Math.random() * 26),
              ),
            ).join("");

      generatedWord = fallbackWord;
      generateStatus = `Generated (fallback): ${fallbackWord}`;
      onstatuschange?.(`Beats: ${fallbackWord.length} | Fallback`);

      generatedBeats = fallbackWord.split("").map((letter) => ({
        letter,
        pictograph: createMockPictographData(letter),
      }));

      console.warn("[RetroGenerateTab] Real generation failed, using mock data:", error);
    } finally {
      isGenerating = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      handleGenerate();
    }
  }

  function switchMode(newMode: string) {
    mode = newMode as "freeform" | "spell";
    generatedBeats = [];
    generateStatus = "Ready";
    generatedWord = "";
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="generate-tab" onkeydown={handleKeydown}>
  <!-- Mode toggle -->
  <div class="mode-row">
    <span class="mode-label">Mode:</span>
    <div class="mode-radios">
      <RetroRadioButton
        label="Freeform"
        name="gen-mode"
        value="freeform"
        selected={mode === "freeform"}
        onchange={switchMode}
      />
      <RetroRadioButton
        label="Spell"
        name="gen-mode"
        value="spell"
        selected={mode === "spell"}
        onchange={switchMode}
      />
    </div>
  </div>

  {#if mode === "spell"}
    <!-- Spell Mode: word input + settings                               -->
    <fieldset class="settings-fieldset">
      <legend>Spell Word</legend>

      <div class="field-row">
        <label class="field-label" for="spell-word">Word:</label>
        <div class="word-input-wrapper">
          <RetroTextInput
            id="spell-word"
            bind:value={spellWord}
            placeholder="Type a word..."
            disabled={isGenerating}
          />
        </div>
      </div>

      <div class="field-row">
        <label class="field-label" for="spell-constraint">Constraint:</label>
        <RetroDropdown
          id="spell-constraint"
          bind:value={constraint}
          options={constraintOptions}
          disabled={isGenerating}
        />
      </div>

      <div class="field-row">
        <label class="field-label" for="spell-level">Level:</label>
        <RetroDropdown
          id="spell-level"
          bind:value={level}
          options={levelOptions}
          disabled={isGenerating}
        />
      </div>
    </fieldset>
  {:else}
    <!-- Freeform Mode: settings cards                                   -->
    <fieldset class="settings-fieldset">
      <legend>Generation Settings</legend>

      <div class="settings-grid">
        <div class="field-row">
          <label class="field-label" for="gen-level">Level:</label>
          <RetroDropdown
            id="gen-level"
            bind:value={level}
            options={levelOptions}
            disabled={isGenerating}
          />
        </div>

        <div class="field-row">
          <label class="field-label" for="gen-length">Length:</label>
          <RetroDropdown
            id="gen-length"
            bind:value={length}
            options={lengthOptions}
            disabled={isGenerating}
          />
        </div>

        <div class="field-row">
          <label class="field-label" for="gen-turns">Turns:</label>
          <RetroDropdown
            id="gen-turns"
            bind:value={turnIntensity}
            options={turnOptions}
            disabled={isGenerating}
          />
        </div>

        <div class="field-row">
          <label class="field-label" for="gen-grid">Grid:</label>
          <RetroDropdown
            id="gen-grid"
            bind:value={gridMode}
            options={gridOptions}
            disabled={isGenerating}
          />
        </div>

        <div class="field-row">
          <label class="field-label" for="gen-continuity">Prop:</label>
          <RetroDropdown
            id="gen-continuity"
            bind:value={continuity}
            options={continuityOptions}
            disabled={isGenerating}
          />
        </div>

        <div class="field-row">
          <label class="field-label" for="gen-constraint">Constraint:</label>
          <RetroDropdown
            id="gen-constraint"
            bind:value={constraint}
            options={constraintOptions}
            disabled={isGenerating}
          />
        </div>
      </div>
    </fieldset>
  {/if}

  <!-- Generate button -->
  <div class="generate-row">
    <RetroButton
      label={mode === "spell" ? "Spell" : "Generate"}
      isDefault
      disabled={isGenerating || (mode === "spell" && !spellWord.trim())}
      onclick={handleGenerate}
    />
  </div>

  <!-- Display area: results -->
  <div class="display-area sunken-panel">
    {#if isGenerating}
      <div class="progress-container">
        <RetroProgressBar value={generateProgress} segmented />
        <p class="progress-message">{generateStatus}</p>
      </div>
    {:else if generatedBeats.length > 0}
      <div class="results-wrapper">
        <div class="result-word">{generatedWord}</div>
        <div class="beats-container">
          {#each generatedBeats as beat, i (i)}
            <div class="beat-cell">
              <RetroPictograph data={beat.pictograph} size={42} />
              <span class="beat-number">{i + 1}</span>
              <span class="beat-label">{beat.letter}</span>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="empty-state">
        <p class="empty-text">
          {mode === "spell"
            ? "Enter a word and click Spell to generate"
            : "Adjust settings and click Generate"}
        </p>
      </div>
    {/if}
  </div>
</div>

<style>
  .generate-tab {
    display: flex;
    flex-direction: column;
    gap: 6px;
    height: 100%;
    padding: 4px;
  }

  /* Mode toggle                                                         */
  .mode-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .mode-label {
    font-size: var(--retro-font-size, 11px);
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    color: var(--retro-black, #000);
    font-weight: bold;
  }

  .mode-radios {
    display: flex;
    gap: 12px;
  }

  /* Settings fieldset                                                   */
  .settings-fieldset {
    flex-shrink: 0;
    padding: 4px 6px;
    margin: 0;
  }

  .settings-fieldset legend {
    font-size: var(--retro-font-size, 11px);
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    color: var(--retro-black, #000);
  }

  .settings-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 12px;
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 2px;
  }

  .field-label {
    white-space: nowrap;
    color: var(--retro-black, #000);
    font-size: var(--retro-font-size, 11px);
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    flex-shrink: 0;
    min-width: 60px;
  }

  .word-input-wrapper {
    flex: 1;
    min-width: 80px;
  }

  /* Generate button                                                     */
  .generate-row {
    display: flex;
    justify-content: center;
    flex-shrink: 0;
  }

  /* Display area                                                        */
  .display-area {
    flex: 1;
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    background: var(--retro-field-bg, #fff);
  }

  .progress-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px;
    width: 80%;
  }

  .progress-message {
    color: var(--retro-black, #000);
    font-size: var(--retro-font-size, 11px);
    margin: 0;
  }

  .results-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px;
    width: 100%;
  }

  .result-word {
    font-family: var(--retro-font-mono, "Fixedsys", monospace);
    font-size: 13px;
    font-weight: bold;
    color: var(--retro-navy, #000080);
    letter-spacing: 2px;
  }

  .beats-container {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    justify-content: center;
  }

  .beat-number {
    font-family: var(--retro-font-mono, "Fixedsys", monospace);
    font-size: 8px;
    color: var(--retro-dark-gray, #808080);
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }

  .empty-text {
    color: var(--retro-disabled-text, #808080);
    font-size: var(--retro-font-size, 11px);
    margin: 0;
    font-style: italic;
  }
</style>
