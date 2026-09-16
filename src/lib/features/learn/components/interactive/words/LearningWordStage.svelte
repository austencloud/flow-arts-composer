<script lang="ts">
  import InlineAnimationPlayer from "$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import {
    AnimationVisibilityStateManager,
    getAnimationVisibilityManager,
  } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { derivePropElementalType } from "$lib/shared/shape-matrix/domain/prop-relationship";
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import PanelGroup from "$lib/shared/panels/PanelGroup.svelte";
  import type { LearningLetterTeachingContent } from "./learning-letter-teaching-content";

  let {
    sequence,
    content,
  }: {
    sequence: SequenceData;
    content: LearningLetterTeachingContent | null;
  } = $props();

  const sharedVisibility = getAnimationVisibilityManager();
  const lessonVisibility = new AnimationVisibilityStateManager({
    ephemeral: true,
  });
  lessonVisibility.replaceAll({
    ...sharedVisibility.snapshot(),
    elementalGlyph: true,
    tkaGlyph: false,
    wordHeader: false,
  });
  lessonVisibility.setMotionPolicySource(sharedVisibility);
  const propElementalType = $derived(derivePropElementalType(sequence));
  let stageWidth = $state(
    typeof window === "undefined" ? 900 : window.innerWidth
  );
</script>

<div class="learning-word-stage" bind:clientWidth={stageWidth}>
  {#snippet performancePane()}
    <section class="studio-pane video-pane" aria-label="Performance video">
      <header class="pane-heading">
        <i class="fa-solid fa-video" aria-hidden="true"></i>
        <span>Performance video</span>
      </header>
      <div class="pane-body video-body">
        {#if content?.video}
          <video
            src={content.video.src}
            poster={content.video.poster}
            autoplay
            loop
            muted
            playsinline
            preload="metadata"
            aria-label={`Performance video for ${sequence.word}`}
          >
            {#if content.video.captionsSrc}
              <track
                kind="captions"
                src={content.video.captionsSrc}
                srclang="en"
                label="English"
                default
              />
            {/if}
          </video>
        {:else}
          <div class="empty-state" role="status">
            <span class="empty-icon" aria-hidden="true">
              <i class="fa-solid fa-circle-play"></i>
            </span>
            <span>Video coming soon</span>
          </div>
        {/if}
      </div>
    </section>
  {/snippet}

  {#snippet animationPane()}
    <section class="studio-pane animation-pane" aria-label="Animation">
      <header class="pane-heading">
        <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
        <span>Animation</span>
      </header>
      <div class="pane-body animation-body">
        <InlineAnimationPlayer
          {sequence}
          autoPlay
          chrome="minimal"
          fill
          showWordHeader={false}
          showPlacementGlyph
          scrubbable
          beatIndicators={false}
          hideTkaGlyph
          leftPropType="staff"
          rightPropType="staff"
          visibilityManagerOverride={lessonVisibility}
          {propElementalType}
          hoverHint="badge"
          glyphFrame="stage"
          backgroundAlpha={0}
        />
      </div>
    </section>
  {/snippet}

  {#snippet cardPane()}
    <section class="studio-pane card-pane" aria-label="Choreo card">
      <header class="pane-heading">
        <i class="fa-regular fa-rectangle-list" aria-hidden="true"></i>
        <span>Choreo card</span>
      </header>
      <div class="pane-body card-body">
        <ChoreoCard
          {sequence}
          showWord={false}
          showStepNumbers
          showDifficultyLevel={false}
          includeStartPlacement
          showNotes={false}
          showLoopGlyph={false}
          showQRCode={false}
          darkMode
          forceContain
          leftPropType={PropType.STAFF}
          rightPropType={PropType.STAFF}
        />
      </div>
    </section>
  {/snippet}

  <div class="studio-body">
    <PanelGroup
      direction="horizontal"
      flattened={stageWidth < 900}
      gap={6}
      panels={[
        {
          id: "performance",
          content: performancePane,
          defaultSize: 1,
          minSize: 280,
          resizeLabel: "Resize performance video and animation",
        },
        {
          id: "animation",
          content: animationPane,
          defaultSize: 1.35,
          minSize: 360,
          resizeLabel: "Resize animation and choreo card",
        },
        {
          id: "card",
          content: cardPane,
          defaultSize: 0.82,
          minSize: 260,
          resizable: false,
        },
      ]}
    />
  </div>

  <section class="guide-notes" aria-labelledby="guide-notes-title">
    <header>
      <i class="fa-solid fa-book-open" aria-hidden="true"></i>
      <h2 id="guide-notes-title">Guide notes</h2>
    </header>
    {#if content?.explanation}
      <div class="explanation-copy">
        {#each content.explanation.paragraphs as paragraph}
          <p>{paragraph}</p>
        {/each}
      </div>
    {:else}
      <p class="empty-copy">Explanation coming soon</p>
    {/if}
  </section>
</div>

<style>
  .learning-word-stage {
    container: learning-word-stage / inline-size;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: transparent;
  }

  .studio-body {
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .studio-body :global(.panel-group) {
    height: 100%;
  }

  .studio-pane {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: color-mix(in srgb, var(--theme-card-bg) 52%, transparent);
  }

  .pane-heading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.65rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--theme-stroke);
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 650;
  }

  .pane-heading i {
    color: var(--theme-accent);
  }

  .pane-body {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .video-body {
    display: grid;
    place-items: center;
    padding: clamp(0.75rem, 1.25cqw, 1.25rem);
  }

  .video-body video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: var(--radius-sm, 0.35rem);
    background: #000;
  }

  .animation-body {
    background: color-mix(in srgb, var(--theme-panel-bg) 78%, transparent);
  }

  .card-body {
    padding: clamp(0.55rem, 0.9cqw, 1rem);
    background: color-mix(in srgb, var(--theme-panel-bg) 82%, transparent);
  }

  .empty-state {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 0.75rem;
    width: min(100%, 22rem);
    padding: 1.25rem;
    color: var(--theme-text-dim);
    text-align: center;
  }

  .empty-icon {
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
    color: var(--theme-accent);
    font-size: 1.2rem;
  }

  .guide-notes {
    display: grid;
    grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr);
    align-items: center;
    gap: 1rem;
    min-height: 6.75rem;
    padding: clamp(0.8rem, 1.1cqw, 1.1rem);
    border-top: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-card-bg) 74%, transparent);
  }

  .guide-notes header {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    color: var(--theme-text);
  }

  .guide-notes header i {
    color: var(--theme-accent);
  }

  .guide-notes h2,
  .guide-notes p {
    margin: 0;
  }

  .guide-notes h2 {
    font-size: var(--font-size-base, 1rem);
  }

  .empty-copy,
  .explanation-copy {
    color: var(--theme-text-dim);
    line-height: 1.55;
  }

  .explanation-copy {
    display: grid;
    gap: 0.5rem;
  }

  @container learning-word-stage (max-width: 899px) {
    .studio-body {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(19rem, 1fr));
      grid-template-areas:
        "video animation"
        "card animation";
      overflow-y: auto;
    }

    .video-pane {
      grid-area: video;
    }

    .animation-pane {
      grid-area: animation;
    }

    .card-pane {
      grid-area: card;
    }
  }

  @container learning-word-stage (max-width: 760px) {
    .studio-body {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 10.5rem 24rem 31rem;
      grid-template-areas:
        "video"
        "animation"
        "card";
    }

    .video-pane {
      min-height: 15rem;
    }

    .animation-pane {
      min-height: 24rem;
    }

    .card-pane {
      min-height: 31rem;
    }

    .empty-state {
      gap: 0.45rem;
      padding: 0.5rem;
    }

    .empty-icon {
      width: 2.5rem;
      height: 2.5rem;
    }

    .guide-notes {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.55rem;
    }
  }

  @media (max-height: 620px) and (min-width: 761px) {
    .studio-body {
      overflow-y: auto;
    }

    .studio-body :global(.panel-group) {
      min-height: 14rem;
    }

    .guide-notes {
      min-height: 5rem;
    }
  }

  @container learning-word-stage (min-width: 1680px) {
    .studio-body {
      min-height: 0;
    }
  }

  @container learning-word-stage (min-width: 2600px) {
    .studio-body {
      min-height: 0;
    }

    .pane-heading {
      min-height: 3.5rem;
      padding-inline: 1rem;
      font-size: 1.1rem;
    }

    .guide-notes {
      grid-template-columns: minmax(10rem, 16rem) minmax(0, 1fr);
      min-height: 8rem;
      font-size: 1.1rem;
    }

    .guide-notes h2 {
      font-size: 1.2rem;
    }

    .empty-state {
      font-size: 1.1rem;
    }

    .empty-icon {
      width: 4rem;
      height: 4rem;
      font-size: 1.5rem;
    }
  }
</style>
