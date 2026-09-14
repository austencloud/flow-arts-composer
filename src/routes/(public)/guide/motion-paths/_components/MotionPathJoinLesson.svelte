<script lang="ts">
  import { onMount } from "svelte";
  import InlineAnimationPlayer from "$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import StepStrip from "$lib/shared/timeline/StepStrip.svelte";
  import { createAnimationScope } from "$lib/shared/animation-engine/state/animation-scope.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import {
    DEFAULT_TRAIL_SETTINGS,
    TrackingMode,
  } from "$lib/shared/animation-engine/domain/types/trail-types";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { pathJoinExample } from "../_data/motion-path-lesson-sequences";

  interface Props {
    active?: boolean;
  }

  let { active = true }: Props = $props();
  const arcScope = createAnimationScope({ persistence: "ephemeral" });
  const concaveScope = createAnimationScope({ persistence: "ephemeral" });
  arcScope.visibility.setDarkMode(true);
  concaveScope.visibility.setDarkMode(true);
  const trails = {
    ...DEFAULT_TRAIL_SETTINGS,
    trackingMode: TrackingMode.RIGHT_END,
    usePathCache: false,
  };
  const singleStaffTip = { "0-1": { effect: "trails" as const } };

  const arcSequence = pathJoinExample("arc");
  const concaveSequence = pathJoinExample("concave");
  const joinStep = 2;
  let playing = $state(false);
  let liveStep = $state(joinStep);
  let arcSeek = $state<((step: number) => void) | null>(null);
  let reducedMotion = $state(false);

  function togglePlayback(): void {
    if (reducedMotion) return;
    playing = !playing;
  }

  function seek(step: number): void {
    playing = false;
    liveStep = step;
    arcSeek?.(step);
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

<section class="lesson" aria-label="Arc and concave path join comparison">
  <div class="comparison">
    <div class="path-pane">
      <span class="path-label">Arc</span>
      <div class="stage">
        <InlineAnimationPlayer
          sequence={arcSequence}
          sequenceLoadKey={arcSequence.id}
          autoPlay={false}
          showControls={false}
          chrome="minimal"
          fill
          interactive
          hoverHint="none"
          disableContextMenu
          beatIndicators={false}
          hideTkaGlyph
          leftPropType={PropType.STAFF}
          rightPropType={PropType.STAFF}
          visibilityManagerOverride={arcScope.visibility}
          trailSettingsOverride={trails}
          tipEffectMap={singleStaffTip}
          externalBpm={30}
          externalPlaying={active && !reducedMotion ? playing : false}
          onExternalPlayingChange={(value) => (playing = value)}
          onStepChange={(step) => (liveStep = step)}
          onSeekRef={(seekRef) => (arcSeek = seekRef)}
          initialStep={joinStep}
          playbackAllowed={active}
          scrubbable
        />
      </div>
    </div>
    <div class="path-pane">
      <span class="path-label">Concave</span>
      <div class="stage">
        <InlineAnimationPlayer
          sequence={concaveSequence}
          sequenceLoadKey={concaveSequence.id}
          autoPlay={false}
          showControls={false}
          chrome="minimal"
          fill
          interactive={false}
          hoverHint="none"
          disableContextMenu
          beatIndicators={false}
          hideTkaGlyph
          leftPropType={PropType.STAFF}
          rightPropType={PropType.STAFF}
          visibilityManagerOverride={concaveScope.visibility}
          trailSettingsOverride={trails}
          tipEffectMap={singleStaffTip}
          externalStep={liveStep}
          externalPlaying={false}
          playbackAllowed={active}
        />
      </div>
    </div>
  </div>

  <div class="controls">
    <div class="transport">
      <PanelButton onclick={togglePlayback} disabled={reducedMotion}>
        {playing ? "Pause" : "Play slowly"}
      </PanelButton>
    </div>
    <div class="strip" aria-label="Highlighted join at step 2">
      <StepStrip
        sequence={arcSequence}
        includeStartPosition={false}
        currentStep={liveStep}
        bpm={30}
        density="compact"
        presentation="strip"
        loop
        leftPropType={PropType.STAFF}
        rightPropType={PropType.STAFF}
        onCellClick={seek}
      />
    </div>
  </div>
</section>

<style>
  .lesson,
  .comparison,
  .path-pane,
  .controls {
    display: grid;
    gap: var(--spacing-md, 16px);
    min-width: 0;
  }
  .lesson {
    container-type: inline-size;
  }
  .comparison {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .path-label {
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
  }
  .stage {
    aspect-ratio: 1;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-lg, 12px);
    background: var(--theme-panel-bg);
  }
  .transport {
    display: flex;
  }
  .strip {
    height: clamp(4.5rem, 12cqw, 6rem);
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-lg, 12px);
    background: var(--theme-panel-bg);
  }
  @container (max-width: 460px) {
    .comparison {
      grid-template-columns: 1fr;
    }
  }
</style>
