<script lang="ts">
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import ScrubbableNumber from "#lib/shared/ui/components/ScrubbableNumber.svelte";
  import { getThirdOrderContext } from "../context/third-order-context";
  import type {
    ThirdOrderCarrierLane,
    ThirdOrderOrientationMode,
    ThirdOrderTimingMode,
  } from "../domain/third-order-composition";

  let { embedded = false }: { embedded?: boolean } = $props();
  const state = getThirdOrderContext();
  const laneOptions = $derived([
    {
      value: "left",
      label:
        state.composition.carrierPath.mode === "flower"
          ? "Blue path"
          : "Blue carrier",
      shortLabel: "Blue",
      tone: "blue",
    },
    {
      value: "right",
      label:
        state.composition.carrierPath.mode === "flower"
          ? "Red path"
          : "Red carrier",
      shortLabel: "Red",
      tone: "red",
    },
  ] satisfies Array<{
    value: ThirdOrderCarrierLane;
    label: string;
    shortLabel: string;
    tone: "blue" | "red";
  }>);
  const orientationOptions = [
    {
      value: "world",
      label: "World locked",
      shortLabel: "World",
    },
    {
      value: "radial",
      label: "Radial to center",
      shortLabel: "Radial",
    },
    {
      value: "tangent",
      label: "Follow path tangent",
      shortLabel: "Tangent",
    },
    {
      value: "carrier",
      label: "Follow carrier heading",
      shortLabel: "Carrier",
    },
  ] satisfies Array<{
    value: ThirdOrderOrientationMode;
    label: string;
    shortLabel: string;
  }>;
  const timingOptions = [
    { value: "phrase", label: "Fit to outer path", shortLabel: "Fit" },
    { value: "beats", label: "Shared counts", shortLabel: "Counts" },
    { value: "independent", label: "Independent rate", shortLabel: "Rate" },
  ] satisfies Array<{
    value: ThirdOrderTimingMode;
    label: string;
    shortLabel: string;
  }>;

  const orientationHelp = $derived<Record<ThirdOrderOrientationMode, string>>({
    world:
      "The child grid keeps one fixed orientation while its center travels.",
    radial:
      "The child grid’s north axis always points toward the parent center.",
    tangent:
      "The child grid turns to face the direction its center is traveling.",
    carrier:
      state.composition.carrierPath.mode === "flower"
        ? "The child grid turns with the flower’s primary orbit vector."
        : "The child grid inherits the carrier prop’s own staff direction.",
  });
  const timingHelp: Record<ThirdOrderTimingMode, string> = {
    phrase: "The child completes one sequence during one complete outer path.",
    beats: "Child and carrier advance count-for-count; shorter sequences loop.",
    independent: "The child advances from the master clock at its own rate.",
  };
</script>

<section class="inspector" class:embedded aria-label="Third Order controls">
  <header class="inspector-header">
    <div>
      <span class="context-label">Selected system</span>
      <h2>{state.selectedChild.label}</h2>
    </div>
    <button
      class="visibility-button"
      class:muted={!state.selectedChild.visible}
      type="button"
      aria-pressed={state.selectedChild.visible}
      onclick={() =>
        state.setChildVisible(
          state.selectedChildId,
          !state.selectedChild.visible
        )}
    >
      <i
        class="fas {state.selectedChild.visible ? 'fa-eye' : 'fa-eye-slash'}"
        aria-hidden="true"
      ></i>
      {state.selectedChild.visible ? "Visible" : "Hidden"}
    </button>
  </header>

  <section class="control-section">
    <div class="section-heading">
      <h3>
        {state.composition.carrierPath.mode === "flower"
          ? "Path lane"
          : "Carrier lane"}
      </h3>
      <p>Which parent relationship lane moves this whole grid?</p>
    </div>
    <SegmentedControl
      options={laneOptions}
      value={state.selectedChild.lane}
      onchange={(lane) => state.setChildLane(state.selectedChildId, lane)}
      semantics="radiogroup"
      ariaLabel="Parent path lane"
    />
  </section>

  <section class="control-section">
    <div class="section-heading">
      <h3>Frame orientation</h3>
      <p>How does the child coordinate system turn along its route?</p>
    </div>
    <SegmentedControl
      options={orientationOptions}
      value={state.selectedChild.orientationMode}
      onchange={(mode) =>
        state.setChildOrientation(state.selectedChildId, mode)}
      columns={2}
      density="compact"
      semantics="radiogroup"
      ariaLabel="Frame orientation"
    />
    <Crossfade key={state.selectedChild.orientationMode} animateHeight>
      <p class="choice-help">
        {orientationHelp[state.selectedChild.orientationMode]}
      </p>
    </Crossfade>
  </section>

  <section class="control-section">
    <div class="section-heading">
      <h3>Inner timing</h3>
      <p>How the child sequence advances against the carrier.</p>
    </div>
    <SegmentedControl
      options={timingOptions}
      value={state.selectedChild.timingMode}
      onchange={(mode) => state.setChildTiming(state.selectedChildId, mode)}
      columns={3}
      density="tight"
      semantics="radiogroup"
      ariaLabel="Inner timing"
    />
    <Crossfade key={state.selectedChild.timingMode} animateHeight>
      <p class="choice-help">{timingHelp[state.selectedChild.timingMode]}</p>
    </Crossfade>
    {#if state.selectedChild.timingMode === "independent"}
      <div class="rate-row">
        <span>Playback rate</span>
        <ScrubbableNumber
          value={state.selectedChild.rate}
          min={0.1}
          max={4}
          step={0.1}
          label="Child playback rate"
          unit="×"
          showLabel={false}
          onchange={(rate) => state.setChildRate(state.selectedChildId, rate)}
        />
      </div>
    {/if}
  </section>
</section>

<style>
  .inspector {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
    min-width: 0;
    padding: 16px;
    overflow: auto;
    background: var(--theme-panel-bg);
  }
  .inspector.embedded {
    height: auto;
    margin-top: 16px;
    padding: 16px 0 0;
    overflow: visible;
    border-top: 1px solid var(--theme-stroke);
    background: transparent;
  }
  .inspector-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .inspector-header h2 {
    margin: 4px 0 0;
    color: var(--theme-text, #fff);
    font-size: 18px;
  }
  .context-label {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .visibility-button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 11px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
  }
  .visibility-button.muted {
    color: var(--theme-text-dim, #9ca3af);
  }
  .control-section {
    display: grid;
    gap: 11px;
    padding-top: 17px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }
  .section-heading {
    display: grid;
    gap: 4px;
  }
  .section-heading h3 {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 14px;
  }
  .section-heading p {
    margin: 0;
    color: var(--theme-text-dim, #9ca3af);
    font-size: 12px;
    line-height: 1.45;
  }
  .choice-help {
    min-height: 36px;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--border-radius-md, 8px);
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.45;
  }
  .rate-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 46px;
    color: var(--theme-text-dim, #aeb5c1);
    font-size: var(--font-size-min, 14px);
  }
</style>
