<script lang="ts">
  import type { SeoDashboardSnapshot } from "#lib/features/admin/domain/models/seo-dashboard-model.js";
  import { formatDate } from "./seo-dashboard-format";

  type RoadmapState = "done" | "current" | "later";

  interface RoadmapStep {
    number: number;
    title: string;
    detail: string;
    state: RoadmapState;
  }

  let { snapshot }: { snapshot: SeoDashboardSnapshot } = $props();

  function formatWindow(
    window: { start: string; end: string } | null,
    fallback: string
  ): string {
    if (!window) return fallback;
    return formatDate(window.start) + " to " + formatDate(window.end);
  }

  const roadmap = $derived.by((): RoadmapStep[] => {
    const startingPointDone = snapshot.windows.baseline.complete;
    const launchDateDone = snapshot.experimentDates.deploymentDate !== null;
    const googleFoundPages = snapshot.experimentDates.indexedDate !== null;
    const firstComparisonDone =
      snapshot.phase === "primary_complete" || snapshot.phase === "confirmed";
    const firstComparisonCurrent = snapshot.phase === "primary_collecting";
    const repeatDone = snapshot.phase === "confirmed";
    const repeatCurrent = snapshot.phase === "primary_complete";

    return [
      {
        number: 1,
        title: "Save the starting numbers",
        detail: startingPointDone
          ? `${formatWindow(snapshot.windows.baseline, "Starting window")} saved`
          : "The before period is still being collected",
        state: startingPointDone ? "done" : "current",
      },
      {
        number: 2,
        title: "Record when the changes go live",
        detail: launchDateDone
          ? `Recorded on ${formatDate(snapshot.experimentDates.deploymentDate)}`
          : "Needed before growth can be measured",
        state: launchDateDone
          ? "done"
          : startingPointDone
            ? "current"
            : "later",
      },
      {
        number: 3,
        title: "Check that Google found the pages",
        detail: googleFoundPages
          ? `Confirmed on ${formatDate(snapshot.experimentDates.indexedDate)}`
          : launchDateDone
            ? "A measurement run checks the sample pages"
            : "Starts after the launch date is recorded",
        state: googleFoundPages ? "done" : launchDateDone ? "current" : "later",
      },
      {
        number: 4,
        title:
          snapshot.evaluationMode === "visibility_emergence"
            ? "Measure the new visibility"
            : "Compare before and after",
        detail: formatWindow(
          snapshot.windows.primary,
          "Starts after Google finds the pages"
        ),
        state: firstComparisonDone
          ? "done"
          : firstComparisonCurrent
            ? "current"
            : "later",
      },
      {
        number: 5,
        title: "Repeat the check",
        detail: formatWindow(
          snapshot.windows.confirmation,
          "Fresh dates test whether the result holds"
        ),
        state: repeatDone ? "done" : repeatCurrent ? "current" : "later",
      },
    ];
  });

  const currentStep = $derived(
    roadmap.find((step) => step.state === "current") ?? roadmap.at(-1)
  );
  const planTitle = $derived(
    roadmap.every((step) => step.state === "done")
      ? "All five steps are complete"
      : `You are on step ${currentStep?.number ?? 1} of 5`
  );

  function stateLabel(state: RoadmapState): string {
    if (state === "done") return "Done";
    if (state === "current") return "Now";
    return "Later";
  }
</script>

<section class="panel" aria-labelledby="experiment-title">
  <div class="panel-heading">
    <div>
      <span class="panel-kicker">The plan</span>
      <h3 id="experiment-title">{planTitle}</h3>
    </div>
    <span class="decision-status">
      {roadmap.filter((step) => step.state === "done").length}/5 done
    </span>
  </div>

  <p class="plain-explanation">
    The highlighted row is the one that matters right now. Later steps stay
    quiet until their dates arrive.
  </p>

  <ol class="roadmap" aria-label="Five steps to measure SEO growth">
    {#each roadmap as step (step.number)}
      <li
        class="roadmap-step step-{step.state}"
        aria-current={step.state === "current" ? "step" : undefined}
      >
        <span class="step-marker" aria-hidden="true">
          {#if step.state === "done"}
            <i class="fas fa-check"></i>
          {:else}
            {step.number}
          {/if}
        </span>
        <div class="step-copy">
          <strong>{step.title}</strong>
          <span>{step.detail}</span>
        </div>
        <span class="step-state">{stateLabel(step.state)}</span>
      </li>
    {/each}
  </ol>
</section>

<style>
  .panel {
    container-type: inline-size;
    display: flex;
    height: 100%;
    min-height: 0;
    flex-direction: column;
    padding: clamp(14px, 1.2vw, 20px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 14px;
    background: var(--theme-card-bg, rgba(15, 23, 42, 0.74));
  }

  .panel-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .panel-kicker {
    color: var(--semantic-seo-accent);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  h3 {
    margin: 3px 0 0;
    font-size: clamp(1rem, 0.92rem + 0.35vw, 1.25rem);
  }

  .decision-status {
    display: inline-flex;
    min-height: 30px;
    align-items: center;
    justify-content: center;
    padding: 5px 11px;
    border: 1px solid
      color-mix(in srgb, var(--semantic-seo-accent) 42%, transparent);
    border-radius: 999px;
    background: color-mix(
      in srgb,
      var(--semantic-seo-accent) 10%,
      var(--theme-card-bg, #111827)
    );
    color: var(--semantic-seo-accent);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .plain-explanation {
    max-width: 62rem;
    margin: 10px 0 12px;
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.64));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.4;
  }

  .roadmap {
    display: grid;
    min-height: 0;
    flex: 1;
    grid-template-rows: repeat(5, minmax(54px, 1fr));
    gap: 7px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .roadmap-step {
    display: grid;
    min-width: 0;
    grid-template-columns: 30px minmax(0, 1fr) 4.5rem;
    align-items: center;
    gap: 11px;
    padding: 8px 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 10px;
    background: color-mix(in srgb, var(--theme-text, #fff) 3%, transparent);
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.46));
  }

  .step-current {
    border-color: color-mix(
      in srgb,
      var(--semantic-seo-accent) 42%,
      transparent
    );
    color: var(--theme-text, #f8fafc);
    background: color-mix(in srgb, var(--semantic-seo-accent) 9%, transparent);
  }

  .step-done {
    color: var(--theme-text, #f8fafc);
  }

  .step-marker {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--semantic-seo-accent) 15%, transparent);
    color: var(--semantic-seo-accent);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
  }

  .step-done .step-marker {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 16%,
      transparent
    );
    color: var(--semantic-success, #22c55e);
  }

  .step-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  }

  .step-copy > strong {
    font-size: var(--font-size-min, 0.875rem);
  }

  .step-copy > span {
    overflow: hidden;
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.52));
    font-size: var(--font-size-compact, 0.75rem);
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.3;
  }

  .step-state {
    min-width: 4.5rem;
    padding: 5px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-text, #fff) 5%, transparent);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    text-align: center;
  }

  .step-current .step-state {
    background: color-mix(in srgb, var(--semantic-seo-accent) 16%, transparent);
    color: var(--semantic-seo-accent);
  }

  .step-done .step-state {
    color: var(--semantic-success, #22c55e);
  }

  @container (max-width: 560px) {
    .panel-heading {
      flex-direction: column;
    }

    .roadmap {
      grid-template-rows: none;
    }

    .roadmap-step {
      grid-template-columns: 30px minmax(0, 1fr);
    }

    .step-state {
      grid-column: 2;
      justify-self: start;
    }
  }
</style>
