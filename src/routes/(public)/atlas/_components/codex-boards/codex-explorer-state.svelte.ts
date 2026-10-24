/**
 * The Codex explorer's state machine: the board's transforms, turns and
 * layers, the open letter and its variations in both grids, the explorer's
 * own transforms, the URL sync and the fan. Moved out of LetterCodex.svelte so
 * every host (the full board with its dialog, the drill-down screens) reads
 * one object instead of being handed two dozen callbacks.
 *
 * Construct it during a component's init: the inverted-letter lookup is an
 * $effect owned by that component.
 */
import { announcePictographEdit } from "#lib/shared/pictograph/shared/state/pictograph-edit-motion.svelte.js";
import { setGridRotationDirection } from "#lib/shared/pictograph/grid/state/grid-rotation-state.svelte.js";
import type { SequenceSelection } from "#lib/shared/selection/sequence-selection.svelte.js";
import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import { letterQueryHandler } from "#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js";
import {
  GridMode,
  type GridMode as GridModeValue,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  RotationDirection,
  type RotationDirection as RotationDirectionValue,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { TurnValue } from "#lib/shared/create/domain/turn-pattern-data.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { loadFoundingCollectionSequences } from "#lib/features/browse/collections/config/founding-collections.js";
import { filterSequencesByExactLetter } from "#lib/shared/browse/services/sequence-letter-occurrence.js";
import { mutateCurrentUrl } from "#lib/shared/navigation/services/url-state.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
import type { Box } from "./codex-fan";
import {
  CODEX_BOXES,
  CODEX_BY_LABEL,
  CODEX_LETTERS,
  CODEX_TYPE_BANDS,
  type CodexLetterInfo,
} from "./codex-letters";
import {
  editForTransform,
  formatExplorerTransforms,
  invertedLetterOf,
  invertsLetter,
  parseExplorerTransforms,
  transformVariation,
  type ExplorerTransformOp,
} from "./letter-explorer-transforms";
import {
  parseLetterExplorerEdits,
  parseLetterExplorerRoute,
  writeLetterExplorerEdits,
  writeLetterExplorerRoute,
  type LetterExplorerEdits,
  type LetterExplorerRouteState,
} from "./letter-explorer-url";
import {
  buildComposerDraftHref,
  buildLetterDraftSequence,
} from "./letter-explorer-draft";
import {
  applyTurnsToVariations,
  findMatchingVariation,
  motionAllowsFloat,
} from "./letter-explorer-variations";
import {
  codexData,
  type CodexCellDef,
} from "../../../codex/_data/codex-groups";
import {
  CODEX_VISIBILITY_STORAGE_KEY,
  codexResetTurnDirection,
  defaultCodexVisibility,
  formatCodexTransforms,
  parseCodexTransforms,
  restoreCodexVisibility,
  transformCodexPictograph,
  type CodexTransformOp,
  type CodexVisibility,
} from "../../../codex/_data/codex-view";
import {
  codexDataFrom,
  withStartOrientations,
  type CodexStartOrientations,
} from "../../../codex/_data/codex-orientation";

export interface CodexExplorerOptions {
  initialLetter: string;
  /** The board draws turns, transforms and layers, shared with the explorer
   *  (/codex). Without them the board draws the stored letters (/atlas). */
  boardControls: boolean;
  selection: SequenceSelection;
  /** Getters, so the page's props stay live. */
  propType: () => PropType | undefined;
  startOrientations: () => CodexStartOrientations | undefined;
}

function turnNumber(value: TurnValue): number {
  return value === "fl" ? -0.5 : value;
}

function nextTurns(
  current: TurnValue,
  delta: number,
  allowFloat: boolean
): TurnValue {
  const minimum = allowFloat ? -0.5 : 0;
  const value = Math.min(3, Math.max(minimum, turnNumber(current) + delta));
  return value === -0.5 ? "fl" : value;
}

export class CodexExplorerState {
  readonly boardControls: boolean;
  readonly selection: SequenceSelection;
  readonly allowedLetters = new Set(CODEX_BY_LABEL.keys());
  readonly fallback: CodexLetterInfo;
  readonly #propType: () => PropType | undefined;
  readonly #startOrientations: () => CodexStartOrientations | undefined;

  transforms = $state<CodexTransformOp[]>([]);
  visibility = $state<CodexVisibility>(defaultCodexVisibility());

  selectedId = $state("");
  gridMode = $state<GridModeValue>(GridMode.DIAMOND);
  selectedVariationIndex = $state(0);
  leftTurns = $state<TurnValue>(0);
  rightTurns = $state<TurnValue>(0);
  leftRotation = $state<RotationDirectionValue>(RotationDirection.CLOCKWISE);
  rightRotation = $state<RotationDirectionValue>(RotationDirection.CLOCKWISE);
  overlayOpen = $state(false);
  // The explorer's own transforms (with Invert), apart from the board's:
  // they start empty for each letter opened and ride in the URL as ?xf=.
  explorerOps = $state<ExplorerTransformOp[]>([]);
  // The letter this one becomes inverted, looked up once per letter opened.
  inverted = $state<{ from: string; to: string | null } | null>(null);
  // A click on a board cell opens the explorer as a deck dealt from that
  // cell (codex-fan.ts). The dialog skips its own pop so the cards measure
  // their true slots, and takes it back only as it closes, for the exit.
  fan = $state<{ origin: Box; key: number } | null>(null);
  fanning = $state(false);
  #fanCount = 0;
  #press: { origin: Box; at: number } | null = null;
  /** The cell last clicked, waiting for its grid's variations to load so
   *  the explorer can land on the variation it draws. */
  #pendingCell: PictographData | null = null;

  pictographsByGrid = $state<Record<string, PictographData[]>>({
    [GridMode.DIAMOND]: [],
    [GridMode.BOX]: [],
  });
  loadingByGrid = $state<Record<string, boolean>>({
    [GridMode.DIAMOND]: true,
    [GridMode.BOX]: true,
  });
  errorByGrid = $state<Record<string, boolean>>({
    [GridMode.DIAMOND]: false,
    [GridMode.BOX]: false,
  });

  learningDeck = $state<readonly SequenceData[]>([]);
  learningLoading = $state(true);
  learningError = $state(false);

  /** The first letter, drawn where the board itself is out of view. */
  readonly previewCell: CodexCellDef = CODEX_BOXES[0]!.box.cells[0]!;

  constructor(options: CodexExplorerOptions) {
    this.boardControls = options.boardControls;
    this.selection = options.selection;
    this.#propType = options.propType;
    this.#startOrientations = options.startOrientations;
    this.fallback =
      CODEX_BY_LABEL.get(options.initialLetter) ?? CODEX_BY_LABEL.get("A")!;
    this.selectedId = this.fallback.id;
    this.selection.select(this.fallback.id);

    $effect(() => {
      const base = this.variations[0];
      const from = this.info.label;
      if (!base || this.inverted?.from === from) return;
      let cancelled = false;
      invertedLetterOf(base)
        .then((to) => {
          if (!cancelled) this.inverted = { from, to };
        })
        .catch((error: unknown) => {
          console.warn("LetterCodex: inverted letter lookup failed", error);
        });
      return () => {
        cancelled = true;
      };
    });
  }

  get propType(): PropType | undefined {
    return this.#propType();
  }

  get startOrientations(): CodexStartOrientations | undefined {
    return this.#startOrientations();
  }

  // $derived.by, not $derived: the closure defers the read of this.fallback,
  // which the constructor sets after field initializers run. Plain tsc flags
  // the direct form as used-before-initialization (TS2729); Svelte evaluates
  // both lazily, so the behaviour is the same.
  readonly info = $derived.by(
    () => CODEX_LETTERS.get(this.selectedId) ?? this.fallback
  );

  /** A board cell as drawn: its start, then the transforms in the order
   *  pressed. Turns go on last and never move a hand. */
  placedCell(
    id: string,
    ops: readonly CodexTransformOp[]
  ): PictographData | null {
    const start = this.startOrientations;
    const base = start ? codexDataFrom(id, start) : codexData(id);
    return base && ops.length > 0 ? transformCodexPictograph(base, ops) : base;
  }

  // Every setting is read here, not inside the returned function, so the
  // board redraws when one changes.
  readonly boardData = $derived.by(() => {
    const start = this.startOrientations;
    if (!this.boardControls) {
      return start
        ? (id: string) => codexDataFrom(id, start)
        : undefined;
    }
    const ops = [...this.transforms];
    const edits = [
      this.leftTurns,
      this.rightTurns,
      this.leftRotation,
      this.rightRotation,
    ] as const;
    return (id: string): PictographData | null => {
      const placed = this.placedCell(id, ops);
      return placed
        ? (applyTurnsToVariations([placed], ...edits)[0] ?? null)
        : null;
    };
  });

  /** The first cell of a type (1-6), else the first letter. */
  previewFor(typeNumber: number | null): CodexCellDef {
    if (typeNumber === null) return this.previewCell;
    const band = CODEX_TYPE_BANDS.find((b) => b.type.n === typeNumber);
    return band?.boxes[0]?.box.cells[0] ?? this.previewCell;
  }

  #begun(pictographs: readonly PictographData[]): PictographData[] {
    const start = this.startOrientations;
    return start
      ? pictographs.map((p) => withStartOrientations(p, start))
      : [...pictographs];
  }

  readonly variations = $derived(
    this.#begun(
      (this.pictographsByGrid[this.gridMode] ?? []).filter(
        (pictograph) => pictograph.letter === this.info.label
      )
    )
  );
  readonly shownLabel = $derived(
    invertsLetter(this.explorerOps) &&
      this.inverted?.from === this.info.label &&
      this.inverted.to
      ? this.inverted.to
      : this.info.label
  );
  readonly shownInfo = $derived(
    CODEX_BY_LABEL.get(this.shownLabel) ?? this.info
  );
  // Transforms first, then turns, as on the board; turns recompute the ends
  // from the motion types Invert just changed.
  readonly editedVariations = $derived(
    applyTurnsToVariations(
      this.variations.map((variation) => ({
        ...transformVariation(variation, this.explorerOps),
        letter: this.shownLabel as Letter,
      })),
      this.leftTurns,
      this.rightTurns,
      this.leftRotation,
      this.rightRotation
    )
  );
  readonly selectedBase = $derived(
    this.variations[this.selectedVariationIndex] ?? this.variations[0] ?? null
  );
  readonly draft = $derived(
    this.editedVariations[this.selectedVariationIndex] ??
      this.editedVariations[0] ??
      null
  );
  readonly composerHref = $derived.by(() => {
    if (!this.draft) return null;
    try {
      return buildComposerDraftHref(buildLetterDraftSequence(this.draft));
    } catch (error) {
      console.error("LetterCodex: Composer draft could not be built", error);
      return null;
    }
  });
  readonly learningMatches = $derived(
    filterSequencesByExactLetter(this.learningDeck, this.shownLabel)
  );
  readonly isLoading = $derived(this.loadingByGrid[this.gridMode] ?? false);
  readonly loadError = $derived(this.errorByGrid[this.gridMode] ?? false);

  notePress = (event: Event): void => {
    const picture = (event.target as Element | null)
      ?.closest(".codex-cell")
      ?.querySelector(".picto");
    if (!picture) return;
    const { x, y, width, height } = picture.getBoundingClientRect();
    this.#press = { origin: { x, y, width, height }, at: performance.now() };
  };

  routeState(): LetterExplorerRouteState {
    return {
      letter: this.info.label,
      gridMode: this.gridMode,
      variation: this.selectedVariationIndex,
      leftTurns: this.leftTurns,
      rightTurns: this.rightTurns,
      leftRotation: this.leftRotation,
      rightRotation: this.rightRotation,
      transforms: formatExplorerTransforms(this.explorerOps),
    };
  }

  edits(): LetterExplorerEdits {
    return {
      leftTurns: this.leftTurns,
      rightTurns: this.rightTurns,
      leftRotation: this.leftRotation,
      rightRotation: this.rightRotation,
    };
  }

  setEdits(next: LetterExplorerEdits): void {
    this.leftTurns = next.leftTurns;
    this.rightTurns = next.rightTurns;
    this.leftRotation = next.leftRotation;
    this.rightRotation = next.rightRotation;
  }

  /** Turns changed: the whole route while a letter is open, else just the
   *  turns, which the board follows on its own. */
  commitEdits(): void {
    if (this.overlayOpen) {
      this.commitRoute();
      return;
    }
    mutateCurrentUrl((url) => writeLetterExplorerEdits(url, this.edits()));
  }

  commitRoute(mode: "push" | "replace" = "replace"): void {
    mutateCurrentUrl((url) => writeLetterExplorerRoute(url, this.routeState()), {
      mode,
    });
  }

  #resetEdits(): void {
    this.leftTurns = 0;
    this.rightTurns = 0;
    this.leftRotation = RotationDirection.CLOCKWISE;
    this.rightRotation = RotationDirection.CLOCKWISE;
  }

  /** The drill-down screens (/codex on a small window) keep the reader's
   *  settings when Back or Forward moves between screens: the board's
   *  transforms, the turns and spins, and the open letter's own transforms
   *  stay as they are and are written onto the entry arrived at. Without
   *  this, Back from the Adjust screen would undo everything set there,
   *  because Adjust rewrites its own entry and the one before it still holds
   *  the old settings. The full board keeps reading them from the entry. */
  carrySettings = false;

  /** Reads the explorer from the URL. With carry, only which letter is open
   *  (and its grid and variation) comes from the URL; see carrySettings. */
  syncFromUrl = (carry = false): void => {
    const params = new URLSearchParams(window.location.search);
    if (this.boardControls && !carry) {
      this.transforms = parseCodexTransforms(params.get("tf"));
    }
    const state = parseLetterExplorerRoute(params, this.allowedLetters);
    if (!state) {
      this.overlayOpen = false;
      this.explorerOps = [];
      if (this.boardControls && !carry) {
        this.setEdits(parseLetterExplorerEdits(params));
      }
      if (carry) this.#writeSettings();
      return;
    }

    const selectedInfo = CODEX_BY_LABEL.get(state.letter);
    if (!selectedInfo) return;
    const sameLetter = this.overlayOpen && this.selectedId === selectedInfo.id;
    this.selectedId = selectedInfo.id;
    this.selection.select(selectedInfo.id);
    this.gridMode = state.gridMode;
    this.selectedVariationIndex = state.variation;
    this.#pendingCell = null;
    if (!carry) this.setEdits(state);
    if (!carry || !sameLetter) {
      this.explorerOps = parseExplorerTransforms(state.transforms ?? null);
    }
    this.overlayOpen = true;
    if (carry) this.#writeSettings();
  };

  #onPopState = (): void => {
    this.syncFromUrl(this.carrySettings);
  };

  /** The settings as they are, onto the current entry. */
  #writeSettings(): void {
    const tf = this.boardControls ? formatCodexTransforms(this.transforms) : null;
    mutateCurrentUrl((url) => {
      if (this.boardControls) {
        if (tf === null) url.searchParams.delete("tf");
        else url.searchParams.set("tf", tf);
      }
      if (this.overlayOpen) writeLetterExplorerRoute(url, this.routeState());
      else if (this.boardControls) writeLetterExplorerEdits(url, this.edits());
    });
  }

  #letterVariations(mode: GridModeValue): PictographData[] {
    return (this.pictographsByGrid[mode] ?? []).filter(
      (pictograph) => pictograph.letter === this.info.label
    );
  }

  #landOn(cell: PictographData): void {
    const options = this.#letterVariations(this.gridMode);
    if (options.length === 0) {
      this.#pendingCell = cell;
      return;
    }
    this.#pendingCell = null;
    this.selectedVariationIndex = Math.max(
      0,
      findMatchingVariation(options, cell)
    );
  }

  #normalizeVariation(mode: GridModeValue): void {
    if (mode !== this.gridMode) return;
    if (this.#pendingCell) {
      this.#landOn(this.#pendingCell);
      this.commitRoute();
      return;
    }
    const count = this.#letterVariations(mode).length;
    if (count === 0 || this.selectedVariationIndex < count) return;
    this.selectedVariationIndex = 0;
    this.commitRoute();
  }

  loadGrid = async (mode: GridModeValue): Promise<void> => {
    this.loadingByGrid = { ...this.loadingByGrid, [mode]: true };
    this.errorByGrid = { ...this.errorByGrid, [mode]: false };
    try {
      const pictographs =
        await letterQueryHandler.getAllPictographVariations(mode);
      this.pictographsByGrid = { ...this.pictographsByGrid, [mode]: pictographs };
      this.#normalizeVariation(mode);
    } catch (error) {
      console.error(`LetterCodex: ${mode} variations failed to load`, error);
      this.errorByGrid = { ...this.errorByGrid, [mode]: true };
    } finally {
      this.loadingByGrid = { ...this.loadingByGrid, [mode]: false };
    }
  };

  loadLearningDeck = async (): Promise<void> => {
    this.learningLoading = true;
    this.learningError = false;
    try {
      this.learningDeck =
        await loadFoundingCollectionSequences("founding_tka-1");
    } catch (error) {
      console.error("LetterCodex: Learning Letters deck failed to load", error);
      this.learningError = true;
    } finally {
      this.learningLoading = false;
    }
  };

  #persistVisibility(): void {
    try {
      localStorage.setItem(
        CODEX_VISIBILITY_STORAGE_KEY,
        JSON.stringify(this.visibility)
      );
    } catch {
      // Private mode or a full store: the layers just are not remembered.
    }
  }

  toggleLayer = (key: keyof CodexVisibility): void => {
    this.visibility = { ...this.visibility, [key]: !this.visibility[key] };
    this.#persistVisibility();
  };

  #writeTransforms(): void {
    const value = formatCodexTransforms(this.transforms);
    mutateCurrentUrl((url) => {
      if (value === null) url.searchParams.delete("tf");
      else url.searchParams.set("tf", value);
    });
  }

  transformBoard = (op: CodexTransformOp): void => {
    // Board cells draw without the edit clock, so each grid plays its own
    // turn in the shared direction. Set it first, or a left turn spins the
    // grid right while the hands go left. The Adjust screen's preview does
    // ride the clock: announcing the edit turns its grid with its props.
    if (op === "rotate") setGridRotationDirection(1);
    else if (op === "rotate-ccw") setGridRotationDirection(-1);
    announcePictographEdit(editForTransform(op));
    this.transforms = [...this.transforms, op];
    this.#writeTransforms();
  };

  resetTransforms = (): void => {
    const direction = codexResetTurnDirection(this.transforms);
    if (direction !== null) setGridRotationDirection(direction);
    this.transforms = [];
    this.#writeTransforms();
  };

  /** What onMount did in LetterCodex: restore the layers, read the URL, load
   *  both grids and the TKA 1 deck, follow Back and Forward. */
  mount(): () => void {
    if (this.boardControls) {
      try {
        this.visibility = restoreCodexVisibility(
          localStorage.getItem(CODEX_VISIBILITY_STORAGE_KEY)
        );
      } catch {
        // Storage blocked: keep the default layers.
      }
    }
    this.syncFromUrl();
    void Promise.all([
      this.loadGrid(GridMode.DIAMOND),
      this.loadGrid(GridMode.BOX),
    ]);
    void this.loadLearningDeck();
    window.addEventListener("popstate", this.#onPopState);
    return () => window.removeEventListener("popstate", this.#onPopState);
  }

  select = (id: string): void => {
    const selectedInfo = CODEX_LETTERS.get(id);
    if (!selectedInfo) return;
    this.selectedId = id;
    this.selection.select(id);
    // The explorer opens on the variation the clicked cell draws, in that
    // cell's grid: a rotated board shows Box cells.
    const cell = this.placedCell(id, this.boardControls ? this.transforms : []);
    this.gridMode = cell?.motions?.[HandSide.LEFT]?.gridMode ?? GridMode.DIAMOND;
    this.selectedVariationIndex = 0;
    if (cell) this.#landOn(cell);
    if (!this.boardControls) this.#resetEdits();
    this.explorerOps = [];
    const press = this.#press;
    const origin =
      press && performance.now() - press.at < 1500 ? press.origin : null;
    this.#press = null;
    this.fan = origin ? { origin, key: ++this.#fanCount } : null;
    this.fanning = this.fan !== null;
    this.overlayOpen = true;
    this.commitRoute("push");
  };

  closeExplorer = (): void => {
    this.overlayOpen = false;
    this.fan = null;
    this.fanning = false;
    this.#pendingCell = null;
    this.explorerOps = [];
    mutateCurrentUrl(
      (url) => {
        writeLetterExplorerRoute(url, null);
        if (this.boardControls) writeLetterExplorerEdits(url, this.edits());
      },
      { mode: "push" }
    );
  };

  /** The Letter screen was left (/codex drill-down): the explorer's state
   *  goes as closeExplorer leaves it, and the page writes the URL. */
  leaveLetter = (): void => {
    this.overlayOpen = false;
    this.fan = null;
    this.fanning = false;
    this.#pendingCell = null;
    this.explorerOps = [];
  };

  transformExplorer = (op: ExplorerTransformOp): void => {
    // The pictures travel to their new drawing on the shared edit clock. A
    // tile that misses the clock still turns its grid the same way.
    if (op === "rotate") setGridRotationDirection(1);
    else if (op === "rotate-ccw") setGridRotationDirection(-1);
    announcePictographEdit(editForTransform(op));
    this.explorerOps = [...this.explorerOps, op];
    this.commitRoute();
  };

  resetExplorerTransforms = (): void => {
    this.explorerOps = [];
    this.commitRoute();
  };

  changeTurns = (color: HandSide, delta: number): void => {
    // From the board every kind of letter is in play, so float is allowed;
    // letters that cannot float stay at zero (applyTurnsToVariations).
    const allowFloat =
      !this.overlayOpen || motionAllowsFloat(this.selectedBase, color);
    if (color === HandSide.LEFT) {
      this.leftTurns = nextTurns(this.leftTurns, delta, allowFloat);
    } else {
      this.rightTurns = nextTurns(this.rightTurns, delta, allowFloat);
    }
    this.commitEdits();
  };

  changeRotation = (
    color: HandSide,
    direction: RotationDirectionValue
  ): void => {
    if (color === HandSide.LEFT) this.leftRotation = direction;
    else this.rightRotation = direction;
    this.commitEdits();
  };

  resetExplorerEdits = (): void => {
    this.#resetEdits();
    this.commitEdits();
  };

  /** Everything back to its default: the board's transforms, the explorer's
   *  own, and the turns and spins. Start orientations belong to the page. */
  resetAll = (): void => {
    if (this.transforms.length > 0) this.resetTransforms();
    if (this.explorerOps.length > 0) {
      if (this.overlayOpen) this.resetExplorerTransforms();
      else this.explorerOps = [];
    }
    this.resetExplorerEdits();
  };

  copyExactLink = async (): Promise<void> => {
    const exactUrl = new URL(window.location.href);
    writeLetterExplorerRoute(exactUrl, this.routeState());
    mutateCurrentUrl((url) => writeLetterExplorerRoute(url, this.routeState()));
    try {
      await navigator.clipboard.writeText(exactUrl.href);
      toast.success("Exact letter link copied");
    } catch {
      toast.error("Could not copy the letter link");
    }
  };
}
