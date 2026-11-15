<!--
  VisualPiecePage.svelte — one published piece, tunnel or mandala, on one
  screen. The page has one way back (the Browse bar's back button), one square
  stage for both kinds (a mandala fits inside it), the still first and then the
  live piece, one shared round pause button, the title with its byline and
  date, and a step control that walks the pieces of the same type.

  Tall boxes stack the stage over the words; wide boxes put the stage at the
  left and the words at the right. Nothing scrolls.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { formatDate } from "#lib/shared/i18n/i18n-formatters.js";
  import type { PublicArtifactEnvelope } from "#lib/shared/artifact-revisions/domain/public-artifact.js";
  import PanelSpinner from "#lib/shared/components/panel/PanelSpinner.svelte";
  import TkaLabel from "#lib/shared/components/TkaLabel.svelte";
  import { pieceNeighbours } from "../domain/visuals-neighbours.js";
  import type {
    VisualPiece,
    VisualPieceLoader,
  } from "../services/visual-piece-loader.js";
  import { createReducedMotion } from "../state/reduced-motion.svelte.js";
  import LivePieceStage from "./LivePieceStage.svelte";
  import StagePauseButton from "./StagePauseButton.svelte";

  let {
    artifactId,
    pieces,
    loader,
    onStep,
  }: {
    artifactId: string;
    /** Every listed piece, any type; the step control uses the same type's. */
    pieces: readonly PublicArtifactEnvelope[];
    loader: VisualPieceLoader;
    onStep: (envelope: PublicArtifactEnvelope) => void;
  } = $props();

  const reduced = createReducedMotion();

  let piece = $state<VisualPiece | null>(null);
  let failure = $state<"" | "missing" | "invalid">("");
  let userPaused = $state(false);

  $effect(() => {
    const id = artifactId;
    piece = null;
    failure = "";
    userPaused = false;
    const known = loader.peek(id);
    if (known) {
      piece = known;
      return;
    }
    let stale = false;
    loader
      .load(id)
      .then((result) => {
        if (stale) return;
        if (result.status === "ok") piece = result.piece;
        else failure = result.status;
      })
      .catch(() => {
        if (!stale) failure = "invalid";
      });
    return () => {
      stale = true;
    };
  });

  // The list's envelope has the poster before any detail arrives.
  const envelope = $derived(
    pieces.find((entry) => entry.artifactId === artifactId) ??
      piece?.envelope ??
      null
  );

  const neighbours = $derived(
    envelope
      ? pieceNeighbours(
          pieces.filter(
            (entry) => entry.artifactType === envelope.artifactType
          ),
          artifactId
        )
      : null
  );

  function formatPublished(timestamp: unknown): string {
    if (!timestamp) return "";
    const date =
      timestamp instanceof Date
        ? timestamp
        : ((timestamp as { toDate?: () => Date }).toDate?.() ??
          new Date(timestamp as string));
    if (Number.isNaN(date.getTime())) return "";
    return formatDate(date, { style: "medium" });
  }

  const published = $derived(
    envelope ? formatPublished(envelope.publishedAt) : ""
  );
</script>

<div class="page-box">
  <div class="page">
    {#if failure}
      <div class="status error" role="alert">
        {failure === "missing"
          ? t("browse_verified_visual_not_public")
          : t("browse_verified_visual_load_failed")}
      </div>
    {:else if !envelope}
      <div class="status" role="status">
        <PanelSpinner size={10} />
        <span>{t("browse_verified_loading_visual")}</span>
      </div>
    {:else}
      <div class="stage-cell">
        <div class="stage">
          {#key envelope.artifactId}
            <LivePieceStage
              {envelope}
              {piece}
              playing={!userPaused}
              stillOnly={reduced.value}
            />
          {/key}
          {#if !reduced.value}
            <div class="pause">
              <StagePauseButton
                playing={!userPaused}
                onToggle={() => (userPaused = !userPaused)}
              />
            </div>
          {/if}
        </div>
      </div>

      <div class="words">
        <h2 class="title">
          <TkaLabel text={envelope.title} darkMode fitToParent={false} />
        </h2>
        <p class="byline">
          {t("browse_verified_by_creator", { name: envelope.ownerDisplayName })}
          {#if published}
            · {t("browse_verified_published_date", { date: published })}
          {/if}
        </p>

        {#if neighbours && neighbours.total > 1}
          <div class="controls">
            <div class="step">
              <button
                type="button"
                class="step-btn"
                aria-label={t("browse_visuals_step_previous")}
                disabled={!neighbours.previous}
                onclick={() =>
                  neighbours.previous && onStep(neighbours.previous)}
              >
                <i class="fas fa-chevron-left" aria-hidden="true"></i>
              </button>
              <span class="step-count">
                {t("browse_visuals_step_position", {
                  position: neighbours.position,
                  total: neighbours.total,
                })}
              </span>
              <button
                type="button"
                class="step-btn"
                aria-label={t("browse_visuals_step_next")}
                disabled={!neighbours.next}
                onclick={() => neighbours.next && onStep(neighbours.next)}
              >
                <i class="fas fa-chevron-right" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .page-box {
    container-type: size;
    container-name: piece;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }

  .page {
    display: grid;
    width: 100%;
    height: 100%;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 12px;
    padding: 12px;
    box-sizing: border-box;
  }

  .status {
    grid-row: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-min, 14px);
    text-align: center;
  }

  .status.error {
    color: var(--semantic-error, #ef4444);
  }

  /* The stage is the largest square its cell holds. */
  .stage-cell {
    container-type: size;
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .stage {
    position: relative;
    width: min(100cqw, 100cqh);
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 18px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--surface-panel-floor);
  }

  .words {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .title {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-xl, 1.25rem);
    line-height: 1.2;
    overflow: hidden;
    white-space: nowrap;
  }

  .byline {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-min, 14px);
  }

  /* On the picture, above the live piece, in the stage's bottom right. */
  .pause {
    position: absolute;
    right: 12px;
    bottom: 12px;
    z-index: 2;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .step-count {
    min-width: 5ch;
    text-align: center;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    font-variant-numeric: tabular-nums;
  }

  .step-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, #fff);
    cursor: pointer;
    transition: border-color var(--duration-fast) var(--ease-standard);
  }

  .step-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .step-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: 2px;
  }

  @media (hover: hover) {
    .step-btn:not(:disabled):hover {
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    }
  }

  /* Wide: the stage at the left, the words at the right. */
  @container piece (min-aspect-ratio: 5 / 4) {
    .page {
      grid-template-rows: minmax(0, 1fr);
      grid-template-columns: minmax(0, 1fr) clamp(15rem, 28cqw, 24rem);
      gap: 24px;
      padding: 16px;
    }

    .words {
      justify-content: center;
    }

    .title {
      font-size: var(--font-size-2xl, 1.5rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .step-btn {
      transition: none;
    }
  }
</style>
