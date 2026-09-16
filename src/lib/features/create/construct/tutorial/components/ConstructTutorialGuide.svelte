<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { getCreateModuleContext } from "$lib/features/create/shared/context/create-module-context";
  import { WORKSPACE_BUTTON_ICON } from "$lib/features/create/shared/workspace-panel/shared/workspace-button-layout";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";

  const { constructTutorialState } = getCreateModuleContext();

  const message = $derived.by(() => {
    switch (constructTutorialState.stage) {
      case "start-placement":
        return {
          title: "Choose a start placement",
          instruction: "Use Presets, or choose Build to place both props.",
        };
      case "next-pictograph":
        return {
          title: constructTutorialState.placementLabel
            ? `Start placement: ${constructTutorialState.placementLabel}`
            : "Start placement set",
          instruction: "Tap a pictograph to add it. Hold one to preview it.",
        };
      case "play-sequence":
        return {
          title: constructTutorialState.addedLetter
            ? `Next step: ${constructTutorialState.addedLetter}`
            : "Next step added",
          instruction: `Use ${WORKSPACE_BUTTON_ICON.view.actionLabel} below the workspace.`,
        };
    }
  });
</script>

<div class="guide-transition">
  <Crossfade
    key={constructTutorialState.isActive}
    duration={DURATION.emphasis}
    animateHeight
  >
    {#if constructTutorialState.isActive}
      <aside
        class="construct-guide"
        aria-labelledby="construct-guide-title"
        aria-describedby="construct-guide-instruction"
        data-stage={constructTutorialState.stage}
      >
        <div class="guide-progress" aria-hidden="true">
          <span
            style:width={`${(constructTutorialState.currentStepNumber / constructTutorialState.totalSteps) * 100}%`}
          ></span>
        </div>

        <div class="guide-copy" aria-live="polite" aria-atomic="true">
          <span class="guide-kicker">
            Construct guide · Step {constructTutorialState.currentStepNumber}
            of {constructTutorialState.totalSteps}
          </span>
          <strong id="construct-guide-title">{message.title}</strong>
          <span id="construct-guide-instruction">{message.instruction}</span>
        </div>

        <PanelButton
          variant="secondary"
          ariaLabel="Dismiss Construct guide"
          onclick={() => constructTutorialState.dismiss()}
        >
          Dismiss
        </PanelButton>
      </aside>
    {:else}
      <span class="closed-guide" aria-hidden="true"></span>
    {/if}
  </Crossfade>
</div>

<style>
  .guide-transition {
    flex: 0 0 auto;
    width: 100%;
  }

  .closed-guide {
    display: block;
    width: 100%;
    height: 0;
  }

  .construct-guide {
    position: relative;
    flex: 0 0 auto;
    min-height: 88px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px 12px;
    box-sizing: border-box;
    overflow: hidden;
    border-bottom: 1px solid
      color-mix(in srgb, var(--theme-accent) 44%, var(--theme-stroke));
    background: color-mix(
      in srgb,
      var(--theme-accent) 9%,
      var(--theme-panel-bg)
    );
    color: var(--theme-text);
  }

  .guide-progress {
    position: absolute;
    inset: 0 0 auto;
    height: 3px;
    background: color-mix(in srgb, var(--theme-stroke) 72%, transparent);
  }

  .guide-progress span {
    display: block;
    height: 100%;
    background: var(--theme-accent);
    transition: width var(--duration-normal) var(--ease-out);
  }

  .guide-copy {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: baseline;
    column-gap: 10px;
    line-height: 1.25;
  }

  .guide-kicker {
    grid-column: 1 / -1;
    color: color-mix(in srgb, var(--theme-text) 82%, var(--theme-panel-bg));
    font-size: var(--font-size-compact);
    font-weight: 650;
  }

  .guide-copy strong {
    font-size: var(--font-size-min);
  }

  .guide-copy > span:last-child {
    color: color-mix(in srgb, var(--theme-text) 82%, var(--theme-panel-bg));
    font-size: var(--font-size-min);
  }

  @container (max-width: 520px) {
    .construct-guide {
      gap: 10px;
      padding-inline: 12px;
    }

    .guide-copy {
      grid-template-columns: 1fr;
      row-gap: 2px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .guide-progress span {
      transition: none;
    }
  }
</style>
