<script lang="ts">
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import InlineAnimationPlayer from "#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import {
    AnimationVisibilityStateManager,
    getAnimationVisibilityManager,
  } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { derivePropElementalType } from "#lib/shared/pictograph/shared/domain/utils/prop-elemental-type.js";
  import ChoreoCard from "#lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import PanelGroup from "#lib/shared/panels/PanelGroup.svelte";
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

  // The card sits under the animation and takes only the height its beats
  // need. Four beats go in one row while each can stay at 88px or more; any
  // narrower and they wrap to two rows of two instead of shrinking.
  const BEAT_MIN_PX = 88;
  const CARD_PAD_PX = 24;
  const CARD_HEADING_PX = 43;
  let cardWidth = $state(0);
  const beatCount = $derived(sequence.steps?.length ?? 0);
  const cardColumns = $derived(
    beatCount === 0 || beatCount > 4
      ? null
      : cardWidth >= beatCount * BEAT_MIN_PX + CARD_PAD_PX + 8
        ? beatCount
        : Math.ceil(beatCount / 2)
  );
  const cardRows = $derived(
    cardColumns ? Math.ceil(beatCount / cardColumns) : 1
  );
  // The animation is the biggest thing in the column, so the card's row may
  // take about a sixth of the column's height at most (never under 88px a
  // beat). Stacked on a phone the column has no box of its own and no cap.
  let columnHeight = $state(0);
  const cardCell = $derived.by(() => {
    if (!cardColumns) return null;
    const byWidth = (cardWidth - CARD_PAD_PX) / cardColumns;
    const byHeight =
      columnHeight > 0 ? columnHeight * 0.17 : Number.POSITIVE_INFINITY;
    return Math.floor(Math.max(BEAT_MIN_PX, Math.min(byWidth, byHeight)));
  });
  const cardHeight = $derived(
    cardCell && cardColumns
      ? CARD_HEADING_PX + CARD_PAD_PX + cardCell * cardRows
      : null
  );
</script>

<div class="learning-word-stage" bind:clientWidth={stageWidth}>
  {#snippet performancePane()}
    <section
      class="studio-pane video-pane"
      aria-label={tDynamic("learn_word_stage_performance_video")}
    >
      <header class="pane-heading">
        <i class="fa-solid fa-video" aria-hidden="true"></i>
        <span>{tDynamic("learn_word_stage_performance_video")}</span>
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
            aria-label={tDynamic("learn_word_stage_video_for", {
              word: sequence.word,
            })}
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
            <span>{tDynamic("learn_word_stage_video_coming")}</span>
          </div>
        {/if}
      </div>
    </section>
  {/snippet}

  {#snippet animationPane()}
    <section
      class="studio-pane animation-pane"
      aria-label={tDynamic("learn_word_stage_animation")}
    >
      <header class="pane-heading">
        <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
        <span>{tDynamic("learn_word_stage_animation")}</span>
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
    <section
      class="studio-pane card-pane"
      aria-label={tDynamic("learn_word_stage_choreo_card")}
      bind:clientWidth={cardWidth}
      style:height={cardHeight ? `${cardHeight}px` : undefined}
    >
      <header class="pane-heading">
        <i class="fa-regular fa-rectangle-list" aria-hidden="true"></i>
        <span>{tDynamic("learn_word_stage_choreo_card")}</span>
      </header>
      <div class="pane-body card-body">
        <div
          class="card-fit"
          style:width={cardCell && cardColumns
            ? `${cardCell * cardColumns}px`
            : undefined}
        >
        <ChoreoCard
          {sequence}
          showWord={false}
          showStepNumbers
          showDifficultyLevel={false}
          includeStartPlacement={false}
          columnCount={cardColumns}
          showNotes={false}
          showLoopGlyph={false}
          showQRCode={false}
          darkMode
          forceContain
          leftPropType={PropType.STAFF}
          rightPropType={PropType.STAFF}
        />
        </div>
      </div>
    </section>
  {/snippet}

  {#snippet stageColumn()}
    <div class="stage-column" bind:clientHeight={columnHeight}>
      {@render animationPane()}
      {@render cardPane()}
    </div>
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
          resizeLabel: tDynamic("learn_word_stage_resize_video_animation"),
        },
        {
          id: "stage",
          content: stageColumn,
          defaultSize: 2.17,
          minSize: 360,
        },
      ]}
    />
  </div>

  <section class="guide-notes" aria-labelledby="guide-notes-title">
    <header>
      <i class="fa-solid fa-book-open" aria-hidden="true"></i>
      <h2 id="guide-notes-title">{tDynamic("learn_word_stage_guide_notes")}</h2>
    </header>
    {#if content?.explanation}
      <div class="explanation-copy">
        {#each content.explanation.paragraphs as paragraph}
          <p>{paragraph}</p>
        {/each}
      </div>
    {:else}
      <p class="empty-copy">
        {tDynamic("learn_word_stage_explanation_coming")}
      </p>
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

  .stage-column {
    display: grid;
    grid-template-rows: minmax(14rem, 1fr) auto;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .stage-column .card-pane {
    border-top: 1px solid var(--theme-stroke);
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

  .card-fit {
    width: 100%;
    height: 100%;
    margin-inline: auto;
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
      grid-template-rows: minmax(34rem, 1fr);
      overflow-y: auto;
    }
  }

  /* One column: video, then the animation, then the card under it. The
     stage column steps aside so its two panes become rows of the body. */
  @container learning-word-stage (max-width: 760px) {
    .studio-body {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 13rem min(100cqw, 26rem) auto;
      grid-template-areas:
        "video"
        "animation"
        "card";
    }

    .stage-column {
      display: contents;
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

    .stage-column .card-pane {
      border-top: 0;
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
