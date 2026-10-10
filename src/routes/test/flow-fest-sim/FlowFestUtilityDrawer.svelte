<script lang="ts">
  import { onDestroy } from "svelte";
  import FlowFestFieldPositioningPanel from "#lib/features/flow-fest-sim/components/FlowFestFieldPositioningPanel.svelte";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";

  interface Props {
    isOpen?: boolean;
    mounted: boolean;
    /** In the driver's seat: the play card lists the car's keys. */
    driving: boolean;
    soundOn: boolean;
    /** Live camera eye as `x, y, z` metres, or empty before the first report. */
    viewpointCoordinates: string;
    /** Absolute link that reopens the sim on this exact viewpoint. */
    viewpointHref: string;
    showFieldPositioning: boolean;
    captureMode: boolean;
    showReviewTools: boolean;
    onToggleSound: () => void;
    onRestart: () => void;
    onStartOver: () => void;
    onReviewGate: () => void;
    onReviewEntrance: () => void;
    onReviewParkingGate: () => void;
    onReviewCamp: () => void;
    onReviewFestival: () => void;
  }

  let {
    isOpen = $bindable(false),
    mounted,
    driving,
    soundOn,
    viewpointCoordinates,
    viewpointHref,
    showFieldPositioning,
    captureMode,
    showReviewTools,
    onToggleSound,
    onRestart,
    onStartOver,
    onReviewGate,
    onReviewEntrance,
    onReviewParkingGate,
    onReviewCamp,
    onReviewFestival,
  }: Props = $props();

  // Transient copy feedback on a fixed-width button, so the label swap cannot
  // move anything around it.
  let copyState = $state<"idle" | "copied" | "failed">("idle");
  let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

  async function copyViewpointLink(): Promise<void> {
    if (!viewpointHref) return;
    try {
      await navigator.clipboard.writeText(viewpointHref);
      copyState = "copied";
    } catch {
      // The address bar already carries the same link, so a blocked clipboard
      // costs a manual copy rather than the viewpoint. Say so instead of
      // reporting a success that did not happen.
      copyState = "failed";
    }
    if (copyResetTimer) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => (copyState = "idle"), 2200);
  }

  onDestroy(() => {
    if (copyResetTimer) clearTimeout(copyResetTimer);
  });

  const controlGroups = $derived(
    driving
      ? [
          { keys: "W", label: "Accelerate" },
          { keys: "A / D", label: "Steer" },
          { keys: "S", label: "Brake or reverse" },
          { keys: "E", label: "Get out once stopped" },
          { keys: "Mouse", label: "Look around" },
        ]
      : mounted
        ? [
            { keys: "W", label: "Accelerate" },
            { keys: "A / D", label: "Steer" },
            { keys: "S", label: "Brake or reverse" },
            { keys: "Ctrl", label: "Regenerative braking" },
            { keys: "Shift", label: "Performance mode" },
            { keys: "E", label: "Park the wheel" },
            { keys: "Mouse", label: "Look around" },
          ]
        : [
            { keys: "WASD", label: "Walk" },
            { keys: "Shift", label: "Sprint" },
            { keys: "Ctrl", label: "Crouch" },
            { keys: "Space", label: "Jump" },
            { keys: "E", label: "Get in the car or mount the wheel" },
            { keys: "Mouse", label: "Look around" },
          ]
  );
</script>

<Drawer
  bind:isOpen
  placement="right"
  respectLayoutMode
  showHandle={false}
  focusContainerOnOpen
  ariaLabel="Festival guide"
  class="flow-fest-guide-drawer"
>
  <div class="guide themed-scrollbar">
    <header>
      <div>
        <span>Festival guide</span>
        <h2>Controls and utilities</h2>
      </div>
      <button
        class="close-button"
        type="button"
        aria-label="Close festival guide"
        onclick={() => (isOpen = false)}
      >
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    </header>

    <section aria-labelledby="flow-fest-controls-heading">
      <div class="section-heading">
        <span>Play</span>
        <h3 id="flow-fest-controls-heading">
          {driving ? "Driving" : mounted ? "Electric unicycle" : "On foot"}
        </h3>
      </div>
      <dl class="control-list">
        {#each controlGroups as control}
          <div>
            <dt><kbd>{control.keys}</kbd></dt>
            <dd>{control.label}</dd>
          </div>
        {/each}
      </dl>
    </section>

    <section aria-labelledby="flow-fest-utilities-heading">
      <div class="section-heading">
        <span>Utilities</span>
        <h3 id="flow-fest-utilities-heading">Session</h3>
      </div>
      <div class="utility-actions">
        <button type="button" onclick={onToggleSound}>
          <i
            class="fas {soundOn ? 'fa-volume-high' : 'fa-volume-xmark'}"
            aria-hidden="true"
          ></i>
          Sound {soundOn ? "on" : "off"}
        </button>
        <button type="button" onclick={onRestart}>
          <i class="fas fa-arrow-rotate-left" aria-hidden="true"></i>
          Restart journey
        </button>
        <button type="button" onclick={onStartOver}>
          <i class="fas fa-suitcase-rolling" aria-hidden="true"></i>
          Back to the loadout
        </button>
        <a href="/test/flow-fest-graybox">
          <i class="fas fa-ruler-combined" aria-hidden="true"></i>
          Open survey view
        </a>
        <button
          type="button"
          class="viewpoint"
          aria-disabled={!viewpointHref}
          onclick={() => void copyViewpointLink()}
        >
          <i class="fas fa-link" aria-hidden="true"></i>
          <span>
            {copyState === "copied"
              ? "Link copied"
              : copyState === "failed"
                ? "Copy blocked"
                : "Copy view link"}
            <small>{viewpointCoordinates || "—"}</small>
          </span>
        </button>
      </div>
      <p class="map-source">
        Map: ODOT road centreline · 2023 public-domain NAIP imagery · Austen's
        on-site traces
      </p>
    </section>

    {#if showFieldPositioning}
      <section aria-labelledby="flow-fest-field-heading">
        <div class="section-heading">
          <span>Optional</span>
          <h3 id="flow-fest-field-heading">Use your real location</h3>
        </div>
        <FlowFestFieldPositioningPanel surface="drawer" {captureMode} />
      </section>
    {/if}

    {#if showReviewTools}
      <section aria-labelledby="flow-fest-review-heading">
        <div class="section-heading">
          <span>Capture mode</span>
          <h3 id="flow-fest-review-heading">Review locations</h3>
        </div>
        <div class="review-actions">
          <button type="button" onclick={onReviewGate}>Lower gate</button>
          <button type="button" onclick={onReviewEntrance}>East entrance</button
          >
          <button type="button" onclick={onReviewParkingGate}
            >Parking gate</button
          >
          <button type="button" onclick={onReviewCamp}>Selected camp</button>
          <button type="button" onclick={onReviewFestival}>Fire circle</button>
        </div>
      </section>
    {/if}
  </div>
</Drawer>

<style>
  :global(dialog.flow-fest-guide-drawer) {
    --sheet-width: min(31rem, 94vw);
    --sheet-bg: var(--hud-drawer-bg, #101814);
    --sheet-filter: none;
    --sheet-border-strong: 1px solid
      var(--theme-stroke-strong, rgba(237, 238, 210, 0.24));
    --sheet-shadow: -1.5rem 0 4rem rgba(2, 7, 4, 0.42);
    --sheet-backdrop-bg: rgba(2, 7, 4, 0.48);
    --sheet-radius-large: 1.2rem;
    color: var(--theme-text, #fffaf0);
  }

  .guide {
    display: grid;
    align-content: start;
    gap: 1.2rem;
    block-size: 100%;
    overflow-y: auto;
    padding: 1.2rem;
    color: var(--sim-text, var(--theme-text, #fffaf0));
  }

  header,
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  header > div,
  .section-heading {
    min-inline-size: 0;
  }

  header span,
  .section-heading span {
    color: var(--sim-accent, #ffb45f);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 820;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2,
  h3 {
    margin: 0;
  }

  h2 {
    margin-block-start: 0.12rem;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.55rem;
    font-weight: 560;
  }

  section {
    display: grid;
    gap: 0.75rem;
    padding: 0.95rem;
    border: 1px solid var(--sim-stroke, rgba(237, 238, 210, 0.18));
    border-radius: 0.95rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.045));
  }

  .section-heading {
    display: grid;
    justify-content: stretch;
    gap: 0.08rem;
  }

  h3 {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 760;
  }

  .close-button,
  .utility-actions button,
  .utility-actions a,
  .review-actions button {
    min-block-size: var(--min-touch-target, 2.75rem);
    border: 1px solid var(--sim-stroke, rgba(237, 238, 210, 0.18));
    border-radius: 0.72rem;
    color: var(--sim-text, #fffaf0);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.055));
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    cursor: pointer;
  }

  .close-button {
    flex: 0 0 auto;
    inline-size: var(--min-touch-target, 2.75rem);
    padding: 0;
  }

  .close-button:hover,
  .close-button:focus-visible,
  .utility-actions button:hover,
  .utility-actions button:focus-visible,
  .utility-actions a:hover,
  .utility-actions a:focus-visible,
  .review-actions button:hover,
  .review-actions button:focus-visible {
    border-color: var(--sim-accent, #ffb45f);
    outline: none;
  }

  .control-list {
    display: grid;
    gap: 0.42rem;
    margin: 0;
  }

  .control-list > div {
    display: grid;
    grid-template-columns: 6.7rem minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    min-block-size: 2.35rem;
  }

  dt,
  dd {
    margin: 0;
  }

  dd {
    color: var(--sim-muted, #c9cebd);
    font-size: var(--font-size-min, 0.875rem);
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-block-size: 2rem;
    min-inline-size: 3rem;
    padding-inline: 0.48rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-block-end-color: rgba(255, 255, 255, 0.4);
    border-radius: 0.45rem;
    background: rgba(255, 255, 255, 0.07);
    color: var(--sim-text, #fffaf0);
    font:
      720 var(--font-size-compact, 0.75rem) / 1 ui-monospace,
      SFMono-Regular,
      Consolas,
      monospace;
  }

  .utility-actions,
  .review-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .utility-actions button,
  .utility-actions a {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.55rem;
    padding-inline: 0.75rem;
    text-decoration: none;
  }

  .utility-actions a,
  .utility-actions .viewpoint {
    grid-column: 1 / -1;
  }

  .utility-actions .viewpoint {
    align-items: center;
    padding-block: 0.42rem;
  }

  .utility-actions .viewpoint span {
    display: grid;
    justify-items: start;
    min-inline-size: 0;
  }

  .utility-actions .viewpoint small {
    color: var(--sim-muted, #c9cebd);
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
  }

  .utility-actions .viewpoint[aria-disabled="true"] {
    opacity: 0.5;
    cursor: default;
  }

  .map-source {
    margin: 0;
    color: var(--sim-muted, #c9cebd);
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.4;
  }

  .review-actions {
    grid-template-columns: repeat(3, 1fr);
  }

  .review-actions button {
    padding-inline: 0.5rem;
  }

  @media (max-width: 30rem) {
    .guide {
      gap: 0.8rem;
      padding: 0.8rem;
    }

    section {
      padding: 0.78rem;
    }

    .review-actions {
      grid-template-columns: 1fr;
    }
  }
</style>
