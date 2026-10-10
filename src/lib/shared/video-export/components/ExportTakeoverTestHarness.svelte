<!--
  Harness for ExportTakeover.svelte.svelte-tests: gives the overlay something
  underneath to block, and a way to drive `phase` from the test.
-->
<script lang="ts">
  import ExportTakeover from "./ExportTakeover.svelte";
  import type { ExportPhase } from "#lib/shared/compose/domain/video-export-types.js";

  interface Props {
    initialPhase?: ExportPhase;
    cancelDisabledReason?: string | null;
    withCancel?: boolean;
  }

  let {
    initialPhase = "idle",
    cancelDisabledReason = null,
    withCancel = true,
  }: Props = $props();

  let phase = $state<ExportPhase>(initialPhase);
  let progress = $state(0.42);
  let cancelCount = $state(0);
  let underneathClicks = $state(0);

  export function setPhase(next: ExportPhase) {
    phase = next;
  }

  function handleCancel() {
    cancelCount += 1;
    // Real hosts abort the export, which drives the phase back to idle.
    phase = "idle";
  }
</script>

<button data-testid="start-export" onclick={() => (phase = "capturing")}>
  Start export
</button>

<button data-testid="underneath" onclick={() => (underneathClicks += 1)}>
  Underneath
</button>

<output data-testid="cancel-count">{cancelCount}</output>
<output data-testid="underneath-clicks">{underneathClicks}</output>
<output data-testid="phase">{phase}</output>

<ExportTakeover
  {phase}
  {progress}
  phaseLabel="Capturing..."
  onCancel={withCancel ? handleCancel : undefined}
  {cancelDisabledReason}
/>
