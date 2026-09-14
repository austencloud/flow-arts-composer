<!--
  StepMapEditor.svelte

  Maps a performance video's timing to a sequence, by tapping the pictograph.

  The button's face is the move happening right now. You watch the performer,
  you see that shape land, you hit the button. Every tap is the same action -
  "the props arrived at that" - which is why the screen needs no instructions:
  it is visual matching, not counting. Slow motion is what makes the match
  findable, so marking runs at 0.5x by default.

  Marking every arrival yields one more instant than there are moves: the
  opening pose, then the landing of each move. A move's arrival IS the next
  move's launch, so those marks map straight onto beatTimestamps (which has
  always meant "when move i+1 starts") plus a final endTimestamp.

  A take almost never holds the sequence exactly once. A LOOP closes back onto
  its own opening pose, which is the whole reason a performer runs it four or
  five times in a row on camera - so the run does not stop at the last move, it
  wraps to move one and keeps going for as long as there is footage. The marks
  stay one flat increasing list: index i is step `i % moveCount`, and its pass
  is `floor((i - 1) / moveCount) + 1`. See
  docs/superpowers/specs/2026-08-16-step-map-editor-redesign-design.md.
-->
<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";
  import { generateEvenBeatTimestamps } from "$lib/shared/video-collaboration/utils/step-map-utils";
  import { formatTime } from "$lib/shared/sequence-viewer/utils/format-time";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { StartPositionData } from "$lib/shared/foundation/domain/models/start-position-data";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import StepMapTimeline from "./StepMapTimeline.svelte";
  import { mirrorBeat } from "$lib/shared/create/services/step-transforms";
  import { mirrorStartPosition } from "$lib/shared/create/services/start-position-transforms";
  import { motionQueryHandler } from "$lib/shared/pictograph/shared/services/motion-query-handler";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

  interface Props {
    videoUrl: string;
    videoDuration: number;
    /** Every move, in order. Its length is the move count. */
    steps: readonly StepData[];
    /** The opening pose. The first mark is the performer settling into it. */
    startPosition?: StartPositionData | null;
    initialStepMap?: StepMap;
    bpm: number;
    onSave: (beatMap: StepMap) => Promise<void>;
    onClose: () => void;
  }

  let {
    videoUrl,
    videoDuration,
    steps,
    startPosition = null,
    initialStepMap,
    bpm,
    onSave,
    onClose,
  }: Props = $props();

  /** Nudging moves a mark by one frame of typical phone footage. */
  const FRAME = 1 / 30;
  /** Slow enough to see a landing, fast enough not to feel like a chore. */
  const MARKING_RATE = 0.5;
  /** One move's worth of footage, give or take: enough to re-watch a landing. */
  const SKIP_SECONDS = 3;

  /**
   * More of the clip than this left over after a pass ends, measured against
   * how long that pass took, and the performer is almost certainly going round
   * again. Below it, what remains is a bow or a fade rather than a repeat.
   */
  const ANOTHER_PASS_THRESHOLD = 0.6;

  const moveCount = $derived(steps.length);

  /**
   * How many times through the sequence this run is currently sized for. It
   * grows on its own as the marking reaches the end of a pass with footage
   * still to go, so nobody has to count the repeats before starting.
   */
  let passes = $state(
    untrack(() => passesFromStepMap(initialStepMap, steps.length))
  );

  const totalMarks = $derived(moveCount * passes + 1);

  let videoEl: HTMLVideoElement | undefined = $state();
  let isPlaying = $state(false);
  let currentTime = $state(0);
  /**
   * Marking opens slowed down, because the landing is what you are looking for.
   * Re-timing an existing map opens on the timeline, where full speed is what
   * you want to check the result against.
   */
  let rate = $state(untrack(() => initialStepMap) ? 1 : MARKING_RATE);

  /**
   * One timestamp per arrival, in tap order. Shorter than totalMarks while a
   * run is in progress.
   */
  let marks = $state<number[]>(
    untrack(() => marksFromStepMap(initialStepMap, videoDuration))
  );

  /**
   * Marking is the screen when there is no timing yet; an existing map opens on
   * the timeline with its marks intact.
   */
  let mode = $state<"mark" | "review">(
    untrack(() => initialStepMap) ? "review" : "mark"
  );

  let selectedMark = $state(0);
  let isSaving = $state(false);
  let saveError = $state<string | null>(null);
  let flashing = $state(false);
  let flashTimeout: ReturnType<typeof setTimeout> | undefined;

  const complete = $derived(marks.length >= totalMarks);
  /**
   * Times through the sequence that are fully marked. One is enough to save:
   * a run stopped part-way through a later pass still maps every step it
   * covers, and the clip simply stops being mapped where the taps stopped.
   */
  const fullPasses = $derived(
    moveCount > 0 ? Math.floor(Math.max(0, marks.length - 1) / moveCount) : 0
  );
  const canSave = $derived(!isSaving && fullPasses >= 1);

  /**
   * How far into the run the playhead sits: how many marks it is at or past.
   * Deriving the run's position from the playhead rather than from a counter is
   * what makes rewinding safe - scrub back and the face, the count and the
   * timeline all return to that moment, while every mark stays exactly where it
   * was. Only a tap commits the re-take.
   */
  const placed = $derived(
    marks.filter((mark) => mark <= currentTime + FRAME).length
  );
  /** Marks the next tap would replace. Zero unless the playhead was rewound. */
  const supersededCount = $derived(Math.max(0, marks.length - placed));
  /** The mark the next tap will place - and so the move to watch for. */
  const pendingIndex = $derived(Math.min(placed, totalMarks - 1));

  /**
   * Which move a mark belongs to, 1-based, wrapping every pass. Mark 0 is the
   * opening pose and has no move; the arrival of the last move is immediately
   * the pass boundary, and the mark after it is move one again.
   */
  function moveNumberFor(index: number): number {
    if (index <= 0 || moveCount <= 0) return 0;
    return ((index - 1) % moveCount) + 1;
  }

  /** Which time through the sequence a mark belongs to, 1-based. */
  function passFor(index: number): number {
    if (index <= 0 || moveCount <= 0) return 1;
    return Math.floor((index - 1) / moveCount) + 1;
  }

  /**
   * Mark 0 is the opening pose. Mark i is the landing of its move, so the face
   * shows the move that is happening right now, and you tap when it finishes.
   */
  function faceFor(index: number): StepData | StartPositionData | null {
    const showMirrored = mirrored && mirroredSteps !== null;
    const source = showMirrored ? mirroredSteps! : steps;
    if (index <= 0) return showMirrored ? mirroredStart : startPosition;
    return source[moveNumberFor(index) - 1] ?? null;
  }

  function letterFor(index: number): string {
    if (index <= 0) return "";
    return steps[moveNumberFor(index) - 1]?.letter?.trim() ?? "";
  }

  /** Mark 0 is the opening pose, not move 0, so it is not a number. */
  const markLabels = $derived(
    Array.from({ length: totalMarks }, (_, index) =>
      index === 0 ? "start" : String(moveNumberFor(index))
    )
  );

  /**
   * The marks that open a repeat. The timeline draws these as a heavier tick,
   * which is what turns a wall of sixty-five identical ticks into four legible
   * passes. Pass one opens at the start mark, so it is not one of these.
   */
  const passStartIndices = $derived(
    Array.from({ length: Math.max(0, passes - 1) }, (_, i) => moveCount * (i + 1) + 1)
  );

  const pendingFace = $derived(faceFor(pendingIndex));
  const selectedFace = $derived(faceFor(selectedMark));

  function marksFromStepMap(
    map: StepMap | undefined,
    duration: number
  ): number[] {
    if (!map) return [];
    // The final arrival was added later, so a map saved before then ends at the
    // clip rather than at a marked instant.
    return [...map.beatTimestamps, map.endTimestamp ?? duration];
  }

  /** Re-open an existing map on however many passes it was marked with. */
  function passesFromStepMap(map: StepMap | undefined, moves: number): number {
    if (!map || moves <= 0) return 1;
    return Math.max(1, Math.ceil(map.beatTimestamps.length / moves));
  }


  function applyRate(next: number): void {
    rate = next;
    if (videoEl) videoEl.playbackRate = next;
  }

  /**
   * The footage's own aspect, which sizes the stage column on wide panels.
   * 16:9 until the file says otherwise; most performance clips are portrait
   * and would otherwise be a strip in a wide black box.
   */
  let videoRatio = $state(16 / 9);

  function handleLoadedMetadata(): void {
    if (!videoEl) return;
    videoEl.playbackRate = rate;
    if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
      videoRatio = videoEl.videoWidth / videoEl.videoHeight;
    }
  }

  function togglePlayPause(): void {
    if (!videoEl) return;
    if (isPlaying) {
      videoEl.pause();
      return;
    }
    void videoEl.play().catch(() => {
      saveError = "Playback could not start. Try the play button again.";
    });
  }

  function seekTo(time: number): void {
    const clamped = Math.max(0, Math.min(time, videoDuration));
    // Move the readout now rather than waiting for the video to decode.
    currentTime = clamped;
    if (videoEl) videoEl.currentTime = clamped;
  }

  /** Jump by a few seconds, for when the landing went past before the tap. */
  function skip(seconds: number): void {
    seekTo((videoEl?.currentTime ?? currentTime) + seconds);
  }


  /**
   * A performer works in their own frame; the camera sees it reflected, so a
   * hand that goes west in the notation appears to go east in the footage.
   * Mirroring flips the pictographs across the vertical axis so they read the
   * way the clip does.
   *
   * The video is deliberately NOT the thing that flips - footage often carries
   * titles or a watermark, and mirroring those wrecks them.
   *
   * This is a view, not an edit: `marks` and everything handed to onSave are
   * untouched. Letters are invariant under mirroring (proven across every row
   * of both dataframes), so the glyphs stay correct as the geometry flips.
   */
  let mirrored = $state(false);
  let mirroredSteps = $state<StepData[] | null>(null);
  let mirroredStart = $state<StartPositionData | null>(null);

  async function toggleMirror(): Promise<void> {
    mirrored = !mirrored;
    if (!mirrored || mirroredSteps) return;

    mirroredSteps = await Promise.all(
      steps.map((step) =>
        mirrorBeat(
          step,
          step.motions[HandSide.LEFT]?.gridMode ?? GridMode.DIAMOND,
          motionQueryHandler
        )
      )
    );
    mirroredStart = startPosition ? mirrorStartPosition(startPosition) : null;
  }


  function startMarking(): void {
    mode = "mark";
    marks = [];
    passes = 1;
    saveError = null;
    applyRate(MARKING_RATE);
    seekTo(0);
    if (videoEl) {
      void videoEl.play().catch(() => {
        saveError = "Playback could not start. Try the play button again.";
      });
    }
  }

  function markArrival(): void {
    if (mode !== "mark") return;

    // Straight off the element, not the `currentTime` state: timeupdate fires
    // about four times a second, so the state can be a quarter second stale at
    // the instant of the tap - which is most of a move at 0.5x.
    const at = videoEl?.currentTime ?? currentTime;

    // A tap claims this instant and everything after it. Rewinding and tapping
    // again therefore picks the run back up at that point instead of being
    // swallowed by the ordering rule, and a double-fire overwrites rather than
    // duplicating. Either way the marks stay strictly increasing, which is what
    // every consumer of beatTimestamps assumes.
    const kept = marks.filter((mark) => mark < at - FRAME);
    if (kept.length >= totalMarks) return;

    marks = [...kept, at];
    // Keeps the face in step with the tap rather than with the next timeupdate.
    currentTime = at;

    flashing = true;
    if (flashTimeout) clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => (flashing = false), 260);

    if (marks.length >= totalMarks) {
      // The pass just closed. If the take clearly has another one in it, wrap
      // to move one and carry on rather than stopping and asking - the
      // performer is already dancing it, and interrupting to answer "how many
      // times?" is exactly the friction this screen exists to avoid.
      if (roomForAnotherPass(at)) passes += 1;
      else finishMarking();
    }
  }

  /** How long one time through the sequence took, from the marks so far. */
  function passDuration(): number {
    const first = marks[0];
    const last = marks[marks.length - 1];
    if (first === undefined || last === undefined || passes <= 0) return 0;
    return (last - first) / passes;
  }

  function roomForAnotherPass(from: number): boolean {
    const period = passDuration();
    if (period <= 0) return false;
    return videoDuration - from > period * ANOTHER_PASS_THRESHOLD;
  }

  /** End the run wherever it got to, and hand it over to the timeline. */
  function finishMarking(): void {
    videoEl?.pause();
    applyRate(1);
    // Drop the passes that were opened for footage nobody ended up marking, so
    // the counter and the timeline describe the run that actually happened.
    passes = Math.max(1, Math.ceil(Math.max(0, marks.length - 1) / moveCount));
    selectedMark = Math.max(0, marks.length - 1);
    mode = "review";
  }

  /** The clip ran out, so the run is over whatever the pass count said. */
  function handleVideoEnded(): void {
    isPlaying = false;
    if (mode === "mark" && fullPasses >= 1) finishMarking();
  }

  function undoMark(): void {
    if (marks.length === 0) return;
    const undone = marks[marks.length - 1];
    marks = marks.slice(0, -1);

    if (mode === "review") {
      selectedMark = Math.min(selectedMark, marks.length - 1);
      return;
    }
    // Put the playhead back where the rejected mark was, so that moment can be
    // watched again instead of hunted for.
    if (undone !== undefined) seekTo(undone - FRAME);
  }

  function useEvenSpacing(): void {
    // Fill the whole clip, not one pass stretched across it. The BPM says how
    // long a pass should take, so it also says roughly how many of them the
    // footage holds - and a grid that covers the take is a far better thing to
    // drag into place than sixteen marks spread over four repeats.
    const passSeconds = bpm > 0 ? (moveCount * 60) / bpm : 0;
    passes =
      passSeconds > 0
        ? Math.max(1, Math.round(videoDuration / passSeconds))
        : passes;
    marks = generateEvenBeatTimestamps(videoDuration, moveCount * passes + 1, bpm);
    selectedMark = 0;
    mode = "review";
    applyRate(1);
    videoEl?.pause();
    seekTo(marks[0] ?? 0);
  }


  function selectMark(index: number): void {
    selectedMark = Math.max(0, Math.min(index, marks.length - 1));
    const at = marks[selectedMark];
    if (at !== undefined) seekTo(at);
  }

  /** Marks cannot cross their neighbours; every consumer reads them in order. */
  function clampMark(index: number, time: number): number {
    const gap = 0.03;
    const min = index > 0 ? (marks[index - 1] ?? 0) + gap : 0;
    const max =
      index < marks.length - 1 ? (marks[index + 1] ?? videoDuration) - gap : videoDuration;
    return Math.max(0, Math.min(Math.max(min, Math.min(max, time)), videoDuration));
  }

  function moveMark(index: number, time: number): void {
    const next = [...marks];
    next[index] = clampMark(index, time);
    marks = next;
  }

  function nudgeSelected(frames: number): void {
    const at = marks[selectedMark];
    if (at === undefined) return;
    moveMark(selectedMark, at + frames * FRAME);
    const moved = marks[selectedMark];
    if (moved !== undefined) seekTo(moved);
  }


  function handleKeyboard(event: KeyboardEvent): void {
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoMark();
      return;
    }

    // Space is play/pause, the way it is on every other video surface. It used
    // to place a mark, which put the two most-used keys of the run on the same
    // one: rewinding to re-watch a landing is part of marking now, so transport
    // gets reached for throughout the run rather than once at the start, and a
    // Space pressed meaning "pause" would have dropped a mark instead.
    // Space plays from anywhere on this screen, including straight after a
    // speed chip or any other button was clicked. Letting a focused button keep
    // Space meant picking 0.5x left the key dead, which is exactly when it gets
    // reached for. Every button here has a click and a shortcut; none of them
    // needs Space as well.
    if (event.code === "Space") {
      event.preventDefault();
      togglePlayPause();
      return;
    }

    if (mode === "mark") {
      if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        markArrival();
      }
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      nudgeSelected(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      selectMark(selectedMark + (event.key === "ArrowUp" ? -1 : 1));
    }
  }


  async function handleSave(): Promise<void> {
    isSaving = true;
    saveError = null;

    const ordered = [...marks].sort((a, b) => a - b);
    if (ordered.length < moveCount + 1) {
      saveError = `Mark the sequence through at least once - ${moveCount + 1} moments - before saving.`;
      isSaving = false;
      return;
    }

    try {
      // Everything but the last mark is a step launching; the last one is the
      // arrival that closes the run. That holds for one pass or for five.
      await onSave({
        beatTimestamps: ordered.slice(0, -1),
        endTimestamp: ordered[ordered.length - 1],
        stepCount: moveCount,
        source: "manual",
        updatedAt: new Date(),
      });
    } catch (cause) {
      saveError =
        cause instanceof Error ? cause.message : "Failed to save the timing";
    } finally {
      isSaving = false;
    }
  }

  onDestroy(() => {
    if (flashTimeout) clearTimeout(flashTimeout);
  });
</script>

<svelte:window onkeydown={handleKeyboard} />

{#snippet mirrorToggle()}
  <button
    type="button"
    class="aux-btn mirror-btn"
    class:on={mirrored}
    aria-pressed={mirrored}
    onclick={toggleMirror}
  >
    <i class="fas fa-arrows-left-right" aria-hidden="true"></i>
    Mirror
  </button>
{/snippet}

<!-- The shell exists to be queried. A container query resolves against an
     ANCESTOR container, so rules that recompose .editor itself cannot live
     behind its own container-type - they silently never applied. -->
<div class="step-map-shell" style="--video-ratio: {videoRatio}">
  <div class="editor">
    <div class="stage">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        bind:this={videoEl}
        src={videoUrl}
        playsinline
        onloadedmetadata={handleLoadedMetadata}
        ontimeupdate={() => videoEl && (currentTime = videoEl.currentTime)}
        onplay={() => (isPlaying = true)}
        onpause={() => (isPlaying = false)}
        onended={handleVideoEnded}
      ></video>

      <div class="stage-bar">
        <button
          type="button"
          class="stage-skip"
          onclick={() => skip(-SKIP_SECONDS)}
          aria-label="Back {SKIP_SECONDS} seconds"
        >
          <i class="fas fa-rotate-left" aria-hidden="true"></i>
          <span class="skip-label">{SKIP_SECONDS}s</span>
        </button>
        <button
          type="button"
          class="stage-play"
          onclick={togglePlayPause}
          aria-label={isPlaying ? "Pause" : "Play"}
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        >
          <i class="fas {isPlaying ? 'fa-pause' : 'fa-play'}" aria-hidden="true"
          ></i>
        </button>
        <button
          type="button"
          class="stage-skip"
          onclick={() => skip(SKIP_SECONDS)}
          aria-label="Forward {SKIP_SECONDS} seconds"
        >
          <i class="fas fa-rotate-right" aria-hidden="true"></i>
          <span class="skip-label">{SKIP_SECONDS}s</span>
        </button>
        <span class="stage-time">
          {formatTime(currentTime)} / {formatTime(videoDuration)}
        </span>
      </div>
    </div>

    <!-- Present while marking too, so overshooting a landing is a scrub back
         rather than a start-over. The marks show as ticks there: a 44px drag
         handle on each one would swallow the pointer-downs used to reach them. -->
    <div class="timeline-row">
      <StepMapTimeline
        duration={videoDuration}
        {currentTime}
        beatTimestamps={marks}
        activeStepIndex={mode === "review" ? selectedMark : placed - 1}
        markerLabels={markLabels}
        {passStartIndices}
        readOnlyMarks={mode === "mark"}
        provisionalFrom={mode === "mark" ? placed : Number.POSITIVE_INFINITY}
        onTimestampChange={moveMark}
        onSelect={mode === "review" ? selectMark : undefined}
        onSeek={seekTo}
      />
    </div>

    {#if mode === "mark"}
      <div class="control-bar mark-bar">
        <div class="rate-row">
          <!-- Wrapped because SegmentedControl sets width:100%, which resolves
               flex-basis:auto and stretches three short labels across the row. -->
          <span class="rate-control">
            <SegmentedControl
              options={[
                { value: 0.25, label: "0.25x", ariaLabel: "Quarter speed" },
                { value: 0.5, label: "0.5x", ariaLabel: "Half speed" },
                { value: 1, label: "1x", ariaLabel: "Full speed" },
              ]}
              value={rate}
              onchange={applyRate}
              size="sm"
              ariaLabel="Playback speed"
            />
          </span>
          {@render mirrorToggle()}
        </div>

        <button
          type="button"
          class="tap-target"
          class:flash={flashing}
          title="Mark this move (T)"
          onclick={markArrival}
          disabled={placed >= totalMarks}
        >
          <span class="tap-face">
            <span class="face-square">
              {#if pendingFace}
                <PictographContainer
                  pictographData={pendingFace}
                  disableTransitions={true}
                />
              {/if}
            </span>
          </span>
          <span class="tap-copy">
            <strong>
              {pendingIndex === 0
                ? "Tap when they set into this pose"
                : "Tap when this move lands"}
            </strong>
            <span class="tap-progress">
              {#if pendingIndex === 0}
                mark 1 of {totalMarks}
              {:else}
                move {moveNumberFor(pendingIndex)} of {moveCount}
                {#if passes > 1}
                  · pass {passFor(pendingIndex)}
                {/if}
              {/if}
              {#if letterFor(pendingIndex)}
                <span class="tap-letter">
                  <TKAWordGlyph
                    word={letterFor(pendingIndex)}
                    height={18}
                    darkMode
                  />
                </span>
              {/if}
            </span>
            <!-- Two lines are always reserved: this swaps to a longer sentence
                 the moment the playhead is rewound, and growing here would
                 shove every control under it. -->
            <span class="tap-key">
              {#if supersededCount > 0}
                Tapping re-takes from here, replacing the
                {supersededCount}
                {supersededCount === 1 ? "mark" : "marks"} after it
              {:else}
                <span class="kbd-hint">T marks it · Space plays</span>
              {/if}
            </span>
          </span>
        </button>

        <div class="aux-row">
          <!-- The run keeps wrapping for as long as there is footage, so this
               is how it ends: the moment one full pass exists, stopping is a
               button rather than a thing that happens to you. -->
          {#if fullPasses >= 1}
            <button type="button" class="aux-btn done-btn" onclick={finishMarking}>
              <i class="fas fa-check" aria-hidden="true"></i>
              Done marking
            </button>
          {/if}
          <button
            type="button"
            class="aux-btn"
            onclick={undoMark}
            disabled={marks.length === 0}
          >
            <i class="fas fa-rotate-left" aria-hidden="true"></i>
            Undo last
          </button>
          <button type="button" class="aux-btn" onclick={startMarking}>
            <i class="fas fa-backward-fast" aria-hidden="true"></i>
            Start over
          </button>
          <button type="button" class="aux-btn" onclick={useEvenSpacing}>
            <i class="fas fa-ruler-horizontal" aria-hidden="true"></i>
            Start from even spacing
          </button>
        </div>
      </div>
    {:else}
      <div class="control-bar review-bar">
        <div class="selected-row">
          <span class="selected-face">
            <span class="face-square">
              {#if selectedFace}
                <PictographContainer
                  pictographData={selectedFace}
                  disableTransitions={true}
                />
              {/if}
            </span>
          </span>
          <span class="selected-copy">
            <span class="selected-label">
              {selectedMark === 0
                ? "Opening pose"
                : passes > 1
                  ? `Move ${moveNumberFor(selectedMark)} · pass ${passFor(selectedMark)}`
                  : `Move ${moveNumberFor(selectedMark)}`}
              {#if letterFor(selectedMark)}
                <span class="selected-letter">
                  <TKAWordGlyph
                    word={letterFor(selectedMark)}
                    height={16}
                    darkMode
                  />
                </span>
              {/if}
            </span>
            <span class="selected-time">
              lands at {formatTime(marks[selectedMark] ?? 0)}
            </span>
          </span>
          <span class="nudge">
            <button
              type="button"
              class="aux-btn"
              onclick={() => nudgeSelected(-1)}
              aria-label="Move this mark one frame earlier"
            >
              <i class="fas fa-angle-left" aria-hidden="true"></i>
              a frame earlier
            </button>
            <button
              type="button"
              class="aux-btn"
              onclick={() => nudgeSelected(1)}
              aria-label="Move this mark one frame later"
            >
              a frame later
              <i class="fas fa-angle-right" aria-hidden="true"></i>
            </button>
          </span>
        </div>

        <div class="aux-row">
          <button type="button" class="aux-btn" onclick={startMarking}>
            <i class="fas fa-hand-pointer" aria-hidden="true"></i>
            Mark it again
          </button>
          <button type="button" class="aux-btn" onclick={useEvenSpacing}>
            <i class="fas fa-ruler-horizontal" aria-hidden="true"></i>
            Even spacing
          </button>
          {@render mirrorToggle()}
          <span class="review-progress" class:complete>
            {marks.length} of {totalMarks} marked
            {#if passes > 1}
              · {passes} passes
            {/if}
          </span>
        </div>
      </div>
    {/if}

    {#if saveError}
      <div class="error-banner" role="alert">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        <span>{saveError}</span>
      </div>
    {/if}

    <div class="action-bar">
      <button
        type="button"
        class="cancel-btn"
        onclick={onClose}
        disabled={isSaving}
      >
        Cancel
      </button>
      <button
        data-save-shortcut
        type="button"
        class="save-btn"
        onclick={handleSave}
        disabled={!canSave}
      >
        {#if isSaving}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          Saving...
        {:else}
          <i class="fas fa-check" aria-hidden="true"></i>
          Save timing
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  /* The one container every query in this file resolves against, so a rule that
     recomposes .editor and a rule that recomposes its children cross the same
     seam at the same width. */
  /* The shell is a flex item of the performance editor, and its own grid sizes
     every track from the space it is given (minmax(0, 1fr) columns, absolutely
     filled video). That makes its max-content width zero, so an auto flex basis
     collapsed the whole mapping UI to a 0px sliver at the left edge. Claim the
     track explicitly instead of inheriting it from the content. */
  .step-map-shell {
    container-type: inline-size;
    flex: 1;
    min-inline-size: 0;
    inline-size: 100%;
    block-size: 100%;
  }

  /* The stage takes what is left after the controls, so the tap button is
     never the thing that falls below the fold. */
  .editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto auto auto;
    gap: clamp(0.75rem, 1.4cqw, 1.5rem);
    block-size: 100%;
    padding: clamp(0.75rem, 1.6cqw, 2rem);
    background: var(--theme-panel-bg, #101018);
  }

  .stage {
    position: relative;
    grid-row: 1;
    min-block-size: 0;
    border-radius: 0.75rem;
    overflow: hidden;
  }

  /* Filling the stage absolutely rather than sizing to the file: a percentage
     max-height against a 1fr grid area is treated as indefinite, so the video
     kept its intrinsic 956px height and overflowed everything under it. */
  .stage video {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    object-fit: contain;
  }

  .timeline-row {
    grid-row: 2;
  }

  .control-bar {
    grid-row: 3;
  }

  .action-bar {
    grid-row: 4;
  }

  .stage-bar {
    position: absolute;
    inset-inline: 0;
    inset-block-end: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    /* The stage is only as wide as the footage, and a portrait clip beside the
       controls leaves it narrow. Wrapping costs a strip of video; clipping
       would cost a control. */
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 0.5rem;
  }

  .stage-play {
    display: grid;
    place-items: center;
    inline-size: 44px;
    block-size: 44px;
    border: none;
    border-radius: 50%;
    background: var(--theme-accent, #22b8cf);
    color: #04141a;
    font-size: 1rem;
    cursor: pointer;
  }

  .stage-skip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-inline-size: 44px;
    block-size: 44px;
    padding-inline: 0.6rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 0.6rem;
    background: rgba(0, 0, 0, 0.55);
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  .stage-skip:hover {
    border-color: var(--theme-accent, #22b8cf);
  }

  .stage-time {
    padding: 0.25rem 0.6rem;
    border-radius: 0.5rem;
    background: rgba(0, 0, 0, 0.55);
    color: rgba(255, 255, 255, 0.85);
    /* The clock changes every frame; proportional digits would jitter it. */
    font-variant-numeric: tabular-nums;
    font-size: 0.8125rem;
  }

  .control-bar {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    inline-size: min(44rem, 100%);
    margin-inline: auto;
  }

  .rate-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .rate-control {
    flex: 0 0 auto;
    inline-size: max-content;
  }

  /* The whole point of the screen, sized like it. */
  .tap-target {
    display: flex;
    align-items: center;
    gap: clamp(0.75rem, 1.5cqw, 1.5rem);
    padding: clamp(0.75rem, 1.2cqw, 1.25rem);
    border: 2px solid var(--theme-accent, #22b8cf);
    border-radius: 1rem;
    background: color-mix(
      in srgb,
      var(--theme-accent, #22b8cf) 14%,
      transparent
    );
    color: inherit;
    text-align: start;
    cursor: pointer;
    transition:
      background 120ms ease,
      transform 120ms ease;
  }

  .tap-target:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--theme-accent, #22b8cf) 22%,
      transparent
    );
  }

  .tap-target.flash {
    background: color-mix(
      in srgb,
      var(--theme-accent, #22b8cf) 46%,
      transparent
    );
    transform: scale(0.99);
  }

  .tap-target:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .tap-face {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    /* Reserved before the pictograph prepares, so arrival never reflows the
       button or the row of controls under it. */
    inline-size: clamp(5rem, 14cqw, 9rem);
    aspect-ratio: 1;
  }

  /* The visible box, and the thing that is actually square. Splitting it from
     the sizing area above is what lets the wide layout hand the area a height
     from flex and a width from the column, and still draw a square inside:
     aspect-ratio alone derives one axis from the other, so it cannot take the
     smaller of two. See the size-container rule in the two-column tier. */
  .face-square {
    display: grid;
    place-items: center;
    inline-size: 100%;
    aspect-ratio: 1;
    border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.04);
    overflow: hidden;
  }

  .tap-copy {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-inline-size: 0;
  }

  .tap-copy strong {
    font-size: clamp(1rem, 1.5cqw, 1.5rem);
    line-height: 1.2;
  }

  .tap-progress {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.65));
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
  }

  .tap-letter,
  .selected-letter {
    display: inline-flex;
    align-items: center;
  }

  .tap-key {
    /* Reserved for the longer re-take sentence, so swapping to it moves
       nothing below. */
    min-block-size: 2.4em;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    font-size: 0.75rem;
  }

  /* Pressed state is the whole control, not a bar down one edge. */
  .mirror-btn.on {
    border-color: var(--theme-accent, #22b8cf);
    background: color-mix(
      in srgb,
      var(--theme-accent, #22b8cf) 22%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.05))
    );
    color: var(--theme-text, #fff);
  }

  .selected-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.75rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .selected-face {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    inline-size: 3rem;
    aspect-ratio: 1;
  }

  .selected-face .face-square {
    border-radius: 0.5rem;
  }

  .selected-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.15rem;
    min-inline-size: 0;
  }

  .selected-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 600;
  }

  .selected-time {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-variant-numeric: tabular-nums;
    font-size: 0.8125rem;
  }

  .nudge {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: 0 0 auto;
  }

  .aux-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .aux-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    /* Wrap to the next line rather than compress: a shrunk button squeezes its
       label out through its own border. */
    flex: 0 0 auto;
    white-space: nowrap;
    min-block-size: 44px;
    padding: 0 0.85rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0.6rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
  }

  .aux-btn:hover:not(:disabled) {
    border-color: var(--theme-accent, #22b8cf);
  }

  .aux-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  /* The way out of a run that otherwise keeps wrapping, so it carries the
     accent the rest of the row does not. */
  .done-btn {
    border-color: var(--theme-accent, #22b8cf);
    background: color-mix(
      in srgb,
      var(--theme-accent, #22b8cf) 20%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.05))
    );
    color: var(--theme-text, #fff);
  }

  .review-progress {
    margin-inline-start: auto;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-variant-numeric: tabular-nums;
    font-size: 0.8125rem;
  }

  .review-progress.complete {
    color: var(--semantic-success, #51cf66);
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.85rem;
    border-radius: 0.6rem;
    background: color-mix(in srgb, #ff6b6b 18%, transparent);
    color: #ffc9c9;
    font-size: 0.875rem;
  }

  .action-bar {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
  }

  .cancel-btn,
  .save-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-block-size: 44px;
    padding: 0 1.25rem;
    border-radius: 0.6rem;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
  }

  .cancel-btn {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    background: transparent;
    color: inherit;
  }

  .save-btn {
    border: none;
    background: var(--theme-accent, #22b8cf);
    color: #04141a;
  }

  .save-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  /* Narrow and in the hand: the stage and the tap button are the screen, and
     the button's copy stacks under its pictograph rather than beside it. */
  @container (max-width: 34rem) {
    /* The controls are heavy enough on a phone to squeeze the stage out of
       existence, and the video is the thing you are watching. Floor it, and let
       the surface scroll rather than hide the tap button.
       The floor is set for a PORTRAIT clip, which is what a performance video
       almost always is: at 7rem such a clip renders about 60px wide and 11rem
       still only about 100px, too small to see which point a prop arrived at,
       which is the only question this screen asks. 15rem buys back a readable
       clip and pushes only the undo/reset row below the fold - the video and
       the tap button, the two things marking actually uses, both stay in
       view. */
    .editor {
      grid-template-rows: minmax(15rem, 1fr) auto auto auto;
      gap: 0.5rem;
      padding: 0.5rem;
      overflow-y: auto;
    }

    /* A thumb-width bar is already a comfortable scrub target, and every pixel
       it gives back is one the tap button stays above the fold with. */
    .timeline-row {
      --timeline-bar-height: 32px;
    }

    /* Face beside the copy rather than above it. Stacked, the card alone was a
       third of a phone screen, and it was taking that height from the video. */
    .tap-target {
      gap: 0.75rem;
      padding: 0.625rem;
    }

    .tap-face {
      flex: 0 0 auto;
      inline-size: 6.5rem;
    }

    /* No hardware keyboard to tell them about. The slot itself stays - it also
       carries the re-take notice, which matters most on the tier where the
       timeline is smallest and overshooting is easiest. */
    .kbd-hint {
      display: none;
    }

    .action-bar {
      justify-content: stretch;
    }

    .cancel-btn,
    .save-btn {
      flex: 1;
    }
  }

  /* Wide enough for two columns: the controls move beside the stage instead of
     under it, so the video gets the full height rather than half of it and the
     rail either side of a portrait clip stops being dead space. The timeline
     still spans the full width, because it is a ruler. */
  @container (min-width: 52rem) {
    .editor {
      /* The stage column is sized from the footage, not from whatever is left
         over. Performance clips are usually shot on a phone in portrait, and a
         9:16 clip given a 1fr column renders as a narrow strip stranded in
         800px of black. Sizing the column by ratio x height puts the video and
         the controls next to each other in the middle of the frame instead.
         A portrait clip only ever claims a narrow column, so the controls take
         the width it leaves rather than sitting at a fixed 24rem with the rest
         of the canvas empty either side of the pair. The ceiling is roughly
         what the pictograph can spend: past 70dvh the square is height-bound
         and every further pixel of column turns into card padding, which at
         2560 left a 662px square floating in a 1107px card. */
      grid-template-columns:
        minmax(0, min(52cqw, calc(var(--video-ratio, 1.7778) * 78dvh)))
        minmax(18rem, clamp(28rem, 44cqw, 70dvh));
      grid-template-rows: minmax(0, 1fr) auto auto;
      justify-content: center;
    }

    .timeline-row {
      /* A 48px bar spanning 2700px reads as a hairline, not a scrub target. */
      --timeline-bar-height: clamp(48px, 3.5cqw, 88px);
    }

    .control-bar {
      grid-column: 2;
      grid-row: 1;
      /* Stretch, not centre: centring left a band of empty column above and
         below the controls while the video beside them ran the full height. */
      align-self: stretch;
      /* Auto inline margins beat justify-self:stretch, so the column has to be
         claimed explicitly or the controls shrink-to-fit and float in it. */
      inline-size: 100%;
      margin-inline: 0;
    }

    /* In a column rather than a strip, the pictograph goes above the copy and
       gets to be the size of the decision it is asking for. */
    .tap-target,
    .selected-row {
      /* The card takes whatever height the speed and action rows leave, and the
         pictograph fills it. Next to a full-height video, a card sized to its
         text was what made the column look half empty. */
      flex: 1;
      min-block-size: 0;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    /* Height is the leftover after the copy, width follows it through the
       ratio, so the face is square and can never overflow the card. It only
       holds while the width cap never bites - aspect-ratio derives width FROM
       height, so clamping the width cannot pull the height back down, and a
       36rem ceiling here once turned a 4K face into a 576x1432 box. The column
       ceiling above is what guarantees the room. (A size container asking for
       100cqmin is the direct way to say min(width, height), but Chrome resolves
       cqb against the pre-flex pass here and hands back the inline axis.) */
    .tap-face,
    .selected-face {
      flex: 1 1 auto;
      min-block-size: 0;
      inline-size: auto;
      max-inline-size: 100%;
      aspect-ratio: 1;
      margin-inline: auto;
    }

    .tap-progress {
      justify-content: center;
    }

    /* Review shows the same big face in the same place as marking did, so
       checking a mark is the same gesture as placing one. */
    .selected-row {
      gap: 1rem;
      padding: clamp(0.75rem, 1.2cqw, 1.25rem);
    }

    .selected-copy {
      flex: 0 0 auto;
    }

    .selected-label {
      font-size: 1.25rem;
    }

    .selected-label,
    .nudge {
      justify-content: center;
    }

    .timeline-row {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .action-bar {
      grid-column: 1 / -1;
      grid-row: 3;
    }

    /* Short as well as wide - a folded phone held sideways. A portrait stage
       column leaves most of the canvas unused here, so the controls spend that
       width rather than wrapping the action buttons into a second row there is
       no height for. */
    @media (max-height: 34rem) {
      .editor {
        grid-template-columns:
          minmax(0, min(30cqw, calc(var(--video-ratio, 1.7778) * 78dvh)))
          minmax(18rem, 44rem);
      }

      /* Wide enough that both variants of the notice are one line, so the slot
         no longer has to reserve a second one to hold its neighbours still. */
      .tap-key {
        min-block-size: 1.2em;
      }
    }
  }

  /* 4K at 100%, or a TV across the room. Nothing is scaling for you at this
     size, so the ceilings step up rather than leaving the controls beside a
     1700px-tall video as fine print. 1920 (4K at 200%) stays on the tier
     above, where it already reads correctly. */
  @container (min-width: 150rem) {
    /* SegmentedControl sizes itself from these, so raising them on the wrapper
       scales the rate chips through the primitive's own seam. */
    .rate-control {
      --font-size-sm: 1.15rem;
      --font-size-compact: 1.05rem;
    }

    /* No cap of its own up here. The two-column rule already sizes the face
       from the card's width and the viewport's height, and a 36rem ceiling on
       top of that just left a 4K card mostly empty around a small square. */

    .tap-copy strong {
      font-size: clamp(1.5rem, 1.6cqw, 2.5rem);
    }

    .tap-progress,
    .selected-label {
      font-size: 1.5rem;
    }

    .tap-key,
    .selected-time {
      font-size: 1.1rem;
    }

    .aux-btn,
    .cancel-btn,
    .save-btn {
      min-block-size: 60px;
      padding-inline: 1.4rem;
      font-size: 1.15rem;
    }
  }

  /* Wide and short - a folded phone held sideways. Everything optional goes so
     the stage and the tap button both stay above the fold. */
  @media (max-height: 34rem) {
    .kbd-hint {
      display: none;
    }

    /* The timeline reads out the clock a few pixels below, and three buttons
       plus a clock will not cross a portrait stage column. The skip buttons
       keep their icons and their aria-labels, and lose only the duration they
       repeat from them. */
    .stage-time,
    .skip-label {
      display: none;
    }

    .editor {
      gap: 0.5rem;
      padding: 0.5rem;
    }

    .control-bar {
      gap: 0.5rem;
    }

    /* Back to a strip. Stacked, the face and the copy together are taller than
       the row the two-column layout can give them here, and the column spills
       over the timeline underneath it. */
    .tap-target,
    .selected-row {
      flex-direction: row;
      align-items: center;
      /* Centring is the column tier's rule. In a row it strands the pictograph
         and the copy in the middle with half the card empty beside them. */
      justify-content: flex-start;
      gap: 0.75rem;
      padding: 0.6rem;
      text-align: start;
    }

    /* Back to a fixed strip. The two-column tier hands the face flex: 1 1 auto
       so it can take the leftover height of a column; in this row it would take
       the leftover WIDTH instead and the ratio would make it 428px tall inside
       a 76px card. */
    .tap-face,
    .selected-face {
      flex: 0 0 auto;
      inline-size: clamp(3rem, 6cqw, 4.5rem);
      margin-inline: 0;
    }

    .tap-progress,
    .selected-label,
    .nudge {
      justify-content: flex-start;
    }

    /* A scrub bar still has to be grabbable here, but not at the expense of the
       stage - this is the tier with the least height to spend. */
    .timeline-row {
      --timeline-bar-height: 26px;
    }
  }
</style>
