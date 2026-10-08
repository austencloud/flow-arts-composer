<!--
  The camera bar over the stage. Which cameras show, the grid labels, and the
  reproduce-this link all change the stage, so they sit on it rather than in
  the rail, where they used to push the Reference video section down a screen.

  In Reference mode each video pane picks its own angle, so the layout control
  steps aside and the row keeps only what still applies.
-->
<script lang="ts">
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";

  import { INSPECTION_VIEWS } from "./inspection-framing";
  import type { LabView, StaffLabState } from "./lab-state.svelte";

  interface Props {
    lab: StaffLabState;
    /** Reference mode: the video panes own their camera angles. */
    referenceActive: boolean;
  }

  let { lab, referenceActive }: Props = $props();

  let copied = $state(false);
  let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

  const viewOptions = $derived([
    { value: "quad" as LabView, label: "Quad", ariaLabel: "All four cameras" },
    ...INSPECTION_VIEWS.map((view) => ({
      value: view.id as LabView,
      // The abbreviation is visual only; `ariaLabel` still says the full name.
      label: view.pickerLabel ?? view.label,
      ariaLabel: `${view.label} camera only`,
    })),
  ]);

  async function copyLink(): Promise<void> {
    lab.flushPhase();
    const href = lab.fullyQualifiedHref();
    try {
      await navigator.clipboard.writeText(href);
      copied = true;
      if (copyResetTimer) clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => (copied = false), 1600);
    } catch {
      // Clipboard permission is not something a lab should fight over; the
      // address bar already carries the same state.
      copied = false;
    }
  }
</script>

<div class="view-bar" role="toolbar" aria-label="Stage view">
  {#if !referenceActive}
    <div class="layout">
      <SegmentedControl
        options={viewOptions}
        value={lab.view}
        density="tight"
        ariaLabel="Camera layout"
        onchange={(view) => lab.setView(view)}
      />
    </div>
  {/if}
  <div class="actions">
    <FilterChipBase
      mode="toggle"
      icon="fa-tag"
      label="Grid labels"
      size="sm"
      active={lab.gridLabels}
      onclick={() => lab.setGridLabels(!lab.gridLabels)}
    />
    <!-- Fixed width so "Copy link" and "Link copied" swap without a shove. -->
    <div class="copy-slot">
      <FilterChipBase
        mode="action"
        icon={copied ? "fa-check" : "fa-link"}
        label={copied ? "Link copied" : "Copy link"}
        size="sm"
        ariaLabel="Copy a link that reproduces this exact configuration"
        onclick={copyLink}
      />
    </div>
  </div>
</div>

<style>
  .view-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 0.75rem;
    min-width: 0;
    padding: 0.5rem 0.75rem;
  }

  /*
   * A 20rem basis lets the layout share a row with the two chips down to a
   * landscape phone's stage; a 34rem basis wrapped them onto a second row
   * there and took ~50px from four views that only had ~300px between them.
   */
  .layout {
    flex: 1 1 20rem;
    max-width: 34rem;
    min-width: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-left: auto;
  }

  .copy-slot {
    display: flex;
    min-width: 8.5rem;
  }
</style>
