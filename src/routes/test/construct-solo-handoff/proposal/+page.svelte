<script lang="ts">
  import { onMount } from "svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import StepGrid from "$lib/features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { motionQueryHandler } from "$lib/shared/pictograph/shared/services/motion-query-handler";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import {
    appendSoloContinuation,
    createSoloContinuationOptions,
    pairSoloReviewSequences,
  } from "../construct-solo-proposal";
  import {
    createConstructRedPartnerReviewSequence,
    createConstructSoloReviewSequence,
  } from "../construct-solo-review-fixture";

  type Stage = "edit-blue" | "choose-red" | "paired";

  let stage = $state<Stage>("edit-blue");
  let blueSequence = $state(createConstructSoloReviewSequence("left"));
  const redSequence = createConstructRedPartnerReviewSequence();
  let catalog = $state<PictographData[]>([]);
  let catalogLoading = $state(true);
  let catalogError = $state("");
  let compactViewport = $state(false);
  let selectedStepNumber = $state(blueSequence.steps.length);
  let lastAction = $state("Imported 8 blue steps from Choreo Card");

  const options = $derived(
    createSoloContinuationOptions(catalog, blueSequence, "left")
  );
  const pairedSequence = $derived(
    pairSoloReviewSequences(blueSequence, redSequence)
  );
  const visibleSequence = $derived(
    stage === "paired" ? pairedSequence : blueSequence
  );
  const title = $derived(
    stage === "edit-blue"
      ? "Editing blue path"
      : stage === "choose-red"
        ? "Adding a red path"
        : "Paired sequence"
  );
  const subtitle = $derived(
    stage === "edit-blue"
      ? `${blueSequence.steps.length} imported steps · red path not added`
      : stage === "choose-red"
        ? "Blue is locked while you choose its partner"
        : `${pairedSequence.steps.length} steps · blue and red are active`
  );
  const modeLabel = $derived(
    stage === "edit-blue"
      ? "Solo edit"
      : stage === "choose-red"
        ? "Pairing"
        : "Paired"
  );

  function motionLabel(step: StepData): string {
    const motion = step.motions[HandSide.LEFT];
    const motionName = motion.motionType.replaceAll("_", " ");
    const destination = motion.endLocation.replaceAll("_", " ");
    return `${motionName} to ${destination}`;
  }

  function appendOption(option: StepData): void {
    blueSequence = appendSoloContinuation(blueSequence, option);
    selectedStepNumber = blueSequence.steps.length;
    lastAction = `Added blue step ${blueSequence.steps.length}`;
  }

  function beginRedPath(): void {
    stage = "choose-red";
    lastAction = "Blue path locked; choosing a red partner";
  }

  function returnToBlue(): void {
    stage = "edit-blue";
    selectedStepNumber = blueSequence.steps.length;
    lastAction = "Returned to blue path editing";
  }

  function useRedPath(): void {
    stage = "paired";
    selectedStepNumber = pairedSequence.steps.length;
    lastAction = "Paired the saved red path with blue";
  }

  async function loadCatalog(): Promise<void> {
    try {
      catalog = await motionQueryHandler.queryMotions({
        gridMode: blueSequence.gridMode,
      });
    } catch (error) {
      catalogError =
        error instanceof Error
          ? error.message
          : "Could not load motion options";
    } finally {
      catalogLoading = false;
    }
  }

  onMount(() => {
    const compactQuery = window.matchMedia("(max-width: 760px)");
    const syncCompactViewport = () => {
      compactViewport = compactQuery.matches;
    };

    syncCompactViewport();
    compactQuery.addEventListener("change", syncCompactViewport);
    void loadCatalog();

    return () => {
      compactQuery.removeEventListener("change", syncCompactViewport);
    };
  });
</script>

<svelte:head>
  <title>Solo-aware Construct proposal</title>
</svelte:head>

<main class="proposal-page" data-stage={stage}>
  <header class="workbench-header">
    <div class="identity">
      <span class="construct-label">Construct</span>
      <span class="solo-badge">{modeLabel}</span>
      <div class="hand-title">
        <span
          class="hand-dot"
          class:red={stage === "choose-red"}
          class:both={stage === "paired"}
          aria-hidden="true"
        ></span>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
    </div>

    <div class="header-actions">
      {#if stage === "edit-blue"}
        <PanelButton variant="secondary" onclick={beginRedPath}>
          Add red path
        </PanelButton>
      {:else}
        <PanelButton variant="secondary" onclick={returnToBlue}>
          Back to blue
        </PanelButton>
      {/if}
    </div>
  </header>

  <div class="workspace">
    <section class="path-panel" aria-labelledby="path-panel-title">
      <header class="panel-heading">
        <div>
          <span class="panel-kicker">
            {stage === "paired" ? "Sequence" : "Imported Choreo Card"}
          </span>
          <h2 id="path-panel-title">
            {stage === "paired" ? "Blue + red" : "Your blue path"}
          </h2>
        </div>
        <span class="step-count">{visibleSequence.steps.length} steps</span>
      </header>

      <div class="sequence-stage">
        <StepGrid
          steps={visibleSequence.steps}
          startPlacement={visibleSequence.startPlacement}
          {selectedStepNumber}
          onStepClick={(stepNumber) => (selectedStepNumber = stepNumber)}
          fitAllSteps
          sizingProfile="preview"
          manualColumnCount={compactViewport ? 9 : 4}
          narrowMaxColumns={compactViewport ? 9 : 4}
          allowFewStepOverflowOnNarrow={false}
          leftColorOverride="#3b82f6"
          rightColorOverride="#ef233c"
        />
      </div>

      <footer class="path-status">
        <span class="status-dot" aria-hidden="true"></span>
        <span>{lastAction}</span>
      </footer>
    </section>

    {#if stage === "edit-blue"}
      <section class="decision-panel" aria-labelledby="next-move-title">
        <header class="decision-heading blue-heading">
          <div>
            <span class="panel-kicker"
              >Blue path · step {blueSequence.steps.length + 1}</span
            >
            <h2 id="next-move-title">Choose what blue does next</h2>
            <p>
              Every option starts where step {blueSequence.steps.length} ends. Pick
              one to continue the blue path.
            </p>
          </div>
          <span class="red-absence">No red path yet</span>
        </header>

        <div class="option-region" aria-live="polite">
          {#if catalogLoading}
            <div class="option-message">
              <span class="loading-ring" aria-hidden="true"></span>
              <strong>Loading blue moves…</strong>
            </div>
          {:else if catalogError}
            <div class="option-message error-message">
              <strong>Blue moves did not load</strong>
              <span>{catalogError}</span>
            </div>
          {:else if options.length === 0}
            <div class="option-message error-message">
              <strong>No blue continuation found</strong>
              <span>The path remains unchanged.</span>
            </div>
          {:else}
            <div class="option-grid" aria-label="Blue continuation options">
              {#each options as option (option.id)}
                <button
                  type="button"
                  class="motion-option"
                  aria-label={`Add ${motionLabel(option)} as blue step ${blueSequence.steps.length + 1}`}
                  onclick={() => appendOption(option)}
                >
                  <span class="pictograph">
                    <PictographContainer
                      pictographData={option}
                      disableTransitions
                      showStepNumber={false}
                      leftColorOverride="#3b82f6"
                      rightColorOverride="#ef233c"
                    />
                  </span>
                  <span class="motion-name">{motionLabel(option)}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <footer class="decision-footer">
          <span>Only blue changes on this screen.</span>
          <button type="button" class="text-action" onclick={beginRedPath}>
            Ready to pair? Add red path
          </button>
        </footer>
      </section>
    {:else if stage === "choose-red"}
      <section class="decision-panel" aria-labelledby="red-path-title">
        <header class="decision-heading red-heading">
          <div>
            <span class="panel-kicker">Separate pairing step</span>
            <h2 id="red-path-title">Choose the missing red path</h2>
            <p>
              Your blue path is locked. Pick a complete red path to pair with
              it—nothing here adds another blue step.
            </p>
          </div>
        </header>

        <div class="saved-path-list">
          <article class="saved-path-card">
            <div class="saved-path-copy">
              <span class="red-path-dot" aria-hidden="true"></span>
              <div>
                <strong>Smooth box orbit</strong>
                <span>Saved red path · 8 steps</span>
              </div>
            </div>
            <div class="red-sequence-preview">
              <StepGrid
                steps={redSequence.steps}
                startPlacement={redSequence.startPlacement}
                fitAllSteps
                sizingProfile="preview"
                manualColumnCount={compactViewport ? 9 : 4}
                narrowMaxColumns={compactViewport ? 9 : 4}
                allowFewStepOverflowOnNarrow={false}
                leftColorOverride="#3b82f6"
                rightColorOverride="#ef233c"
              />
            </div>
            <PanelButton variant="primary" fullWidth onclick={useRedPath}>
              Use this red path
            </PanelButton>
          </article>
        </div>

        <footer class="decision-footer">
          <span>Blue stays unchanged until a red path is chosen.</span>
          <button type="button" class="text-action" onclick={returnToBlue}>
            Keep editing blue
          </button>
        </footer>
      </section>
    {:else}
      <section
        class="decision-panel complete-panel"
        aria-labelledby="paired-title"
      >
        <div class="complete-mark" aria-hidden="true">✓</div>
        <span class="panel-kicker">Pair complete</span>
        <h2 id="paired-title">Both paths are active</h2>
        <p>
          Blue and red now have eight aligned steps. This is the first point
          where Construct’s normal two-hand controls belong on screen.
        </p>
        <dl>
          <div>
            <dt>Blue</dt>
            <dd>{blueSequence.name}</dd>
          </div>
          <div>
            <dt>Red</dt>
            <dd>{redSequence.name}</dd>
          </div>
          <div>
            <dt>Next task</dt>
            <dd>Edit the paired sequence</dd>
          </div>
        </dl>
      </section>
    {/if}
  </div>
</main>

<style>
  :global(html),
  :global(body) {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #071018;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .proposal-page :global(*) {
    scrollbar-width: none;
  }

  .proposal-page :global(*::-webkit-scrollbar) {
    display: none;
  }

  .proposal-page {
    display: grid;
    width: 100%;
    height: 100dvh;
    grid-template-rows: auto minmax(0, 1fr);
    gap: clamp(10px, 1.2vw, 18px);
    padding: clamp(10px, 1.4vw, 22px);
    overflow: hidden;
    background: #071018;
    color: #f6f8fb;
    font-family: system-ui, sans-serif;
  }

  .workbench-header,
  .path-panel,
  .decision-panel {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: #0d141d;
  }

  .workbench-header {
    display: flex;
    min-height: 72px;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 14px;
    border-radius: 14px;
  }

  .identity {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10px;
  }

  .construct-label {
    padding-right: 10px;
    border-right: 1px solid rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.62);
    font-size: 13px;
    font-weight: 750;
  }

  .solo-badge {
    padding: 4px 7px;
    border: 1px solid rgba(59, 130, 246, 0.45);
    border-radius: 999px;
    background: rgba(59, 130, 246, 0.12);
    color: #93c5fd;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .hand-title {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 9px;
  }

  .hand-dot,
  .status-dot,
  .red-path-dot {
    display: block;
    flex: none;
    border-radius: 50%;
  }

  .hand-dot {
    width: 11px;
    height: 11px;
    background: #3b82f6;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.14);
  }

  .hand-dot.red {
    background: #ef233c;
    box-shadow: 0 0 0 4px rgba(239, 35, 60, 0.13);
  }

  .hand-dot.both {
    background: linear-gradient(90deg, #3b82f6 0 50%, #ef233c 50% 100%);
    box-shadow: 0 0 0 4px rgba(167, 139, 250, 0.13);
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    overflow: hidden;
    font-size: clamp(17px, 1.5vw, 23px);
    letter-spacing: -0.025em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hand-title p {
    margin-top: 2px;
    overflow: hidden;
    color: rgba(255, 255, 255, 0.58);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-actions {
    flex: none;
  }

  .workspace {
    display: grid;
    min-height: 0;
    grid-template-columns: minmax(360px, 0.9fr) minmax(460px, 1.1fr);
    gap: clamp(10px, 1.2vw, 18px);
    overflow: hidden;
  }

  .path-panel,
  .decision-panel {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
    border-radius: 16px;
  }

  .panel-heading,
  .decision-heading {
    display: flex;
    flex: none;
    align-items: start;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .panel-kicker {
    display: block;
    margin-bottom: 3px;
    color: rgba(255, 255, 255, 0.52);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    font-size: clamp(18px, 1.6vw, 24px);
    letter-spacing: -0.025em;
  }

  .step-count,
  .red-absence {
    flex: none;
    padding: 5px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 750;
  }

  .step-count {
    background: rgba(255, 255, 255, 0.07);
    color: rgba(255, 255, 255, 0.7);
  }

  .sequence-stage {
    flex: 1;
    min-height: 0;
    margin: 12px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    background: #05080d;
  }

  .path-status,
  .decision-footer {
    display: flex;
    min-height: 48px;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.58);
    font-size: 12px;
  }

  .path-status {
    justify-content: flex-start;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    background: #3b82f6;
  }

  .decision-heading {
    padding-block: 16px;
  }

  .decision-heading p {
    max-width: 43rem;
    margin-top: 5px;
    color: rgba(255, 255, 255, 0.64);
    font-size: 13px;
    line-height: 1.42;
  }

  .blue-heading {
    background: rgba(59, 130, 246, 0.055);
  }

  .red-heading {
    background: rgba(239, 35, 60, 0.055);
  }

  .red-absence {
    border: 1px solid rgba(239, 35, 60, 0.26);
    color: rgba(255, 176, 184, 0.78);
  }

  .option-region,
  .saved-path-list {
    flex: 1;
    min-height: 0;
    padding: 14px;
    overflow: auto;
    scrollbar-width: none;
  }

  .option-region::-webkit-scrollbar,
  .saved-path-list::-webkit-scrollbar,
  .workspace::-webkit-scrollbar {
    display: none;
  }

  .option-grid {
    display: grid;
    min-height: 100%;
    align-content: center;
    grid-template-columns: repeat(4, minmax(92px, 1fr));
    gap: 9px;
  }

  .motion-option {
    display: grid;
    min-width: 0;
    aspect-ratio: 0.86;
    grid-template-rows: minmax(0, 1fr) auto;
    padding: 5px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 11px;
    background: #080c12;
    color: #f8fafc;
    cursor: pointer;
    transition:
      border-color 120ms ease,
      background 120ms ease,
      transform 120ms ease;
  }

  .motion-option:hover {
    border-color: rgba(96, 165, 250, 0.75);
    background: #0c1624;
  }

  .motion-option:active {
    transform: scale(0.98);
  }

  .motion-option:focus-visible {
    outline: 2px solid #60a5fa;
    outline-offset: 2px;
  }

  .pictograph {
    display: block;
    min-height: 0;
  }

  .motion-name {
    display: block;
    padding: 5px 3px 3px;
    overflow: hidden;
    color: rgba(255, 255, 255, 0.72);
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
    text-align: center;
    text-overflow: ellipsis;
    text-transform: capitalize;
    white-space: nowrap;
  }

  .option-message {
    display: flex;
    height: 100%;
    min-height: 180px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 9px;
    color: rgba(255, 255, 255, 0.68);
    text-align: center;
  }

  .option-message span {
    font-size: 12px;
  }

  .loading-ring {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(59, 130, 246, 0.25);
    border-top-color: #60a5fa;
    border-radius: 50%;
    animation: spin 800ms linear infinite;
  }

  .error-message strong {
    color: #fecaca;
  }

  .text-action {
    min-height: 32px;
    padding: 3px 0;
    border: 0;
    background: transparent;
    color: #93c5fd;
    font: inherit;
    font-weight: 750;
    cursor: pointer;
  }

  .saved-path-list {
    display: grid;
    place-items: center;
  }

  .saved-path-card {
    display: grid;
    width: min(100%, 620px);
    min-height: 0;
    grid-template-rows: auto minmax(220px, 1fr) auto;
    gap: 10px;
    padding: 12px;
    border: 1px solid rgba(239, 35, 60, 0.42);
    border-radius: 14px;
    background: #090c12;
  }

  .saved-path-copy {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .saved-path-copy strong,
  .saved-path-copy span {
    display: block;
  }

  .saved-path-copy strong {
    font-size: 14px;
  }

  .saved-path-copy span {
    margin-top: 2px;
    color: rgba(255, 255, 255, 0.56);
    font-size: 12px;
  }

  .red-path-dot {
    width: 10px;
    height: 10px;
    background: #ef233c;
    box-shadow: 0 0 0 4px rgba(239, 35, 60, 0.13);
  }

  .red-sequence-preview {
    min-height: 0;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    background: #05080d;
  }

  .complete-panel {
    align-items: flex-start;
    justify-content: center;
    padding: clamp(20px, 5vw, 72px);
  }

  .complete-mark {
    display: grid;
    width: 44px;
    height: 44px;
    margin-bottom: 18px;
    place-items: center;
    border: 1px solid rgba(74, 222, 128, 0.44);
    border-radius: 50%;
    background: rgba(74, 222, 128, 0.1);
    color: #86efac;
    font-size: 23px;
  }

  .complete-panel > p {
    max-width: 36rem;
    margin-top: 8px;
    color: rgba(255, 255, 255, 0.64);
    font-size: 14px;
    line-height: 1.5;
  }

  dl {
    display: grid;
    width: min(100%, 36rem);
    gap: 1px;
    margin: 24px 0;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.1);
  }

  dl div {
    display: grid;
    grid-template-columns: 7rem minmax(0, 1fr);
    gap: 10px;
    padding: 10px 12px;
    background: #0b1119;
    font-size: 13px;
  }

  dt {
    color: rgba(255, 255, 255, 0.52);
  }

  dd {
    margin: 0;
    font-weight: 700;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 760px) {
    .proposal-page {
      padding: 8px;
    }

    .workbench-header {
      min-height: 64px;
      padding: 8px 10px;
    }

    .construct-label,
    .solo-badge {
      display: none;
    }

    .header-actions :global(button) {
      min-height: 40px;
      padding-inline: 10px;
      font-size: 12px;
    }

    .workspace {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(240px, 38dvh) minmax(380px, auto);
      overflow-y: auto;
      scrollbar-width: none;
    }

    .path-panel,
    .decision-panel {
      min-height: 0;
    }

    .option-region {
      overflow: visible;
    }

    .option-grid {
      grid-template-columns: repeat(2, minmax(120px, 1fr));
    }

    .decision-footer {
      align-items: flex-start;
      flex-direction: column;
      gap: 2px;
    }
  }

  @media (max-height: 560px) and (min-width: 761px) {
    .proposal-page {
      gap: 8px;
      padding: 8px;
    }

    .workbench-header {
      min-height: 56px;
      padding-block: 6px;
    }

    .panel-heading,
    .decision-heading {
      padding-block: 9px;
    }

    .sequence-stage {
      margin: 7px;
    }

    .path-status,
    .decision-footer {
      min-height: 38px;
      padding-block: 5px;
    }

    .option-region {
      padding: 7px;
    }

    .motion-option {
      aspect-ratio: 1.12;
    }

    .saved-path-card {
      grid-template-rows: auto minmax(150px, 1fr) auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .motion-option {
      transition: none;
    }

    .loading-ring {
      animation: none;
    }
  }
</style>
