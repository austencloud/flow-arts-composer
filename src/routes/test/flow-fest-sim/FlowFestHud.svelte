<script lang="ts">
  import { onDestroy } from "svelte";
  import ActionButton from "#lib/shared/components/selection/ActionButton.svelte";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { FlowFestMobilityRuntimeUpdate } from "#lib/features/flow-fest-sim/state/flow-fest-mobility-state.svelte.js";
  import { FLOW_FEST_GAMEPLAY_WALK_SPEED_METERS_PER_SECOND } from "#lib/features/flow-fest-sim/domain/flow-fest-simulation-contract.js";
  import { flowFestCarSpec } from "#lib/features/flow-fest-sim/domain/flow-fest-car.js";
  import {
    flowFestGroundVehicleSpeedKilometresPerHour,
    flowFestGroundVehicleSpeedMilesPerHour,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-ground-vehicle.js";
  import type {
    FlowFestObjective,
    FlowFestProgressState,
  } from "#lib/features/flow-fest-sim/state/flow-fest-progress.js";
  import type {
    FlowFestBranchId,
    FlowFestRuntimeContract,
    FlowFestRuntimeZone,
  } from "../flow-fest-graybox/flow-fest-runtime-contract";
  import FlowFestFestivalMap from "./FlowFestFestivalMap.svelte";
  import FlowFestUtilityDrawer from "./FlowFestUtilityDrawer.svelte";

  interface Props {
    ready: boolean;
    timeLabel: string;
    objective: FlowFestObjective | null;
    progress: FlowFestProgressState | null;
    contract: FlowFestRuntimeContract | null;
    selectedBranch: FlowFestBranchId;
    position: { x: number; z: number };
    headingRadians: number;
    /** Live camera eye as `x, y, z` metres, or empty before the first report. */
    viewpointCoordinates: string;
    /** Absolute link that reopens the sim on this exact viewpoint. */
    viewpointHref: string;
    targetZone: FlowFestRuntimeZone | null;
    targetDistance: number | null;
    mobility: FlowFestMobilityRuntimeUpdate;
    electricUnicycleSpeedMph: number;
    electricUnicycleSpeedKph: number;
    objectiveActionDisabled: boolean;
    soundOn: boolean;
    showFieldPositioning: boolean;
    captureMode: boolean;
    showReviewTools: boolean;
    onObjectiveAction: () => void;
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
    ready,
    timeLabel,
    objective,
    progress,
    contract,
    selectedBranch,
    position,
    headingRadians,
    viewpointCoordinates,
    viewpointHref,
    targetZone,
    targetDistance,
    mobility,
    electricUnicycleSpeedMph,
    electricUnicycleSpeedKph,
    objectiveActionDisabled,
    soundOn,
    showFieldPositioning,
    captureMode,
    showReviewTools,
    onObjectiveAction,
    onToggleSound,
    onRestart,
    onStartOver,
    onReviewGate,
    onReviewEntrance,
    onReviewParkingGate,
    onReviewCamp,
    onReviewFestival,
  }: Props = $props();

  /** How long a new objective's supporting sentence stays on screen. */
  const DETAIL_DWELL_MS = 7000;

  let guideOpen = $state(false);
  /** Leaving for the loadout screen closes the guide behind it. */
  function closeGuideAndStartOver(): void {
    guideOpen = false;
    onStartOver();
  }
  /**
   * The mobility card parks under the map on narrow viewports, so it needs
   * the map's real rendered height rather than a guessed offset.
   */
  let mapDockBlockSize = $state(0);

  /*
   * The objective sentence explains a goal once, when it changes, and then
   * gets out of the way. Keeping it on screen for the whole leg turned the
   * objective into a paragraph the player had already read.
   */
  let detailVisible = $state(false);
  let detailTimer: ReturnType<typeof setTimeout> | null = null;
  let lastDetailTitle = "";

  $effect(() => {
    const title = objective?.title ?? "";
    if (title === lastDetailTitle) return;
    lastDetailTitle = title;
    if (detailTimer) clearTimeout(detailTimer);
    detailVisible = Boolean(title);
    if (!detailVisible) return;
    detailTimer = setTimeout(() => (detailVisible = false), DETAIL_DWELL_MS);
  });

  onDestroy(() => {
    if (detailTimer) clearTimeout(detailTimer);
  });

  const objectiveVisible = $derived(
    ready &&
      objective !== null &&
      progress?.phase !== "loadout" &&
      progress?.phase !== "choose-camp"
  );
  const car = $derived(mobility.car ?? null);
  const driving = $derived(Boolean(car?.driving));
  const carLabel = $derived(car ? flowFestCarSpec(car.modelId).label : "");
  const carSpeedMph = $derived(
    car
      ? flowFestGroundVehicleSpeedMilesPerHour(
          car.dynamics.speedMetersPerSecond
        )
      : 0
  );
  const carSpeedKph = $derived(
    car
      ? flowFestGroundVehicleSpeedKilometresPerHour(
          car.dynamics.speedMetersPerSecond
        )
      : 0
  );
  const energyPercent = $derived(
    Math.max(0, Math.min(100, progress?.energyPercent ?? 0))
  );
  /** The loadout screen owns the view until the car leaves. */
  const inWorld = $derived(ready && progress?.phase !== "loadout");
  /**
   * The loadout screen is a translucent panel over the site. The wordmark
   * and the minimap would show through it, so the chrome waits until the
   * player is actually in the world. While the scene is still loading the
   * wordmark stays, as it always has.
   */
  const chromeVisible = $derived(progress?.phase !== "loadout");
  const showObjectiveAction = $derived(
    Boolean(objective?.actionLabel) && !objectiveActionDisabled
  );
  /**
   * Running needs both halves. Shift alone is a request the body may not be
   * able to honour - blocked by a car, backpedalling, or still standing still
   * - and speed alone climbs the same way on a downhill walk. The label
   * changes only once the player asked to run and the body is genuinely
   * travelling faster than its walk.
   */
  const carStateLabel = $derived.by(() => {
    if (!car) return "Stopped";
    const speed = car.dynamics.speedMetersPerSecond;
    if (speed < -0.05) return "Reversing";
    if (Math.abs(speed) <= 0.3) return "Stopped";
    return car.input.brake > 0 ? "Braking" : "Driving";
  });
  const mobilityStateLabel = $derived(
    driving
      ? carStateLabel
      : mobility.mounted
        ? mobility.input.performanceMode
          ? "Performance"
          : "Cruise"
        : mobility.onFoot.sprinting &&
            mobility.onFoot.speedMetersPerSecond >
              FLOW_FEST_GAMEPLAY_WALK_SPEED_METERS_PER_SECOND
          ? "Running"
          : "Walking"
  );
</script>

{#if chromeVisible}
  <div class="hud-brand">
    <div class="wordmark">
      <strong>FLOW FEST</strong>
      <span>{timeLabel}</span>
    </div>
    <button
      type="button"
      aria-label="Open festival guide and controls"
      aria-expanded={guideOpen}
      onclick={() => (guideOpen = true)}
    >
      <i class="fas fa-compass" aria-hidden="true"></i>
    </button>
  </div>

  <div class="map-dock" bind:clientHeight={mapDockBlockSize}>
    <FlowFestFestivalMap
      {contract}
      branch={selectedBranch}
      player={position}
      {headingRadians}
      {targetZone}
      {targetDistance}
    />
  </div>
{/if}

<div class="hud-foot">
  {#if inWorld && car?.edgeMessage}
    <div class="prompt edge" role="status">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      <span>{car.edgeMessage}</span>
    </div>
  {/if}

  {#if inWorld && mobility.interactionMessage}
    <div class="prompt">
      <kbd>E</kbd>
      <span>{mobility.interactionMessage}</span>
    </div>
  {/if}

  {#if objectiveVisible && objective}
    <section class="objective" aria-live="polite">
      <div class="objective-line">
        <span class="eyebrow">{objective.eyebrow}</span>
        <h1>{objective.title}</h1>
        {#if targetDistance !== null}
          <strong class="range">{Math.round(targetDistance)} m</strong>
        {/if}
        {#if showObjectiveAction && objective.actionLabel}
          <ActionButton
            label={objective.actionLabel}
            icon={progress?.phase === "morning"
              ? "fa-arrow-rotate-left"
              : "fa-arrow-right"}
            color="fuse"
            onclick={onObjectiveAction}
          />
        {/if}
      </div>

      {#if detailVisible}
        <p transition:growFade={{ duration: DURATION.emphasis }}>
          {objective.detail}
        </p>
      {/if}

      <div
        class="objective-progress"
        role="progressbar"
        aria-label="Arrival progress"
        aria-valuemin="0"
        aria-valuemax={objective.progressTotal}
        aria-valuenow={objective.progressStep}
      >
        <span
          style:inline-size={`${(objective.progressStep / objective.progressTotal) * 100}%`}
        ></span>
      </div>
    </section>
  {/if}
</div>

{#if inWorld}
  <aside
    class="mobility-card"
    style:--hud-map-block-size="{mapDockBlockSize}px"
    aria-live="polite"
  >
    <div class="mobility-heading">
      <span>{driving ? carLabel : mobility.mounted ? "EUC" : "On foot"}</span>
      <strong class:performance={mobility.input.performanceMode}>
        {mobilityStateLabel}
      </strong>
    </div>

    {#if driving}
      <div class="speed">
        <strong>{carSpeedMph.toFixed(0)}</strong>
        <span>mph<small>{carSpeedKph.toFixed(0)} km/h</small></span>
      </div>
      <div
        class="battery energy"
        role="meter"
        aria-label="Energy"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(energyPercent)}
      >
        <span><i style:inline-size={`${energyPercent}%`}></i></span>
        <strong>{Math.round(energyPercent)}%</strong>
      </div>
    {:else if mobility.mounted}
      <div class="speed">
        <strong>{electricUnicycleSpeedMph.toFixed(1)}</strong>
        <span>mph<small>{electricUnicycleSpeedKph.toFixed(1)} km/h</small></span
        >
      </div>
      <div class="battery">
        <span
          ><i style:inline-size={`${mobility.dynamics.batteryPercent}%`}
          ></i></span
        >
        <strong>{Math.round(mobility.dynamics.batteryPercent)}%</strong>
      </div>
    {/if}
  </aside>
{/if}

<FlowFestUtilityDrawer
  bind:isOpen={guideOpen}
  mounted={mobility.mounted}
  {driving}
  {soundOn}
  {viewpointCoordinates}
  {viewpointHref}
  {showFieldPositioning}
  {captureMode}
  {showReviewTools}
  {onToggleSound}
  {onRestart}
  onStartOver={closeGuideAndStartOver}
  {onReviewGate}
  {onReviewEntrance}
  {onReviewParkingGate}
  {onReviewCamp}
  {onReviewFestival}
/>

<style>
  .hud-brand,
  .objective,
  .prompt,
  .mobility-card {
    border: 1px solid var(--sim-stroke);
    color: var(--sim-text);
    background: var(--sim-panel-strong);
    box-shadow: 0 1rem 2.6rem rgba(2, 7, 4, 0.28);
  }

  .hud-brand {
    position: absolute;
    inset-block-start: clamp(0.6rem, 1.1vw, 1rem);
    inset-inline-start: clamp(0.6rem, 1.1vw, 1rem);
    z-index: 34;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.3rem 0.3rem 0.6rem;
    border-radius: 0.7rem;
  }

  .wordmark {
    display: grid;
    gap: 0.02rem;
  }

  .wordmark strong {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 0.9rem;
    font-weight: 620;
    letter-spacing: 0.07em;
    line-height: 1.1;
  }

  .wordmark span {
    color: var(--sim-muted);
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }

  .hud-brand button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 2.1rem;
    block-size: 2.1rem;
    min-inline-size: 0;
    min-block-size: 0;
    padding: 0;
    border: 1px solid var(--sim-stroke);
    border-radius: 0.55rem;
    color: var(--sim-accent);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.055));
    font: inherit;
    cursor: pointer;
  }

  /*
   * The visible control is deliberately smaller than the touch floor so the
   * brand stays a badge rather than a toolbar; the hit area meets the floor by
   * extending past the button.
   */
  .hud-brand button::after {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    inline-size: var(--min-touch-target);
    block-size: var(--min-touch-target);
    translate: -50% -50%;
    content: "";
  }

  .hud-brand button:hover,
  .hud-brand button:focus-visible {
    border-color: var(--sim-accent);
    outline: none;
  }

  .map-dock {
    position: absolute;
    inset-block-start: clamp(0.6rem, 1.1vw, 1rem);
    inset-inline-end: clamp(0.6rem, 1.1vw, 1rem);
    z-index: 33;
  }

  /*
   * One bottom-centred column. The objective and the interaction prompt are
   * both "what do I do next", so they stack in the same place instead of
   * claiming two corners, and the column grows upward as content arrives.
   */
  .hud-foot {
    position: absolute;
    inset-block-end: clamp(0.6rem, 1.1vw, 1rem);
    inset-inline-start: 50%;
    z-index: 35;
    display: grid;
    gap: 0.45rem;
    justify-items: center;
    /*
     * An explicit width, not a max: an absolutely positioned box anchored at
     * 50% only gets the right-hand half of the viewport to shrink-to-fit in,
     * which truncated the objective long before the column ran out of room.
     */
    inline-size: min(38rem, calc(100vw - 2rem));
    translate: -50% 0;
  }

  .prompt {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.3rem 0.6rem 0.3rem 0.35rem;
    border-color: rgba(255, 180, 95, 0.28);
    border-radius: 0.6rem;
    background: rgba(24, 16, 8, 0.72);
  }

  .prompt span {
    font-size: var(--font-size-compact, 0.75rem);
    white-space: nowrap;
  }

  .objective {
    display: grid;
    gap: 0.4rem;
    inline-size: 100%;
    padding: 0.5rem 0.7rem 0.55rem;
    border-radius: 0.8rem;
    pointer-events: auto;
  }

  /*
   * The row wraps rather than truncating: a destination the player cannot read
   * is worse than a capsule that grows one line. It is bottom-anchored, so the
   * extra line grows upward into empty sky.
   */
  .objective-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.35rem 0.55rem;
  }

  .eyebrow {
    flex: 0 0 auto;
    color: var(--sim-accent);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 820;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1,
  p {
    margin: 0;
  }

  h1 {
    min-inline-size: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.05rem;
    font-weight: 560;
    line-height: 1.15;
    text-align: center;
  }

  .range {
    flex: 0 0 auto;
    color: var(--sim-mint);
    font-size: var(--font-size-min, 0.875rem);
    font-variant-numeric: tabular-nums;
  }

  p {
    color: var(--sim-muted);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.4;
    text-align: center;
  }

  .objective-progress {
    block-size: 0.16rem;
    inline-size: 100%;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
  }

  .objective-progress span {
    display: block;
    block-size: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--sim-accent), #ed6f56);
    transition: inline-size 480ms ease;
  }

  .mobility-card {
    position: absolute;
    inset-inline-end: clamp(0.6rem, 1.1vw, 1rem);
    inset-block-end: clamp(0.6rem, 1.1vw, 1rem);
    z-index: 34;
    display: grid;
    gap: 0.4rem;
    /* Fits the widest heading pair, "On foot" beside "Performance". */
    inline-size: 11.75rem;
    padding: 0.55rem 0.65rem;
    border-radius: 0.8rem;
    pointer-events: none;
  }

  .mobility-heading,
  .speed,
  .battery {
    display: flex;
    align-items: center;
  }

  .mobility-heading,
  .battery {
    justify-content: space-between;
    gap: 0.35rem;
  }

  .mobility-heading > span {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--sim-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 780;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  /*
   * Every label in this row is enumerable, so the widest one reserves the
   * space and the row never resizes as the state changes.
   */
  .mobility-heading > strong {
    min-inline-size: 5.6rem;
    white-space: nowrap;
    color: var(--sim-mint);
    font-size: var(--font-size-compact, 0.75rem);
    text-align: end;
  }

  .mobility-heading > strong.performance {
    color: var(--sim-accent);
  }

  .speed {
    align-items: flex-end;
    gap: 0.4rem;
  }

  .speed > strong {
    min-inline-size: 3.5rem;
    font:
      580 1.95rem/0.9 Georgia,
      "Times New Roman",
      serif;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.04em;
  }

  .speed > span {
    display: grid;
    min-inline-size: 0;
    color: var(--sim-accent);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    text-transform: uppercase;
  }

  .speed small {
    color: var(--sim-muted);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    text-transform: none;
    white-space: nowrap;
  }

  .battery > span {
    flex: 1;
    min-inline-size: 0;
    block-size: 0.28rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
  }

  .battery i {
    display: block;
    block-size: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #67cfab, #c4e58c);
    transition: inline-size 180ms linear;
  }

  .battery strong {
    min-inline-size: 2.6rem;
    color: var(--sim-mint);
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
    text-align: end;
  }

  .battery.energy i {
    background: linear-gradient(90deg, var(--sim-accent), #ed6f56);
  }

  .battery.energy strong {
    color: var(--sim-accent);
  }

  .prompt.edge {
    border-color: rgba(237, 111, 86, 0.5);
  }

  .prompt.edge i {
    color: var(--sim-accent);
    font-size: var(--font-size-compact, 0.75rem);
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 1.7rem;
    min-block-size: 1.6rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-block-end-color: rgba(255, 255, 255, 0.4);
    border-radius: 0.4rem;
    background: rgba(255, 255, 255, 0.07);
    font:
      720 var(--font-size-compact, 0.75rem) / 1 ui-monospace,
      monospace;
  }

  /*
   * Phone portrait: the bottom column and the mobility card cannot share the
   * bottom edge, so the card moves under the map and the column takes the
   * full width. Nothing is hidden; the layout recomposes.
   */
  @media (max-width: 63rem) {
    .map-dock {
      /* A fifth of a tablet's width is still a lot of map. */
      --festival-map-width: 17rem;
    }

    .hud-foot {
      inset-inline: 0.5rem;
      inline-size: auto;
      translate: 0 0;
    }

    .mobility-card {
      inset-block: calc(
          clamp(0.6rem, 1.1vw, 1rem) + var(--hud-map-block-size, 12rem) +
            0.55rem
        )
        auto;
    }
  }

  @media (max-width: 34rem) {
    .map-dock {
      /*
       * A phone cannot give the map a fifth of its width per side and still
       * show the brand badge, so the map takes what is left beside the badge.
       */
      --festival-map-width: min(11.5rem, calc(100vw - 11.5rem));
    }

    .mobility-card {
      inline-size: 9.5rem;
      gap: 0.3rem;
      padding: 0.45rem 0.5rem;
    }

    .speed > strong {
      min-inline-size: 3rem;
      font-size: 1.6rem;
    }

    .prompt span {
      white-space: normal;
    }
  }

  /* Wide and short: recentre the column and keep it clear of the map rail. */
  @media (max-height: 31rem) and (min-width: 34.01rem) {
    .map-dock {
      /* Half the viewport height is too much map on a short landscape phone. */
      --festival-map-width: 15rem;
    }

    .hud-foot {
      inset-inline: auto;
      inset-inline-start: 50%;
      inline-size: min(30rem, calc(100vw - 26rem));
      translate: -50% 0;
    }

    .objective p {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .objective-progress span,
    .battery i {
      transition: none;
    }
  }
</style>
