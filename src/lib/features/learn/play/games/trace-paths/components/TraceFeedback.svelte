<!--
TraceFeedback — what the player sees the moment a round ends.

The rule this component exists to enforce: every outcome answers WHICH HAND,
WHICH BEAT, and WHAT TO CHANGE. "Wrong" is not feedback. So the headline is the
divergence sentence the state factory built from `TraceMetrics.divergence`, and
under it the four dimensions stay four separate readouts. Collapsing them into
one score would tell someone their number went down without telling them their
line was fine and their hands were 300ms apart.

Presentation constraints, all deliberate:
- Failure is a STATIC marker on the stage plus a sentence. No flash, no shake,
  no saturated red fill. A miss is information, not a punishment.
- Success is restrained: the path fills, the endpoint locks, and the haptic and
  sound are both opt-in.
- Numbers are tabular so a 100% → 92% swap can't jitter the row, and the
  sentence — which genuinely varies in width — gets its own full-width row so it
  has nothing to shove.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/env";
  import { getSoundPlayer } from "#lib/shared/audio/get-sound-player.js";
  import type { TraceMetrics } from "../domain/trace-types";
  import type { TraceRoundScore } from "../services/score-trace-round";
  import { getTracePaths } from "../state/trace-paths-state.svelte";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    metrics: TraceMetrics;
    score: TraceRoundScore;
    /** True when the round was completed by tapping or stepping through. */
    assisted: boolean;
    onNext: () => void;
    onRetry: () => void;
  }

  let { metrics, score, assisted, onNext, onRetry }: Props = $props();

  const trace = getTracePaths();

  const clean = $derived(!metrics.divergence && metrics.coverage >= 1);

  /** The sentence is already built by the state factory — one voice, one source. */
  const sentence = $derived(trace.statusText);

  function percent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  /** Sync is genuinely absent on a one-hand round, and "—" says that honestly. */
  const syncLabel = $derived(
    metrics.synchrony === null ? "—" : percent(metrics.synchrony)
  );

  onMount(() => {
    if (!clean || assisted) return;
    if (!trace.settings.sound || !browser) return;
    // Quiet, opt-in, and only on a clean round. A tone on every outcome turns
    // into noise the player learns to stop hearing.
    void (async () => {
      try {
        const player = getSoundPlayer();
        await player.initialize();
        player.play("chime");
      } catch {
        // Audio is decoration here. A device that can't play it loses nothing.
      }
    })();
  });
</script>

<section
  class="trace-feedback"
  class:clean
  aria-label={tDynamic("learn_trace_round_result")}
>
  <!-- Full-width row of its own: the sentence varies in length by design, and
       here there is nothing beside it to displace. -->
  <p class="headline">{sentence}</p>

  {#if assisted}
    <p class="note">
      {tDynamic("learn_trace_assisted_note")}
    </p>
  {/if}

  <dl class="readouts">
    <div class="readout">
      <dt>{tDynamic("learn_trace_coverage")}</dt>
      <dd>{percent(metrics.coverage)}</dd>
    </div>
    <div class="readout">
      <dt>{tDynamic("learn_trace_accuracy")}</dt>
      <dd>{percent(metrics.accuracy)}</dd>
    </div>
    <div class="readout">
      <dt>{tDynamic("learn_trace_continuity")}</dt>
      <dd>{percent(metrics.continuity)}</dd>
    </div>
    <div class="readout">
      <dt>{tDynamic("learn_trace_sync")}</dt>
      <dd>{syncLabel}</dd>
    </div>
  </dl>

  <p class="points">
    <span class="points-label">{tDynamic("learn_trace_points")}</span>
    <span class="points-value">{score.points}</span>
  </p>

  <div class="actions">
    <button type="button" class="action secondary" onclick={onRetry}>
      {tDynamic("learn_trace_retry")}
    </button>
    <button type="button" class="action primary" onclick={onNext}>
      {tDynamic("learn_trace_next")}
    </button>
  </div>
</section>

<style>
  .trace-feedback {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    max-width: 42rem;
    margin: 0 auto;
    padding: 1rem;
    box-sizing: border-box;
    border-radius: 1rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
  }

  /* A clean round gets a calm accent edge. Not a color wash, not a flash — the
     difference between outcomes is legible without being loud. */
  .trace-feedback.clean {
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 50%,
      transparent
    );
  }

  .headline {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 600;
    line-height: 1.45;
    color: var(--theme-text, #fff);
  }

  .note {
    margin: 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .readouts {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;
    margin: 0;
  }

  .readout {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.5rem;
    border-radius: 0.625rem;
    background: var(--theme-panel-bg, rgba(255, 255, 255, 0.04));
  }

  .readout dt {
    font-size: var(--font-size-compact);
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .readout dd {
    margin: 0;
    /* Tabular so 100% → 92% never re-widths the column. */
    font-variant-numeric: tabular-nums;
    font-size: var(--font-size-lg);
    font-weight: 700;
    color: var(--theme-text, #fff);
  }

  .points {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 0;
    padding-top: 0.5rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .points-label {
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .points-value {
    font-variant-numeric: tabular-nums;
    font-size: var(--font-size-xl, 1.25rem);
    font-weight: 800;
    color: var(--game-accent, var(--theme-accent, #818cf8));
    /* Reserve four digits so a 3-digit round can't shift the row. */
    min-width: 4ch;
    text-align: right;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  /* Both actions are buttons. Neither is a text link — a standalone action the
     player is meant to click has to look clickable. */
  .action {
    flex: 1;
    min-height: var(--min-touch-target);
    padding: 0 1rem;
    border-radius: 0.75rem;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  .action.secondary {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.16));
    background: transparent;
    color: var(--theme-text, #fff);
  }

  .action.secondary:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .action.primary {
    border: 1px solid var(--game-accent, #818cf8);
    background: color-mix(
      in srgb,
      var(--game-accent, #818cf8) 24%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  .action.primary:hover {
    background: color-mix(
      in srgb,
      var(--game-accent, #818cf8) 36%,
      transparent
    );
  }

  .action:focus-visible {
    outline: 2px solid var(--theme-accent, #818cf8);
    outline-offset: 2px;
  }

  @media (min-width: 1680px) {
    .trace-feedback {
      max-width: 56rem;
      gap: 1rem;
      padding: 1.5rem;
    }

    .headline {
      font-size: var(--font-size-lg);
    }

    .action {
      font-size: var(--font-size-base);
    }
  }
</style>
