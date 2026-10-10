<!--
  The working screen: footage on the left, what the body is doing on the right.

  The pictograph beside the editor is deliberate. It says what the props are
  required to do at this instant, which is the half the notation already knows -
  so the observer's attention goes entirely to the half it does not, which is
  what the arms and torso had to do to deliver it.
-->
<script lang="ts">
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import { formatTime } from "#lib/shared/sequence-viewer/utils/format-time.js";
  import {
    describeSignature,
    isDraftEmpty,
    nearestPhaseAnchor,
    readingCount,
  } from "../domain/movement-annotation";
  import { describeValue } from "../domain/anatomy-vocabulary";
  import { withSequenceJoinApplied } from "#lib/shared/grid-join/sequence-grid-join.js";
  import { getMovementMapContext } from "../context/movement-map-context";
  import AnatomyEditor from "./AnatomyEditor.svelte";
  import FrameTransport from "./FrameTransport.svelte";
  import CoveragePanel from "./CoveragePanel.svelte";

  const { state: movementMap } = getMovementMapContext();

  type RailTab = "describe" | "observations" | "coverage";
  let railTab = $state<RailTab>("describe");

  let videoEl = $state<HTMLVideoElement | undefined>();

  const displayWord = $derived(
    movementMap.sequence?.word ? simplifyRepeatedWord(movementMap.sequence.word) : ""
  );

  // The face is drawn on the grids the sequence is joined on (display-only).
  const faceStep = $derived(
    withSequenceJoinApplied(movementMap.sequence, movementMap.currentStep)
  );

  const stepCount = $derived(movementMap.sequence?.steps.length ?? 0);
  const canSave = $derived(!!movementMap.position && !isDraftEmpty(movementMap.draft));

  const railOptions = $derived([
    { value: "describe" as RailTab, label: "Describe" },
    {
      value: "observations" as RailTab,
      label: "Observations",
      shortLabel: "Recorded",
      count: movementMap.annotationsForCurrentStep.length || null,
    },
    { value: "coverage" as RailTab, label: "Coverage" },
  ]);

  // The transport writes times onto the state; the element follows. Without
  // this the frame buttons would move the readout while the footage sat still.
  $effect(() => {
    const element = videoEl;
    const target = movementMap.currentTime;
    if (!element) return;
    if (Math.abs(element.currentTime - target) > 0.002) {
      element.currentTime = target;
    }
  });

  $effect(() => {
    if (videoEl) videoEl.playbackRate = movementMap.playbackRate;
  });

  async function save(): Promise<void> {
    await movementMap.saveDraft();
  }
</script>

<div class="annotate">
  <header class="bar">
    <button
      type="button"
      class="ghost"
      onclick={() => movementMap.goToStage("timing")}
    >
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
      <span>Timing</span>
    </button>

    <div class="identity">
      {#if displayWord}
        <TKAWordGlyph word={displayWord} height={18} darkMode />
      {:else}
        <strong>{movementMap.sequence?.name ?? "Sequence"}</strong>
      {/if}
      <span class="clip">{movementMap.video?.label}</span>
    </div>

    {#if movementMap.position}
      {@const position = movementMap.position}
      <div class="readout" role="status">
        <span class="chunk">
          <span class="k">Move</span>
          <span class="v">{position.stepIndex + 1}/{stepCount}</span>
        </span>
        <span class="chunk">
          <span class="k">Phase</span>
          <span class="v">{nearestPhaseAnchor(position.phase)}</span>
        </span>
        <span class="chunk">
          <span class="k">Pass</span>
          <span class="v">{position.pass}</span>
        </span>
        <span class="chunk">
          <span class="k">Time</span>
          <span class="v">{formatTime(movementMap.currentTime)}</span>
        </span>
      </div>
    {:else}
      <p class="readout empty" role="status">
        Outside the mapped run &mdash; scrub into the sequence.
      </p>
    {/if}
  </header>

  <div class="workspace">
    <section class="stage" aria-label="Footage">
      <div class="video-frame">
        {#if movementMap.video}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            bind:this={videoEl}
            bind:currentTime={
              () => movementMap.currentTime, (value) => (movementMap.currentTime = value)
            }
            bind:paused={
              () => !movementMap.isPlaying, (value) => (movementMap.isPlaying = !value)
            }
            src={movementMap.video.url}
            playsinline
          ></video>
        {/if}
      </div>
      <FrameTransport />
    </section>

    <aside class="rail" aria-label="Describe this instant">
      <div class="rail-head">
        <div class="face">
          {#if faceStep}
            <PictographContainer
              pictographData={faceStep}
              disableTransitions={true}
            />
          {/if}
        </div>
        <div class="signatures">
          {#if movementMap.leftSignature}
            <p class="sig left">
              <span class="hand">Left</span>
              {describeSignature(movementMap.leftSignature)}
            </p>
          {/if}
          {#if movementMap.rightSignature}
            <p class="sig right">
              <span class="hand">Right</span>
              {describeSignature(movementMap.rightSignature)}
            </p>
          {/if}
        </div>
      </div>

      <SegmentedControl
        options={railOptions}
        value={railTab}
        onchange={(next: RailTab) => (railTab = next)}
        size="sm"
        density="tight"
        ariaLabel="Rail view"
      />

      <div class="rail-body">
        {#if railTab === "describe"}
          <AnatomyEditor />
          <div class="save-row">
            <button
              type="button"
              class="primary"
              disabled={!canSave}
              onclick={save}
            >
              <i class="fas fa-check" aria-hidden="true"></i>
              <span>
                {movementMap.selectedAnnotationId ? "Update" : "Record"} observation
              </span>
            </button>
            <button
              type="button"
              class="ghost"
              onclick={() => movementMap.resetDraft()}
              disabled={isDraftEmpty(movementMap.draft)}
            >
              Clear
            </button>
          </div>
        {:else if railTab === "observations"}
          {#if movementMap.annotationsForCurrentStep.length === 0}
            <p class="empty-note">
              Nothing recorded on this move yet in this clip.
            </p>
          {:else}
            <ul class="observations">
              {#each movementMap.annotationsForCurrentStep as annotation (annotation.id)}
                <li>
                  <div class="obs-head">
                    <span class="obs-phase">
                      {nearestPhaseAnchor(annotation.phase)}
                    </span>
                    <span class="obs-count">
                      {readingCount(annotation)} readings
                    </span>
                  </div>
                  {#each ["left", "right", "body"] as const as scope}
                    {@const reading = annotation[scope]}
                    {#if Object.keys(reading).length > 0}
                      <p class="obs-line">
                        <span class="obs-scope">{scope}</span>
                        {Object.entries(reading)
                          .map(([d, v]) => describeValue(d, v))
                          .join(", ")}
                      </p>
                    {/if}
                  {/each}
                  {#if annotation.notes}
                    <p class="obs-notes">{annotation.notes}</p>
                  {/if}
                  <div class="obs-actions">
                    <button
                      type="button"
                      class="ghost sm"
                      onclick={() => movementMap.editAnnotation(annotation)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      class="ghost sm danger"
                      onclick={() => movementMap.deleteAnnotation(annotation.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        {:else}
          <CoveragePanel />
        {/if}
      </div>
    </aside>
  </div>
</div>

<style>
  .annotate {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.6rem 0.9rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .identity {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .identity strong {
    font-size: var(--font-size-min, 0.875rem);
    color: var(--theme-text, #fff);
  }

  .clip {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.55));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 16ch;
  }

  .readout {
    display: flex;
    gap: 0.75rem;
    margin-left: auto;
    flex-wrap: wrap;
  }

  .readout.empty {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.55));
  }

  .chunk {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }

  .k {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.55));
  }

  .v {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 650;
    color: var(--theme-text, #fff);
    font-variant-numeric: tabular-nums;
    /* Widest phase name reserves the column so the row cannot jitter as the
       playhead moves through a move. */
    min-width: 5ch;
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(20rem, 25rem);
    gap: 0.9rem;
    padding: 0.9rem;
    flex: 1;
    min-height: 0;
    /* Past this the footage pane becomes a field of black around a clip that
       cannot get any bigger, and the transport drifts far from the video it
       drives. The band keeps the two together and centres the instrument. */
    max-width: 160rem;
    width: 100%;
    margin: 0 auto;
  }

  .stage {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
    min-width: 0;
  }

  .video-frame {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.75rem;
    overflow: hidden;
    background: #000;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  /* Fills the pane and letterboxes inside it. `max-width`/`max-height` alone
     only ever shrink a video, so portrait footage stayed at its natural size in
     the middle of a black field on a large display - which is exactly where
     this gets used. */
  .video-frame video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .rail {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-height: 0;
    padding: 0.75rem;
    border-radius: 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
  }

  .rail-head {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    flex-shrink: 0;
  }

  .face {
    width: 5.5rem;
    height: 5.5rem;
    flex-shrink: 0;
    border-radius: 0.5rem;
    overflow: hidden;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.25));
  }

  .signatures {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .sig {
    margin: 0;
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.35;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    word-break: break-word;
  }

  .hand {
    display: inline-block;
    font-weight: 700;
    margin-right: 0.3rem;
  }

  .sig.left .hand {
    color: var(--semantic-blue, #3b82f6);
  }

  .sig.right .hand {
    color: var(--semantic-red, #ef4444);
  }

  .rail-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .save-row {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    padding: 0 0.9rem;
    border-radius: 0.5rem;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, #fff);
    transition:
      background-color var(--transition-fast, 120ms) ease,
      border-color var(--transition-fast, 120ms) ease;
  }

  button:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-accent, #6366f1);
  }

  button:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* Capped so the save action reads as a button rather than stretching into
     something that looks like a progress bar on a wide rail. */
  button.primary {
    flex: 1;
    max-width: 22rem;
    background: var(--theme-accent, #6366f1);
    border-color: var(--theme-accent, #6366f1);
    color: #fff;
  }

  button.sm {
    min-height: 2.25rem;
    padding: 0 0.6rem;
    font-size: var(--font-size-compact, 0.75rem);
  }

  button.danger:hover:not(:disabled) {
    border-color: var(--semantic-red, #ef4444);
    color: var(--semantic-red, #ef4444);
  }

  .empty-note {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .observations {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    overflow-y: auto;
    min-height: 0;
  }

  .observations li {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.55rem;
    border-radius: 0.5rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
  }

  .obs-head {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .obs-phase {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    text-transform: capitalize;
    color: var(--theme-accent, #6366f1);
  }

  .obs-count {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.55));
    font-variant-numeric: tabular-nums;
  }

  .obs-line,
  .obs-notes {
    margin: 0;
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.4;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.75));
  }

  .obs-scope {
    font-weight: 700;
    text-transform: capitalize;
    margin-right: 0.3rem;
    color: var(--theme-text, #fff);
  }

  .obs-notes {
    font-style: italic;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .obs-actions {
    display: flex;
    gap: 0.35rem;
  }

  /* Below this the rail cannot hold a usable chip palette beside the footage,
     so the two stack and the page scrolls as one column. */
  @media (max-width: 56.25rem) {
    .workspace {
      grid-template-columns: minmax(0, 1fr);
      overflow-y: auto;
      /* Rows size to their content and stack from the top. Without this they
         share the workspace's fixed height, the footage column overflows its
         own row, and the rail paints straight over the transport. */
      align-content: start;
    }

    /* A definite height here is what gives the stacked column a real height to
       stack against; `flex: 1` inside a zero-min parent collapsed it. */
    .stage,
    .rail {
      min-height: auto;
    }

    .video-frame {
      flex: 0 0 auto;
      height: min(45vh, 22rem);
      min-height: 12rem;
    }

    .rail-body {
      overflow: visible;
    }
  }

  /* A wide, short window (a folded phone in landscape) keeps the two columns,
     but the rail's fixed furniture - pictograph, two tab rows, save button -
     eats the whole height and leaves the chip palette a few pixels tall, which
     means nothing can actually be recorded. The rail becomes one scrolling
     column instead, with the save action pinned to the bottom of it so it stays
     reachable without scrolling past every dimension. */
  @media (max-height: 34rem) {
    .rail {
      overflow-y: auto;
    }

    .rail-body,
    .dimensions {
      overflow: visible;
    }

    .face {
      width: 3.5rem;
      height: 3.5rem;
    }

    /* Above the palette rather than pinned over it. A pinned bar would need an
       opaque background to sit on top of the chips, and the theme's panel
       colour is translucent - the chips read straight through it. */
    .save-row {
      order: -1;
    }

    .video-frame {
      max-height: 40vh;
    }
  }

  @media (min-width: 105rem) {
    .workspace {
      grid-template-columns: minmax(0, 1fr) minmax(26rem, 32rem);
      gap: 1.25rem;
      padding: 1.25rem;
    }
  }

  @media (min-width: 162.5rem) {
    .workspace {
      grid-template-columns: minmax(0, 1fr) minmax(32rem, 40rem);
      gap: 1.75rem;
      padding: 1.75rem;
    }

    .face {
      width: 7rem;
      height: 7rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
