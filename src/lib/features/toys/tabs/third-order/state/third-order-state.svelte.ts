import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { IThirdOrderCompositionSampler } from "../services/contracts/IThirdOrderCompositionSampler";
import {
  THIRD_ORDER_COMPOSITION_VERSION,
  type ThirdOrderCarrierLane,
  type ThirdOrderCarrierPathMode,
  type ThirdOrderChildDraft,
  type ThirdOrderCompositionDraft,
  type ThirdOrderCompositionFrame,
  type ThirdOrderFlowerRatio,
  type ThirdOrderOrientationMode,
  type ThirdOrderSourceTarget,
  type ThirdOrderTimingMode,
} from "../domain/third-order-composition";
import type { VtgMode } from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";
import type { SpinStyle } from "@vtg/domain";
import type { ProjectedTrajectorySet } from "#lib/shared/mandala/domain/trajectory-types.js";
import {
  bakeThirdOrderTrajectories,
  type ThirdOrderPropTypes,
} from "../services/third-order-trajectories";

export type ThirdOrderMandalaMode = "off" | "trace" | "full";

type ChildId = ThirdOrderChildDraft["id"];

export interface ThirdOrderState {
  readonly composition: ThirdOrderCompositionDraft;
  readonly frame: ThirdOrderCompositionFrame;
  readonly masterBeat: number;
  readonly isPlaying: boolean;
  readonly selectedChildId: ChildId;
  readonly selectedChild: ThirdOrderChildDraft;
  readonly pickerTarget: ThirdOrderSourceTarget | null;
  readonly setupDrawerOpen: boolean;
  readonly mandalaMode: ThirdOrderMandalaMode;
  readonly showMotion: boolean;
  readonly traceComplete: boolean;
  readonly propTypes: ThirdOrderPropTypes;
  readonly trajectories: ProjectedTrajectorySet;
  setMandalaMode(mode: ThirdOrderMandalaMode): void;
  setShowMotion(show: boolean): void;
  setPropTypes(left: string, right: string): void;
  selectChild(id: ChildId): void;
  setCarrier(sequence: SequenceData): void;
  setChildSequence(id: ChildId, sequence: SequenceData): void;
  duplicateBlueToRed(): void;
  setChildLane(id: ChildId, lane: ThirdOrderCarrierLane): void;
  setChildOrientation(id: ChildId, mode: ThirdOrderOrientationMode): void;
  setChildTiming(id: ChildId, mode: ThirdOrderTimingMode): void;
  setChildRate(id: ChildId, rate: number): void;
  setChildVisible(id: ChildId, visible: boolean): void;
  setCarrierPathMode(mode: ThirdOrderCarrierPathMode): void;
  setFlowerRatio(ratio: ThirdOrderFlowerRatio): void;
  setFlowerStyle(style: SpinStyle): void;
  setFlowerStrength(strength: number): void;
  setFlowerPhase(phase: number): void;
  setFlowerRelationship(relationship: VtgMode): void;
  setShowConstruction(show: boolean): void;
  setBpm(bpm: number): void;
  setMasterBeat(beat: number): void;
  stepBy(beats: number): void;
  restart(): void;
  togglePlayback(): void;
  openPicker(target: ThirdOrderSourceTarget): void;
  closePicker(): void;
  applyPickedSequence(sequence: SequenceData): void;
  setSetupDrawerOpen(open: boolean): void;
  destroy(): void;
}

function createChild(
  id: ChildId,
  label: string,
  lane: ThirdOrderCarrierLane,
  sequence: SequenceData
): ThirdOrderChildDraft {
  return {
    id,
    label,
    lane,
    sequence,
    orientationMode: "world",
    timingMode: "phrase",
    rate: 1,
    visible: true,
  };
}

export function createThirdOrderState(
  sampler: IThirdOrderCompositionSampler,
  initialSequence: SequenceData
): ThirdOrderState {
  const composition = $state<ThirdOrderCompositionDraft>({
    version: THIRD_ORDER_COMPOSITION_VERSION,
    carrier: initialSequence,
    carrierPath: {
      mode: "flower",
      ratio: "1:3",
      style: "anti",
      strength: 1,
      phase: 0,
      relationship: "SO",
      showConstruction: true,
    },
    children: [
      createChild("grid-blue", "Blue grid", "left", initialSequence),
      createChild("grid-red", "Red grid", "right", initialSequence),
    ],
    bpm: 60,
  });
  let masterBeat = $state(0);
  let isPlaying = $state(false);
  let selectedChildId = $state<ChildId>("grid-blue");
  let pickerTarget = $state<ThirdOrderSourceTarget | null>(null);
  let setupDrawerOpen = $state(false);
  let mandalaMode = $state<ThirdOrderMandalaMode>("trace");
  let showMotion = $state(true);
  let traceComplete = $state(false);
  let propTypes = $state<ThirdOrderPropTypes>({
    left: "staff",
    right: "staff",
  });
  const trajectories = $derived(
    bakeThirdOrderTrajectories(composition, sampler, propTypes)
  );
  let frame = $state<ThirdOrderCompositionFrame>(
    sampler.sample(composition, 0)
  );
  let animationFrame = 0;
  let previousTimestamp = 0;

  function refresh(): void {
    frame = sampler.sample(composition, masterBeat);
    masterBeat = frame.masterBeat;
  }

  function updateChild(
    id: ChildId,
    update: (child: ThirdOrderChildDraft) => ThirdOrderChildDraft
  ): void {
    traceComplete = false;
    composition.children = composition.children.map((child) =>
      child.id === id ? update(child) : child
    );
    refresh();
  }

  function stopPlayback(): void {
    isPlaying = false;
    previousTimestamp = 0;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function tick(timestamp: number): void {
    if (!isPlaying) return;
    if (previousTimestamp > 0) {
      const elapsedSeconds = Math.min(
        0.1,
        (timestamp - previousTimestamp) / 1000
      );
      masterBeat += elapsedSeconds * (composition.bpm / 60);
      if (masterBeat >= frame.totalBeats) traceComplete = true;
      refresh();
    }
    previousTimestamp = timestamp;
    animationFrame = requestAnimationFrame(tick);
  }

  return {
    get mandalaMode() {
      return mandalaMode;
    },
    get showMotion() {
      return showMotion;
    },
    get traceComplete() {
      return traceComplete;
    },
    get propTypes() {
      return propTypes;
    },
    get trajectories() {
      return trajectories;
    },
    setMandalaMode(mode) {
      mandalaMode = mode;
    },
    setShowMotion(show) {
      showMotion = show;
    },
    setPropTypes(left, right) {
      if (left === propTypes.left && right === propTypes.right) return;
      propTypes = { left, right };
      traceComplete = false;
    },
    get composition() {
      return composition;
    },
    get frame() {
      return frame;
    },
    get masterBeat() {
      return masterBeat;
    },
    get isPlaying() {
      return isPlaying;
    },
    get selectedChildId() {
      return selectedChildId;
    },
    get selectedChild() {
      return composition.children.find(
        (child) => child.id === selectedChildId
      )!;
    },
    get pickerTarget() {
      return pickerTarget;
    },
    get setupDrawerOpen() {
      return setupDrawerOpen;
    },
    selectChild(id) {
      selectedChildId = id;
    },
    setCarrier(sequence) {
      traceComplete = false;
      stopPlayback();
      composition.carrier = sequence;
      masterBeat = 0;
      sampler.clear();
      refresh();
    },
    setChildSequence(id, sequence) {
      updateChild(id, (child) => ({ ...child, sequence }));
    },
    duplicateBlueToRed() {
      const blue = composition.children.find(
        (child) => child.id === "grid-blue"
      );
      if (!blue) return;
      updateChild("grid-red", (red) => ({
        ...red,
        sequence: blue.sequence,
        orientationMode: blue.orientationMode,
        timingMode: blue.timingMode,
        rate: blue.rate,
      }));
    },
    setChildLane(id, lane) {
      updateChild(id, (child) => ({ ...child, lane }));
    },
    setChildOrientation(id, orientationMode) {
      updateChild(id, (child) => ({ ...child, orientationMode }));
    },
    setChildTiming(id, timingMode) {
      updateChild(id, (child) => ({ ...child, timingMode }));
    },
    setChildRate(id, rate) {
      updateChild(id, (child) => ({ ...child, rate }));
    },
    setChildVisible(id, visible) {
      updateChild(id, (child) => ({ ...child, visible }));
    },
    setCarrierPathMode(mode) {
      traceComplete = false;
      stopPlayback();
      composition.carrierPath.mode = mode;
      masterBeat = 0;
      refresh();
    },
    setFlowerRatio(ratio) {
      traceComplete = false;
      stopPlayback();
      composition.carrierPath.ratio = ratio;
      masterBeat = 0;
      refresh();
    },
    setFlowerStyle(style) {
      traceComplete = false;
      composition.carrierPath.style = style;
      refresh();
    },
    setFlowerStrength(strength) {
      traceComplete = false;
      composition.carrierPath.strength = Math.max(0, Math.min(1, strength));
      refresh();
    },
    setFlowerPhase(phase) {
      traceComplete = false;
      composition.carrierPath.phase = ((Math.round(phase) % 8) + 8) % 8;
      refresh();
    },
    setFlowerRelationship(relationship) {
      traceComplete = false;
      composition.carrierPath.relationship = relationship;
      refresh();
    },
    setShowConstruction(show) {
      composition.carrierPath.showConstruction = show;
    },
    setBpm(bpm) {
      composition.bpm = Math.max(10, Math.min(300, bpm));
    },
    setMasterBeat(beat) {
      traceComplete = false;
      stopPlayback();
      masterBeat = beat;
      refresh();
    },
    stepBy(beats) {
      traceComplete = false;
      stopPlayback();
      masterBeat += beats;
      refresh();
    },
    restart() {
      traceComplete = false;
      stopPlayback();
      masterBeat = 0;
      refresh();
    },
    togglePlayback() {
      if (isPlaying) {
        stopPlayback();
        return;
      }
      isPlaying = true;
      previousTimestamp = 0;
      animationFrame = requestAnimationFrame(tick);
    },
    openPicker(target) {
      pickerTarget = target;
    },
    closePicker() {
      pickerTarget = null;
    },
    applyPickedSequence(sequence) {
      const target = pickerTarget;
      if (!target) return;
      if (target === "carrier") {
        traceComplete = false;
        stopPlayback();
        composition.carrier = sequence;
        masterBeat = 0;
        sampler.clear();
        refresh();
      } else {
        updateChild(target, (child) => ({ ...child, sequence }));
      }
      pickerTarget = null;
    },
    setSetupDrawerOpen(open) {
      setupDrawerOpen = open;
    },
    destroy() {
      stopPlayback();
      sampler.clear();
    },
  };
}
