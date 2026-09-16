<script lang="ts">
  import PrintPreviewPages from "$lib/features/choreo-card/components/print-preview/PrintPreviewPages.svelte";
  import type { CardFooter } from "$lib/features/choreo-card/domain/models/DeckRelease";
  import SequenceMetadataRail from "$lib/features/create/shared/workspace-panel/sequence-display/components/SequenceMetadataRail.svelte";
  import WordLabel from "$lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte";
  import { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import demoSequenceJson from "$lib/shared/landing/data/demo-sequence.json";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

  type WorkspaceState = "empty" | "first" | "loop";

  const cardSequence = demoSequenceJson as unknown as SequenceData;
  const cardFooter: CardFooter = { center: "The Kinetic Alphabet" };
  const cardQrUrl = "https://tka.run/P3WN?bp=staff&rp=staff";
  const displayWord =
    cardSequence.word ?? cardSequence.name ?? "Built-in LOOP sequence";
  const cardMeasure = `${cardSequence.steps.length} counts · 3×4 portrait grid`;
  const emptySequence: SequenceData = { ...cardSequence, steps: [] };
  const firstStepSequence: SequenceData = {
    ...cardSequence,
    steps: cardSequence.steps.slice(0, 1),
  };
  let workspaceState = $state<WorkspaceState>("loop");

  const workspaceSequence = $derived<SequenceData>(
    workspaceState === "empty"
      ? emptySequence
      : workspaceState === "first"
        ? firstStepSequence
        : cardSequence
  );
  const workspaceLoopType = $derived(
    workspaceState === "loop" ? (cardSequence.loopType ?? null) : null
  );
  const workspacePeriod = $derived(
    workspaceState === "loop" && cardSequence.period
      ? cardSequence.period === 4
        ? Period.QUARTERED
        : Period.HALVED
      : null
  );
</script>

<svelte:head>
  <title>Choreo indicators</title>
</svelte:head>

<main class="review-page">
  <header class="page-header">
    <p class="eyebrow">Deck Releaser render</p>
    <h1>Choreo indicators</h1>
    <p>
      This checked-in 8-count LOOP uses the Deck Releaser print pipeline for
      both sides.
    </p>
  </header>

  <div class="review-grid">
    <section class="review-panel card-panel">
      <div class="panel-heading">
        <div>
          <p class="section-number">01</p>
          <h2>Physical card pair</h2>
        </div>
        <span class="measure">{cardMeasure}</span>
      </div>

      <div class="card-stage">
        <div class="card-render">
          <PrintPreviewPages
            sequences={[cardSequence]}
            cardSize="poker"
            theme="rainbow"
            isLoading={false}
            includeStartPlacement={true}
            footers={[cardFooter]}
            qrUrls={[cardQrUrl]}
            deckMode={true}
            displayMode="grid"
            showBacks={true}
            leftPropType={PropType.STAFF}
            rightPropType={PropType.STAFF}
            includeInsertCard={false}
          />
        </div>
      </div>

      <p class="card-source">Built-in 8-count rotated LOOP · {displayWord}</p>
    </section>

    <section class="review-panel workspace-panel">
      <div class="panel-heading">
        <div>
          <p class="section-number">02</p>
          <h2>Workspace header</h2>
        </div>
        <span class="measure">20 px level · 18 px LOOP icons</span>
      </div>

      <div
        class="state-switch"
        role="group"
        aria-label="Workspace sequence state"
      >
        <button
          type="button"
          class:active={workspaceState === "empty"}
          onclick={() => (workspaceState = "empty")}>No steps</button
        >
        <button
          type="button"
          class:active={workspaceState === "first"}
          onclick={() => (workspaceState = "first")}>First step</button
        >
        <button
          type="button"
          class:active={workspaceState === "loop"}
          onclick={() => (workspaceState = "loop")}>Detected LOOP</button
        >
      </div>

      <div class="workspace-stage">
        <div class="workspace-header">
          <div class="word-label-area">
            <WordLabel word={displayWord} scrollMode={false} />
            <SequenceMetadataRail
              sequence={workspaceSequence}
              loopType={workspaceLoopType}
              period={workspacePeriod}
            />
          </div>
        </div>

        <div class="workspace-body" aria-hidden="true">
          {#each workspaceSequence?.steps ?? [] as _, index}
            <div class="step-placeholder">{index + 1}</div>
          {/each}
          {#if (workspaceSequence?.steps.length ?? 0) === 0}
            <p>Add a step to reveal the level.</p>
          {/if}
        </div>
      </div>

      <p class="state-note">
        The rail keeps its height from the start. Difficulty appears with the
        first step, and LOOP icons appear when a pattern is detected.
      </p>
    </section>
  </div>
</main>

<style>
  :global(html) {
    color-scheme: dark;
    background: #090b10;
  }

  :global(body) {
    margin: 0;
    background:
      radial-gradient(
        circle at 12% 10%,
        rgba(91, 75, 138, 0.18),
        transparent 36rem
      ),
      #090b10;
  }

  :global(button) {
    font: inherit;
  }

  .review-page {
    min-height: 100vh;
    box-sizing: border-box;
    padding: clamp(24px, 4vw, 64px);
    color: #f4f4f5;
  }

  .page-header {
    width: min(100%, 1180px);
    margin: 0 auto clamp(24px, 4vw, 48px);
  }

  .eyebrow,
  .section-number {
    margin: 0 0 8px;
    color: #a995e2;
    font-size: 12px;
    font-weight: 750;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  h1,
  h2,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 8px;
    font:
      700 clamp(32px, 5vw, 56px) / 1.05 Gelasio,
      Georgia,
      serif;
  }

  .page-header > p:last-child {
    margin-bottom: 0;
    color: #a8a8b3;
    font-size: 16px;
  }

  .review-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(20px, 3vw, 36px);
    width: min(100%, 1180px);
    margin: 0 auto;
  }

  .review-panel {
    min-width: 0;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.11);
    border-radius: 20px;
    background: rgba(18, 20, 28, 0.9);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.3);
  }

  .panel-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 22px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .panel-heading h2 {
    margin-bottom: 0;
    font-size: 21px;
  }

  .section-number {
    margin-bottom: 3px;
  }

  .measure {
    padding: 7px 10px;
    border: 1px solid rgba(169, 149, 226, 0.28);
    border-radius: 999px;
    color: #c8baf0;
    font-size: 12px;
    white-space: nowrap;
  }

  .card-stage {
    display: grid;
    min-height: 560px;
    place-items: center;
    padding: clamp(24px, 5vw, 54px);
    background:
      linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
    background-size: 24px 24px;
  }

  .card-render {
    width: min(100%, 760px);
  }

  .card-render :global(.pages-container),
  .card-render :global(.card-grid-scroll) {
    padding: 0;
    overflow: visible;
  }

  .card-render :global(.card-grid-scroll) {
    display: block;
  }

  .card-render :global(.card-item) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;
  }

  .card-render :global(.card-cell) {
    box-shadow: 0 28px 45px rgba(0, 0, 0, 0.42);
  }

  .card-source {
    margin: 0;
    padding: 0 24px 22px;
    color: #9697a5;
    font-size: 12px;
    text-align: center;
  }

  .state-switch {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin: 24px 24px 0;
    padding: 4px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.28);
  }

  .state-switch,
  .workspace-stage,
  .state-note {
    width: min(calc(100% - 48px), 760px);
    box-sizing: border-box;
    margin-right: auto;
    margin-left: auto;
  }

  .state-switch button {
    min-height: 44px;
    padding: 8px 12px;
    border: 0;
    border-radius: 8px;
    color: #aaaab5;
    background: transparent;
    cursor: pointer;
  }

  .state-switch button.active {
    color: #fff;
    background: #4e3b78;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  }

  .state-switch button:focus-visible {
    outline: 2px solid #c8baf0;
    outline-offset: 2px;
  }

  .workspace-stage {
    min-height: 360px;
    margin: 20px 24px 0;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    background: #11141c;
  }

  .workspace-header {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }

  .word-label-area {
    grid-column: 2;
    display: grid;
    grid-template-rows: auto 20px;
    align-items: center;
    justify-items: center;
    gap: 2px;
    min-width: 0;
  }

  .workspace-body {
    display: grid;
    grid-template-columns: repeat(4, minmax(52px, 1fr));
    gap: 10px;
    align-content: start;
    min-height: 266px;
    padding: 22px;
  }

  .workspace-body p {
    grid-column: 1 / -1;
    align-self: center;
    margin: 90px 0 0;
    color: #777987;
    font-size: 14px;
    text-align: center;
  }

  .step-placeholder {
    display: grid;
    aspect-ratio: 1;
    place-items: start;
    padding: 7px;
    box-sizing: border-box;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 8px;
    color: #777987;
    background:
      linear-gradient(
        45deg,
        transparent 49%,
        rgba(255, 255, 255, 0.055) 50%,
        transparent 51%
      ),
      rgba(255, 255, 255, 0.025);
    font-size: 12px;
  }

  .state-note {
    margin: 18px 24px 24px;
    color: #9697a5;
    font-size: 13px;
    line-height: 1.55;
  }

  @media (max-width: 860px) {
    .card-stage {
      min-height: 0;
    }

    .card-render {
      width: min(100%, 360px);
    }

    .card-render :global(.card-item) {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (min-width: 1680px) {
    .page-header,
    .review-grid {
      width: min(88vw, 2600px);
    }

    .review-grid {
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
      align-items: start;
    }

    .card-stage {
      min-height: 680px;
    }
  }

  @media (min-width: 3000px) {
    .review-page {
      padding: 112px;
    }

    .page-header,
    .review-grid {
      width: min(100%, 2600px);
    }

    .page-header {
      margin-bottom: 72px;
    }

    .eyebrow,
    .section-number {
      font-size: 18px;
    }

    h1 {
      margin-bottom: 16px;
      font-size: 88px;
    }

    .page-header > p:last-child {
      font-size: 25px;
    }

    .review-panel {
      border-radius: 30px;
    }

    .panel-heading {
      padding: 36px 40px;
    }

    .panel-heading h2 {
      font-size: 32px;
    }

    .measure {
      padding: 11px 16px;
      font-size: 18px;
    }

    .card-stage {
      min-height: 960px;
    }

    .card-render {
      width: min(100%, 1180px);
    }

    .state-switch {
      gap: 6px;
      margin: 40px 40px 0;
      padding: 6px;
      border-radius: 18px;
    }

    .state-switch button {
      min-height: 64px;
      border-radius: 12px;
      font-size: 20px;
    }

    .workspace-stage {
      min-height: 620px;
      margin: 32px 40px 0;
      border-radius: 20px;
    }

    .workspace-header {
      grid-template-columns: 64px minmax(0, 1fr) 64px;
      padding: 22px;
    }

    .workspace-body {
      gap: 16px;
      min-height: 462px;
      padding: 34px;
    }

    .step-placeholder {
      padding: 11px;
      border-radius: 12px;
      font-size: 18px;
    }

    .state-note {
      margin: 28px 40px 40px;
      font-size: 19px;
    }

    .state-switch,
    .workspace-stage,
    .state-note {
      width: min(calc(100% - 80px), 1400px);
      margin-right: auto;
      margin-left: auto;
    }
  }

  @media (max-width: 520px) {
    .review-page {
      padding: 18px 12px 28px;
    }

    .panel-heading {
      display: grid;
      padding: 18px;
    }

    .measure {
      justify-self: start;
    }

    .state-switch,
    .workspace-stage {
      margin-right: 14px;
      margin-left: 14px;
    }

    .state-switch button {
      padding-inline: 6px;
      font-size: 12px;
    }

    .workspace-body {
      grid-template-columns: repeat(2, 1fr);
    }

    .state-note {
      margin-right: 14px;
      margin-left: 14px;
    }
  }
</style>
