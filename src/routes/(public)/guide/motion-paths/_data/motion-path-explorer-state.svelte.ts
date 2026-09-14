import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createAnimationScope } from "$lib/shared/animation-engine/state/animation-scope.svelte";
import { applySequencePathPreview } from "$lib/shared/sequence-viewer/services/sequence-path-policy";
import type { AnimationPathPolicy } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import type { MandalaPathShape } from "$lib/shared/mandala/domain/mandala-types";
import type { Flower } from "$lib/shared/shape-matrix/domain/flower-signature";
import type { VtgMode } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
import { motionPathExamples } from "./motion-path-examples";

export type MotionPathRealizationBuilder = (
  pair: { left: Flower; right: Flower },
  mode: VtgMode
) => Promise<SequenceData | null>;

type PickerStatus = "idle" | "loading" | "error";

export function createMotionPathExplorerState() {
  const scope = createAnimationScope({ persistence: "ephemeral" });
  scope.visibility.setDarkMode(true);
  scope.visibility.setVisibility("leftPathLines", true);
  scope.visibility.setVisibility("rightPathLines", true);
  let original = $state<SequenceData>(motionPathExamples[2]!);
  let selectedPair = $state<{ left: Flower; right: Flower } | null>(null);
  let selectedMode = $state<VtgMode | null>("SS");
  let pickerStatus = $state<PickerStatus>("idle");
  let pickerError = $state<string | null>(null);
  let selectionVersion = 0;
  let retryBuilder: MotionPathRealizationBuilder | null = null;
  let policy = $state<AnimationPathPolicy>({
    pathShape: "arc",
    motionAwarePaths: false,
  });
  let trace = $state<"hands" | "tips">("tips");
  let guides = $state(true);
  let playing = $state(false);
  let liveStep = $state(0);
  // InlineAnimationPlayer only reloads when its sequence identity changes. A
  // completed matrix selection can legitimately reuse that identity, so this
  // monotonically increasing key tells the two-source stage to prepare it.
  let transitionVersion = $state(0);
  const variants = $derived(
    Object.fromEntries(
      (["arc", "linear", "concave", "hybrid"] as const).map((path) => [
        path,
        applySequencePathPreview(original, {
          pathShape: path === "hybrid" ? policy.pathShape : path,
          motionAwarePaths: path === "hybrid",
        })!,
      ])
    ) as Record<MandalaPathShape, SequenceData>
  );
  const selectedPath = $derived<MandalaPathShape>(
    policy.motionAwarePaths ? "hybrid" : policy.pathShape
  );
  const sequence = $derived({
    ...variants[selectedPath],
    id: `${original.id}-${selectedPath}`,
  });

  async function buildSelection(
    builder: MotionPathRealizationBuilder
  ): Promise<void> {
    const pair = selectedPair;
    const mode = selectedMode;
    const version = ++selectionVersion;
    retryBuilder = builder;
    pickerError = null;
    if (!pair || !mode) {
      pickerStatus = "idle";
      return;
    }
    pickerStatus = "loading";
    try {
      const built = await builder(pair, mode);
      if (version !== selectionVersion) return;
      if (!built) {
        pickerStatus = "error";
        pickerError =
          "That hand relationship is not available for these shapes.";
        return;
      }
      original = built;
      transitionVersion += 1;
      pickerStatus = "idle";
    } catch {
      if (version !== selectionVersion) return;
      pickerStatus = "error";
      pickerError = "That sequence could not be built. Try again.";
    }
  }

  return {
    scope,
    get sequence() {
      return sequence;
    },
    get variants() {
      return variants;
    },
    get selectedPair() {
      return selectedPair;
    },
    get selectedMode() {
      return selectedMode;
    },
    get pickerStatus() {
      return pickerStatus;
    },
    get pickerError() {
      return pickerError;
    },
    get selectedPath() {
      return selectedPath;
    },
    get trace() {
      return trace;
    },
    set trace(value: "hands" | "tips") {
      trace = value;
    },
    get guides() {
      return guides;
    },
    get playing() {
      return playing;
    },
    set playing(value: boolean) {
      playing = value;
    },
    get liveStep() {
      return liveStep;
    },
    set liveStep(value: number) {
      liveStep = value;
    },
    get transitionKey() {
      return `${original.id}:${transitionVersion}:${selectedPath}`;
    },
    syncPolicy() {
      policy = scope.visibility.getPathPolicy();
    },
    chooseMatrixPair(
      pair: { left: Flower; right: Flower },
      builder: MotionPathRealizationBuilder
    ) {
      selectedPair = pair;
      void buildSelection(builder);
    },
    chooseHandRelationship(
      mode: VtgMode | null,
      builder: MotionPathRealizationBuilder
    ) {
      selectedMode = mode;
      void buildSelection(builder);
    },
    clearMatrixPair() {
      ++selectionVersion;
      selectedPair = null;
      pickerStatus = "idle";
      pickerError = null;
    },
    retryMatrixSelection() {
      if (retryBuilder) void buildSelection(retryBuilder);
    },
    chooseSequence(value: SequenceData) {
      ++selectionVersion;
      original = value;
      selectedPair = null;
      pickerStatus = "idle";
      pickerError = null;
      transitionVersion += 1;
    },
    toggleGuides() {
      guides = !guides;
      scope.visibility.setVisibility("leftPathLines", guides);
      scope.visibility.setVisibility("rightPathLines", guides);
    },
  };
}
