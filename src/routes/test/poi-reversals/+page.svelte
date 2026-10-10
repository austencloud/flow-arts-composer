<script lang="ts">
  import { onMount } from "svelte";
  import ActionButton from "#lib/shared/components/selection/ActionButton.svelte";
  import QftStage from "#lib/shared/notation/qft/components/QftStage.svelte";
  import {
    buildTrajectoryIncrements,
    trajectoryPropRateAt,
    trajectoryReversals,
  } from "#lib/shared/notation/qft/qft-trajectory.js";
  import HorizontalTransportRow from "#lib/shared/sequence-viewer/components/HorizontalTransportRow.svelte";
  import type { PositionValue } from "#lib/shared/notation/qft/qft-model.js";
  import seed from "#lib/features/levels/poi-lab/data/poi-reversal-observations.json";
  import {
    POI_REVERSAL_REASON_LIMIT,
    type PoiReversalObservationFile,
  } from "#lib/features/levels/poi-lab/domain/poi-reversal-observations.js";
  import type {
    PoiCandidateSelectionReason,
    PoiReversalVerdict,
  } from "#lib/features/levels/poi-lab/domain/poi-reversal-candidates.js";
  import { createPoiReversalReviewState } from "#lib/features/levels/poi-lab/state/poi-reversal-review-state.svelte.js";

  const STEP_MS = 620;

  async function persistObservations(
    file: PoiReversalObservationFile
  ): Promise<{ ok: boolean; message: string }> {
    const response = await fetch("/test/poi-reversals/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(file),
    });
    if (!response.ok) {
      return { ok: false, message: await response.text() };
    }
    const result = (await response.json()) as { count: number };
    return {
      ok: true,
      message: `Saved ${result.count} observation${result.count === 1 ? "" : "s"}`,
    };
  }

  const review = createPoiReversalReviewState(seed, persistObservations);
  const candidate = $derived(review.selection?.candidate ?? null);
  const selectionReason = $derived(review.selection?.reason ?? null);
  const increments = $derived(
    candidate ? buildTrajectoryIncrements(candidate.trajectory) : []
  );
  const reversals = $derived(
    candidate ? trajectoryReversals(candidate.trajectory) : []
  );
  const reversalSteps = $derived(
    new Set(reversals.map((reversal) => reversal.step))
  );

  let cursor = $state(0);
  let playing = $state(false);
  let reduceMotion = $state(true);
  let previousCandidateId = $state("");

  const activeStepIndex = $derived(((Math.floor(cursor) % 8) + 8) % 8);
  const observationNumber = $derived(review.observations.length + 1);

  onMount(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reduceMotion = query.matches;
      if (query.matches) playing = false;
    };
    sync();
    if (!query.matches) playing = true;
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  });

  $effect(() => {
    const id = candidate?.id ?? "";
    if (id === previousCandidateId) return;
    previousCandidateId = id;
    cursor = 0;
    if (!reduceMotion) playing = true;
  });

  $effect(() => {
    if (!playing) return;

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(64, now - last);
      last = now;
      cursor = (cursor + delta / STEP_MS) % 8;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });

  function stepBy(delta: number): void {
    playing = false;
    cursor = (((Math.floor(cursor) + delta) % 8) + 8) % 8;
  }

  function seekStep(stepIndex: number): void {
    playing = false;
    cursor = stepIndex;
    if (review.draftVerdict === "illegal") {
      review.selectFailureStep((stepIndex + 1) as PositionValue);
    }
  }

  function chooseVerdict(verdict: PoiReversalVerdict): void {
    playing = false;
    review.selectVerdict(verdict);
  }

  function recordAndContinue(): void {
    const result = review.recordCurrent();
    if (result.ok && !reduceMotion) playing = true;
  }

  function selectionCopy(reason: PoiCandidateSelectionReason | null): {
    label: string;
    detail: string;
  } {
    switch (reason) {
      case "calibration-pendulum":
        return {
          label: "Pendulum calibration",
          detail:
            "Checks this renderer against the pendulum example before new geometry.",
        };
      case "calibration-extendulum":
        return {
          label: "Extendulum calibration",
          detail:
            "Keeps the same rate profile and changes the hand radius from zero to one.",
        };
      case "boundary":
        return {
          label: "Boundary check",
          detail:
            "This candidate sits near the closest saved legal and illegal examples.",
        };
      case "repeat":
        return {
          label: "Repeat check",
          detail:
            "An earlier candidate returns so uncertainty or a changed judgment stays in the data.",
        };
      case "coverage":
      default:
        return {
          label: "Coverage check",
          detail:
            "This reversal geometry is far from the candidates reviewed so far.",
        };
    }
  }

  function handleKeyboard(event: KeyboardEvent): void {
    const target = event.target;
    const key = event.key.toLowerCase();
    const insideInteractive =
      target instanceof Element &&
      target.closest(
        "button, input, textarea, select, a, [contenteditable='true']"
      );

    if (
      key === "enter" &&
      (event.ctrlKey || event.metaKey) &&
      review.canRecord
    ) {
      event.preventDefault();
      recordAndContinue();
      return;
    }

    if (insideInteractive) {
      return;
    }

    if (key === " ") {
      event.preventDefault();
      playing = !playing;
    } else if (key === "arrowleft") {
      event.preventDefault();
      stepBy(-1);
    } else if (key === "arrowright") {
      event.preventDefault();
      stepBy(1);
    } else if (key === "l" || key === "i" || key === "u") {
      event.preventDefault();
      chooseVerdict(key === "l" ? "legal" : key === "i" ? "illegal" : "unsure");
    } else if (review.draftVerdict === "illegal" && /^[1-8]$/.test(event.key)) {
      event.preventDefault();
      const step = Number(event.key) as PositionValue;
      review.selectFailureStep(step);
      seekStep(step - 1);
    } else if (key === "enter" && review.canRecord) {
      event.preventDefault();
      recordAndContinue();
    }
  }
</script>

<svelte:head>
  <title>Poi Reversal Teacher · Lab</title>
  <meta
    name="description"
    content="Review one animated poi reversal trajectory at a time and save step-local legality observations."
  />
</svelte:head>

<svelte:window onkeydown={handleKeyboard} />

<main class="teacher-page">
  <header class="topbar">
    <div class="title-block">
      <p class="eyebrow">Poi legality research</p>
      <h1>Poi reversal teacher</h1>
      <p>
        Review one trajectory at a time. The saved corrections become the rule.
      </p>
    </div>

    <div class="progress" aria-label="Review progress">
      <strong>{review.uniqueReviewedCount}</strong>
      <span>of {review.totalCandidateCount} candidates</span>
      <small>
        {review.observations.length}
        {review.observations.length === 1 ? "observation" : "observations"}
      </small>
    </div>

    <div class="save-area">
      <div class="save-button">
        <ActionButton
          label={review.dirtyCount === 0
            ? "Saved"
            : `Save ${review.dirtyCount}`}
          icon={review.dirtyCount === 0 ? "fa-check" : "fa-floppy-disk"}
          color="cyan"
          fullWidth
          disabled={review.dirtyCount === 0}
          busy={review.saving}
          busyLabel="Saving"
          onclick={() => void review.save()}
        />
      </div>
      <p
        class="save-status"
        class:success={review.saveResult?.ok}
        class:failure={review.saveResult && !review.saveResult.ok}
        aria-live="polite"
      >
        {review.saveResult?.message ?? " "}
      </p>
    </div>
  </header>

  {#if candidate}
    <div class="workspace">
      <section class="motion-panel" aria-labelledby="candidate-heading">
        <header class="panel-heading">
          <div>
            <p class="panel-kicker">
              {review.selection?.reason === "repeat"
                ? `Repeat ${review.currentReviewCount + 1}`
                : `Observation ${observationNumber}`}
            </p>
            <h2 id="candidate-heading">
              {selectionCopy(selectionReason).label}
            </h2>
          </div>
          <code>{candidate.id}</code>
        </header>

        <div class="stage-shell">
          <QftStage
            trajectory={candidate.trajectory}
            {increments}
            {cursor}
            extent={270}
          />
        </div>

        <div class="transport-row">
          <span class="step-counter">Step {activeStepIndex + 1} / 8</span>
          <HorizontalTransportRow
            isPlaying={playing}
            onPlaybackToggle={() => (playing = !playing)}
            onStepFullBack={() => stepBy(-1)}
            onStepFullFwd={() => stepBy(1)}
          />
          <span class="tempo-note">Playback speed is for reading</span>
        </div>

        <div class="step-grid" aria-label="Trajectory steps">
          {#each increments as increment, stepIndex (stepIndex)}
            {@const stepNumber = (stepIndex + 1) as PositionValue}
            {@const rate = trajectoryPropRateAt(
              candidate.trajectory,
              stepIndex
            )}
            <button
              type="button"
              class="step-button"
              class:active={activeStepIndex === stepIndex}
              class:reversal={reversalSteps.has(stepNumber)}
              class:failure={review.draftFailureStep === stepNumber}
              aria-pressed={review.draftFailureStep === stepNumber}
              aria-label={`Step ${stepNumber}. ${rate > 0 ? "Clockwise" : "Counterclockwise"} prop rate ${Math.abs(rate)}. Prop ${increment.propDepart} to ${increment.propArrive}.${reversalSteps.has(stepNumber) ? " Reversal." : ""}`}
              onclick={() => seekStep(stepIndex)}
            >
              <span class="step-number">{stepNumber}</span>
              <strong>{rate > 0 ? "CW" : "CCW"} {Math.abs(rate)}</strong>
              <span class="step-path"
                >{increment.propDepart} → {increment.propArrive}</span
              >
              <span class="reversal-slot">
                {reversalSteps.has(stepNumber) ? "reverse" : " "}
              </span>
            </button>
          {/each}
        </div>
      </section>

      <aside class="review-panel" aria-labelledby="review-heading">
        <div class="review-scroll themed-scrollbar">
          <section class="why-card">
            <p class="section-label">Why this one</p>
            <strong>{selectionCopy(selectionReason).label}</strong>
            <p>{selectionCopy(selectionReason).detail}</p>
          </section>

          <section class="facts" aria-label="Candidate facts">
            <div>
              <span>Hand radius</span>
              <strong>{candidate.trajectory.radius}</strong>
            </div>
            <div>
              <span>Hand direction</span>
              <strong
                >{candidate.trajectory.handDirection === 1
                  ? "Clockwise"
                  : "Counterclockwise"}</strong
              >
            </div>
            <div>
              <span>Prop start</span>
              <strong>{increments[0]?.propDepart ?? "?"}</strong>
            </div>
            <div>
              <span>Reversals</span>
              <strong>
                {reversals
                  .map(
                    (reversal) =>
                      `step ${reversal.step} at ${reversal.propPosition}`
                  )
                  .join(", ")}
              </strong>
            </div>
          </section>

          <section class="judgment">
            <div class="question">
              <p class="section-label">Your judgment</p>
              <h2 id="review-heading">
                Can this path be performed continuously with poi at some
                workable speed?
              </h2>
              <p>
                Judge the path, not the playback tempo. Minimum-speed physics is
                a separate dataset.
              </p>
            </div>

            <div
              class="verdict-actions"
              role="group"
              aria-label="Legality verdict"
            >
              <button
                type="button"
                class="verdict legal"
                class:selected={review.draftVerdict === "legal"}
                aria-pressed={review.draftVerdict === "legal"}
                onclick={() => chooseVerdict("legal")}
              >
                <i class="fas fa-check" aria-hidden="true"></i>
                Legal
                <kbd>L</kbd>
              </button>
              <button
                type="button"
                class="verdict illegal"
                class:selected={review.draftVerdict === "illegal"}
                aria-pressed={review.draftVerdict === "illegal"}
                onclick={() => chooseVerdict("illegal")}
              >
                <i class="fas fa-xmark" aria-hidden="true"></i>
                Illegal
                <kbd>I</kbd>
              </button>
              <button
                type="button"
                class="verdict unsure"
                class:selected={review.draftVerdict === "unsure"}
                aria-pressed={review.draftVerdict === "unsure"}
                onclick={() => chooseVerdict("unsure")}
              >
                <i class="fas fa-question" aria-hidden="true"></i>
                Unsure
                <kbd>U</kbd>
              </button>
            </div>

            <div class="correction-slot">
              {#if review.draftVerdict === "illegal"}
                <div class="correction-form">
                  <div class="failure-heading">
                    <div>
                      <span id="failure-step-label" class="field-label"
                        >Where does it first break?</span
                      >
                      <p>Choose a step above or press 1 through 8.</p>
                    </div>
                    <strong class="failure-readout">
                      {review.draftFailureStep
                        ? `Step ${review.draftFailureStep}`
                        : "No step chosen"}
                    </strong>
                  </div>
                  <label for="failure-reason"
                    >What makes that step impossible?</label
                  >
                  <textarea
                    id="failure-reason"
                    value={review.draftReason}
                    oninput={(event) =>
                      review.setReason(event.currentTarget.value)}
                    maxlength={POI_REVERSAL_REASON_LIMIT}
                    rows="4"
                    placeholder="Describe what the tether, head, hand, or momentum does."
                  ></textarea>
                </div>
              {:else if review.draftVerdict === "unsure"}
                <div class="correction-form">
                  <label for="unsure-reason">What needs a closer look?</label>
                  <textarea
                    id="unsure-reason"
                    value={review.draftReason}
                    oninput={(event) =>
                      review.setReason(event.currentTarget.value)}
                    maxlength={POI_REVERSAL_REASON_LIMIT}
                    rows="4"
                    placeholder="Optional note for the next review."
                  ></textarea>
                </div>
              {:else if review.draftVerdict === "legal"}
                <div class="choice-summary legal-summary">
                  <i class="fas fa-check-circle" aria-hidden="true"></i>
                  <p>
                    Legal records the complete eight-step path. Add the
                    observation to continue.
                  </p>
                </div>
              {:else}
                <div class="choice-summary">
                  <i class="fas fa-hand-pointer" aria-hidden="true"></i>
                  <p>
                    Play the full cycle, pause on either reversal, then choose a
                    verdict.
                  </p>
                </div>
              {/if}
            </div>

            <p
              id="record-status"
              class="form-status"
              class:shown={review.formMessage.length > 0}
              role={review.formMessage ? "alert" : undefined}
            >
              {review.formMessage || " "}
            </p>

            <p class="shortcut-note">
              Space plays or pauses. Arrow keys move one step. Enter records;
              use Ctrl/⌘ Enter while writing a note.
            </p>
          </section>
        </div>

        <div class="record-action">
          <ActionButton
            label="Add observation and continue"
            icon="fa-arrow-right"
            color="cyan"
            fullWidth
            ariaDisabled={!review.canRecord}
            ariaDescribedBy="record-status"
            onclick={recordAndContinue}
          />
        </div>
      </aside>
    </div>
  {:else}
    <section class="empty-state">
      <h2>No candidate is available</h2>
      <p>The candidate generator returned an empty set.</p>
    </section>
  {/if}
</main>

<style>
  :global(html:has(.teacher-page)) {
    font-size: clamp(16px, 9.78px + 0.3704vw, 24px);
  }

  .teacher-page {
    --teacher-panel: var(--theme-panel-bg, #10111a);
    --teacher-card: var(--theme-card-bg, rgba(255, 255, 255, 0.055));
    --teacher-stroke: var(--theme-stroke, rgba(255, 255, 255, 0.13));
    --teacher-muted: var(--theme-text-dim, rgba(236, 241, 255, 0.62));
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-height: 100dvh;
    background:
      radial-gradient(
        circle at 18% 4%,
        rgba(34, 211, 238, 0.09),
        transparent 32rem
      ),
      radial-gradient(
        circle at 88% 92%,
        rgba(139, 92, 246, 0.11),
        transparent 38rem
      ),
      #080910;
    color: var(--theme-text, #f4f6ff);
  }

  .topbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 11rem;
    align-items: center;
    gap: 1.5rem;
    padding: 1rem max(1rem, 2.5vw);
    border-bottom: 1px solid var(--teacher-stroke);
    background: color-mix(in srgb, var(--teacher-panel) 94%, #080910);
  }

  .title-block {
    min-width: 0;
  }

  .eyebrow,
  .panel-kicker,
  .section-label {
    margin: 0;
    color: var(--theme-accent, #67e8f9);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0.12rem 0 0;
    font-size: clamp(1.45rem, 1.05rem + 1.2vw, 2.4rem);
    letter-spacing: -0.035em;
    line-height: 1;
  }

  .title-block > p:last-child {
    margin: 0.35rem 0 0;
    color: var(--teacher-muted);
    font-size: var(--font-size-sm, 0.875rem);
  }

  .progress {
    display: grid;
    grid-template-columns: auto auto;
    align-items: baseline;
    column-gap: 0.38rem;
    min-width: 11rem;
    font-variant-numeric: tabular-nums;
  }

  .progress strong {
    font-size: 1.7rem;
    line-height: 1;
  }

  .progress span {
    color: var(--teacher-muted);
    font-size: var(--font-size-sm, 0.875rem);
  }

  .progress small {
    grid-column: 1 / -1;
    margin-top: 0.25rem;
    color: var(--teacher-muted);
    font-size: var(--font-size-compact, 0.75rem);
    text-align: right;
  }

  .save-area {
    display: grid;
    width: 11rem;
  }

  .save-button {
    width: 100%;
  }

  .save-status {
    min-height: 1.1rem;
    margin: 0.3rem 0 0;
    overflow: hidden;
    color: var(--teacher-muted);
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.1;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .save-status.success {
    color: var(--semantic-success, #4ade80);
  }

  .save-status.failure {
    color: var(--semantic-error, #f87171);
  }

  .workspace {
    display: grid;
    gap: 1rem;
    width: min(96vw, 168rem);
    min-height: 0;
    margin: 0 auto;
    padding: 1rem 0;
  }

  .motion-panel,
  .review-panel {
    min-width: 0;
    border: 1px solid var(--teacher-stroke);
    border-radius: 1.25rem;
    background: var(--teacher-panel);
    box-shadow: 0 1.2rem 3.5rem rgba(0, 0, 0, 0.22);
  }

  .motion-panel {
    display: grid;
    grid-template-rows: auto minmax(18rem, 1fr) auto auto;
    overflow: hidden;
  }

  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.2rem;
    border-bottom: 1px solid var(--teacher-stroke);
  }

  .panel-heading h2 {
    margin: 0.2rem 0 0;
    font-size: 1.2rem;
  }

  .panel-heading code {
    max-width: 52%;
    overflow: hidden;
    color: var(--teacher-muted);
    font-size: var(--font-size-compact, 0.75rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stage-shell {
    min-height: 18rem;
    padding: 0.75rem;
    background:
      radial-gradient(circle, rgba(103, 232, 249, 0.055), transparent 48%),
      #090a11;
  }

  .transport-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 1rem;
    padding: 0.65rem 1rem;
    border-top: 1px solid var(--teacher-stroke);
  }

  .transport-row :global(.horizontal-transport-row) {
    padding: 0.35rem 0.65rem;
    border: 0;
    background: transparent;
  }

  .step-counter,
  .tempo-note {
    color: var(--teacher-muted);
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
  }

  .tempo-note {
    text-align: right;
  }

  .step-grid {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 0.35rem;
    padding: 0.75rem;
    border-top: 1px solid var(--teacher-stroke);
  }

  .step-button {
    position: relative;
    display: grid;
    min-width: 0;
    min-height: 4.5rem;
    place-items: center;
    gap: 0.12rem;
    padding: 0.42rem 0.25rem;
    border: 1px solid var(--teacher-stroke);
    border-radius: 0.75rem;
    background: var(--teacher-card);
    color: var(--theme-text, #f4f6ff);
    cursor: pointer;
    transition:
      border-color 150ms ease,
      background 150ms ease,
      transform 150ms ease;
  }

  .step-button:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    transform: translateY(-1px);
  }

  .step-button.active {
    border-color: var(--theme-accent, #67e8f9);
    background: color-mix(
      in srgb,
      var(--theme-accent, #67e8f9) 13%,
      var(--teacher-card)
    );
  }

  .step-button.failure {
    border-color: var(--semantic-error, #ef4444);
    box-shadow: inset 0 0 0 1px var(--semantic-error, #ef4444);
  }

  .step-number {
    position: absolute;
    top: 0.28rem;
    left: 0.38rem;
    color: var(--teacher-muted);
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
  }

  .step-button strong {
    font-size: var(--font-size-sm, 0.875rem);
  }

  .step-path,
  .reversal-slot {
    color: var(--teacher-muted);
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
  }

  .reversal-slot {
    min-height: 1em;
    color: var(--semantic-warning, #fbbf24);
    font-weight: 700;
  }

  .review-panel {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .review-scroll {
    display: grid;
    align-content: start;
    gap: 1rem;
    min-height: 0;
    padding: 1rem;
    overflow: auto;
  }

  .why-card,
  .facts,
  .judgment {
    border: 1px solid var(--teacher-stroke);
    border-radius: 1rem;
    background: var(--teacher-card);
  }

  .why-card {
    padding: 1rem;
  }

  .why-card strong {
    display: block;
    margin-top: 0.45rem;
    font-size: 1.05rem;
  }

  .why-card p:last-child {
    margin: 0.35rem 0 0;
    color: var(--teacher-muted);
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.5;
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .facts > div {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
    padding: 0.85rem 1rem;
  }

  .facts > div:nth-child(odd) {
    border-right: 1px solid var(--teacher-stroke);
  }

  .facts > div:nth-child(-n + 2) {
    border-bottom: 1px solid var(--teacher-stroke);
  }

  .facts span {
    color: var(--teacher-muted);
    font-size: var(--font-size-compact, 0.75rem);
  }

  .facts strong {
    overflow-wrap: anywhere;
    font-size: var(--font-size-sm, 0.875rem);
  }

  .judgment {
    display: grid;
    gap: 1rem;
    padding: 1rem;
  }

  .question h2 {
    margin: 0.45rem 0 0;
    font-size: clamp(1.25rem, 1rem + 0.8vw, 1.8rem);
    line-height: 1.18;
  }

  .question > p:last-child {
    margin: 0.55rem 0 0;
    color: var(--teacher-muted);
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.5;
  }

  .verdict-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .verdict {
    display: grid;
    grid-template-columns: auto 1fr auto;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    gap: 0.35rem;
    padding: 0.7rem 0.65rem;
    border: 1px solid var(--teacher-stroke);
    border-radius: 0.8rem;
    background: color-mix(in srgb, currentColor 5%, var(--teacher-panel));
    color: var(--teacher-muted);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
    cursor: pointer;
    transition:
      border-color 150ms ease,
      background 150ms ease,
      color 150ms ease;
  }

  .verdict.legal {
    --verdict-color: var(--semantic-success, #4ade80);
  }

  .verdict.illegal {
    --verdict-color: var(--semantic-error, #f87171);
  }

  .verdict.unsure {
    --verdict-color: var(--semantic-warning, #fbbf24);
  }

  .verdict:hover,
  .verdict.selected {
    border-color: var(--verdict-color);
    background: color-mix(
      in srgb,
      var(--verdict-color) 13%,
      var(--teacher-panel)
    );
    color: var(--verdict-color);
  }

  kbd {
    display: grid;
    min-width: 1.5rem;
    height: 1.5rem;
    place-items: center;
    border: 1px solid currentColor;
    border-radius: 0.35rem;
    font: inherit;
    font-size: var(--font-size-compact, 0.75rem);
    opacity: 0.72;
  }

  .correction-slot {
    min-height: 12.75rem;
  }

  .correction-form {
    display: grid;
    gap: 0.55rem;
    height: 100%;
  }

  .correction-form label,
  .failure-heading .field-label {
    color: var(--theme-text, #f4f6ff);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
  }

  .failure-heading {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
  }

  .failure-heading p {
    margin: 0.2rem 0 0;
    color: var(--teacher-muted);
    font-size: var(--font-size-compact, 0.75rem);
  }

  .failure-readout {
    min-width: 8.5rem;
    color: var(--semantic-error, #f87171);
    font-size: var(--font-size-sm, 0.875rem);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 8.25rem;
    resize: vertical;
    padding: 0.8rem 0.9rem;
    border: 1px solid var(--teacher-stroke);
    border-radius: 0.8rem;
    background: var(--teacher-panel);
    color: var(--theme-text, #f4f6ff);
    font: inherit;
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.5;
  }

  textarea:focus {
    border-color: var(--theme-accent, #67e8f9);
    outline: 2px solid
      color-mix(in srgb, var(--theme-accent, #67e8f9) 25%, transparent);
    outline-offset: 2px;
  }

  textarea::placeholder {
    color: color-mix(in srgb, var(--teacher-muted) 80%, transparent);
  }

  .choice-summary {
    display: flex;
    min-height: 12.75rem;
    align-items: center;
    justify-content: center;
    gap: 0.8rem;
    padding: 1.25rem;
    border: 1px dashed var(--teacher-stroke);
    border-radius: 0.85rem;
    color: var(--teacher-muted);
    text-align: left;
  }

  .choice-summary i {
    flex: none;
    color: var(--theme-accent, #67e8f9);
    font-size: 1.35rem;
  }

  .choice-summary p {
    max-width: 28rem;
    margin: 0;
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.5;
  }

  .legal-summary i {
    color: var(--semantic-success, #4ade80);
  }

  .form-status {
    min-height: 1.2rem;
    margin: -0.45rem 0;
    color: var(--semantic-error, #f87171);
    font-size: var(--font-size-compact, 0.75rem);
    opacity: 0;
  }

  .form-status.shown {
    opacity: 1;
  }

  .record-action {
    z-index: 2;
    padding: 0.75rem 1rem 1rem;
    border-top: 1px solid var(--teacher-stroke);
    background: var(--teacher-panel);
  }

  .shortcut-note {
    margin: 0;
    color: var(--teacher-muted);
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.45;
    text-align: center;
  }

  .empty-state {
    align-self: center;
    justify-self: center;
    padding: 2rem;
    text-align: center;
  }

  .empty-state h2 {
    margin: 0;
  }

  .empty-state p {
    color: var(--teacher-muted);
  }

  @media (min-width: 64rem) and (min-height: 40rem) {
    .teacher-page {
      height: 100dvh;
      overflow: hidden;
    }

    .workspace {
      grid-template-columns: minmax(0, 1.45fr) minmax(24rem, 0.8fr);
      height: 100%;
      overflow: hidden;
    }

    .motion-panel,
    .review-panel {
      height: 100%;
    }

    .stage-shell {
      min-height: 0;
    }
  }

  @media (min-width: 105rem) {
    .workspace {
      grid-template-columns: minmax(0, 1.65fr) minmax(27rem, 0.72fr);
      gap: 1.25rem;
      padding-block: 1.25rem;
    }

    .motion-panel,
    .review-panel {
      border-radius: 1.5rem;
    }
  }

  @media (max-width: 63.99rem), (max-height: 39.99rem) {
    .teacher-page {
      overflow: auto;
    }

    .workspace {
      grid-template-columns: minmax(0, 1fr);
    }

    .stage-shell {
      height: min(58svh, 36rem);
    }

    .review-panel {
      grid-template-rows: auto auto;
      overflow: visible;
    }

    .review-scroll {
      overflow: visible;
    }
  }

  @media (max-width: 48rem) {
    .topbar {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.8rem 1rem;
    }

    .title-block {
      grid-column: 1 / -1;
    }

    .progress {
      min-width: 0;
    }

    .save-area {
      width: 10rem;
    }

    .transport-row {
      grid-template-columns: 1fr auto;
    }

    .tempo-note {
      display: none;
    }
  }

  @media (max-width: 34rem) {
    .workspace {
      width: min(100% - 1rem, 32rem);
      padding-block: 0.5rem;
    }

    .motion-panel,
    .review-panel {
      border-radius: 1rem;
    }

    .stage-shell {
      height: 18rem;
      min-height: 18rem;
      padding: 0.25rem;
    }

    .transport-row {
      grid-template-columns: 1fr;
      justify-items: center;
      gap: 0.2rem;
    }

    .step-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .panel-heading {
      align-items: flex-start;
      flex-direction: column;
    }

    .panel-heading code {
      max-width: 100%;
    }

    .review-scroll {
      padding: 0.65rem;
    }

    .record-action {
      padding: 0.65rem;
    }

    .verdict-actions {
      grid-template-columns: 1fr;
    }

    .verdict {
      grid-template-columns: auto 1fr auto;
    }

    .facts {
      grid-template-columns: minmax(0, 1fr);
    }

    .facts > div:nth-child(odd) {
      border-right: 0;
    }

    .facts > div:not(:last-child) {
      border-bottom: 1px solid var(--teacher-stroke);
    }
  }

  @media (max-height: 30rem) and (max-width: 63.99rem) {
    .stage-shell {
      height: 14rem;
      min-height: 14rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .step-button,
    .verdict {
      transition: none;
    }

    .step-button:hover {
      transform: none;
    }
  }
</style>
