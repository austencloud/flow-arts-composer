<script lang="ts">
  import { untrack } from "svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import InlineAnimationPlayer from "#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { motionQueryHandler } from "#lib/shared/pictograph/shared/services/motion-query-handler.js";
  import { deriveLettersForSequence } from "#lib/shared/navigation/services/letter-deriver.js";
  import { createConstructSoloReviewSequence } from "./construct-solo-review-fixture";
  import {
    createSoloAuthoringState,
    setSoloAuthoringContext,
  } from "./solo-authoring-state.svelte.js";
  import { handName, otherHand } from "./construct-solo-proposal";
  import SoloStartChoices from "./SoloStartChoices.svelte";
  import SoloMotionChoices from "./SoloMotionChoices.svelte";
  import SoloPathPreview from "./SoloPathPreview.svelte";

  const authoring = createSoloAuthoringState(
    {
      loadCatalog: (gridMode) => motionQueryHandler.queryMotions({ gridMode }),
      deriveLetters: deriveLettersForSequence,
    },
    createConstructSoloReviewSequence("left")
  );
  setSoloAuthoringContext(authoring);
  const visibility = new AnimationVisibilityStateManager({ ephemeral: true });
  const effects = createEffectsConfigState(undefined, { persist: false });
  let mobilePanel = $state("build");
  let referenceShown = $state(false);
  const colorName = $derived(handName(authoring.activeHand));
  const nextStep = $derived((authoring.active?.steps.length ?? 0) + 1);
  const referencePicture = $derived(
    authoring.reference
      ? !authoring.active
        ? authoring.reference.startPlacement
        : authoring.reference.steps[
            Math.min(nextStep - 1, authoring.reference.steps.length - 1)
          ]
      : null
  );
  const title = $derived(
    authoring.result
      ? authoring.reference
        ? "Blue + red sequence"
        : colorName + " solo"
      : !authoring.active
        ? "Choose where " + colorName.toLowerCase() + " starts"
        : authoring.complete
          ? colorName + " path complete"
          : "Choose " + colorName.toLowerCase() + " step " + nextStep
  );
  const displayedSequence = $derived(
    authoring.result ??
      (referenceShown && authoring.reference
        ? authoring.reference
        : authoring.active)
  );

  $effect(() => {
    void authoring.draft.gridMode;
    untrack(() => {
      void authoring.loadCatalog();
    });
  });
  $effect(() => {
    void authoring.activeHand;
    untrack(() => {
      mobilePanel = "build";
      referenceShown = false;
    });
  });
  function newSolo() {
    authoring.newSolo();
    mobilePanel = "build";
    referenceShown = false;
  }
</script>

<svelte:head><title>Construct · single-hand authoring test</title></svelte:head>

<main
  class="solo-workbench"
  data-hand={authoring.activeHand}
  data-mode={authoring.result
    ? "review"
    : authoring.reference
      ? "partner"
      : "solo"}
>
  <header class="toolbar">
    <div class="identity">
      <h1>Construct</h1>
      <span>Single-hand test</span>
      <LinkChip href="/test/construct-solo-handoff/proposal" size="inline"
        >Fixture walkthrough</LinkChip
      >
    </div>
    <div class="history-actions">
      <PanelButton
        disabled={!authoring.history.canUndo}
        onclick={() => authoring.history.undo()}>Undo</PanelButton
      >
      <PanelButton
        disabled={!authoring.history.canRedo}
        onclick={() => authoring.history.redo()}>Redo</PanelButton
      >
      <PanelButton onclick={newSolo}>New solo</PanelButton>
    </div>
  </header>

  <div class="mobile-switch">
    <SegmentedControl
      ariaLabel="Workspace panel"
      semantics="tabs"
      color="accent"
      value={mobilePanel}
      onchange={(value) => (mobilePanel = value)}
      options={[
        {
          value: "build",
          label: authoring.result
            ? "Playback"
            : "Build " + colorName.toLowerCase(),
        },
        {
          value: "path",
          label: "Your path",
          count: authoring.active?.steps.length ?? 0,
        },
      ]}
    />
  </div>

  <div class="workspace">
    <section class="artifact" class:mobile-hidden={mobilePanel !== "path"}>
      {#if authoring.reference && !authoring.result}
        <SegmentedControl
          ariaLabel="Path to inspect"
          semantics="tabs"
          color="accent"
          value={referenceShown ? "reference" : "active"}
          onchange={(value) => (referenceShown = value === "reference")}
          options={[
            { value: "active", label: colorName + " · building" },
            {
              value: "reference",
              label: handName(authoring.draft.primaryHand) + " · fixed",
            },
          ]}
        />
      {/if}
      <div class="path-stage">
        <SoloPathPreview
          sequence={displayedSequence}
          title={authoring.result
            ? authoring.reference
              ? "Combined pictographs"
              : colorName + " path"
            : referenceShown && authoring.reference
              ? handName(authoring.draft.primaryHand) + " path · fixed"
              : colorName + " path"}
          focusStep={referenceShown
            ? nextStep
            : (authoring.active?.steps.length ?? 0)}
        />
      </div>
    </section>

    <section
      class="builder"
      class:mobile-hidden={mobilePanel !== "build"}
      aria-label="Active hand builder"
    >
      <header class="task-heading">
        <div class="task-copy">
          <h2>{title}</h2>
          <p>
            {authoring.result
              ? "Play your sequence, or return to editing."
              : authoring.reference
                ? `${handName(authoring.draft.primaryHand)} stays fixed · ${authoring.active?.steps.length ?? 0} of ${authoring.targetLength} steps built`
                : !authoring.active
                  ? "Choose a hand, then a starting pictograph."
                  : "Pick a pictograph to add one motion."}
          </p>
        </div>
        {#if referencePicture && !authoring.result}
          <figure class="reference">
            <div class="reference-picture">
              <PictographContainer
                pictographData={referencePicture}
                gridMode={authoring.draft.gridMode}
                disableTransitions
                stepNumberOverride={false}
              />
            </div>
            <figcaption>
              {handName(authoring.draft.primaryHand)}
              {authoring.active
                ? `step ${Math.min(nextStep, authoring.targetLength!)}`
                : "start"} · fixed
            </figcaption>
          </figure>
        {/if}
      </header>

      <div
        class="decision"
        class:review={!!authoring.result}
        class:starting={!authoring.active && !authoring.result}
      >
        {#if authoring.result}
          <div class="player">
            <InlineAnimationPlayer
              sequence={authoring.result}
              autoPlay={false}
              fill
              visibilityManagerOverride={visibility}
              effectsConfigState={effects}
              disableContextMenu
            />
          </div>
        {:else if authoring.complete}
          <div class="complete">
            <h3>Both paths have {authoring.targetLength} steps.</h3>
            <p>Combine them to see the two-hand pictographs and animation.</p>
            {#if authoring.error}<p role="alert">{authoring.error}</p>{/if}
            <PanelButton
              variant="primary"
              disabled={authoring.busy}
              ariaBusy={authoring.busy}
              onclick={authoring.review}
            >
              {authoring.busy ? "Combining…" : "Combine paths"}
            </PanelButton>
          </div>
        {:else if !authoring.active}
          <SoloStartChoices />
        {:else}
          <SoloMotionChoices />
        {/if}
      </div>

      <footer class="builder-actions">
        {#if authoring.result}
          <PanelButton variant="primary" onclick={authoring.resume}
            >Keep editing</PanelButton
          >
          {#if !authoring.reference}<PanelButton
              onclick={() => {
                authoring.resume();
                authoring.addPartner();
              }}
              >Add {handName(otherHand(authoring.activeHand)).toLowerCase()} path</PanelButton
            >{/if}
        {:else if !authoring.reference && authoring.active?.steps.length}
          <PanelButton onclick={authoring.review}>Review solo</PanelButton>
          <PanelButton onclick={authoring.addPartner}
            >Add {handName(otherHand(authoring.activeHand)).toLowerCase()} path</PanelButton
          >
        {:else}
          <span
            >{authoring.reference
              ? "Every choice here changes only " +
                colorName.toLowerCase() +
                "."
              : "A solo can stand on its own. A second hand is optional."}</span
          >
        {/if}
      </footer>
    </section>
  </div>
  <footer class="session-note">
    <span role="status">{authoring.notice}</span>
    <LinkChip href="/test/construct-solo-handoff/proposal" size="inline" wrap
      >Fixture walkthrough</LinkChip
    ><span class="ephemeral">Test session · not saved</span>
  </footer>
</main>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    scrollbar-gutter: auto;
    background: var(--theme-background, #101014);
  }
  .solo-workbench,
  .solo-workbench :global(*) {
    box-sizing: border-box;
  }
  .solo-workbench {
    height: 100dvh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 12px;
    padding: 16px;
    color: var(--theme-text, #fafafa);
    font-family: system-ui, sans-serif;
    font-size: 16px;
    background: var(--theme-panel-bg, #101014);
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 48px;
  }
  .identity {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  h1 {
    font-size: 20px;
    margin: 0;
  }
  .identity span,
  .ephemeral {
    color: var(--theme-text-dim);
    font-size: 12px;
  }
  .history-actions {
    display: flex;
    gap: 8px;
  }
  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    gap: clamp(10px, 1.2vw, 18px);
    min-height: 0;
  }
  .artifact {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: 0;
    padding: 16px;
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
    background: var(--theme-card-bg);
  }
  .path-stage {
    flex: 1;
    min-height: 0;
  }
  .builder {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 12px;
    min-height: 0;
    min-width: 0;
    padding: 16px;
  }
  .task-heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }
  .task-copy {
    min-width: 0;
  }
  h2 {
    margin: 0;
    font-size: 22px;
    line-height: 1.2;
  }
  .task-heading p {
    margin: 8px 0 0;
    color: var(--theme-text-dim);
    font-size: 14px;
    line-height: 1.4;
  }
  .reference {
    margin: 0;
    width: 130px;
    flex: none;
  }
  .reference-picture {
    width: 100%;
    height: 112px;
  }
  figcaption {
    font-size: 12px;
    text-align: center;
    line-height: 1.2;
  }
  .decision {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
  }
  .decision.review {
    display: block;
  }
  .builder-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
    gap: 8px;
    font-size: 14px;
    color: var(--theme-text-dim);
  }
  .session-note {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 20px;
    font-size: 12px;
    color: var(--theme-text-dim);
  }
  .complete {
    grid-row: 1/-1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 16px;
  }
  .complete h3,
  .complete p {
    margin: 0;
  }
  .player {
    height: 100%;
    width: 100%;
  }
  .mobile-switch {
    display: none;
  }
  @media (min-width: 2200px) {
    .workspace {
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
      gap: 40px;
    }
    .builder {
      padding-inline: clamp(16px, 3vw, 100px);
    }
  }
  @media (max-width: 700px) {
    .solo-workbench {
      padding: 8px;
      gap: 8px;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
    }
    .identity span {
      display: none;
    }
    .toolbar {
      gap: 8px;
    }
    h1 {
      font-size: 16px;
    }
    .history-actions {
      gap: 4px;
    }
    .history-actions :global(button) {
      padding-inline: 9px;
      font-size: 14px;
    }
    .mobile-switch {
      display: block;
    }
    .workspace {
      display: block;
    }
    .artifact,
    .builder {
      height: 100%;
    }
    .mobile-hidden {
      display: none;
    }
    .builder {
      padding: 4px;
      gap: 8px;
    }
    .decision {
      gap: 8px;
    }
    h2 {
      font-size: 18px;
    }
    .task-heading p {
      margin-top: 4px;
    }
    .reference {
      width: 86px;
    }
    .reference-picture {
      height: 70px;
    }
    .session-note {
      min-height: 30px;
    }
    .ephemeral {
      display: none;
    }
  }
  @media (min-width: 701px) and (max-width: 1000px) and (min-height: 800px) {
    .workspace {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 0.38fr) minmax(0, 0.62fr);
      gap: 12px;
    }
    .builder {
      padding: 8px;
    }
  }
  @media (max-height: 550px) and (min-width: 701px) {
    .solo-workbench {
      padding: 8px;
      gap: 6px;
    }
    .workspace {
      gap: 12px;
      grid-template-columns: minmax(0, 0.75fr) minmax(0, 1.25fr);
    }
    .artifact,
    .builder {
      padding: 6px;
      gap: 6px;
    }
    .reference {
      width: 74px;
    }
    .reference-picture {
      height: 52px;
    }
    h2 {
      font-size: 18px;
    }
    .task-heading p {
      margin-top: 3px;
    }
    .decision {
      gap: 6px;
    }
    .decision.starting {
      grid-template-columns: 270px minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
    }
    .session-note {
      min-height: 16px;
    }
  }
</style>
