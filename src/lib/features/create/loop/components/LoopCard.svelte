<!-- LoopCard - the start position and the steps, each gliding to its place as
     the card rearranges, with copies flying down a row when a LOOP is made. -->
<script lang="ts">
  import type { StartPlacementData } from "#lib/shared/foundation/domain/models/start-placement-data.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import StepNumber from "#lib/shared/pictograph/shared/components/StepNumber.svelte";
  import { LAYOUT_MOTION_EASING } from "#lib/shared/transitions/layout-flip.js";
  import {
    motionDuration,
    opaqueFade,
    popIn,
  } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { CardCell, CardLayout } from "../domain/loop-card-layout";
  import { rowChangeTransform, rowChangeUndo } from "../domain/loop-families";
  import type {
    CellFlight,
    LoopCardPlayer,
  } from "../state/loop-card-player.svelte";
  import LoopCardCell from "./LoopCardCell.svelte";

  let {
    start,
    steps,
    layout,
    player,
    ink,
    match = null,
    frames = false,
    letters = true,
  }: {
    start: StartPlacementData | null;
    steps: readonly StepData[];
    layout: CardLayout;
    player: LoopCardPlayer;
    /** The LOOP type's colour, for the marks. */
    ink: string;
    /** Outline the start and this step, to show they are the same place. */
    match?: number | null;
    /** Draw every square's place, filled or not. */
    frames?: boolean;
    /** The steps' letters; off where a LOOP is first explained. */
    letters?: boolean;
  } = $props();

  // A square leaves with its place, so it can fade out where it stood.
  const placed = $derived(
    steps.flatMap((step, index) => {
      const cell = layout.steps[index];
      return cell ? [{ step, cell }] : [];
    })
  );

  // Each copy carries the step it lands as, so it can become that step on
  // the way down.
  const flying = $derived(
    player.flights.flatMap((flight) => {
      const from = steps[flight.from];
      const to = steps[flight.to];
      return from && to ? [{ flight, from, to }] : [];
    })
  );
  // The squares copies are landing on appear at once, hidden beneath them.
  const landing = $derived(new Set(player.flights.map((flight) => flight.to)));

  const place = (cell: CardCell) =>
    `translate: ${cell.x}px ${cell.y}px; width: ${cell.size}px; height: ${cell.size}px;`;

  function fly(node: HTMLElement, flight: CellFlight) {
    const from = layout.steps[flight.from];
    const to = layout.steps[flight.to];
    if (!from || !to) return;
    const timing: KeyframeAnimationOptions = {
      duration: motionDuration(flight.ms),
      easing: LAYOUT_MOTION_EASING,
      fill: "both",
    };
    node.animate(
      [
        { transform: `translate(${from.x}px, ${from.y}px)` },
        { transform: `translate(${to.x}px, ${to.y}px)` },
      ],
      timing
    );
    const turn = node.querySelector<HTMLElement>(".flight-turn");
    turn?.animate(
      [{ transform: "none" }, { transform: rowChangeTransform(flight.change) }],
      timing
    );
    // The copy fades in as it lifts off, so the step it leaves, letter and
    // all, never blinks out under it.
    turn?.animate(
      [
        { opacity: 0, offset: 0 },
        { opacity: 1, offset: 0.2 },
        { opacity: 1, offset: 1 },
      ],
      { ...timing, easing: "linear" }
    );
    // Mid-air, while it moves, the copy dissolves into the step it lands as:
    // a prop that ends up held another way changes there, not on landing.
    node
      .querySelector<HTMLElement>(".flight-to")
      ?.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: 0.25 },
          { opacity: 1, offset: 0.75 },
          { opacity: 1, offset: 1 },
        ],
        { ...timing, easing: "linear" }
      );
  }
</script>

<div class="card" style:--loop-ink={ink}>
  {#if frames}
    {#each [layout.start, ...layout.steps] as cell, index (index)}
      <div class="frame" style={place(cell)}></div>
    {/each}
  {/if}

  {#if start}
    <div
      class="cell"
      class:matched={match !== null}
      style={place(layout.start)}
    >
      <div class="art">
        <LoopCardCell data={start} pose {letters} />
      </div>
      <svg
        class="start-label"
        viewBox="0 0 950 950"
        role="img"
        aria-label={t("create_ui_start")}
      >
        <StepNumber stepNumber={0} />
      </svg>
    </div>
  {/if}

  {#each placed as { step, cell }, index (index)}
    {@const visual = player.visuals[index] ?? null}
    <div
      class="cell"
      class:waiting={visual !== null && !visual.shown}
      class:landing={landing.has(index)}
      class:matched={match === index}
      style={place(cell)}
      out:opaqueFade={{ duration: DURATION.normal, dimmedBy: ["waiting"] }}
    >
      <div
        class="art"
        in:popIn|global={{ start: 0.85, duration: DURATION.dramatic }}
      >
        <LoopCardCell data={step} {visual} {letters} />
      </div>
    </div>
  {/each}

  {#each flying as { flight, from, to } (flight.id)}
    <div
      class="flight"
      style:width="{layout.size}px"
      style:height="{layout.size}px"
      use:fly={flight}
      out:opaqueFade={{ duration: DURATION.normal }}
      aria-hidden="true"
    >
      <div class="flight-turn">
        <div class="flight-art">
          <LoopCardCell data={from} letters={false} />
        </div>
        <div
          class="flight-art flight-to"
          style:transform={rowChangeUndo(flight.change)}
        >
          <LoopCardCell data={to} letters={false} />
        </div>
      </div>
    </div>
  {/each}
</div>

<style>
  .card {
    position: absolute;
    inset: 0;
  }

  .cell,
  .frame,
  .flight {
    position: absolute;
    top: 0;
    left: 0;
    box-sizing: border-box;
  }

  .cell,
  .flight-turn {
    outline: 1px solid var(--theme-stroke);
  }

  .cell {
    transition:
      translate var(--duration-dramatic) var(--ease-in-out),
      width var(--duration-dramatic) var(--ease-in-out),
      height var(--duration-dramatic) var(--ease-in-out),
      outline-color var(--duration-emphasis) var(--ease-in-out),
      opacity var(--duration-fast) var(--ease-out);
  }

  .art {
    width: 100%;
    height: 100%;
    transition: transform var(--duration-dramatic) var(--ease-spring);
  }

  .cell.waiting {
    opacity: 0;
  }

  .cell.waiting .art {
    transform: scale(0.85);
  }

  /* Under its copy the square is already in place, so it doesn't grow in. */
  .cell.landing,
  .cell.landing .art {
    transition: none;
  }

  .cell.matched {
    z-index: 1;
    outline: 2px solid var(--loop-ink);
  }

  .frame {
    outline: 1px solid var(--theme-stroke);
    opacity: 0.6;
  }

  .start-label {
    /* The word sits by the corner in every language. */
    direction: ltr;
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .flight {
    z-index: 2;
    pointer-events: none;
  }

  .flight-turn {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .flight-art {
    position: absolute;
    inset: 0;
  }

  .flight-to {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .cell,
    .art {
      transition: none;
    }
  }
</style>
