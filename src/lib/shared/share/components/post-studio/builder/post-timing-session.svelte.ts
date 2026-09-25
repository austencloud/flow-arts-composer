import type { PostBuilderState } from "$lib/shared/media-composition/state/post-builder-state.svelte";
import type { PaintFrame } from "$lib/shared/media-composition/services/post-studio-layer-painter";
import {
  MIN_MOVE_SECONDS,
  TAKE_MAX_BPM,
  TAKE_MIN_BPM,
  landingDragRange,
  mergeTimingSectionIntoPrevious,
  moveBeatOne,
  releaseLanding,
  setBeatOneAt,
  setLandingAt,
  setPerformanceEndAt,
  splitTimingSection,
  takeSampleAt,
  type SplitContinuity,
  type TimingSection,
} from "$lib/shared/media-composition/domain/take-timing";
import { sequenceFrameAt } from "$lib/shared/media-composition/domain/sequence-frame";
import {
  landingName,
  summarizeTiming,
} from "$lib/shared/media-composition/domain/timing-summary";

export interface LandingRef {
  sectionId: string;
  position: number;
}

export type TimingSpeed = "1" | "0.75" | "0.5";
export type TimingZoom = "4" | "8" | "16";

/**
 * The Timing step's working state, shared by its stage (the take, its move
 * square and the lanes) and its panel (the controls), which the studio may
 * lay out apart. The take plays on its own clock here, not the post's.
 */
export function createPostTimingSession(builder: PostBuilderState) {
  let video = $state<HTMLVideoElement | null>(null);
  let mediaSeconds = $state(0);
  let playing = $state(false);
  let speed = $state<TimingSpeed>("1");
  let zoom = $state<TimingZoom>("8");
  let showSquare = $state(true);
  let selected = $state<LandingRef | null>(null);
  let tapCount = $state(0);

  const takes = $derived(builder.plan.takes);
  const takeId = $derived(
    builder.selectedTakeId &&
      takes.some((take) => take.id === builder.selectedTakeId)
      ? builder.selectedTakeId
      : (takes[0]?.id ?? null)
  );
  const take = $derived(takes.find((entry) => entry.id === takeId) ?? null);
  const url = $derived(takeId ? builder.mediaUrl(takeId) : null);
  const timing = $derived(takeId ? builder.timing(takeId) : null);
  const resolved = $derived(takeId ? builder.resolvedTiming(takeId) : null);
  const status = $derived(takeId ? builder.timingStatus(takeId) : "untapped");
  const moveBeats = $derived(builder.moveBeats);
  const movesPerPass = $derived(moveBeats.length);
  const durationSeconds = $derived(take?.durationSeconds ?? 0);

  const sectionIndex = $derived.by(() => {
    let index = 0;
    (timing?.sections ?? []).forEach((section, candidate) => {
      if (mediaSeconds >= section.startSeconds) index = candidate;
    });
    return index;
  });
  const section = $derived<TimingSection | null>(
    timing?.sections[sectionIndex] ?? null
  );
  const resolvedSection = $derived(
    resolved?.sections.find((entry) => entry.id === section?.id) ?? null
  );
  const summary = $derived(
    section
      ? summarizeTiming({ section, resolved: resolvedSection, moveBeats })
      : null
  );

  const frame = $derived.by(() => {
    if (!resolved) return null;
    const sample = takeSampleAt(resolved, mediaSeconds);
    return sample
      ? sequenceFrameAt(sample.arrival, moveBeats, {
          endArrival: sample.endArrival,
        })
      : null;
  });
  const paintFrame = $derived<PaintFrame | null>(
    frame
      ? {
          projectProgress: 0,
          sourceTimeSeconds: mediaSeconds,
          sequenceFrame: frame,
          sequencePosition: frame.enginePosition,
          displayedBeatNumber: frame.move,
        }
      : null
  );
  const readout = $derived(
    !frame
      ? "Not mapped here"
      : frame.phase === "opening"
        ? "Opening pose"
        : `${landingName(Math.max(1, Math.ceil(frame.arrival - 1e-9)), movesPerPass)}${
            frame.phase === "holding" ? " · held" : ""
          }`
  );

  const selectedLanding = $derived.by(() => {
    const ref = selected;
    if (!ref || !resolved) return null;
    const owner = resolved.sections.find((entry) => entry.id === ref.sectionId);
    return (
      owner?.landings.find((landing) => landing.position === ref.position) ??
      null
    );
  });

  const canSplit = $derived(
    Boolean(
      section &&
      mediaSeconds > section.startSeconds + 0.25 &&
      mediaSeconds < section.endSeconds - 0.25
    )
  );

  // A different take starts from its top with nothing selected.
  $effect(() => {
    void takeId;
    mediaSeconds = 0;
    playing = false;
    selected = null;
  });

  $effect(() => {
    if (video) video.playbackRate = Number(speed);
  });

  // Follow the video while it plays; a paused one moves only by seek.
  $effect(() => {
    if (!playing || !video) return;
    const target = video;
    let frameId = requestAnimationFrame(function follow() {
      mediaSeconds = target.currentTime;
      frameId = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frameId);
  });

  function seek(seconds: number): void {
    const clamped = Math.min(durationSeconds, Math.max(0, seconds));
    mediaSeconds = clamped;
    if (video) video.currentTime = clamped;
  }

  function pause(): void {
    video?.pause();
  }

  function togglePlay(): void {
    if (!video) return;
    if (video.paused) {
      if (video.ended || video.currentTime >= durationSeconds - 0.05) seek(0);
      void video.play().catch(() => (playing = false));
    } else {
      video.pause();
    }
  }

  function stepFrame(direction: -1 | 1): void {
    video?.pause();
    seek(mediaSeconds + direction * MIN_MOVE_SECONDS);
  }

  function editCurrent(edit: (section: TimingSection) => TimingSection): void {
    if (!takeId || !section) return;
    builder.editSection(takeId, section.id, edit);
  }

  function tap(): void {
    if (!takeId || !timing) return;
    const seconds = video?.currentTime ?? mediaSeconds;
    const owner =
      [...timing.sections]
        .reverse()
        .find((entry) => seconds >= entry.startSeconds) ?? timing.sections[0];
    if (!owner) return;
    builder.editSection(takeId, owner.id, (current) => ({
      ...current,
      taps: [...current.taps, seconds].sort((a, b) => a - b),
    }));
    tapCount += 1;
  }

  /** Sets the BPM; false when it is not a tempo the fit can use. */
  function setBpm(value: number): boolean {
    if (
      !Number.isFinite(value) ||
      value < TAKE_MIN_BPM ||
      value > TAKE_MAX_BPM
    ) {
      return false;
    }
    const bpm = Math.round(value * 10) / 10;
    editCurrent((current) =>
      current.bpm === bpm ? current : { ...current, bpm }
    );
    return true;
  }

  function firstTapWasMoveOne(): void {
    const first = resolvedSection?.fit?.labels[0]?.seconds;
    if (first === undefined) return;
    editCurrent((current) => setBeatOneAt(current, moveBeats, first));
  }

  function dropLeadingTaps(count: number): void {
    const leading = new Set(
      (resolvedSection?.fit?.labels ?? [])
        .slice(0, count)
        .map((label) => label.seconds)
    );
    editCurrent((current) => ({
      ...current,
      taps: current.taps.filter((seconds) => !leading.has(seconds)),
    }));
  }

  function nudgeGrid(direction: -1 | 1): void {
    editCurrent((current) => ({
      ...current,
      offsetSeconds:
        Math.round(
          (current.offsetSeconds + direction * MIN_MOVE_SECONDS) * 1e6
        ) / 1e6,
    }));
  }

  function clearEnd(): void {
    editCurrent((current) => {
      if (current.lastPosition === undefined) return current;
      const { lastPosition: _end, ...rest } = current;
      return rest;
    });
  }

  function clearTaps(): void {
    editCurrent((current) =>
      current.taps.length === 0 ? current : { ...current, taps: [] }
    );
  }

  function placeLanding(landing: LandingRef, seconds: number): void {
    if (!takeId) return;
    builder.editSection(takeId, landing.sectionId, (current) =>
      setLandingAt(current, moveBeats, landing.position, seconds)
    );
  }

  function landingRange(landing: LandingRef) {
    const owner = timing?.sections.find(
      (entry) => entry.id === landing.sectionId
    );
    return owner ? landingDragRange(owner, moveBeats, landing.position) : null;
  }

  function releaseSelected(): void {
    const ref = selected;
    if (!takeId || !ref) return;
    builder.editSection(takeId, ref.sectionId, (current) =>
      releaseLanding(current, ref.position)
    );
  }

  function split(continuity: SplitContinuity): void {
    if (!takeId || !timing) return;
    let index = timing.sections.length + 1;
    while (timing.sections.some((entry) => entry.id === `part-${index}`)) {
      index += 1;
    }
    const at = mediaSeconds;
    builder.editTiming(takeId, (current) =>
      splitTimingSection(
        current,
        at,
        `part-${index}`,
        Date.now(),
        moveBeats,
        continuity
      )
    );
  }

  function joinWithPrevious(): void {
    if (!takeId || !section) return;
    const id = section.id;
    builder.editTiming(takeId, (current) =>
      mergeTimingSectionIntoPrevious(current, id, Date.now())
    );
  }

  /** Records the check, then moves to the next take or on to the acts. */
  function confirm(): void {
    if (!takeId) return;
    pause();
    builder.confirmTiming(takeId);
    const next = builder.takesInUse.find(
      (entry) => builder.timingStatus(entry.id) !== "confirmed"
    );
    if (next) builder.selectedTakeId = next.id;
    else builder.step = "acts";
  }

  function isTyping(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    );
  }

  /** T taps, Space plays, comma and period step a frame. */
  function handleKey(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }
    if (isTyping(event.target)) return;
    if (event.key === "t" || event.key === "T") {
      event.preventDefault();
      tap();
    } else if (event.key === " ") {
      if (event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      togglePlay();
    } else if (event.key === ",") {
      stepFrame(-1);
    } else if (event.key === ".") {
      stepFrame(1);
    }
  }

  return {
    get video() {
      return video;
    },
    set video(next: HTMLVideoElement | null) {
      video = next;
    },
    get mediaSeconds() {
      return mediaSeconds;
    },
    get playing() {
      return playing;
    },
    get speed() {
      return speed;
    },
    set speed(next: TimingSpeed) {
      speed = next;
    },
    get zoom() {
      return zoom;
    },
    set zoom(next: TimingZoom) {
      zoom = next;
    },
    get showSquare() {
      return showSquare;
    },
    set showSquare(next: boolean) {
      showSquare = next;
    },
    get selected() {
      return selected;
    },
    set selected(next: LandingRef | null) {
      selected = next;
    },
    get tapCount() {
      return tapCount;
    },
    get takes() {
      return takes;
    },
    get take() {
      return take;
    },
    get takeId() {
      return takeId;
    },
    get url() {
      return url;
    },
    get timing() {
      return timing;
    },
    get resolved() {
      return resolved;
    },
    get status() {
      return status;
    },
    get moveBeats() {
      return moveBeats;
    },
    get movesPerPass() {
      return movesPerPass;
    },
    get durationSeconds() {
      return durationSeconds;
    },
    get sectionIndex() {
      return sectionIndex;
    },
    get section() {
      return section;
    },
    get resolvedSection() {
      return resolvedSection;
    },
    get summary() {
      return summary;
    },
    get paintFrame() {
      return paintFrame;
    },
    get readout() {
      return readout;
    },
    get selectedLanding() {
      return selectedLanding;
    },
    get canSplit() {
      return canSplit;
    },
    get canUndo() {
      return takeId ? builder.canUndoTiming(takeId) : false;
    },
    /** The video element reports its own play state. */
    notePlaying(next: boolean): void {
      playing = next;
      if (!next && video) mediaSeconds = video.currentTime;
    },
    noteSeeked(): void {
      if (video && !playing) mediaSeconds = video.currentTime;
    },
    selectTake(id: string): void {
      builder.selectedTakeId = id;
    },
    goToTakes(): void {
      builder.step = "takes";
    },
    seek,
    pause,
    togglePlay,
    stepFrame,
    tap,
    setBpm,
    setTempo(tempo: TimingSection["tempo"]): void {
      editCurrent((current) =>
        current.tempo === tempo ? current : { ...current, tempo }
      );
    },
    setSnap(snap: TimingSection["snap"]): void {
      editCurrent((current) =>
        current.snap === snap ? current : { ...current, snap }
      );
    },
    beatOneHere(): void {
      const at = mediaSeconds;
      editCurrent((current) => setBeatOneAt(current, moveBeats, at));
    },
    shiftBeatOne(landings: -1 | 1): void {
      editCurrent((current) => moveBeatOne(current, moveBeats, landings));
    },
    endHere(): void {
      const at = mediaSeconds;
      editCurrent((current) => setPerformanceEndAt(current, moveBeats, at));
    },
    firstTapWasMoveOne,
    dropLeadingTaps,
    nudgeGrid,
    clearEnd,
    clearTaps,
    placeLanding,
    landingRange,
    releaseSelected,
    split,
    joinWithPrevious,
    undo(): void {
      if (takeId) builder.undoTiming(takeId);
    },
    confirm,
    handleKey,
  };
}

export type PostTimingSession = ReturnType<typeof createPostTimingSession>;
