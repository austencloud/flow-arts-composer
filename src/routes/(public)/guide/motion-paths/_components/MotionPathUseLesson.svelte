<script lang="ts">
  import InlineAnimationPlayer from "$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import PathShapePanel from "$lib/shared/animation-engine/components/settings-panels/PathShapePanel.svelte";
  import { createAnimationScope } from "$lib/shared/animation-engine/state/animation-scope.svelte";
  import { setAnimationVisibilityContext } from "$lib/shared/animation-engine/state/animation-visibility-context";
  import {
    DEFAULT_TRAIL_SETTINGS,
    TrackingMode,
  } from "$lib/shared/animation-engine/domain/types/trail-types";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import StepStrip from "$lib/shared/timeline/StepStrip.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { openSequenceViewer } from "$lib/shared/sequence-viewer/services/sequence-viewer-navigator";
  import { motionPathExamples } from "../_data/motion-path-examples";
  import { createMotionPathApplication } from "../_data/motion-path-application.svelte";
  import { savedSequencePathPolicy } from "$lib/shared/sequence-viewer/services/sequence-path-policy";

  let { active = true }: { active?: boolean } = $props();
  const scope = createAnimationScope({ persistence: "ephemeral" });
  const playbackScope = createAnimationScope({ persistence: "ephemeral" });
  scope.visibility.setDarkMode(true);
  playbackScope.visibility.setDarkMode(true);
  playbackScope.visibility.setVisibility("leftPathLines", true);
  playbackScope.visibility.setVisibility("rightPathLines", true);
  setAnimationVisibilityContext(scope.visibility);
  const lesson = createMotionPathApplication(motionPathExamples[2]!);
  const sequence = $derived(lesson.sequence);
  const trails = {
    ...DEFAULT_TRAIL_SETTINGS,
    trackingMode: TrackingMode.RIGHT_END,
    usePathCache: false,
  };
  let target = $state<"sequence" | "step">("sequence");
  let selectedStep = $state(1);
  let currentStep = $state(1);
  let playing = $state(false);
  let seek = $state<((step: number) => void) | null>(null);
  let status = $state("Example ready");

  $effect(() => {
    if (!active) playing = false;
  });

  function selectStep(step: number) {
    playing = false;
    selectedStep = Math.max(
      1,
      Math.min(sequence.steps.length, Math.floor(step))
    );
    currentStep = selectedStep;
    target = "step";
    syncControls();
    seek?.(selectedStep);
  }

  function syncControls() {
    let policy = savedSequencePathPolicy(sequence, {
      pathShape: "arc",
      motionAwarePaths: false,
    });
    if (target === "step") {
      const motions = sequence.steps[selectedStep - 1]?.motions;
      const left = motions?.left?.pathShape;
      const right = motions?.right?.pathShape;
      if (left)
        policy = {
          pathShape: left,
          motionAwarePaths: right !== undefined && left !== right,
        };
    }
    scope.visibility.setPathPolicy(policy);
  }

  function applyPath() {
    playing = false;
    lesson.apply(
      scope.visibility.getPathPolicy(),
      target === "step" ? selectedStep - 1 : undefined
    );
    status =
      target === "step"
        ? `Step ${selectedStep} changed`
        : "Whole sequence changed";
  }
</script>

<div class="application-demo">
  <div class="stage">
    <InlineAnimationPlayer
      {sequence}
      leftPropType={PropType.STAFF}
      rightPropType={PropType.STAFF}
      visibilityManagerOverride={playbackScope.visibility}
      effectsConfigState={playbackScope.effects}
      trailSettingsOverride={trails}
      autoPlay={false}
      externalPlaying={playing}
      externalBpm={36}
      onExternalPlayingChange={(value) => (playing = value)}
      onStepChange={(step) => (currentStep = step)}
      onSeekRef={(value) => (seek = value)}
      initialStep={currentStep}
      playbackAllowed={active}
      chrome="minimal"
      showControls={false}
      backgroundAlpha={0}
      disableContextMenu
      beatIndicators={false}
      fill
    />
  </div>
  <div class="editor">
    <span class="label">Apply to</span>
    <SegmentedControl
      options={[
        { value: "sequence", label: "Whole sequence" },
        { value: "step", label: `Step ${selectedStep}` },
      ]}
      value={target}
      onchange={(value) => {
        target = value;
        syncControls();
      }}
      ariaLabel="Apply motion path to"
    />
    <div class="path-controls">
      <PathShapePanel showHelp={false} onSettingChange={applyPath} />
    </div>
    <div class="actions">
      <PanelButton onclick={() => (playing = !playing)}
        >{playing ? "Pause example" : "Play example"}</PanelButton
      >
      <PanelButton
        disabled={!lesson.changed}
        onclick={() => {
          lesson.save();
          status = "Saved in this example";
        }}>Save example</PanelButton
      >
      <PanelButton
        disabled={!lesson.changed}
        onclick={() => {
          playing = false;
          lesson.restore();
          syncControls();
          status = "Saved example restored";
        }}>Restore saved</PanelButton
      >
      <PanelButton
        onclick={() => {
          playing = false;
          lesson.reset();
          syncControls();
          status = "Example reset";
        }}>Reset example</PanelButton
      >
    </div>
    <span class="status" role="status">{status}</span>
    <PanelButton
      onclick={() =>
        openSequenceViewer(sequence, {
          source: "external_link",
          returnPath: "/guide/motion-paths",
          returnLabel: "Motion paths",
        })}>Open in sequence viewer</PanelButton
    >
  </div>
  <div class="strip" aria-label="Choose a step to edit">
    <StepStrip
      {sequence}
      includeStartPosition={false}
      currentStep={playing ? currentStep : selectedStep}
      onCellClick={selectStep}
      leftPropType={PropType.STAFF}
      rightPropType={PropType.STAFF}
      density="compact"
      fillHeight
    />
  </div>
</div>

<style>
  .application-demo {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: center;
    gap: var(--spacing-md, 16px);
    min-width: 0;
  }
  .stage {
    width: 100%;
    aspect-ratio: 1;
    min-width: 0;
    position: relative;
  }
  .editor {
    display: grid;
    gap: var(--spacing-sm, 8px);
    min-width: 0;
  }
  .label,
  .status {
    color: var(--theme-text-muted);
    font-size: var(--font-size-min, 14px);
  }
  .status {
    min-height: 1.5em;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm, 8px);
  }
  .strip {
    grid-column: 1 / -1;
    min-width: 0;
    height: 84px;
    overflow: hidden;
  }
  @container (max-width: 520px) {
    .application-demo {
      grid-template-columns: minmax(0, 1fr);
    }
    .stage {
      max-width: 340px;
      justify-self: center;
    }
  }
</style>
