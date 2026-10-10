<script lang="ts">
  import QftStage, {
    type QftHand as QftStageHand,
  } from "#lib/shared/notation/qft/components/QftStage.svelte";
  import { QFT_FLOWERS } from "#lib/shared/notation/qft/qft-app-selection.js";
  import { GUIDE_MOVES } from "#lib/shared/notation/qft/qft-guide.js";
  import { ratioLabel } from "#lib/shared/shape-matrix/domain/flower-signature.js";
  import { MODE_LABEL } from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";
  import { getQftAppContext } from "../_context/qft-app-context";
  import QftHandControls from "./QftHandControls.svelte";
  import QftNotationPanel from "./QftNotationPanel.svelte";
  import QftRelationshipControls from "./QftRelationshipControls.svelte";

  const state = getQftAppContext();

  function handName(hand: "left" | "right"): string {
    const selection = hand === "left" ? state.left : state.right;
    const source = selection.source;
    if (source.kind === "preset") {
      return (
        GUIDE_MOVES.find(({ id }) => id === source.id)?.title ??
        "Canonical move"
      );
    }
    if (source.kind === "custom") return "Restored motion";
    const flower = QFT_FLOWERS[source.index] ?? QFT_FLOWERS[0]!;
    return `${ratioLabel(flower.turns)} ${flower.style === "pro" ? "inspin" : "antispin"}`;
  }

  const title = $derived(
    state.handCount === "one"
      ? handName("left")
      : `${handName("left")} × ${handName("right")}`
  );
  const detail = $derived(
    state.handCount === "one"
      ? `radius ${state.left.radius.toFixed(2)} prop lengths`
      : `${MODE_LABEL[state.vtgMode]} · blue radius ${state.left.radius.toFixed(2)} · red radius ${state.right.radius.toFixed(2)}`
  );

  const stageHands = $derived<QftStageHand[]>(
    state.handCount === "one"
      ? [
          {
            trajectory: state.leftTrajectory,
            increments: state.leftIncrements,
            tone: "accent",
          },
        ]
      : [
          {
            trajectory: state.leftTrajectory,
            increments: state.leftIncrements,
            tone: "blue",
          },
          {
            trajectory: state.rightTrajectory,
            increments: state.rightIncrements ?? [],
            tone: "red",
          },
        ]
  );
</script>

<main class="workbench">
  <section class="stage-panel" aria-label="Live QfT stage">
    <header class="stage-header">
      <h1>{title}</h1>
      <p>{detail}</p>
    </header>
    <div class="stage-box">
      <QftStage
        hands={stageHands}
        cursor={state.position}
        layers={state.layers}
        fit
      />
    </div>
  </section>

  {#if !state.phone}
    <aside class="controls-panel themed-scrollbar" aria-label="QfT controls">
      {#if state.handCount === "one"}
        <QftHandControls hand="left" tone="accent" />
      {:else}
        <div class="hand-pair">
          <QftHandControls hand="left" tone="blue" />
          <QftHandControls hand="right" tone="red" />
        </div>
      {/if}
      <QftRelationshipControls />
      <QftNotationPanel />
    </aside>
  {/if}
</main>

<style>
  .workbench {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(25rem, 0.85fr);
    gap: 0.75rem;
    min-height: 0;
    padding: 0.75rem;
    container-type: size;
  }

  .stage-panel,
  .controls-panel {
    min-width: 0;
    min-height: 0;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.12));
    border-radius: var(--radius-2026-md, 1rem);
    background: var(--theme-panel-bg, rgb(12 14 30 / 0.86));
  }

  .stage-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .stage-header {
    display: grid;
    align-content: center;
    min-height: 4.25rem;
    padding: 0.65rem 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
  }

  h1,
  p {
    margin: 0;
  }

  h1 {
    overflow: hidden;
    color: var(--theme-text, #fff);
    font-size: clamp(1.05rem, 1.5vw, 1.45rem);
    font-weight: 650;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stage-header p {
    overflow: hidden;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .stage-box {
    flex: 1;
    min-height: 0;
    padding: clamp(0.25rem, 1.2cqh, 0.9rem);
  }

  .controls-panel {
    display: grid;
    align-content: start;
    gap: 1rem;
    overflow-y: auto;
    padding: 0.85rem;
    container-type: inline-size;
  }

  .hand-pair {
    display: grid;
    gap: 1rem;
  }

  @container (min-width: 72rem) {
    .hand-pair {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 64rem) and (min-height: 36.01rem) {
    .workbench {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(18rem, 1.1fr) minmax(14rem, 0.9fr);
    }
  }

  @media (max-height: 36rem) and (min-width: 48.01rem) {
    .workbench {
      grid-template-columns: minmax(0, 1.15fr) minmax(24rem, 0.85fr);
      padding-block: 0.4rem;
    }

    .stage-header {
      min-height: 3.25rem;
      padding-block: 0.35rem;
    }

    .controls-panel {
      gap: 0.7rem;
      padding: 0.55rem;
    }
  }

  @media (max-width: 48rem) {
    .workbench {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 1fr);
      padding: 0.45rem;
    }

    .stage-header {
      min-height: 3.5rem;
      padding: 0.45rem 0.75rem;
    }

    .stage-box {
      padding: 0.15rem;
    }
  }

  @media (min-width: 105rem) {
    .workbench {
      grid-template-columns: minmax(0, 1.55fr) minmax(30rem, 1fr);
      gap: 1rem;
      padding: 1rem;
    }
  }
</style>
