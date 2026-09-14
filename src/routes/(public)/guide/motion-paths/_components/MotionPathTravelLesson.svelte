<script lang="ts">
  import { onMount } from "svelte";
  import InlineAnimationPlayer from "$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import { createAnimationScope } from "$lib/shared/animation-engine/state/animation-scope.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import {
    DEFAULT_TRAIL_SETTINGS,
    TrackingMode,
  } from "$lib/shared/animation-engine/domain/types/trail-types";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    singleHandPathExample,
    type MotionPathLessonShape,
  } from "../_data/motion-path-lesson-sequences";

  interface Props {
    active?: boolean;
  }

  let { active = true }: Props = $props();
  const scope = createAnimationScope({ persistence: "ephemeral" });
  scope.visibility.setDarkMode(true);
  scope.visibility.setVisibility("props", true);
  scope.visibility.setVisibility("leftPathLines", true);
  scope.visibility.setVisibility("rightPathLines", false);
  const trails = {
    ...DEFAULT_TRAIL_SETTINGS,
    trackingMode: TrackingMode.RIGHT_END,
    usePathCache: false,
  };
  const singleStaffTip = { "0-1": { effect: "trails" as const } };

  let shape = $state<MotionPathLessonShape>("arc");
  let prop = $state<"hand" | "staff">("hand");
  let playing = $state(false);
  let liveStep = $state(1.5);
  let reducedMotion = $state(false);
  let sequence = $derived(singleHandPathExample(shape));

  function chooseShape(value: MotionPathLessonShape): void {
    shape = value;
    playing = false;
  }

  function togglePlayback(): void {
    if (reducedMotion) return;
    playing = !playing;
  }

  $effect(() => {
    if (!active || reducedMotion) playing = false;
  });

  onMount(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion = query.matches;
    const updateReducedMotion = () => (reducedMotion = query.matches);
    const pauseWhenHidden = () => {
      if (document.hidden) playing = false;
    };
    query.addEventListener("change", updateReducedMotion);
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      playing = false;
      query.removeEventListener("change", updateReducedMotion);
      document.removeEventListener("visibilitychange", pauseWhenHidden);
    };
  });
</script>

<section class="lesson" aria-label="One hand motion path explorer">
  <div class="stage" aria-label="Single hand path animation">
    <InlineAnimationPlayer
      {sequence}
      sequenceLoadKey={sequence.id}
      initialStep={liveStep}
      onStepChange={(step) => (liveStep = step)}
      autoPlay={false}
      showControls={false}
      chrome="minimal"
      fill
      interactive
      hoverHint="none"
      disableContextMenu
      beatIndicators={false}
      hideTkaGlyph
      leftPropType={prop === "hand" ? PropType.HAND : PropType.STAFF}
      rightPropType={PropType.HAND}
      visibilityManagerOverride={scope.visibility}
      trailSettingsOverride={trails}
      tipEffectMap={singleStaffTip}
      externalPlaying={active && !reducedMotion ? playing : false}
      onExternalPlayingChange={(value) => (playing = value)}
      playbackAllowed={active}
      scrubbable
    />
  </div>

  <div class="controls">
    <div class="control-group">
      <span class="control-label">Path</span>
      <SegmentedControl
        options={[
          { value: "arc", label: "Arc" },
          { value: "linear", label: "Linear" },
          { value: "concave", label: "Concave" },
          { value: "hybrid", label: "Hybrid" },
        ]}
        value={shape}
        onchange={chooseShape}
        ariaLabel="Hand path"
        density="compact"
      />
    </div>
    <div class="control-row">
      <PanelButton onclick={togglePlayback} disabled={reducedMotion}>
        {playing ? "Pause" : "Play"}
      </PanelButton>
      <SegmentedControl
        options={[
          { value: "hand", label: "Hand" },
          { value: "staff", label: "Add staff" },
        ]}
        value={prop}
        onchange={(value) => (prop = value)}
        ariaLabel="What travels with the hand"
        density="compact"
      />
    </div>
    <p class="tip">Staff rotation rides along with the same hand travel.</p>
  </div>
</section>

<style>
  .lesson {
    container-type: inline-size;
    display: grid;
    gap: var(--spacing-md, 16px);
    min-width: 0;
  }
  .stage {
    width: min(100%, 27.5rem);
    aspect-ratio: 1;
    margin-inline: auto;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-lg, 12px);
    background: var(--theme-panel-bg);
  }
  .controls,
  .control-group {
    display: grid;
    gap: var(--spacing-sm, 8px);
    min-width: 0;
  }
  .control-label,
  .tip {
    color: var(--theme-text-muted);
    font-size: var(--font-size-min, 14px);
  }
  .control-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-sm, 8px);
  }
  .control-row :global(.segmented-control) {
    flex: 1 1 16rem;
  }
  .tip {
    margin: 0;
  }
  @container (min-width: 720px) {
    .lesson {
      grid-template-columns: minmax(0, 1.3fr) minmax(16rem, 0.7fr);
      align-items: center;
    }
    .stage {
      width: min(100%, 27.5rem);
    }
  }
</style>
