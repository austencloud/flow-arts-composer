import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createAnimationScope } from "$lib/shared/animation-engine/state/animation-scope.svelte";
import { applySequencePathPreview } from "$lib/shared/sequence-viewer/services/sequence-path-policy";
import type { AnimationPathPolicy } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import type { MandalaPathShape } from "$lib/shared/mandala/domain/mandala-types";
import {
  flowerKey,
  type Flower,
} from "$lib/shared/shape-matrix/domain/flower-signature";
import {
  MODE_ORDER,
  type VtgMode,
} from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
import { motionPathExamples } from "./motion-path-examples";

export type MotionPathRealizationBuilder = (
  pair: { left: Flower; right: Flower },
  mode: VtgMode
) => Promise<SequenceData | null>;

type PickerStatus = "idle" | "loading" | "error";

type MatrixPair = { left: Flower; right: Flower };
type RealizationCache = Map<string, Map<VtgMode, Promise<SequenceData | null>>>;

function matrixPairKey(pair: MatrixPair): string {
  return `${flowerKey(pair.left)}:${flowerKey(pair.right)}`;
}

export function createMotionPathExplorerState() {
  const scope = createAnimationScope({ persistence: "ephemeral" });
  scope.visibility.setDarkMode(true);
  scope.visibility.setVisibility("leftPathLines", true);
  scope.visibility.setVisibility("rightPathLines", true);
  let original = $state<SequenceData>(motionPathExamples[2]!);
  let selectedPair = $state<{ left: Flower; right: Flower } | null>(null);
  // A matrix header plays one hand of the pair on its own. The other hand
  // keeps building so the pair stays solvable; the surfaces hide it.
  let soloHand = $state<"left" | "right" | null>(null);
  let guides = $state(true);
  // Path lines follow the guides toggle per hand, so a solo takes the other
  // hand's line with it; the visibility context hides that hand's prop.
  function setSolo(hand: "left" | "right" | null) {
    soloHand = hand;
    scope.visibility.setVisibility("leftPathLines", guides && hand !== "right");
    scope.visibility.setVisibility("rightPathLines", guides && hand !== "left");
  }
  let selectedMode = $state<VtgMode | null>("SS");
  let pickerStatus = $state<PickerStatus>("idle");
  let pickerError = $state<string | null>(null);
  let selectionVersion = 0;
  let retryBuilder: MotionPathRealizationBuilder | null = null;
  // Cache by builder identity because callers can supply more than one matrix
  // source during a guide visit.
  const realizationCaches = new WeakMap<
    MotionPathRealizationBuilder,
    RealizationCache
  >();
  let policy = $state<AnimationPathPolicy>({
    pathShape: "arc",
    motionAwarePaths: false,
  });
  let trace = $state<"hands" | "tips">("tips");
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

  function cachedRealization(
    builder: MotionPathRealizationBuilder,
    pair: MatrixPair,
    mode: VtgMode
  ): Promise<SequenceData | null> {
    let cache = realizationCaches.get(builder);
    if (!cache) {
      cache = new Map();
      realizationCaches.set(builder, cache);
    }
    const key = matrixPairKey(pair);
    let modes = cache.get(key);
    if (!modes) {
      modes = new Map();
      cache.set(key, modes);
    }
    const cached = modes.get(mode);
    if (cached) return cached;

    const pending = builder(pair, mode).then(
      (result) => {
        // Builders report transient loader failures as null. Do not turn that
        // temporary state into a permanently unavailable relationship.
        if (!result) modes?.delete(mode);
        return result;
      },
      (error: unknown) => {
        modes?.delete(mode);
        throw error;
      }
    );
    modes.set(mode, pending);
    return pending;
  }

  async function prewarmPair(
    pair: MatrixPair,
    builder: MotionPathRealizationBuilder,
    selectedMode: VtgMode | null
  ): Promise<void> {
    for (const mode of MODE_ORDER) {
      if (mode === selectedMode) continue;
      // These builds populate data only. The stage retains two live players,
      // so warming six relationships never creates six canvases.
      // Yielding lets a click begin its selected build before background modes
      // spend time deriving their own flower phases.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      void cachedRealization(builder, pair, mode).catch(() => {});
    }
  }

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
      const built = await cachedRealization(builder, pair, mode);
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
    get soloHand() {
      return soloHand;
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
    get fixedPath() {
      return policy.pathShape;
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
      setSolo(null);
      selectedPair = pair;
      void prewarmPair(pair, builder, selectedMode);
      void buildSelection(builder);
    },
    /**
     * One axis flower alone, from its header. The other hand keeps whatever
     * is selected, or the host's fallback when nothing is, so the pair still
     * builds; a solo of the current pair only changes what is shown.
     */
    chooseMatrixSolo(
      hand: "left" | "right",
      flower: Flower,
      fallback: MatrixPair,
      builder: MotionPathRealizationBuilder
    ) {
      const other = selectedPair ?? fallback;
      const pair =
        hand === "left"
          ? { left: flower, right: other.right }
          : { left: other.left, right: flower };
      setSolo(hand);
      if (selectedPair && matrixPairKey(selectedPair) === matrixPairKey(pair))
        return;
      selectedPair = pair;
      void prewarmPair(pair, builder, selectedMode);
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
      setSolo(null);
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
      setSolo(null);
      pickerStatus = "idle";
      pickerError = null;
      transitionVersion += 1;
    },
    toggleGuides() {
      guides = !guides;
      setSolo(soloHand);
    },
  };
}
