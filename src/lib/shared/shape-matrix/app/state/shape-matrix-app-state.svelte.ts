import { applyFilter } from "$lib/shared/shape-matrix/domain/filter-flower-axis";
import {
  matrixFiltersForTurns,
  clampMatrixTurnToLevel,
  matrixTurnsForLevel,
  type MatrixLabelMode,
} from "$lib/shared/shape-matrix/domain/matrix-turn-band";
import {
  flowerKey,
  type Flower,
} from "$lib/shared/shape-matrix/domain/flower-signature";
import {
  flowerAtTurn,
  semanticVariant,
  type SemanticVariant,
} from "$lib/shared/shape-matrix/domain/flower-at-turn";
import type {
  TurnLevel,
  TurnValue,
} from "$lib/shared/create/services/level-turn-values";
import type { ShapeMatrixData } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";
import {
  MODE_ORDER,
  type VtgMode,
} from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ShapeMatrixPropPair } from "$lib/shared/shape-matrix/domain/prop-pair";
import { requestShapeMatrixTransition } from "$lib/shared/shape-matrix/debug/shape-matrix-transition-recorder";
import { spinRatioEquals, type SpinRatio } from "@vtg/domain";
import {
  buildTheoryAxis,
  theoryFlowerKey,
  type TheoryFlower,
} from "$lib/shared/shape-matrix/domain/theory-flower";
import {
  DEFAULT_THEORY_RATIO,
  THEORY_RATIO_MAX_PART,
  theoryRatioFromParts,
} from "$lib/shared/shape-matrix/domain/theory-ratio";

/** A part of the About modal a reader can be sent straight to. */
export type ShapeMatrixAboutFocus = "levels" | null;

export type ShapeMatrixAppView = "matrix" | "detail";
export type ShapeMatrixSurface = "matrix" | "theory";
export interface ShapeMatrixCompactFocusRequest {
  id: number;
  target: ShapeMatrixAppView;
}
export type ShapeMatrixAxisTarget = "left" | "both" | "right";

export interface ShapeMatrixSelectPairOptions {
  /**
   * False records the selection without moving a compact layout to the
   * detail pane. The host then navigates itself (through the shared-element
   * morph), which needs the clicked tile to be the selection BEFORE the
   * view flips so the morph starts from that tile.
   */
  navigate?: boolean;
}

export interface ShapeMatrixSurpriseOptions {
  /** Let the shell defer compact navigation until its shared-element handoff. */
  navigate?: boolean;
}

export interface ShapeMatrixSetTurnOptions {
  /**
   * Keep the compact layout on the detail pane after a turn or level edit.
   * The matrix ribbon returns to the matrix (existing navigation); the detail
   * pane's own popover stays put so the animator restages under the user's
   * eyes.
   */
  stayOnDetail?: boolean;
}

export interface ShapeMatrixAppSnapshot {
  surface: ShapeMatrixSurface;
  /** Theory rows: the blue hand's prop-to-hand ratio. */
  theoryLeftRatio: SpinRatio;
  /** Theory columns: the red hand's prop-to-hand ratio. */
  theoryRightRatio: SpinRatio;
  /** When true, either ratio editor moves both axes together. */
  theoryRatiosLinked?: boolean;
  /**
   * The timing-and-direction pairing on the Theory surface, named by the same
   * six VTG modes (and the same six elements) a Matrix realization carries.
   */
  theoryMode: VtgMode;
  theoryPair: { left: TheoryFlower; right: TheoryFlower } | null;
  /**
   * The Theory surface's own solo: one ratio from its header, played by its
   * own prop alone. Optional because saved snapshots predate it; absent is
   * the pair.
   */
  theorySolo?: "left" | "right" | null;
  level: TurnLevel;
  leftTurn: TurnValue;
  rightTurn: TurnValue;
  activeAxis: ShapeMatrixAxisTarget;
  labelMode: MatrixLabelMode;
  leftPropType: PropType;
  rightPropType: PropType;
  /**
   * Snapshots saved before the pair existed carry one prop. It is read into
   * both hands and never written again.
   */
  propType?: PropType;
  pair: { left: Flower; right: Flower } | null;
  mode: VtgMode | null;
  propMode: VtgMode | null;
  /**
   * The one hand on stage, when a row or column header was chosen instead of
   * a cell: that axis item alone, played by its own prop. Null is the pair.
   */
  solo: "left" | "right" | null;
}

export interface ShapeMatrixAppPersistence {
  restore: () => ShapeMatrixAppSnapshot | null;
  persist: (state: ShapeMatrixAppSnapshot) => void;
  /**
   * The address that would restore this snapshot, for sharing. The host owns
   * the route, so only a host that persists to one can answer; an embedded
   * host without a route leaves it out and the app offers no link.
   */
  link?: (state: ShapeMatrixAppSnapshot) => string;
}

export type ShapeMatrixPropHand = "left" | "right";

interface ShapeMatrixAppDependencies {
  loadMatrix: (props: ShapeMatrixPropPair) => Promise<ShapeMatrixData>;
  syncState: (state: ShapeMatrixAppSnapshot) => void;
  link?: (state: ShapeMatrixAppSnapshot) => string;
  /**
   * A pick made inside the engine (a prop, or the cat dog chip), for a host
   * that mirrors the pair somewhere else. Adopted pairs never come back out.
   */
  onPropPairChange?: (pair: ShapeMatrixPropPair, catDog: boolean) => void;
}

/** A snapshot without the pair fills both hands from its legacy prop, or staff. */
function snapshotPropPair(
  snapshot: ShapeMatrixAppSnapshot
): ShapeMatrixPropPair {
  const legacy = snapshot.propType ?? PropType.STAFF;
  return {
    left: snapshot.leftPropType ?? legacy,
    right: snapshot.rightPropType ?? legacy,
  };
}

const LEVEL_LANDING_TURN: Record<TurnLevel, TurnValue> = {
  1: 0,
  2: 1,
  3: 0.5,
  4: 0.25,
};

/**
 * Carry a selection across a ratio change instead of dropping it.
 *
 * The user picked prospin-out in the top-left corner; changing the ratio is a
 * request to see THAT variant at the new ratio, the same way the Matrix keeps
 * a cell's style and orientation when its turn value moves. The endpoints have
 * fewer variants, so the axis is asked what actually survives.
 */
function theoryFlowerAt(
  ratio: SpinRatio,
  remembered: TheoryFlower | null
): TheoryFlower {
  const axis = buildTheoryAxis(ratio);
  const match = remembered
    ? axis.find(
        (candidate) =>
          candidate.style === remembered.style &&
          candidate.ori === remembered.ori
      )
    : undefined;
  return match ?? (axis[0] as TheoryFlower);
}

function supportsTimedPropRelationship(
  pair: { left: Flower; right: Flower } | null
): boolean {
  return (
    pair !== null &&
    pair.left.turns !== "fl" &&
    pair.right.turns !== "fl" &&
    pair.left.turns === pair.right.turns
  );
}

function randomPairFromAxes<T>(
  rows: readonly T[],
  columns: readonly T[],
  current: { left: T; right: T } | null,
  keyOf: (value: T) => string,
  random: () => number
): { left: T; right: T } | null {
  const pairs = rows.flatMap((left) =>
    columns.map((right) => ({ left, right }))
  );
  if (pairs.length === 0) return null;

  const pairKey = ({ left, right }: { left: T; right: T }) =>
    `${keyOf(left)}|${keyOf(right)}`;
  const currentKey = current ? pairKey(current) : null;
  const choices =
    pairs.length > 1
      ? pairs.filter((candidate) => pairKey(candidate) !== currentKey)
      : pairs;
  const unit = Math.min(0.999999, Math.max(0, random()));
  return choices[Math.floor(unit * choices.length)] ?? null;
}

function randomItem<T>(items: readonly T[], random: () => number): T | null {
  if (items.length === 0) return null;
  const unit = Math.min(0.999999, Math.max(0, random()));
  return items[Math.floor(unit * items.length)] ?? null;
}

/**
 * Random theory grids should sample the ratios the playground can actually
 * display, not over-weight reducible spellings such as 2:4 and 3:6.
 */
const THEORY_RANDOM_RATIOS = (() => {
  const unique = new Map<string, SpinRatio>();
  for (
    let handCycles = 0;
    handCycles <= THEORY_RATIO_MAX_PART;
    handCycles += 1
  ) {
    for (
      let propRotations = 0;
      propRotations <= THEORY_RATIO_MAX_PART;
      propRotations += 1
    ) {
      const ratio = theoryRatioFromParts(propRotations, handCycles);
      // A stationary hand intentionally collapses to one axis entry. The
      // playground still accepts it when typed, but a "new 4×4" roll should
      // only choose ratios that keep four distinct row/column choices.
      if (!ratio || buildTheoryAxis(ratio).length !== 4) continue;
      unique.set(`${ratio.propRotations}:${ratio.handCycles}`, ratio);
    }
  }
  return [...unique.values()];
})();

export function createShapeMatrixAppState(
  dependencies: ShapeMatrixAppDependencies,
  initial: ShapeMatrixAppSnapshot,
  initialCompact: boolean
) {
  let surface = $state<ShapeMatrixSurface>(initial.surface);
  let theoryLeftRatio = $state(
    theoryRatioFromParts(
      initial.theoryLeftRatio.propRotations,
      initial.theoryLeftRatio.handCycles
    ) ?? DEFAULT_THEORY_RATIO
  );
  let theoryRightRatio = $state(
    theoryRatioFromParts(
      initial.theoryRightRatio.propRotations,
      initial.theoryRightRatio.handCycles
    ) ?? DEFAULT_THEORY_RATIO
  );
  let theoryRatiosLinked = $state(
    Boolean(initial.theoryRatiosLinked) &&
      spinRatioEquals(theoryLeftRatio, theoryRightRatio)
  );
  let theoryMode = $state<VtgMode>(initial.theoryMode);
  let theoryPair = $state(initial.theoryPair);
  /* The Theory surface keeps its own solo, as it keeps its own pair: the two
     grids are two selections, and leaving one for the other does not change
     what the other was showing. */
  let theorySoloHand = $state<"left" | "right" | null>(
    initial.theoryPair ? (initial.theorySolo ?? null) : null
  );
  let level = $state(initial.level);
  let leftTurn = $state<TurnValue>(
    clampMatrixTurnToLevel(initial.leftTurn, initial.level)
  );
  let rightTurn = $state<TurnValue>(
    clampMatrixTurnToLevel(initial.rightTurn, initial.level)
  );
  let activeAxis = $state<ShapeMatrixAxisTarget>(initial.activeAxis);
  let labelMode = $state(initial.labelMode);
  const initialPair = snapshotPropPair(initial);
  let leftPropType = $state(initialPair.left);
  let rightPropType = $state(initialPair.right);
  /** Whether the hand segments show; starts on when the restored pair differs. */
  let catDog = $state(initialPair.left !== initialPair.right);
  /** The hand the picker addresses while cat dog is on. */
  let propHand = $state<ShapeMatrixPropHand>("left");
  /* A load is a request for one pair; a later request supersedes it. */
  let loadToken = 0;
  let selectedPair = $state(initial.pair);
  let rememberedVariants = $state<{
    left: SemanticVariant;
    right: SemanticVariant;
  }>({
    left: initial.pair ? semanticVariant(initial.pair.left) : 0,
    right: initial.pair ? semanticVariant(initial.pair.right) : 2,
  });
  /* A header choice, not a cell: one hand is on stage and the other is not
     drawn. The pair underneath is still whole — a realization needs both
     hands, and every legal one traces this hand's own flower — so soloing is
     a matter of what is shown, never of what is solved. */
  let soloHand = $state<"left" | "right" | null>(
    initial.pair ? initial.solo : null
  );
  let selectedMode = $state<VtgMode | null>(
    initial.pair ? (initial.mode ?? MODE_ORDER[0] ?? null) : null
  );
  let selectedPropMode = $state<VtgMode | null>(
    supportsTimedPropRelationship(initial.pair) ? initial.propMode : null
  );
  let data = $state<ShapeMatrixData | null>(null);
  let loading = $state(false);
  let loadError = $state<string | null>(null);
  let compact = $state(initialCompact);
  let activeView = $state<ShapeMatrixAppView>(
    initialCompact && initial.pair ? "detail" : "matrix"
  );
  let compactFocusRequest = $state<ShapeMatrixCompactFocusRequest | null>(null);
  let aboutOpen = $state(false);
  /* Which part of About the reader asked for. The modal scrolls to it on
     open; null is the top, which is what the header's own About button
     wants. */
  let aboutFocus = $state<ShapeMatrixAboutFocus>(null);
  let propPickerOpen = $state(false);
  let mandalaHandoff = $state(false);
  /**
   * Bumped once per Surprise roll. The panes key their reveal choreography on
   * it, so the animation belongs to the roll and never to an ordinary edit.
   */
  let revealToken = $state(0);

  const availableTurns = $derived(matrixTurnsForLevel(level));
  const theoryRowAxis = $derived(buildTheoryAxis(theoryLeftRatio));
  const theoryColAxis = $derived(buildTheoryAxis(theoryRightRatio));
  const filters = $derived(matrixFiltersForTurns(leftTurn, rightTurn));
  const rowAxis = $derived(
    data ? applyFilter(data.axis, filters.left, false) : []
  );
  const colAxis = $derived(
    data ? applyFilter(data.axis, filters.right, false) : []
  );

  async function load(
    nextPair: ShapeMatrixPropPair = { left: leftPropType, right: rightPropType }
  ): Promise<void> {
    const token = ++loadToken;
    loading = true;
    loadError = null;
    try {
      const nextData = await dependencies.loadMatrix(nextPair);
      if (token !== loadToken) return;
      data = nextData;
      leftPropType = nextPair.left;
      rightPropType = nextPair.right;
    } catch (error) {
      if (token !== loadToken) return;
      loadError = error instanceof Error ? error.message : String(error);
    } finally {
      if (token === loadToken) loading = false;
    }
  }

  function updateSelectedPairTurns(
    nextLeftTurn: TurnValue,
    nextRightTurn: TurnValue
  ): void {
    if (!selectedPair) return;
    selectedPair = {
      left: flowerAtTurn(nextLeftTurn, rememberedVariants.left),
      right: flowerAtTurn(nextRightTurn, rememberedVariants.right),
    };
  }

  function setLevel(
    nextLevel: TurnLevel,
    options: ShapeMatrixSetTurnOptions = {}
  ): void {
    if (level === nextLevel) return;
    level = nextLevel;

    const landingTurn = LEVEL_LANDING_TURN[level];
    // A higher level should change the picture, not merely add quiet options
    // around the current Level 1 matrix. Move the edited axis into the new
    // vocabulary while preserving the other axis whenever it remains legal.
    const nextLeftTurn =
      activeAxis === "right"
        ? clampMatrixTurnToLevel(leftTurn, level)
        : landingTurn;
    const nextRightTurn =
      activeAxis === "left"
        ? clampMatrixTurnToLevel(rightTurn, level)
        : landingTurn;
    if (
      selectedPair &&
      (nextLeftTurn !== leftTurn || nextRightTurn !== rightTurn)
    ) {
      requestShapeMatrixTransition(
        `level:${level}:${String(nextLeftTurn)}:${String(nextRightTurn)}`
      );
    }
    updateSelectedPairTurns(nextLeftTurn, nextRightTurn);
    if (nextLeftTurn === "fl" || nextLeftTurn !== nextRightTurn) {
      selectedPropMode = null;
    }
    leftTurn = nextLeftTurn;
    rightTurn = nextRightTurn;
    if (compact && !options.stayOnDetail) activeView = "matrix";
    syncState();
  }

  function commitTurns(
    nextLeftTurn: TurnValue,
    nextRightTurn: TurnValue,
    transitionLabel: string,
    options: ShapeMatrixSetTurnOptions
  ): void {
    if (selectedPair) {
      rememberedVariants = {
        left: semanticVariant(selectedPair.left),
        right: semanticVariant(selectedPair.right),
      };
    }
    if (nextLeftTurn === leftTurn && nextRightTurn === rightTurn) return;

    if (selectedPair) {
      requestShapeMatrixTransition(
        `turn:${transitionLabel}:${String(nextLeftTurn)}:${String(nextRightTurn)}`
      );
    }
    updateSelectedPairTurns(nextLeftTurn, nextRightTurn);
    if (nextLeftTurn === "fl" || nextLeftTurn !== nextRightTurn) {
      selectedPropMode = null;
    }
    leftTurn = nextLeftTurn;
    rightTurn = nextRightTurn;
    if (compact && !options.stayOnDetail) activeView = "matrix";
    syncState();
  }

  /** Edit the axis the Apply-to target names (kept for restored links). */
  function setTurn(
    nextTurn: TurnValue,
    options: ShapeMatrixSetTurnOptions = {}
  ): void {
    if (!availableTurns.includes(nextTurn)) return;
    commitTurns(
      activeAxis === "right" ? leftTurn : nextTurn,
      activeAxis === "left" ? rightTurn : nextTurn,
      activeAxis,
      options
    );
  }

  /**
   * Edit one named axis directly. The recipe bar above the grid gives rows
   * and columns their own stepper, so no Apply-to mode stands between the
   * user and the axis they mean.
   */
  function setTurnFor(
    hand: "left" | "right",
    nextTurn: TurnValue,
    options: ShapeMatrixSetTurnOptions = {}
  ): void {
    if (!availableTurns.includes(nextTurn)) return;
    commitTurns(
      hand === "left" ? nextTurn : leftTurn,
      hand === "right" ? nextTurn : rightTurn,
      hand,
      options
    );
  }

  function setActiveAxis(nextAxis: ShapeMatrixAxisTarget): void {
    if (activeAxis === nextAxis) return;
    activeAxis = nextAxis;
    syncState();
  }

  function setLabelMode(nextMode: MatrixLabelMode): void {
    if (labelMode === nextMode) return;
    labelMode = nextMode;
    syncState();
  }

  function setSurface(nextSurface: ShapeMatrixSurface): void {
    if (surface === nextSurface) return;
    surface = nextSurface;
    syncState();
  }

  function applyTheoryRatios(nextLeft: SpinRatio, nextRight: SpinRatio): void {
    const moved =
      !spinRatioEquals(nextLeft, theoryLeftRatio) ||
      !spinRatioEquals(nextRight, theoryRightRatio);
    if (!moved) return;
    theoryLeftRatio = nextLeft;
    theoryRightRatio = nextRight;
    if (theoryPair) {
      theoryPair = {
        left: theoryFlowerAt(nextLeft, theoryPair.left),
        right: theoryFlowerAt(nextRight, theoryPair.right),
      };
    }
  }

  /** One named axis, for the live tuners that edit a specific hand. */
  function setTheoryRatioFor(
    hand: "left" | "right",
    nextRatio: SpinRatio
  ): void {
    const allowed = theoryRatioFromParts(
      nextRatio.propRotations,
      nextRatio.handCycles
    );
    if (!allowed) return;
    if (theoryRatiosLinked) {
      applyTheoryRatios(allowed, allowed);
      syncState();
      return;
    }
    applyTheoryRatios(
      hand === "left" ? allowed : theoryLeftRatio,
      hand === "right" ? allowed : theoryRightRatio
    );
    syncState();
  }

  function linkTheoryRatios(source: "left" | "right"): void {
    const kept = source === "left" ? theoryLeftRatio : theoryRightRatio;
    theoryRatiosLinked = true;
    applyTheoryRatios(kept, kept);
    syncState();
  }

  function unlinkTheoryRatios(): void {
    if (!theoryRatiosLinked) return;
    theoryRatiosLinked = false;
    syncState();
  }

  /** Two visible editors commit together when one ratio is copied across. */
  function setTheoryRatios(
    nextLeftRatio: SpinRatio,
    nextRightRatio: SpinRatio
  ): void {
    const allowedLeft = theoryRatioFromParts(
      nextLeftRatio.propRotations,
      nextLeftRatio.handCycles
    );
    const allowedRight = theoryRatioFromParts(
      nextRightRatio.propRotations,
      nextRightRatio.handCycles
    );
    if (!allowedLeft || !allowedRight) return;
    if (theoryRatiosLinked && !spinRatioEquals(allowedLeft, allowedRight)) {
      theoryRatiosLinked = false;
    }
    applyTheoryRatios(allowedLeft, allowedRight);
    syncState();
  }

  function setTheoryMode(nextMode: VtgMode): void {
    if (theoryMode === nextMode) return;
    theoryMode = nextMode;
    syncState();
  }

  function selectTheoryPair(
    pair: { left: TheoryFlower; right: TheoryFlower },
    options: ShapeMatrixSelectPairOptions = {}
  ): void {
    // A cell is both hands; choosing one leaves any solo behind.
    theorySoloHand = null;
    theoryPair = pair;
    if (compact && options.navigate !== false) {
      activeView = "detail";
      requestCompactFocus("detail");
    }
    syncState();
  }

  /**
   * One ratio alone, from its own header: the Theory surface's answer to the
   * Matrix's header solo. The other hand keeps whatever it was set to (its
   * axis's first flower otherwise), so the pair underneath stays whole and a
   * cell picked afterwards resumes with both hands.
   */
  function selectTheorySolo(
    hand: "left" | "right",
    flower: TheoryFlower,
    options: ShapeMatrixSelectPairOptions = {}
  ): void {
    const pair =
      hand === "left"
        ? {
            left: flower,
            right: theoryPair?.right ?? theoryFlowerAt(theoryRightRatio, null),
          }
        : {
            left: theoryPair?.left ?? theoryFlowerAt(theoryLeftRatio, null),
            right: flower,
          };
    selectTheoryPair(pair, options);
    theorySoloHand = hand;
    syncState();
  }

  /**
   * Roll the whole experience in one state transition: a new 4×4, one of its
   * crossings, and one hand relationship for the resulting animation.
   */
  function surpriseMe(
    random: () => number = Math.random,
    options: ShapeMatrixSurpriseOptions = {}
  ): void {
    if (surface === "theory") {
      const nextLeft = randomItem(THEORY_RANDOM_RATIOS, random);
      const nextRight = randomItem(THEORY_RANDOM_RATIOS, random);
      if (!nextLeft || !nextRight) return;

      // A surprise always opens a different grid. Advance one axis if the two
      // independent rolls happened to reproduce the current pair exactly.
      let resolvedLeft = nextLeft;
      if (
        spinRatioEquals(nextLeft, theoryLeftRatio) &&
        spinRatioEquals(nextRight, theoryRightRatio)
      ) {
        const currentIndex = THEORY_RANDOM_RATIOS.indexOf(nextLeft);
        resolvedLeft =
          THEORY_RANDOM_RATIOS[
            (currentIndex + 1) % THEORY_RANDOM_RATIOS.length
          ] ?? nextLeft;
      }

      const nextRows = buildTheoryAxis(resolvedLeft);
      const nextColumns = buildTheoryAxis(nextRight);
      const nextPair = randomPairFromAxes(
        nextRows,
        nextColumns,
        null,
        theoryFlowerKey,
        random
      );
      const nextMode = randomItem(MODE_ORDER, random);
      if (!nextPair || !nextMode) return;

      theoryLeftRatio = resolvedLeft;
      theoryRightRatio = nextRight;
      theoryRatiosLinked = false;
      theoryPair = nextPair;
      theorySoloHand = null;
      theoryMode = nextMode;
    } else {
      if (!data) return;
      const turnPairs = availableTurns.flatMap((nextLeftTurn) =>
        availableTurns.map((nextRightTurn) => ({
          left: nextLeftTurn,
          right: nextRightTurn,
        }))
      );
      const differentTurnPairs = turnPairs.filter(
        (turns) => turns.left !== leftTurn || turns.right !== rightTurn
      );
      const nextTurns = randomItem(
        differentTurnPairs.length > 0 ? differentTurnPairs : turnPairs,
        random
      );
      if (!nextTurns) return;

      const nextFilters = matrixFiltersForTurns(
        nextTurns.left,
        nextTurns.right
      );
      const nextRows = applyFilter(data.axis, nextFilters.left, false);
      const nextColumns = applyFilter(data.axis, nextFilters.right, false);
      const nextPair = randomPairFromAxes(
        nextRows,
        nextColumns,
        null,
        flowerKey,
        random
      );
      const nextMode = randomItem(MODE_ORDER, random);
      if (!nextPair || !nextMode) return;

      if (selectedPair) {
        requestShapeMatrixTransition(
          `surprise:${String(nextTurns.left)}:${String(nextTurns.right)}`
        );
      }
      leftTurn = nextTurns.left;
      rightTurn = nextTurns.right;
      selectedPair = nextPair;
      rememberedVariants = {
        left: semanticVariant(nextPair.left),
        right: semanticVariant(nextPair.right),
      };
      selectedMode = nextMode;
      // The hand relationship is the roll; let the drill resolve its matching
      // prop relationship instead of carrying a stale explicit choice across.
      selectedPropMode = null;
    }

    revealToken += 1;
    if (compact && options.navigate !== false) {
      activeView = "detail";
      requestCompactFocus("detail");
    }
    syncState();
  }

  /*
   * The picker stays open. It sits beside the animation rather than over it,
   * so a choice is meant to be watched: pick a prop, see the shape traced by
   * it, pick the next one. Closing is its own action.
   */
  async function setPropType(
    prop: PropType,
    hand: ShapeMatrixPropHand | "both" = catDog ? propHand : "both"
  ): Promise<void> {
    const next = {
      left: hand === "right" ? leftPropType : prop,
      right: hand === "left" ? rightPropType : prop,
    };
    if (next.left === leftPropType && next.right === rightPropType) return;
    await load(next);
    if (loadError) return;
    syncState();
    dependencies.onPropPairChange?.(
      { left: leftPropType, right: rightPropType },
      catDog
    );
  }

  function setPropHand(hand: ShapeMatrixPropHand): void {
    propHand = hand;
  }

  /**
   * Leaving cat dog folds the right hand onto the left, the same collapse
   * Settings performs; entering it changes nothing until a hand is picked.
   */
  async function toggleCatDog(): Promise<void> {
    if (catDog && rightPropType !== leftPropType) {
      await load({ left: leftPropType, right: leftPropType });
      if (loadError) return;
      syncState();
    }
    catDog = !catDog;
    if (!catDog) propHand = "left";
    dependencies.onPropPairChange?.(
      { left: leftPropType, right: rightPropType },
      catDog
    );
  }

  /**
   * The host's pair, taken as the truth: recorded at once, reloaded when the
   * matrix is already up, and never synced or announced back to the host.
   */
  function adoptPropPair(pair: ShapeMatrixPropPair, nextCatDog: boolean): void {
    catDog = nextCatDog;
    if (!nextCatDog) propHand = "left";
    if (pair.left === leftPropType && pair.right === rightPropType) return;
    leftPropType = pair.left;
    rightPropType = pair.right;
    if (data || loading) void load();
  }

  function restoreState(
    snapshot: ShapeMatrixAppSnapshot,
    options: { keepPropPair?: boolean } = {}
  ): void {
    surface = snapshot.surface ?? "matrix";
    level = snapshot.level;
    const restoredLeftRatio = snapshot.theoryLeftRatio ?? DEFAULT_THEORY_RATIO;
    const restoredRightRatio =
      snapshot.theoryRightRatio ?? DEFAULT_THEORY_RATIO;
    theoryLeftRatio =
      theoryRatioFromParts(
        restoredLeftRatio.propRotations,
        restoredLeftRatio.handCycles
      ) ?? DEFAULT_THEORY_RATIO;
    theoryRightRatio =
      theoryRatioFromParts(
        restoredRightRatio.propRotations,
        restoredRightRatio.handCycles
      ) ?? DEFAULT_THEORY_RATIO;
    theoryRatiosLinked =
      Boolean(snapshot.theoryRatiosLinked) &&
      spinRatioEquals(theoryLeftRatio, theoryRightRatio);
    theoryMode = snapshot.theoryMode ?? "SS";
    theoryPair = snapshot.theoryPair
      ? {
          left: theoryFlowerAt(theoryLeftRatio, snapshot.theoryPair.left),
          right: theoryFlowerAt(theoryRightRatio, snapshot.theoryPair.right),
        }
      : null;
    theorySoloHand = theoryPair ? (snapshot.theorySolo ?? null) : null;
    leftTurn = clampMatrixTurnToLevel(snapshot.leftTurn, snapshot.level);
    rightTurn = clampMatrixTurnToLevel(snapshot.rightTurn, snapshot.level);
    activeAxis = snapshot.activeAxis;
    labelMode = snapshot.labelMode;
    if (!options.keepPropPair) {
      const pair = snapshotPropPair(snapshot);
      leftPropType = pair.left;
      rightPropType = pair.right;
      catDog = pair.left !== pair.right;
      propHand = "left";
    }
    if (snapshot.pair) {
      rememberedVariants = {
        left: semanticVariant(snapshot.pair.left),
        right: semanticVariant(snapshot.pair.right),
      };
    }
    selectedPair = snapshot.pair
      ? {
          left: flowerAtTurn(leftTurn, rememberedVariants.left),
          right: flowerAtTurn(rightTurn, rememberedVariants.right),
        }
      : null;
    selectedMode = selectedPair
      ? (snapshot.mode ?? MODE_ORDER[0] ?? null)
      : null;
    selectedPropMode = supportsTimedPropRelationship(selectedPair)
      ? snapshot.propMode
      : null;
    soloHand = selectedPair ? snapshot.solo : null;
  }

  function selectPair(
    pair: { left: Flower; right: Flower },
    options: ShapeMatrixSelectPairOptions = {}
  ): void {
    // A cell is both hands; choosing one leaves any solo behind.
    soloHand = null;
    selectedPair = pair;
    rememberedVariants = {
      left: semanticVariant(pair.left),
      right: semanticVariant(pair.right),
    };
    selectedMode ??= MODE_ORDER[0] ?? null;
    if (!supportsTimedPropRelationship(pair)) selectedPropMode = null;
    if (compact && options.navigate !== false) {
      activeView = "detail";
      requestCompactFocus("detail");
    }
    syncState();
  }

  /**
   * One axis item alone, from its own header. The other hand keeps whatever
   * it was already set to (its turn value decides it otherwise), so the pair
   * stays solvable and returning to a cell resumes where it left off.
   */
  function selectSolo(
    hand: "left" | "right",
    flower: Flower,
    options: ShapeMatrixSelectPairOptions = {}
  ): void {
    const pair =
      hand === "left"
        ? {
            left: flower,
            right:
              selectedPair?.right ??
              flowerAtTurn(rightTurn, rememberedVariants.right),
          }
        : {
            left:
              selectedPair?.left ??
              flowerAtTurn(leftTurn, rememberedVariants.left),
            right: flower,
          };
    selectPair(pair, options);
    soloHand = hand;
    syncState();
  }

  function setMode(mode: VtgMode | null): void {
    selectedMode = selectedPair
      ? (mode ?? selectedMode ?? MODE_ORDER[0] ?? null)
      : null;
    syncState();
  }

  function setPropMode(mode: VtgMode | null): void {
    selectedPropMode = supportsTimedPropRelationship(selectedPair)
      ? mode
      : null;
    syncState();
  }

  function showMatrix(): void {
    activeView = "matrix";
    if (compact) requestCompactFocus("matrix");
  }
  function showDetail(): void {
    if (surface === "theory" ? theoryPair : selectedPair) {
      activeView = "detail";
      if (compact) requestCompactFocus("detail");
    }
  }
  function requestCompactFocus(target: ShapeMatrixAppView): void {
    compactFocusRequest = {
      id: (compactFocusRequest?.id ?? 0) + 1,
      target,
    };
  }
  function setCompact(nextCompact: boolean): void {
    if (compact === nextCompact) return;
    compact = nextCompact;
    if (compact) {
      activeView = (surface === "theory" ? theoryPair : selectedPair)
        ? "detail"
        : "matrix";
    }
  }
  function openAbout(focus: ShapeMatrixAboutFocus = null): void {
    aboutFocus = focus;
    aboutOpen = true;
  }
  function closeAbout(): void {
    aboutOpen = false;
    aboutFocus = null;
  }
  /**
   * One entry point. The Props pill under the animation opens the catalogue
   * over the grid pane (a sheet on compact hosts) and shows pressed until it
   * closes. The pill, the catalogue's close button, Escape and a click
   * elsewhere in the app all put it away.
   */
  function togglePropPicker(): void {
    propPickerOpen = !propPickerOpen;
  }
  /** The catalogue's own exits: close button, Escape, click-away, sheet. */
  function closePropPicker(): void {
    propPickerOpen = false;
  }
  /** A tile-to-hero shared-element transition is capturing or animating. */
  function beginMandalaHandoff(): void {
    mandalaHandoff = true;
  }
  function endMandalaHandoff(): void {
    mandalaHandoff = false;
  }

  function snapshot(): ShapeMatrixAppSnapshot {
    return {
      surface,
      theoryLeftRatio,
      theoryRightRatio,
      theoryRatiosLinked,
      theoryMode,
      theoryPair,
      theorySolo: theorySoloHand,
      level,
      leftTurn,
      rightTurn,
      activeAxis,
      labelMode,
      leftPropType,
      rightPropType,
      pair: selectedPair,
      mode: selectedMode,
      propMode: selectedPropMode,
      solo: soloHand,
    };
  }

  function syncState(): void {
    dependencies.syncState(snapshot());
  }

  /* A link to the view on screen, exactly as it stands — the notation
     included, so switching the header before copying is what sends the other
     one. Null when the host has no route. */
  function shareLink(): string | null {
    return dependencies.link?.(snapshot()) ?? null;
  }

  return {
    get surface() {
      return surface;
    },
    get theoryLeftRatio() {
      return theoryLeftRatio;
    },
    get theoryRightRatio() {
      return theoryRightRatio;
    },
    get theoryRatiosLinked() {
      return theoryRatiosLinked;
    },
    get theoryMode() {
      return theoryMode;
    },
    get theoryPair() {
      return theoryPair;
    },
    get theoryRowAxis() {
      return theoryRowAxis;
    },
    get theoryColAxis() {
      return theoryColAxis;
    },
    get level() {
      return level;
    },
    get leftTurn() {
      return leftTurn;
    },
    get rightTurn() {
      return rightTurn;
    },
    get activeAxis() {
      return activeAxis;
    },
    get activeTurn() {
      return activeAxis === "right" ? rightTurn : leftTurn;
    },
    get labelMode() {
      return labelMode;
    },
    get leftPropType() {
      return leftPropType;
    },
    get rightPropType() {
      return rightPropType;
    },
    get catDog() {
      return catDog;
    },
    get propHand() {
      return propHand;
    },
    /** The prop the picker addresses: the chosen hand under cat dog, else left. */
    get addressedPropType() {
      return catDog && propHand === "right" ? rightPropType : leftPropType;
    },
    /** The hand chip and segments every engine AnimationPanel shows. */
    get handProps() {
      return {
        catDog,
        hand: propHand,
        leftPropType,
        rightPropType,
        onToggleCatDog: () => void toggleCatDog(),
        onHandChange: setPropHand,
      };
    },
    get availableTurns() {
      return availableTurns;
    },
    get selectedPair() {
      return selectedPair;
    },
    get selectedMode() {
      return selectedMode;
    },
    get selectedPropMode() {
      return selectedPropMode;
    },
    get soloHand() {
      return soloHand;
    },
    get theorySoloHand() {
      return theorySoloHand;
    },
    get data() {
      return data;
    },
    get loading() {
      return loading;
    },
    get loadError() {
      return loadError;
    },
    get compact() {
      return compact;
    },
    get activeView() {
      return activeView;
    },
    get compactFocusRequest() {
      return compactFocusRequest;
    },
    get aboutFocus() {
      return aboutFocus;
    },
    get aboutOpen() {
      return aboutOpen;
    },
    get propPickerOpen() {
      return propPickerOpen;
    },
    get mandalaHandoff() {
      return mandalaHandoff;
    },
    get revealToken() {
      return revealToken;
    },
    get rowAxis() {
      return rowAxis;
    },
    get colAxis() {
      return colAxis;
    },
    load,
    restoreState,
    setLevel,
    setTurn,
    setTurnFor,
    setActiveAxis,
    setLabelMode,
    setSurface,
    setTheoryRatioFor,
    setTheoryRatios,
    linkTheoryRatios,
    unlinkTheoryRatios,
    setTheoryMode,
    selectTheoryPair,
    selectTheorySolo,
    surpriseMe,
    setPropType,
    setPropHand,
    toggleCatDog,
    adoptPropPair,
    selectPair,
    setMode,
    setPropMode,
    selectSolo,
    showMatrix,
    showDetail,
    setCompact,
    openAbout,
    closeAbout,
    togglePropPicker,
    closePropPicker,
    beginMandalaHandoff,
    endMandalaHandoff,
    get canShare() {
      return dependencies.link !== undefined;
    },
    shareLink,
  };
}

export type ShapeMatrixAppState = ReturnType<typeof createShapeMatrixAppState>;
