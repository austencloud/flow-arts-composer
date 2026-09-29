<script lang="ts">
  import { onDestroy, tick } from "svelte";

  import SequencePickerModal from "$lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import TransportControls from "$lib/shared/animation-engine/components/controls/TransportControls.svelte";
  import TempoControl from "$lib/shared/animation-panel/components/TempoControl.svelte";
  import TimeRuler from "$lib/shared/timeline/TimeRuler.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import {
    flyFade,
    growFade,
    motionDuration,
    popIn,
  } from "$lib/shared/transitions/motion";
  import {
    createLayoutMotion,
    LAYOUT_MOTION_DURATION_MS,
  } from "$lib/shared/transitions/layout-flip";
  import { DURATION } from "$lib/shared/transitions/transitions";

  import { getStageChoreographyContext } from "../context/stage-choreography-context";
  import {
    getActiveStageSequenceClip,
    samplePerformerSequenceAtBeat,
  } from "../domain/stage-sequence-timeline";
  import {
    projectPerformerFloorTravel,
    samplePerformerFloorSpeed,
    stageSequenceDisplayName,
    type StageFloorSpeedSample,
    type StageFloorTravelSegment,
  } from "../domain/stage-timeline-projection";
  import type {
    Formation,
    Performer,
    StageSequenceClip,
  } from "../domain/stage-types";
  import type {
    StageEditMode,
    StageSelection,
  } from "../state/stage-edit-mode.svelte";
  import StageFloorLane from "./StageFloorLane.svelte";
  import StageHandsClipContent from "./StageHandsClipContent.svelte";
  import StageMotionLane from "./StageMotionLane.svelte";

  type TimelineMode = "dock" | "editor";
  type TimelineLens = "hands" | "floor" | "motion";

  const TIMELINE_LENSES: {
    value: TimelineLens;
    label: string;
    icon: string;
  }[] = [
    {
      value: "hands",
      label: "Hands",
      icon: "fas fa-hands",
    },
    {
      value: "floor",
      label: "Floor",
      icon: "fas fa-route",
    },
    {
      value: "motion",
      label: "Motion",
      icon: "fas fa-chart-line",
    },
  ];

  interface Props {
    editMode: StageEditMode;
    mode?: TimelineMode;
    sequences?: ReadonlyMap<string, SequenceData>;
    timelineLens?: TimelineLens;
    onExpand?: () => void;
    onCollapse?: () => void;
    onDeleteSelection: (selection: StageSelection) => void;
  }

  type ClipDrag = {
    clipId: string;
    mode: "move" | "resize";
    pointerStartX: number;
    initialStartBeat: number;
    initialDurationBeats: number;
    draftStartBeat: number;
    draftDurationBeats: number;
  };

  type FormationDrag = {
    formationId: string;
    mode: "move" | "transition";
    pointerStartX: number;
    initialAtBeat: number;
    initialTransitionBeats: number;
    draftAtBeat: number;
    draftTransitionBeats: number;
  };

  type FloorTravelHandle = "move" | "departure" | "arrival";

  type FloorTravelDrag = {
    segmentId: string;
    formationId: string;
    performerId: string;
    mode: FloorTravelHandle;
    pointerStartX: number;
    initialStartBeat: number;
    initialEndBeat: number;
    minimumStartBeat: number;
    maximumEndBeat: number;
    historyStarted: boolean;
  };

  let {
    editMode,
    mode = "editor",
    sequences = new Map(),
    timelineLens = $bindable("hands"),
    onExpand = () => {},
    onCollapse = () => {},
    onDeleteSelection,
  }: Props = $props();

  const stageState = getStageChoreographyContext();
  const choreography = $derived(stageState.choreography);
  let timelineGridElement: HTMLElement | null = null;
  const performerRowMotion = createLayoutMotion({
    getRoot: () => timelineGridElement,
    groups: [
      {
        selector: "[data-performer-row-label]",
        datasetKey: "performerRowLabel",
      },
      {
        selector: "[data-performer-row-lane]",
        datasetKey: "performerRowLane",
      },
    ],
    getDuration: () => motionDuration(LAYOUT_MOTION_DURATION_MS),
  });
  const performerRowSignature = $derived(
    choreography.performers.map((performer) => performer.id).join("|")
  );
  let previousPerformerRowSignature: string | null = null;
  let performerRowTransitionToken = 0;

  // A removed performer changes every row below it. Capture the surviving
  // labels and lanes before the document changes, then carry them together to
  // their new rows so the eye never has to reconstruct where they went.
  $effect.pre(() => {
    const signature = performerRowSignature;
    const previous = previousPerformerRowSignature;
    previousPerformerRowSignature = signature;
    if (previous === null || previous === signature) return;

    const captured = performerRowMotion.capture();
    const token = ++performerRowTransitionToken;
    void tick().then(() => {
      if (token === performerRowTransitionToken && captured) {
        performerRowMotion.play();
      }
    });
  });
  const maxBeats = $derived(Math.max(16, Math.ceil(stageState.maxTotalBeats)));
  const activeClipIds = $derived.by(() => {
    const ids = new Set<string>();
    for (const performer of choreography.performers) {
      const clip = getActiveStageSequenceClip(
        performer,
        stageState.currentBeat
      );
      if (clip) ids.add(clip.id);
    }
    return ids;
  });
  // The floor, not the target. A show should read end to end without
  // scrolling — a 64-count drill whose sets land on 32 and 64 is unreadable if
  // the second set is off the right edge — so the track fits the viewport and
  // only starts scrolling once counts would get narrower than this.
  const MIN_PIXELS_PER_BEAT = 12;
  // The label gutter on the left, and room on the right for the closing set's
  // chip. A set that lands on the final count sits flush against the end of the
  // track, so without the trailing room its chip hangs off the edge and the
  // last thing in the show is the one thing you cannot read.
  const TRACK_GUTTER_PX = 112;
  const TRACK_TRAILING_PX = 148;
  let timelineViewportWidth = $state(0);
  let pickerOpen = $state(false);
  let pickerPerformerId = $state<string | null>(null);
  let drag = $state<ClipDrag | null>(null);
  let didDrag = false;
  let formationDrag = $state<FormationDrag | null>(null);
  let didFormationDrag = false;
  let floorTravelDrag = $state<FloorTravelDrag | null>(null);
  const effectivePixelsPerBeat = $derived(
    Math.max(
      MIN_PIXELS_PER_BEAT,
      (timelineViewportWidth - TRACK_GUTTER_PX - TRACK_TRAILING_PX) /
        Math.max(1, maxBeats)
    )
  );

  const floorTravelByPerformer = $derived.by(() => {
    const projected = new Map<string, StageFloorTravelSegment[]>();
    for (const performer of choreography.performers) {
      projected.set(
        performer.id,
        projectPerformerFloorTravel(choreography, performer.id)
      );
    }
    return projected;
  });

  const selectedFloorTravel = $derived.by(() => {
    if (editMode.selection.kind !== "travel") return null;
    return (
      floorTravelByPerformer
        .get(editMode.selection.performerId)
        ?.find(
          (segment) => segment.formationId === editMode.selection.formationId
        ) ?? null
    );
  });

  const floorSpeedByPerformer = $derived.by(() => {
    const projected = new Map<string, StageFloorSpeedSample[]>();
    for (const performer of choreography.performers) {
      projected.set(
        performer.id,
        samplePerformerFloorSpeed(choreography, performer.id, maxBeats)
      );
    }
    return projected;
  });

  const maxFloorSpeed = $derived.by(() => {
    let max = 0;
    for (const samples of floorSpeedByPerformer.values()) {
      for (const sample of samples) max = Math.max(max, sample.metersPerSecond);
    }
    return Math.max(1, max);
  });

  const currentFrameByPerformer = $derived(
    new Map(
      stageState.performanceFrames.map(
        (frame) => [frame.performerId, frame] as const
      )
    )
  );

  function sequenceForClip(clip: StageSequenceClip): SequenceData | undefined {
    return sequences.get(clip.sequenceId);
  }

  function clipDisplayLabel(clip: StageSequenceClip): string {
    const sequence = sequenceForClip(clip);
    return (
      clip.label?.trim() ||
      (sequence
        ? stageSequenceDisplayName(sequence)
        : stageState.clipLabel(clip))
    );
  }

  function activeStepIndex(
    performer: Performer,
    clip: StageSequenceClip
  ): number | null {
    const sample = samplePerformerSequenceAtBeat(
      performer,
      stageState.currentBeat
    );
    return sample?.clip.id === clip.id ? sample.stepIndex : null;
  }

  function openPicker(performerId: string): void {
    pickerPerformerId = performerId;
    pickerOpen = true;
  }

  function selectSequence(sequence: SequenceData): void {
    if (!pickerPerformerId) return;
    const clip = stageState.addSequenceClip(
      pickerPerformerId,
      sequence,
      stageState.currentBeat
    );
    if (clip) editMode.selectClip(pickerPerformerId, clip.id);
  }

  function seekFromPointer(event: PointerEvent): void {
    if (
      (event.target as Element).closest(
        ".sequence-clip, .formation-block, .floor-travel-control"
      )
    )
      return;
    const lane = event.currentTarget as HTMLElement;
    const rect = lane.getBoundingClientRect();
    const beat = Math.max(
      0,
      Math.min(maxBeats, (event.clientX - rect.left) / effectivePixelsPerBeat)
    );
    const total = Math.max(1, stageState.maxTotalBeats);
    stageState.seek(Math.min(beat, total) / total);
  }

  function selectClip(
    event: MouseEvent,
    performer: Performer,
    clip: StageSequenceClip
  ): void {
    event.stopPropagation();
    if (didDrag) {
      didDrag = false;
      return;
    }
    editMode.selectClip(performer.id, clip.id);
  }

  function beginClipDrag(
    event: PointerEvent,
    clip: StageSequenceClip,
    mode: ClipDrag["mode"]
  ): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    didDrag = false;
    drag = {
      clipId: clip.id,
      mode,
      pointerStartX: event.clientX,
      initialStartBeat: clip.startBeat,
      initialDurationBeats: clip.durationBeats,
      draftStartBeat: clip.startBeat,
      draftDurationBeats: clip.durationBeats,
    };
  }

  function updateClipDrag(event: PointerEvent): void {
    if (!drag) return;
    const beatDelta =
      (event.clientX - drag.pointerStartX) / effectivePixelsPerBeat;
    if (Math.abs(event.clientX - drag.pointerStartX) > 3) didDrag = true;
    if (drag.mode === "move") {
      drag.draftStartBeat = Math.max(
        0,
        Math.round((drag.initialStartBeat + beatDelta) * 4) / 4
      );
    } else {
      drag.draftDurationBeats = Math.max(
        0.25,
        Math.round((drag.initialDurationBeats + beatDelta) * 4) / 4
      );
    }
  }

  function commitClipDrag(): void {
    if (!drag) return;
    if (didDrag) {
      if (drag.mode === "move") {
        stageState.moveSequenceClip(drag.clipId, drag.draftStartBeat);
      } else {
        stageState.resizeSequenceClip(drag.clipId, drag.draftDurationBeats);
      }
    }
    drag = null;
  }

  function clipStart(clip: StageSequenceClip): number {
    return drag?.clipId === clip.id ? drag.draftStartBeat : clip.startBeat;
  }

  function clipDuration(clip: StageSequenceClip): number {
    return drag?.clipId === clip.id
      ? drag.draftDurationBeats
      : clip.durationBeats;
  }

  function formationBeat(formation: Formation): number {
    return formationDrag?.formationId === formation.id &&
      formationDrag.mode === "move"
      ? formationDrag.draftAtBeat
      : formation.atBeat;
  }

  function formationTransition(formation: Formation): number {
    return formationDrag?.formationId === formation.id &&
      formationDrag.mode === "transition"
      ? formationDrag.draftTransitionBeats
      : formation.transitionBeats;
  }

  /**
   * A set is held from the beat it lands on until the walk into the NEXT set
   * begins. The hold can legitimately be zero — the default document walks for
   * all eight counts — so this drives a rail drawn behind the set's chip, never
   * the chip's own width. Sizing the chip by the hold collapsed it to an
   * unreadable stub whenever the cast never stops.
   */
  function formationHoldBeats(index: number): number {
    const formation = choreography.formations[index];
    if (!formation) return 0;
    const next = choreography.formations[index + 1];
    const end = next
      ? formationBeat(next) - formationTransition(next)
      : maxBeats;
    return Math.max(0, end - formationBeat(formation));
  }

  function formationName(formation: Formation, index: number): string {
    return formation.label?.trim() || `Set ${index + 1}`;
  }

  function addFormationAtPlayhead(): void {
    const formation = stageState.addFormation(
      Math.round(stageState.currentBeat)
    );
    if (formation) editMode.selectFormation(formation.id);
  }

  function beginFormationDrag(
    event: PointerEvent,
    formation: Formation,
    mode: FormationDrag["mode"]
  ): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    didFormationDrag = false;
    stageState.beginDrag();
    formationDrag = {
      formationId: formation.id,
      mode,
      pointerStartX: event.clientX,
      initialAtBeat: formation.atBeat,
      initialTransitionBeats: formation.transitionBeats,
      draftAtBeat: formation.atBeat,
      draftTransitionBeats: formation.transitionBeats,
    };
  }

  function updateFormationDrag(event: PointerEvent): void {
    if (!formationDrag) return;
    const beatDelta =
      (event.clientX - formationDrag.pointerStartX) / effectivePixelsPerBeat;
    if (Math.abs(event.clientX - formationDrag.pointerStartX) > 3) {
      didFormationDrag = true;
    }
    if (formationDrag.mode === "move") {
      formationDrag.draftAtBeat = Math.max(
        1,
        Math.round(formationDrag.initialAtBeat + beatDelta)
      );
    } else {
      // The handle sits on the set's leading edge, so dragging it left pulls
      // the start of the walk earlier and lengthens the transition.
      formationDrag.draftTransitionBeats = Math.max(
        0,
        Math.round(formationDrag.initialTransitionBeats - beatDelta)
      );
    }
  }

  function commitFormationDrag(): void {
    if (!formationDrag) return;
    if (didFormationDrag) {
      if (formationDrag.mode === "move") {
        stageState.moveFormation(
          formationDrag.formationId,
          formationDrag.draftAtBeat
        );
      } else {
        stageState.setFormationTransitionBeats(
          formationDrag.formationId,
          formationDrag.draftTransitionBeats
        );
      }
    }
    stageState.endDrag();
    formationDrag = null;
  }

  function selectFloorTravel(segment: StageFloorTravelSegment): void {
    editMode.selectTravel(segment.formationId, segment.performerId);
  }

  function beginFloorTravelDrag(
    event: PointerEvent,
    segment: StageFloorTravelSegment,
    mode: FloorTravelHandle
  ): void {
    if (event.button !== 0 || segment.distanceMeters < 0.01) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    selectFloorTravel(segment);
    floorTravelDrag = {
      segmentId: segment.id,
      formationId: segment.formationId,
      performerId: segment.performerId,
      mode,
      pointerStartX: event.clientX,
      initialStartBeat: segment.startBeat,
      initialEndBeat: segment.endBeat,
      minimumStartBeat: segment.minimumStartBeat,
      maximumEndBeat: segment.maximumEndBeat,
      historyStarted: false,
    };
  }

  function updateFloorTravelDrag(event: PointerEvent): void {
    if (!floorTravelDrag) return;
    const pixelsMoved = event.clientX - floorTravelDrag.pointerStartX;
    if (Math.abs(pixelsMoved) <= 3) return;
    if (!floorTravelDrag.historyStarted) {
      stageState.beginDrag();
      floorTravelDrag.historyStarted = true;
    }

    const beatDelta =
      Math.round((pixelsMoved / effectivePixelsPerBeat) * 4) / 4;
    const duration =
      floorTravelDrag.initialEndBeat - floorTravelDrag.initialStartBeat;
    let departureBeat = floorTravelDrag.initialStartBeat;
    let arrivalBeat = floorTravelDrag.initialEndBeat;

    if (floorTravelDrag.mode === "move") {
      departureBeat = Math.min(
        floorTravelDrag.maximumEndBeat - duration,
        Math.max(
          floorTravelDrag.minimumStartBeat,
          floorTravelDrag.initialStartBeat + beatDelta
        )
      );
      arrivalBeat = departureBeat + duration;
    } else if (floorTravelDrag.mode === "departure") {
      departureBeat = Math.min(
        arrivalBeat - 0.25,
        Math.max(
          floorTravelDrag.minimumStartBeat,
          floorTravelDrag.initialStartBeat + beatDelta
        )
      );
    } else {
      arrivalBeat = Math.max(
        departureBeat + 0.25,
        Math.min(
          floorTravelDrag.maximumEndBeat,
          floorTravelDrag.initialEndBeat + beatDelta
        )
      );
    }

    stageState.updatePerformerTravelTiming(
      floorTravelDrag.formationId,
      floorTravelDrag.performerId,
      departureBeat,
      arrivalBeat
    );
  }

  function commitFloorTravelDrag(): void {
    stageState.endDrag();
    floorTravelDrag = null;
  }

  onDestroy(() => {
    if (drag) commitClipDrag();
    if (formationDrag) commitFormationDrag();
    if (floorTravelDrag) commitFloorTravelDrag();
  });

  function handleFloorTravelKeydown(
    event: KeyboardEvent,
    segment: StageFloorTravelSegment,
    mode: FloorTravelHandle
  ): void {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      selectFloorTravel(segment);
      onDeleteSelection({
        kind: "travel",
        formationId: segment.formationId,
        performerId: segment.performerId,
      });
      return;
    }

    const smaller = event.shiftKey ? 1 : 0.25;
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? smaller
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -smaller
          : event.key === "PageUp"
            ? 4
            : event.key === "PageDown"
              ? -4
              : null;
    const isBoundary = event.key === "Home" || event.key === "End";
    if (delta === null && !isBoundary) return;
    event.preventDefault();
    event.stopPropagation();
    selectFloorTravel(segment);

    const duration = segment.endBeat - segment.startBeat;
    let departureBeat = segment.startBeat;
    let arrivalBeat = segment.endBeat;
    if (mode === "move") {
      departureBeat =
        event.key === "Home"
          ? segment.minimumStartBeat
          : event.key === "End"
            ? segment.maximumEndBeat - duration
            : Math.min(
                segment.maximumEndBeat - duration,
                Math.max(segment.minimumStartBeat, segment.startBeat + delta!)
              );
      arrivalBeat = departureBeat + duration;
    } else if (mode === "departure") {
      departureBeat =
        event.key === "Home"
          ? segment.minimumStartBeat
          : event.key === "End"
            ? segment.endBeat - 0.25
            : Math.min(
                segment.endBeat - 0.25,
                Math.max(segment.minimumStartBeat, segment.startBeat + delta!)
              );
    } else {
      arrivalBeat =
        event.key === "Home"
          ? segment.startBeat + 0.25
          : event.key === "End"
            ? segment.maximumEndBeat
            : Math.max(
                segment.startBeat + 0.25,
                Math.min(segment.maximumEndBeat, segment.endBeat + delta!)
              );
    }
    stageState.beginDrag();
    stageState.updatePerformerTravelTiming(
      segment.formationId,
      segment.performerId,
      departureBeat,
      arrivalBeat
    );
    stageState.endDrag();
  }

  function adjustSelectedStepCount(delta: number): void {
    const segment = selectedFloorTravel;
    const range = segment?.supportedStepRange;
    if (!segment || !range) return;
    const current =
      segment.requestedStepCount ?? segment.resolvedStepCount ?? range.min;
    stageState.setPerformerTravelStepCount(
      segment.formationId,
      segment.performerId,
      Math.min(range.max, Math.max(range.min, current + delta))
    );
  }

  function handleFormationKeydown(
    event: KeyboardEvent,
    formation: Formation,
    index: number
  ): void {
    if (index > 0 && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      event.stopPropagation();
      onDeleteSelection({ kind: "formation", formationId: formation.id });
      return;
    }
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      editMode.selectFormation(formation.id);
      return;
    }
    if (
      index > 0 &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      stageState.moveFormation(
        formation.id,
        formation.atBeat + direction * (event.shiftKey ? 4 : 1)
      );
      return;
    }
  }

  function handleClipKeydown(
    event: KeyboardEvent,
    performer: Performer,
    clip: StageSequenceClip
  ): void {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      onDeleteSelection({
        kind: "clip",
        performerId: performer.id,
        clipId: clip.id,
      });
      return;
    }
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      editMode.selectClip(performer.id, clip.id);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      stageState.moveSequenceClip(
        clip.id,
        clip.startBeat + direction * (event.shiftKey ? 4 : 0.25)
      );
      return;
    }
  }
</script>

<svelte:window
  onpointermove={(event) => {
    updateClipDrag(event);
    updateFormationDrag(event);
    updateFloorTravelDrag(event);
  }}
  onpointerup={() => {
    commitClipDrag();
    commitFormationDrag();
    commitFloorTravelDrag();
  }}
  onpointercancel={() => {
    commitClipDrag();
    commitFormationDrag();
    commitFloorTravelDrag();
  }}
/>

<section
  class="stage-timeline"
  class:dock={mode === "dock"}
  aria-label="Performance timeline"
>
  <header class="timeline-toolbar">
    <div class="timeline-title">
      {#if mode === "dock"}
        <span
          class="timeline-label"
          transition:growFade={{ duration: DURATION.fast, axis: "x" }}
          >Performance</span
        >
      {/if}
      <strong
        >Count {stageState.currentBeat.toFixed(1)} / {Math.round(
          stageState.maxTotalBeats
        )}</strong
      >
      {#if mode === "editor"}
        <div class="timeline-lens-control">
          <SegmentedControl
            options={TIMELINE_LENSES}
            value={timelineLens}
            onchange={(value) => (timelineLens = value)}
            size="sm"
            density="tight"
            color="accent"
            semantics="radiogroup"
            ariaLabel="Timeline view"
          />
        </div>
      {/if}
      {#if mode === "dock"}
        <span
          class="timeline-summary"
          transition:growFade={{ duration: DURATION.fast, axis: "x" }}
          >{choreography.performers.length} performer{choreography.performers
            .length === 1
            ? ""
            : "s"} · {choreography.formations.length} set{choreography
            .formations.length === 1
            ? ""
            : "s"}</span
        >
      {/if}
    </div>

    <TransportControls
      isPlaying={stageState.isPlaying}
      onPlaybackToggle={() => stageState.togglePlay()}
      onRestartToStart={() => stageState.seek(0)}
    />

    <div class="timeline-tools">
      <TempoControl
        bpm={choreography.bpm}
        onBpmChange={(nextBpm) => stageState.setBpm(nextBpm)}
        showPresets={false}
        showPractice={false}
        presetsMode="popover"
      />
      <button
        type="button"
        class="timeline-disclosure"
        aria-expanded={mode === "editor"}
        aria-controls="stage-timeline-editor"
        aria-label={mode === "dock"
          ? "Open choreography editor"
          : "Collapse choreography editor"}
        onclick={mode === "dock" ? onExpand : onCollapse}
      >
        <Crossfade key={mode} duration={DURATION.fast}>
          <span class="disclosure-content">
            <i
              class="fas {mode === 'dock'
                ? 'fa-wave-square'
                : 'fa-chevron-down'}"
              aria-hidden="true"
            ></i>
            <span>{mode === "dock" ? "Choreograph" : "Collapse"}</span>
          </span>
        </Crossfade>
      </button>
    </div>
  </header>

  {#if mode === "editor" && timelineLens === "floor" && selectedFloorTravel}
    {@const selectedPerformer = choreography.performers.find(
      (performer) => performer.id === selectedFloorTravel?.performerId
    )}
    <div
      class="floor-travel-editor"
      transition:growFade={{ duration: DURATION.emphasis, axis: "y" }}
      aria-label="Travel timing for performer {selectedPerformer?.label ??
        ''} into {selectedFloorTravel.label}"
    >
      <div class="travel-editor-summary">
        <span
          class="travel-editor-performer"
          style:--performer-color={selectedPerformer?.color}
          >{selectedPerformer?.label}</span
        >
        <span>
          <strong>Into {selectedFloorTravel.label}</strong>
          <span class="travel-editor-help">
            Drag the bar to move the trip. Drag either end to change departure
            or arrival.
          </span>
        </span>
      </div>

      <dl class="travel-timing-readout">
        <div>
          <dt>Leave</dt>
          <dd>{selectedFloorTravel.startBeat}</dd>
        </div>
        <div>
          <dt>Arrive</dt>
          <dd>{selectedFloorTravel.endBeat}</dd>
        </div>
      </dl>

      <div class="step-editor">
        <span class="step-label">Steps</span>
        <button
          type="button"
          class:auto-active={selectedFloorTravel.requestedStepCount === null}
          aria-pressed={selectedFloorTravel.requestedStepCount === null}
          onclick={() =>
            stageState.setPerformerTravelStepCount(
              selectedFloorTravel!.formationId,
              selectedFloorTravel!.performerId,
              null
            )}>Auto</button
        >
        <button
          type="button"
          aria-label="Use one fewer step"
          disabled={!selectedFloorTravel.supportedStepRange ||
            (selectedFloorTravel.requestedStepCount ??
              selectedFloorTravel.resolvedStepCount ??
              0) <= selectedFloorTravel.supportedStepRange.min}
          onclick={() => adjustSelectedStepCount(-1)}
          ><i class="fas fa-minus" aria-hidden="true"></i></button
        >
        <output aria-live="polite">
          {selectedFloorTravel.requestedStepCount ??
            selectedFloorTravel.resolvedStepCount ??
            "—"}
        </output>
        <button
          type="button"
          aria-label="Use one more step"
          disabled={!selectedFloorTravel.supportedStepRange ||
            (selectedFloorTravel.requestedStepCount ??
              selectedFloorTravel.resolvedStepCount ??
              0) >= selectedFloorTravel.supportedStepRange.max}
          onclick={() => adjustSelectedStepCount(1)}
          ><i class="fas fa-plus" aria-hidden="true"></i></button
        >
        <span
          class="step-status"
          class:unsupported={!selectedFloorTravel.exact}
        >
          {#if selectedFloorTravel.distanceMeters < 0.01}
            No travel
          {:else if selectedFloorTravel.supportedStepRange}
            Supported: {selectedFloorTravel.supportedStepRange
              .min}–{selectedFloorTravel.supportedStepRange.max}
          {:else}
            Adjust the timing to make an exact walk possible
          {/if}
        </span>
      </div>
    </div>
  {/if}

  {#if mode === "editor"}
    <div
      id="stage-timeline-editor"
      class="timeline-scroll"
      bind:clientWidth={timelineViewportWidth}
      transition:flyFade={{ duration: DURATION.emphasis, y: 8 }}
    >
      <div
        class="timeline-grid"
        bind:this={timelineGridElement}
        style:--timeline-width="{Math.max(
          720,
          maxBeats * effectivePixelsPerBeat
        )}px"
      >
        <div class="ruler-label" aria-hidden="true">
          <Crossfade key={timelineLens} fill>
            <span class="ruler-label-content">{timelineLens}</span>
          </Crossfade>
        </div>
        <div
          class="ruler"
          onpointerdown={seekFromPointer}
          role="group"
          aria-label="Count ruler. Click to move the playhead."
        >
          <TimeRuler
            duration={maxBeats}
            pixelsPerSecond={effectivePixelsPerBeat}
            tickInterval={1}
            formatLabel={(beat) => `${Math.round(beat)}`}
          />
          <div
            class="ruler-playhead"
            style:left="{stageState.currentBeat * effectivePixelsPerBeat}px"
          ></div>
        </div>

        <div class="formation-label context-label">
          <Crossfade key={timelineLens} fill>
            <div class="context-label-content">
              <span class="formation-label-text">
                {timelineLens === "hands"
                  ? "NOW"
                  : timelineLens === "floor"
                    ? "SETS"
                    : "SPEED"}
              </span>
              {#if timelineLens === "floor"}
                <button
                  type="button"
                  class="add-formation"
                  onclick={addFormationAtPlayhead}
                  aria-label="Add a set at the playhead"
                  title="Add a set at the playhead"
                >
                  <i class="fas fa-plus" aria-hidden="true"></i>
                </button>
              {:else if timelineLens === "hands"}
                <span class="context-label-glyph" title="Hand sequence">
                  <i class="fas fa-hands" aria-hidden="true"></i>
                </span>
              {:else}
                <span class="context-unit">m/s</span>
              {/if}
            </div>
          </Crossfade>
        </div>

        <div
          class="formation-track context-track"
          style="--pixels-per-beat: {effectivePixelsPerBeat}px"
          onpointerdown={seekFromPointer}
          role={timelineLens === "floor" ? "listbox" : "group"}
          aria-label={timelineLens === "hands"
            ? "Hands view guide"
            : timelineLens === "floor"
              ? "Formation sets. Each block is a held set; the ramp before it is the walk into that set."
              : "Floor speed guide"}
          tabindex="-1"
        >
          <div
            class="context-layer hands-context"
            class:active={timelineLens === "hands"}
            aria-hidden={timelineLens !== "hands"}
          >
            <span class="view-guide-icon"><i class="fas fa-sparkles"></i></span>
            <span>
              <strong>Follow the glow.</strong>
              Each tile is one hand movement in the sequence.
            </span>
          </div>

          <div
            class="context-layer floor-context"
            class:active={timelineLens === "floor"}
            aria-hidden={timelineLens !== "floor"}
            inert={timelineLens !== "floor"}
          >
            {#each choreography.formations as formation, index (formation.id)}
              {@const beat = formationBeat(formation)}
              {@const transition = formationTransition(formation)}
              {@const hold = formationHoldBeats(index)}
              {@const selected = editMode.selectedFormationId === formation.id}
              {#if hold > 0}
                <div
                  class="formation-hold"
                  class:selected
                  style="left: {beat * effectivePixelsPerBeat}px; width: {hold *
                    effectivePixelsPerBeat}px"
                  aria-hidden="true"
                ></div>
              {/if}
              {#if transition > 0}
                <div
                  class="formation-ramp"
                  class:selected
                  style="left: {(beat - transition) *
                    effectivePixelsPerBeat}px; width: {transition *
                    effectivePixelsPerBeat}px"
                  aria-hidden="true"
                ></div>
              {/if}
              <div
                class="formation-block"
                data-keyboard-shortcuts-ignore
                data-stage-formation-id={formation.id}
                class:selected
                class:dragging={formationDrag?.formationId === formation.id}
                style="left: {beat * effectivePixelsPerBeat}px"
                role="option"
                aria-selected={selected}
                tabindex="0"
                onkeydown={(event) =>
                  handleFormationKeydown(event, formation, index)}
              >
                {#if index > 0}
                  <button
                    type="button"
                    class="transition-handle"
                    onpointerdown={(event) =>
                      beginFormationDrag(event, formation, "transition")}
                    aria-label="Change the walk into {formationName(
                      formation,
                      index
                    )}, currently {formation.transitionBeats} counts"
                    title="Drag to change how many counts the walk takes"
                  ></button>
                {/if}
                <button
                  type="button"
                  class="formation-body"
                  onpointerdown={(event) => {
                    if (index === 0) return;
                    beginFormationDrag(event, formation, "move");
                  }}
                  onclick={() => {
                    if (didFormationDrag) {
                      didFormationDrag = false;
                      return;
                    }
                    editMode.selectFormation(formation.id);
                  }}
                  aria-label="{formationName(
                    formation,
                    index
                  )}, in place on count {formation.atBeat}{index > 0
                    ? `, ${formation.transitionBeats} counts to get there`
                    : ''}"
                >
                  <span class="formation-name">
                    {formationName(formation, index)}
                  </span>
                  <span class="formation-count">{beat}</span>
                </button>
                {#if selected && index > 0}
                  <button
                    type="button"
                    class="formation-action"
                    transition:popIn={{ duration: DURATION.fast }}
                    aria-label="Remove {formationName(formation, index)}"
                    title="Remove"
                    onpointerdown={(event) => event.stopPropagation()}
                    onclick={(event) => {
                      event.stopPropagation();
                      onDeleteSelection({
                        kind: "formation",
                        formationId: formation.id,
                      });
                    }}
                  >
                    <i class="fas fa-trash" aria-hidden="true"></i>
                  </button>
                {/if}
              </div>
            {/each}
          </div>

          <div
            class="context-layer motion-context"
            class:active={timelineLens === "motion"}
            aria-hidden={timelineLens !== "motion"}
          >
            <span class="view-guide-icon"
              ><i class="fas fa-chart-line"></i></span
            >
            <span>
              <strong>Floor speed · metres per second.</strong>
              Calculated from each formation path and its easing.
            </span>
            <span class="motion-scale">0–{maxFloorSpeed.toFixed(1)} m/s</span>
          </div>

          <div
            class="lane-playhead context-playhead"
            style:left="{stageState.currentBeat * effectivePixelsPerBeat}px"
          ></div>
        </div>

        {#each choreography.performers as performer (performer.id)}
          <div
            class="lane-label"
            data-performer-row-label={performer.id}
            class:selected={editMode.selectedPerformerId === performer.id}
            style:--performer-color={performer.color}
          >
            <button
              type="button"
              class="performer-select"
              data-stage-performer-id={performer.id}
              onclick={(event) =>
                editMode.selectPerformer(
                  performer.id,
                  event.shiftKey || event.ctrlKey || event.metaKey
                )}
              aria-pressed={editMode.multiSelectedPerformerIds.has(
                performer.id
              )}
            >
              <span>{performer.label}</span>
            </button>
            <div class="lane-trailing">
              <Crossfade key={timelineLens} fill>
                {#if timelineLens === "hands"}
                  <button
                    type="button"
                    class="add-sequence"
                    onclick={() => openPicker(performer.id)}
                    aria-label="Add sequence for performer {performer.label}"
                    title="Add sequence"
                  >
                    <i class="fas fa-plus" aria-hidden="true"></i>
                  </button>
                {:else if timelineLens === "floor"}
                  <span class="lane-mode-glyph" title="Floor path">
                    <i class="fas fa-route" aria-hidden="true"></i>
                  </span>
                {:else}
                  <span class="current-speed">
                    <strong
                      >{(
                        currentFrameByPerformer.get(performer.id)
                          ?.speedMetersPerSecond ?? 0
                      ).toFixed(1)}</strong
                    >
                    <span>m/s</span>
                  </span>
                {/if}
              </Crossfade>
            </div>
          </div>

          <div
            class="sequence-lane"
            data-performer-row-lane={performer.id}
            class:selected={editMode.selectedPerformerId === performer.id}
            data-lens={timelineLens}
            style="--performer-color: {performer.color}; --pixels-per-beat: {effectivePixelsPerBeat}px"
            onpointerdown={seekFromPointer}
            role="group"
            aria-label="Performer {performer.label} {timelineLens} lane"
          >
            <div
              class="lens-layer hands-layer"
              class:active={timelineLens === "hands"}
              aria-hidden={timelineLens !== "hands"}
              inert={timelineLens !== "hands"}
            >
              {#if performer.sequenceClips.length === 0}
                <button
                  type="button"
                  class="lane-add-hint"
                  transition:flyFade={{ duration: DURATION.normal, x: 6, y: 0 }}
                  onpointerdown={(event) => event.stopPropagation()}
                  onclick={() => openPicker(performer.id)}
                >
                  <i class="fas fa-plus" aria-hidden="true"></i>
                  Add sequence
                </button>
              {/if}
              {#each performer.sequenceClips as clip (clip.id)}
                <div
                  class="sequence-clip"
                  data-keyboard-shortcuts-ignore
                  class:selected={editMode.selectedClipId === clip.id}
                  class:active={activeClipIds.has(clip.id)}
                  class:dragging={drag?.clipId === clip.id}
                  style="left: {clipStart(clip) *
                    effectivePixelsPerBeat}px; width: {Math.max(
                    28,
                    clipDuration(clip) * effectivePixelsPerBeat
                  )}px"
                  role="option"
                  aria-selected={editMode.selectedClipId === clip.id}
                  tabindex="0"
                  onkeydown={(event) =>
                    handleClipKeydown(event, performer, clip)}
                >
                  <StageHandsClipContent
                    title={clipDisplayLabel(clip)}
                    sequence={sequenceForClip(clip)}
                    activeStepIndex={activeStepIndex(performer, clip)}
                    loop={clip.loop}
                  />
                  <button
                    type="button"
                    class="clip-body"
                    onpointerdown={(event) =>
                      beginClipDrag(event, clip, "move")}
                    onclick={(event) => selectClip(event, performer, clip)}
                    aria-label="{clipDisplayLabel(
                      clip
                    )}, starts at beat {clip.startBeat}, lasts {clip.durationBeats} beats"
                  >
                    <span class="clip-name">{clipDisplayLabel(clip)}</span>
                  </button>
                  {#if editMode.selectedClipId === clip.id}
                    <button
                      type="button"
                      class="clip-action"
                      transition:popIn={{ duration: DURATION.fast }}
                      class:active={clip.loop}
                      aria-pressed={clip.loop}
                      aria-label="Loop {clipDisplayLabel(clip)}"
                      title="Loop"
                      onpointerdown={(event) => event.stopPropagation()}
                      onclick={(event) => {
                        event.stopPropagation();
                        stageState.toggleSequenceClipLoop(clip.id);
                      }}
                    >
                      <i class="fas fa-repeat" aria-hidden="true"></i>
                    </button>
                    <button
                      type="button"
                      class="clip-action delete-clip"
                      transition:popIn={{ duration: DURATION.fast }}
                      aria-label="Remove {clipDisplayLabel(clip)}"
                      title="Remove"
                      onpointerdown={(event) => event.stopPropagation()}
                      onclick={(event) => {
                        event.stopPropagation();
                        onDeleteSelection({
                          kind: "clip",
                          performerId: performer.id,
                          clipId: clip.id,
                        });
                      }}
                    >
                      <i class="fas fa-trash" aria-hidden="true"></i>
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="resize-handle"
                    onpointerdown={(event) =>
                      beginClipDrag(event, clip, "resize")}
                    aria-label="Resize {clipDisplayLabel(clip)}"
                    title="Drag to change duration"
                  ></button>
                </div>
              {/each}
            </div>

            <div
              class="lens-layer floor-layer"
              class:active={timelineLens === "floor"}
              aria-hidden={timelineLens !== "floor"}
            >
              <StageFloorLane
                segments={floorTravelByPerformer.get(performer.id) ?? []}
                currentBeat={stageState.currentBeat}
                pixelsPerBeat={effectivePixelsPerBeat}
                selectedSegmentId={selectedFloorTravel?.performerId ===
                performer.id
                  ? selectedFloorTravel.id
                  : null}
                draggingSegmentId={floorTravelDrag?.segmentId ?? null}
                interactive={timelineLens === "floor"}
                onSelect={selectFloorTravel}
                onPointerStart={beginFloorTravelDrag}
                onKeyAdjust={handleFloorTravelKeydown}
              />
            </div>

            <div
              class="lens-layer motion-layer"
              class:active={timelineLens === "motion"}
              aria-hidden={timelineLens !== "motion"}
            >
              <StageMotionLane
                samples={floorSpeedByPerformer.get(performer.id) ?? []}
                currentBeat={stageState.currentBeat}
                currentSpeed={currentFrameByPerformer.get(performer.id)
                  ?.speedMetersPerSecond ?? 0}
                maxBeat={maxBeats}
                maxSpeed={maxFloorSpeed}
                pixelsPerBeat={effectivePixelsPerBeat}
              />
            </div>

            <div
              class="lane-playhead"
              style:left="{stageState.currentBeat * effectivePixelsPerBeat}px"
            ></div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</section>

<SequencePickerModal
  open={pickerOpen}
  title={pickerPerformerId
    ? `Add a sequence to performer ${choreography.performers.find((performer) => performer.id === pickerPerformerId)?.label ?? ""}`
    : "Add sequence"}
  onSelect={selectSequence}
  onClose={() => (pickerOpen = false)}
/>

<style>
  .stage-timeline {
    display: flex;
    height: 100%;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: color-mix(in srgb, var(--theme-panel-bg, #10111a) 94%, black);
    color: var(--theme-text, white);
  }

  .stage-timeline.dock {
    background:
      linear-gradient(
        90deg,
        color-mix(in srgb, var(--theme-accent) 8%, transparent),
        transparent 42%
      ),
      color-mix(in srgb, var(--theme-panel-bg, #10111a) 92%, black);
    box-shadow: 0 -0.75rem 2rem rgba(0, 0, 0, 0.26);
  }

  .timeline-toolbar {
    display: grid;
    min-height: 3.75rem;
    flex: 0 0 auto;
    grid-template-columns: minmax(10rem, 1fr) auto minmax(10rem, 1fr);
    align-items: center;
    gap: 0.75rem;
    padding: 0.4rem 0.65rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.035));
  }

  .timeline-title,
  .timeline-tools {
    display: flex;
    align-items: center;
  }

  .timeline-title {
    min-width: 0;
    gap: 0.5rem;
    font-size: var(--font-size-min, 0.875rem);
  }

  .timeline-lens-control {
    width: min(15rem, calc(100% - 6rem));
    min-width: 11rem;
    flex: 0 1 15rem;
  }

  .timeline-lens-control :global(.segmented-control) {
    width: 100%;
  }

  .timeline-label {
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 750;
  }

  .timeline-title strong {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
  }

  .timeline-summary {
    overflow: hidden;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 0.75rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .timeline-tools {
    position: relative;
    min-width: 0;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .timeline-disclosure {
    display: inline-flex;
    width: auto;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    padding: 0.45rem 0.8rem;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.16));
    border-radius: 0.7rem;
    background: color-mix(
      in srgb,
      var(--theme-accent) 12%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    color: var(--theme-text, white);
    cursor: pointer;
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    white-space: nowrap;
  }

  .disclosure-content {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
  }

  .timeline-disclosure:hover,
  .timeline-disclosure:focus-visible {
    border-color: var(--theme-accent);
    background: color-mix(
      in srgb,
      var(--theme-accent) 20%,
      var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08))
    );
  }

  /* TempoControl's inline popover would grow the toolbar row; float it below
     the control instead so opening it never reflows the timeline. */
  .timeline-tools :global(.tempo-wrapper) {
    position: relative;
    width: auto;
  }

  .timeline-tools :global(.tempo-control) {
    width: auto;
  }

  .timeline-tools :global(.bpm-popover) {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    z-index: 30;
    min-width: 15rem;
    background: color-mix(in srgb, var(--theme-panel-bg, #12121c) 96%, white);
  }

  .floor-travel-editor {
    display: grid;
    min-height: 4.25rem;
    flex: 0 0 auto;
    grid-template-columns: minmax(15rem, 1fr) auto minmax(25rem, auto);
    align-items: center;
    gap: 1rem;
    padding: 0.55rem 0.75rem;
    overflow-x: auto;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: color-mix(
      in srgb,
      var(--theme-accent) 7%,
      var(--theme-panel-bg, #10111a)
    );
  }

  .travel-editor-summary {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.65rem;
    font-size: 1rem;
  }

  .travel-editor-summary > span:last-child {
    display: grid;
    min-width: 0;
    gap: 0.15rem;
  }

  .travel-editor-performer {
    display: grid;
    width: 2.25rem;
    height: 2.25rem;
    flex: 0 0 auto;
    place-items: center;
    border: 2px solid var(--performer-color);
    border-radius: 999px;
    color: var(--performer-color);
    font-weight: 800;
  }

  .travel-editor-help {
    overflow: hidden;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    font-size: 0.9375rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .travel-timing-readout {
    display: flex;
    margin: 0;
    gap: 0.45rem;
  }

  .travel-timing-readout div {
    display: grid;
    min-width: 4.5rem;
    place-items: center;
    padding: 0.25rem 0.55rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.65rem;
    background: rgba(0, 0, 0, 0.18);
  }

  .travel-timing-readout dt,
  .step-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    font-size: 0.875rem;
    font-weight: 700;
  }

  .travel-timing-readout dd {
    margin: 0;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    font-weight: 800;
  }

  .step-editor {
    display: flex;
    min-width: max-content;
    align-items: center;
    justify-content: flex-end;
    gap: 0.35rem;
  }

  .step-editor button {
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    padding: 0.35rem 0.65rem;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    border-radius: 0.65rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, white);
    cursor: pointer;
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 750;
    transition:
      border-color var(--duration-fast) ease,
      background-color var(--duration-fast) ease,
      opacity var(--duration-fast) ease;
  }

  .step-editor button:hover:not(:disabled),
  .step-editor button:focus-visible,
  .step-editor button.auto-active {
    border-color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
  }

  .step-editor button:disabled {
    cursor: not-allowed;
    opacity: 0.38;
  }

  .step-editor output {
    min-width: 2rem;
    text-align: center;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    font-weight: 850;
  }

  .step-status {
    max-width: 11rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    font-size: 0.875rem;
    line-height: 1.25;
  }

  .step-status.unsupported {
    color: var(--theme-warning, #f6c85f);
  }

  .timeline-scroll {
    min-width: 0;
    min-height: 0;
    flex: 1;
    overflow: auto;
    scrollbar-color: var(--theme-stroke-strong, #4b5563) transparent;
  }

  .timeline-grid {
    display: grid;
    width: max-content;
    min-width: 100%;
    min-height: min-content;
    /* The track column is at least the beat scale wide and takes whatever
       else is going, so a chip sitting on the final count has somewhere to be
       drawn instead of being clipped by the lane it ends. */
    grid-template-columns: 7rem minmax(var(--timeline-width), 1fr);
    grid-auto-rows: var(--stage-timeline-lane-size, 3.5rem);
    /* 3.5rem keeps the set chip's 2.75rem touch target intact inside its
       0.35rem inset, and matches the performer lane height. */
    grid-template-rows:
      var(--stage-timeline-ruler-size, 2.25rem)
      var(--stage-timeline-lane-size, 3.5rem);
  }

  .ruler-label,
  .formation-label,
  .lane-label {
    position: sticky;
    left: 0;
    z-index: 6;
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    background: #11131c;
  }

  .ruler-label,
  .ruler {
    position: sticky;
    top: 0;
    z-index: 7;
  }

  .ruler-label {
    display: flex;
    align-items: center;
    padding: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.42));
    font-size: 0.75rem;
    font-weight: 750;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .ruler-label-content {
    display: flex;
    height: 100%;
    align-items: center;
    padding: 0 0.75rem;
  }

  .ruler {
    height: 2.25rem;
    overflow: hidden;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: #11131c;
    cursor: pointer;
  }

  .ruler-playhead,
  .lane-playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 5;
    width: 2px;
    background: var(--semantic-warning, #f59e0b);
    box-shadow: 0 0 0.6rem color-mix(in srgb, #f59e0b 65%, transparent);
    pointer-events: none;
  }

  .lane-label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.45rem;
  }

  .lane-label.selected {
    background: color-mix(in srgb, var(--performer-color) 12%, #11131c);
  }

  .performer-select {
    display: flex;
    min-width: 0;
    min-height: 2.75rem;
    flex: 1;
    align-items: center;
    gap: 0.55rem;
    border: 0;
    border-radius: 0.6rem;
    background: transparent;
    color: var(--theme-text, white);
    cursor: pointer;
    text-align: left;
  }

  .performer-select > span {
    display: grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    flex: 0 0 auto;
    border: 1px solid var(--performer-color);
    border-radius: 999px;
    color: var(--performer-color);
    font-weight: 800;
  }

  .add-sequence {
    display: grid;
    width: 2.75rem;
    height: 2.75rem;
    place-items: center;
    flex: 0 0 auto;
    border: 1px solid
      color-mix(in srgb, var(--performer-color) 42%, transparent);
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--performer-color) 10%, transparent);
    color: var(--performer-color);
    cursor: pointer;
  }

  .lane-trailing {
    position: relative;
    width: 2.75rem;
    height: 2.75rem;
    flex: 0 0 auto;
  }

  .lane-mode-glyph,
  .current-speed {
    display: grid;
    width: 2.75rem;
    height: 2.75rem;
    place-items: center;
    border: 1px solid
      color-mix(in srgb, var(--performer-color) 35%, transparent);
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--performer-color) 8%, transparent);
    color: var(--performer-color);
  }

  .current-speed {
    align-content: center;
    gap: 0.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .current-speed strong {
    font-size: var(--font-size-min, 0.875rem);
  }

  .current-speed span {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
  }

  .formation-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.35rem;
    padding: 0.3rem 0.45rem;
    /* Deliberately NOT --theme-accent: the themed accent collides with the
       performer clip colours and makes the spine read as a fifth lane. */
    --formation-accent: #7cd4e8;
  }

  .context-label {
    padding: 0;
  }

  .context-label-content {
    display: flex;
    height: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 0.35rem;
    padding: 0.3rem 0.45rem;
  }
  .formation-label-text {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.42));
    font-size: 0.75rem;
    font-weight: 750;
    letter-spacing: 0.1em;
  }
  .add-formation {
    display: grid;
    width: 2.75rem;
    height: 2.75rem;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid
      color-mix(in srgb, var(--formation-accent) 42%, transparent);
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--formation-accent) 10%, transparent);
    color: var(--formation-accent);
    cursor: pointer;
  }

  .context-label-glyph,
  .context-unit {
    display: grid;
    width: 2.75rem;
    height: 2.75rem;
    place-items: center;
    border: 1px solid
      color-mix(in srgb, var(--formation-accent) 38%, transparent);
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--formation-accent) 8%, transparent);
    color: var(--formation-accent);
  }

  .context-unit {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
  }
  .formation-track {
    position: relative;
    overflow: hidden;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background:
      repeating-linear-gradient(
        90deg,
        transparent 0,
        transparent calc(var(--pixels-per-beat) - 1px),
        rgba(255, 255, 255, 0.06) calc(var(--pixels-per-beat) - 1px),
        rgba(255, 255, 255, 0.06) var(--pixels-per-beat)
      ),
      color-mix(in srgb, var(--theme-panel-bg, #0c0d14) 88%, black);
    background-size:
      var(--timeline-width) 100%,
      100% 100%;
    background-repeat: no-repeat;
    /* Deliberately NOT --theme-accent: the themed accent collides with the
       performer clip colours and makes the spine read as a fifth lane. */
    --formation-accent: #7cd4e8;
  }

  .context-track {
    position: relative;
  }

  /* These layers stay mounted because the Hands view owns prepared pictographs
     and the timeline owns selection/drag state. Remounting them through the
     keyed Crossfade primitive would discard that work on every lens switch.
     The parent row fixes the geometry; opacity communicates the change without
     allowing either view to move the rows around it. */
  .context-layer,
  .lens-layer {
    position: absolute;
    inset: 0;
    min-width: 0;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity var(--duration-normal, 240ms) ease,
      visibility 0s linear var(--duration-normal, 240ms);
  }

  .context-layer.active,
  .lens-layer.active {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transition-delay: 0s;
  }

  .hands-context,
  .motion-context {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0 0.85rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .hands-context strong,
  .motion-context strong {
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 0.875rem);
  }

  .view-guide-icon {
    display: grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 999px;
    background: color-mix(in srgb, var(--formation-accent) 14%, transparent);
    color: var(--formation-accent);
  }

  .motion-scale {
    display: grid;
    width: 7rem;
    min-width: 7rem;
    margin-left: auto;
    place-items: center;
    padding: 0.25rem 0.45rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.45rem;
    color: var(--theme-text, white);
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .context-playhead {
    z-index: 10;
  }
  /* The cast is standing still: a flat hairline rail, no travel implied. */
  .formation-hold {
    position: absolute;
    top: 50%;
    z-index: 1;
    height: 0.125rem;
    border-radius: 0.0625rem;
    background: color-mix(in srgb, var(--formation-accent) 30%, transparent);
    transform: translateY(-50%);
    pointer-events: none;
  }
  .formation-hold.selected {
    background: color-mix(in srgb, var(--formation-accent) 60%, transparent);
  }
  /* The walk into a set: a bar that thickens toward its arrowhead, so travel
     and its direction read at a glance instead of looking like a divider. */
  .formation-ramp {
    position: absolute;
    top: 50%;
    z-index: 1;
    height: 0.45rem;
    border-radius: 0.225rem 0 0 0.225rem;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--formation-accent) 10%, transparent),
      color-mix(in srgb, var(--formation-accent) 65%, transparent)
    );
    transform: translateY(-50%);
    pointer-events: none;
  }
  .formation-ramp::after {
    position: absolute;
    top: 50%;
    right: -0.05rem;
    width: 0;
    height: 0;
    border-top: 0.45rem solid transparent;
    border-bottom: 0.45rem solid transparent;
    border-left: 0.5rem solid
      color-mix(in srgb, var(--formation-accent) 65%, transparent);
    content: "";
    transform: translateY(-50%);
  }
  .formation-ramp.selected {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--formation-accent) 22%, transparent),
      var(--formation-accent)
    );
  }
  .formation-ramp.selected::after {
    border-left-color: var(--formation-accent);
  }
  /* A set is a marker anchored on its count, sized by its own label — never by
     the hold, which is often zero. The leading rule is the count it lands on. */
  .formation-block {
    position: absolute;
    top: 0.35rem;
    bottom: 0.35rem;
    z-index: 2;
    display: flex;
    min-width: 2.75rem;
    max-width: 14rem;
    border: 1px solid
      color-mix(in srgb, var(--formation-accent) 40%, transparent);
    border-left: 2px solid var(--formation-accent);
    border-radius: 0 0.45rem 0.45rem 0;
    background: color-mix(in srgb, var(--formation-accent) 14%, #0e1018);
    box-shadow: 0 0.2rem 0.6rem rgba(0, 0, 0, 0.4);
  }
  .formation-block.selected {
    outline: 2px solid white;
    outline-offset: 1px;
  }
  .formation-block.dragging {
    opacity: 0.85;
  }
  /* The walk length is dragged from the set's leading edge. The hit zone keeps
     the 44px floor the clip resize handles use, but straddles that edge instead
     of sitting in flow: a 44px slab in flow outweighs the label on a set this
     narrow. What you see is the grip below. */
  .transition-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: -1.375rem;
    width: 2.75rem;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: ew-resize;
  }
  .transition-handle::before {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 1.375rem;
    width: 0.375rem;
    background: linear-gradient(
      90deg,
      var(--formation-accent),
      color-mix(in srgb, var(--formation-accent) 15%, transparent)
    );
    content: "";
    transition: width 120ms ease;
  }
  .transition-handle:hover::before,
  .transition-handle:focus-visible::before {
    width: 0.7rem;
  }
  .formation-body {
    display: flex;
    min-width: 0;
    min-height: 2.75rem;
    flex: 1;
    align-items: center;
    justify-content: space-between;
    gap: 0.35rem;
    padding: 0 0.5rem 0 0.7rem;
    border: 0;
    background: transparent;
    color: var(--theme-text, white);
    cursor: grab;
    text-align: left;
  }
  .formation-name {
    overflow: hidden;
    /* Matches .clip-name: sets and clips are the same class of timeline label. */
    font-size: 0.75rem;
    font-weight: 750;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* A tinted chip, so "Set 1" and its count read as two things rather than as
     the string "Set 1 0". */
  .formation-count {
    flex: 0 0 auto;
    padding: 0.1rem 0.3rem;
    border-radius: 0.3rem;
    background: color-mix(in srgb, var(--formation-accent) 22%, transparent);
    color: color-mix(in srgb, var(--formation-accent) 75%, white);
    font-size: 0.75rem;
    font-weight: 750;
    /* The count changes as a set is dragged, so fix the digit width. */
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .formation-action {
    display: grid;
    width: 2.25rem;
    min-height: 2.75rem;
    flex: 0 0 auto;
    place-items: center;
    border: 0;
    border-left: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(0, 0, 0, 0.28);
    color: rgba(255, 255, 255, 0.82);
    cursor: pointer;
  }
  .sequence-lane {
    position: relative;
    container-type: inline-size;
    overflow: hidden;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    background:
      repeating-linear-gradient(
        90deg,
        transparent 0,
        transparent calc(var(--pixels-per-beat) - 1px),
        rgba(255, 255, 255, 0.06) calc(var(--pixels-per-beat) - 1px),
        rgba(255, 255, 255, 0.06) var(--pixels-per-beat)
      ),
      color-mix(in srgb, var(--theme-panel-bg, #0c0d14) 94%, black);
    background-size:
      var(--timeline-width) 100%,
      100% 100%;
    background-repeat: no-repeat;
  }

  .sequence-lane.selected {
    background-color: color-mix(
      in srgb,
      var(--performer-color) 6%,
      var(--theme-panel-bg, #0c0d14)
    );
  }

  .sequence-clip {
    position: absolute;
    top: 0.4rem;
    bottom: 0.4rem;
    z-index: 2;
    display: flex;
    min-width: 1.75rem;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--performer-color) 68%, white);
    border-radius: 0.55rem;
    background: color-mix(in srgb, var(--performer-color) 54%, #151722);
    box-shadow: 0 0.2rem 0.6rem rgba(0, 0, 0, 0.32);
  }

  .sequence-clip.selected {
    outline: 2px solid white;
    outline-offset: 1px;
  }

  .sequence-clip.active {
    box-shadow:
      0 0.2rem 0.7rem rgba(0, 0, 0, 0.4),
      0 0 1rem color-mix(in srgb, var(--performer-color) 50%, transparent);
  }

  .sequence-clip.dragging {
    z-index: 8;
    opacity: 0.9;
  }

  .clip-body {
    position: relative;
    z-index: 2;
    display: flex;
    min-width: 0;
    min-height: 2.75rem;
    flex: 1;
    align-items: center;
    gap: 0.45rem;
    padding: 0 0.75rem;
    border: 0;
    background: transparent;
    color: white;
    cursor: grab;
    text-align: left;
  }

  .clip-name {
    min-width: 0;
    overflow: hidden;
    flex: 1;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
    text-overflow: ellipsis;
    text-shadow: 0 1px 2px black;
    white-space: nowrap;
  }

  .hands-layer .clip-name {
    visibility: hidden;
  }

  .clip-action {
    position: relative;
    z-index: 3;
    display: grid;
    width: 2.25rem;
    min-height: 2.75rem;
    flex: 0 0 auto;
    place-items: center;
    border: 0;
    border-left: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(0, 0, 0, 0.28);
    color: rgba(255, 255, 255, 0.82);
    cursor: pointer;
  }

  .clip-action:hover {
    background: rgba(0, 0, 0, 0.45);
    color: white;
  }

  .clip-action.active {
    color: white;
    background: color-mix(in srgb, var(--performer-color) 55%, black);
  }

  .clip-action.delete-clip {
    color: var(--semantic-error, #f87171);
  }

  .resize-handle {
    position: relative;
    z-index: 3;
    display: grid;
    width: 1rem;
    min-height: 2.75rem;
    flex: 0 0 auto;
    place-items: center;
    border: 0;
    border-left: 1px solid rgba(255, 255, 255, 0.22);
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.28));
    cursor: ew-resize;
  }

  .resize-handle::after {
    width: 4px;
    height: 1.1rem;
    border-inline: 1.5px solid rgba(255, 255, 255, 0.8);
    content: "";
  }

  .lane-add-hint {
    position: absolute;
    top: 50%;
    left: 0.6rem;
    z-index: 3;
    display: flex;
    min-height: 2.5rem;
    align-items: center;
    gap: 0.45rem;
    padding: 0 0.85rem;
    border: 1px dashed
      color-mix(in srgb, var(--performer-color) 55%, transparent);
    border-radius: 0.55rem;
    background: color-mix(in srgb, var(--performer-color) 8%, transparent);
    color: var(--performer-color);
    cursor: pointer;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    translate: 0 -50%;
    white-space: nowrap;
  }

  .lane-add-hint:hover {
    background: color-mix(in srgb, var(--performer-color) 16%, transparent);
  }

  button:focus-visible,
  .sequence-clip:focus-visible {
    outline: 3px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }

  @media (max-width: 920px) {
    .timeline-summary {
      display: none;
    }

    .timeline-grid {
      grid-template-columns: 6rem minmax(var(--timeline-width), 1fr);
    }

    .floor-travel-editor {
      grid-template-columns: minmax(13rem, 1fr) auto auto;
    }

    .travel-editor-help,
    .step-status {
      display: none;
    }
  }

  @media (max-width: 560px) {
    /* The count is the timeline's primary readout — which beat you are on, out
       of how many. It moves onto its own line here rather than disappearing,
       because a phone is exactly where you cannot infer it from the ruler. */
    .timeline-toolbar {
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-rows: auto auto;
      row-gap: 0.3rem;
    }

    .timeline-title {
      display: flex;
      grid-column: 1 / -1;
      justify-content: center;
    }

    .timeline-disclosure {
      width: var(--min-touch-target, 44px);
      padding-inline: 0;
    }

    .timeline-disclosure span {
      display: none;
    }

    .floor-travel-editor {
      min-height: 3.75rem;
      grid-template-columns: auto auto;
      gap: 0.65rem;
    }

    .travel-timing-readout {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .context-layer,
    .lens-layer {
      transition: none;
    }
  }
</style>
