<!--
  PovPatternLab.svelte - Toybox for the LED strip pattern engine.

  Generate algorithmic patterns or upload POV images, preview them flat,
  adjust persistence duration, and upload to physical poi hardware via BLE.
-->
<script lang="ts">

import { getPoiDeviceManager } from "#lib/features/poi/get-poi-device-manager.js";
import { getStripPatternEngine } from "#lib/features/poi/get-strip-pattern-engine.js";
  import { onDestroy } from "svelte";
  import { createPoiState } from "#lib/features/poi/state/poi-state.svelte.js";
  import { setPoiContext } from "#lib/features/poi/context/poi-context.js";
  import PatternPicker from "#lib/features/poi/components/PatternPicker.svelte";
  import PoiImageLibrary from "#lib/features/poi/components/PoiImageLibrary.svelte";
  import PovPreview from "#lib/features/poi/components/PovPreview.svelte";
  import PovSpinPreview from "#lib/features/poi/components/PovSpinPreview.svelte";
  import PovAnimatorPreview from "#lib/features/poi/components/PovAnimatorPreview.svelte";
  import LedStaffPreview from "#lib/features/poi/components/LedStaffPreview.svelte";
  import PatternTimeline from "#lib/features/poi/components/PatternTimeline.svelte";
  import StripPatternExporter from "#lib/features/poi/components/StripPatternExporter.svelte";
  import DevicePanel from "#lib/features/poi/components/DevicePanel.svelte";
  import ScrubValue from "#lib/shared/ui/components/ScrubbableNumber.svelte";
  import SequencePickerModal from "#lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  const poi = createPoiState(
    getStripPatternEngine(),
    getPoiDeviceManager(),
  );
  setPoiContext(poi);

  // Tear down the Firestore library subscription when the lab unmounts
  // so we don't leak onSnapshot listeners across module switches.
  onDestroy(() => {
    poi.dispose();
  });

  // Generate initial pattern on mount (skip if restoring an uploaded image)
  if (!poi.hasUploadedImage) {
    poi.generateFromPreset();
  }

  function setLedCount(v: number): void {
    const clamped = Math.round(Math.max(1, Math.min(256, v)));
    poi.setLedCount(clamped);
    poi.generateFromPreset();
  }

  function setFrameCount(v: number): void {
    const clamped = Math.round(Math.max(2, Math.min(500, v)));
    poi.setFrameCount(clamped);
    poi.generateFromPreset();
  }

  // The lab starts in abstract-beat mode; loading a sequence ties
  // the timeline's beat count to the sequence's step count so each
  // beat corresponds to a real TKA step the user can paint onto.
  let showSequencePicker = $state(false);

  function handleSequenceSelected(seq: SequenceData): void {
    poi.loadSequence(seq, seq.steps ?? []);
    showSequencePicker = false;
  }
</script>

<div class="pov-lab">
  <div class="sequence-header">
    {#if poi.loadedSequence}
      <div class="loaded-sequence">
        <i class="fas fa-music" aria-hidden="true"></i>
        <span class="seq-word">
          {poi.loadedSequence.word || poi.loadedSequence.name || "Untitled"}
        </span>
        <span class="seq-length">{poi.loadedSteps.length} steps</span>
        <button
          class="text-btn"
          onclick={() => poi.unloadSequence()}
          aria-label="Unload sequence"
        >
          Unload
        </button>
      </div>
    {:else}
      <button
        class="text-btn load-btn"
        onclick={() => (showSequencePicker = true)}
        aria-label="Load a sequence into the pattern lab"
      >
        <i class="fas fa-folder-open" aria-hidden="true"></i>
        Load sequence
      </button>
    {/if}
  </div>

  <div class="lab-grid">
    <!-- Column 1: pattern selection + controls -->
    <div class="controls-column">
      <PatternPicker />

      <PoiImageLibrary />

      <div class="params-section">
        <h3 class="section-title">Parameters</h3>

        <ScrubValue
          label="LEDs"
          value={poi.ledCount}
          min={1}
          max={256}
          step={1}
          onchange={setLedCount}
        />

        <ScrubValue
          label="Frames"
          value={poi.frameCount}
          min={2}
          max={500}
          step={1}
          onchange={setFrameCount}
        />
      </div>

      <PovPreview />

      <div class="bottom-row">
        <StripPatternExporter />
        {#if poi.activePattern}
          <div class="pattern-stats">
            <span>{poi.activePattern.metadata.name}</span>
            <span class="stat-dim">{poi.activePattern.metadata.source}</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- Column 2: spin disc (hero) - always the biggest element -->
    <div class="spin-column">
      <PovSpinPreview />
    </div>

    <!-- Column 3: motion preview + staff preview + devices -->
    <div class="side-column">
      <PovAnimatorPreview />
      <LedStaffPreview />
      <DevicePanel />
    </div>
  </div>

  <!-- Full-width pattern timeline below the main grid -->
  <div class="timeline-row">
    <PatternTimeline />
  </div>
</div>

<SequencePickerModal
  open={showSequencePicker}
  onSelect={handleSequenceSelected}
  onClose={() => (showSequencePicker = false)}
  title="Select Sequence for POV Pattern Lab"
/>

<style>
  .pov-lab {
    padding: 1rem 1.5rem;
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    /* Use the full available width. The lab was previously capped at
       900px, which wasted most of a 1440p/4K monitor. Now the layout
       breathes and the spin disc can actually get big. */
    container-type: inline-size;
  }

  .sequence-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .loaded-sequence {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.875rem;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.15));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255 255 255 / 0.05));
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-primary, #e2e8f0);
  }

  .loaded-sequence .fa-music {
    color: var(--theme-accent, #3b82f6);
  }

  .seq-word {
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .seq-length {
    color: var(--theme-text-secondary, #94a3b8);
    font-size: var(--font-size-compact, 12px);
  }

  .text-btn {
    height: 32px;
    padding: 0 0.875rem;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.15));
    border-radius: 16px;
    background: transparent;
    color: var(--theme-text-primary, #e2e8f0);
    cursor: pointer;
    font-size: var(--font-size-compact, 12px);
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    transition: border-color 0.15s, background 0.15s;
  }

  .text-btn:hover {
    border-color: var(--theme-accent, #3b82f6);
    background: rgba(59, 130, 246, 0.08);
  }

  .loaded-sequence .text-btn {
    margin-left: 0.5rem;
    height: 26px;
    padding: 0 0.75rem;
  }

  /*
    Three-column lab grid, responsive:
    - Default (wide screens, ≥1400px): three columns - controls / spin disc / side stack.
      Spin column is the hero; controls and side stack are narrower.
    - Medium (900-1400px): controls on the left, spin+side stacked on the right.
    - Narrow (<900px): everything single column.

    Using minmax with a min of 0 prevents grid blow-out when a child has
    intrinsic content wider than the track.
  */
  .lab-grid {
    display: grid;
    gap: 1.5rem;
    width: 100%;
    grid-template-columns: minmax(0, 320px) minmax(0, 1fr) minmax(0, 380px);
    align-items: start;
  }

  .timeline-row {
    width: 100%;
  }

  .controls-column,
  .spin-column,
  .side-column {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }

  /* Cap the spin disc on really huge screens so it doesn't become
     absurd, while still letting it breathe much larger than the old
     ~400px ceiling. */
  .spin-column {
    max-width: 900px;
    justify-self: center;
    width: 100%;
  }

  @container (max-width: 1400px) {
    .lab-grid {
      grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
    }
    .spin-column {
      grid-column: 2;
    }
    .side-column {
      grid-column: 2;
    }
  }

  @container (max-width: 900px) {
    .lab-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .spin-column,
    .side-column {
      grid-column: 1;
    }
  }

  .section-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-primary, #e2e8f0);
    margin: 0 0 0.5rem;
  }

  .params-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255 255 255 / 0.05));
  }

  .bottom-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .pattern-stats {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    background: var(--theme-card-bg, rgba(255 255 255 / 0.05));
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-primary, #e2e8f0);
    flex: 1;
  }

  .stat-dim {
    color: var(--theme-text-secondary, #94a3b8);
  }

</style>
