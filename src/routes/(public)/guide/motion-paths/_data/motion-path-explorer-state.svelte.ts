import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createAnimationScope } from "$lib/shared/animation-engine/state/animation-scope.svelte";
import { applySequencePathPreview } from "$lib/shared/sequence-viewer/services/sequence-path-policy";
import type { AnimationPathPolicy } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import type { MandalaPathShape } from "$lib/shared/mandala/domain/mandala-types";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
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

/** Where the played sequence comes from: a matrix cell or the picker. */
export type ExplorerSource = "matrix" | "sequence";

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
  // The canvas names what plays by its timing and direction, hands and
  // props, beside the letter. The beat number and the positions are about
  // where the sequence is, which is not the lesson.
  scope.visibility.setVisibility("stepNumbers", false);
  scope.visibility.setVisibility("elementalGlyph", true);
  scope.visibility.setVisibility("propElementalGlyph", true);
  // Hybrid first: the default pair mixes pro with anti, so the first thing on
  // screen is the rule at work, one hand on Arc and the other on Concave.
  scope.visibility.setPathPolicy({ pathShape: "arc", motionAwarePaths: true });
  // The toy box under the canvas drives this scope. The mandala already draws
  // the whole path, so the canvas opens with no effect on top of it; picking
  // one in Effects assigns it to every tip.
  const DEFAULT_BPM = 48;
  scope.settings.setBpm(DEFAULT_BPM);
  scope.visibility.setBpm(DEFAULT_BPM);
  scope.effects.replace({
    ...scope.effects.config,
    activeEffect: "none",
    tipEffectMap: {},
  });
  let original = $state<SequenceData>(motionPathExamples[2]!);
  let source = $state<ExplorerSource>("matrix");
  // The last sequence taken from the picker. It starts as the mixed frozen
  // example so the sequence source has a card to show before any browsing.
  let browsed = $state<SequenceData>(motionPathExamples[2]!);
  let selectedPair = $state<{ left: Flower; right: Flower } | null>(null);
  // A matrix header plays one hand of the pair on its own. The other hand
  // keeps building so the pair stays solvable; the surfaces hide it.
  let soloHand = $state<"left" | "right" | null>(null);
  // Display's Hand paths tile sets both hands' path lines. A solo takes the
  // other hand's line with it (the viewer visibility context hides that
  // hand's prop, but the path-line overlay does not read it), and keeps it
  // off if Hand paths is switched on during the solo. The timing glyphs
  // describe a pair, so a solo takes them off too.
  function pathLinesOn(): boolean {
    return (
      scope.visibility.getVisibility("leftPathLines") ||
      scope.visibility.getVisibility("rightPathLines")
    );
  }
  function setSolo(hand: "left" | "right" | null) {
    const lines = pathLinesOn();
    soloHand = hand;
    scope.visibility.setVisibility("leftPathLines", lines && hand !== "right");
    scope.visibility.setVisibility("rightPathLines", lines && hand !== "left");
    scope.visibility.setVisibility("elementalGlyph", hand === null);
    scope.visibility.setVisibility("propElementalGlyph", hand === null);
  }
  scope.visibility.registerObserver(() => {
    if (soloHand === null) return;
    const hidden = soloHand === "left" ? "rightPathLines" : "leftPathLines";
    if (scope.visibility.getVisibility(hidden))
      scope.visibility.setVisibility(hidden, false);
  });
  // One prop for both hands, as the matrix is built for one prop.
  let propType = $state<PropType>(PropType.STAFF);
  let bpm = $state(DEFAULT_BPM);
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
  let policy = $state<AnimationPathPolicy>(scope.visibility.getPathPolicy());
  // Hands first. The path is the hand between positions, and the four tiles
  // only read as circle, lines, star and a mix when they trace the hand.
  let trace = $state<"hands" | "tips">("hands");
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

  function chooseMatrixPair(
    pair: MatrixPair,
    builder: MotionPathRealizationBuilder
  ): void {
    setSolo(null);
    selectedPair = pair;
    void prewarmPair(pair, builder, selectedMode);
    void buildSelection(builder);
  }

  /** Play the browsed sequence. The matrix pair stays remembered. */
  function showSequence(): void {
    ++selectionVersion;
    source = "sequence";
    original = browsed;
    setSolo(null);
    pickerStatus = "idle";
    pickerError = null;
    transitionVersion += 1;
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
    get source() {
      return source;
    },
    get browsed() {
      return browsed;
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
    get propType() {
      return propType;
    },
    set propType(value: PropType) {
      propType = value;
    },
    get bpm() {
      return bpm;
    },
    setBpm(value: number) {
      bpm = value;
      scope.settings.setBpm(value);
      scope.visibility.setBpm(value);
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
    chooseMatrixPair,
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
      browsed = value;
      showSequence();
    },
    showSequence,
    /** Back to the matrix: the remembered pair, or the host's fallback. */
    showMatrix(fallback: MatrixPair, builder: MotionPathRealizationBuilder) {
      source = "matrix";
      chooseMatrixPair(selectedPair ?? fallback, builder);
    },
  };
}
