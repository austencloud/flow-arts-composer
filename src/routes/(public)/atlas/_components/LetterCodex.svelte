<!--
  LetterCodex is the host for the visual letter reference. The boards own the
  overview; LetterExplorer owns the focused, shareable letter destination.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import {
    SequenceSelection,
    setSequenceSelection,
  } from "#lib/shared/selection/sequence-selection.svelte.js";
  import "#lib/shared/selection/selection.css";
  import "./codex-boards/codex-dark.css";
  import BoardAtlas from "./codex-boards/BoardAtlas.svelte";
  import LetterExplorer from "./codex-boards/LetterExplorer.svelte";
  import CodexBoardControls from "./codex-boards/CodexBoardControls.svelte";
  import CodexLetterGlyph from "./codex-boards/CodexLetterGlyph.svelte";
  import {
    editForTransform,
    formatExplorerTransforms,
    invertedLetterOf,
    invertsLetter,
    parseExplorerTransforms,
    transformVariation,
    type ExplorerTransformOp,
  } from "./codex-boards/letter-explorer-transforms";
  import { announcePictographEdit } from "#lib/shared/pictograph/shared/state/pictograph-edit-motion.svelte.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
  import type { Box } from "./codex-boards/codex-fan";
  import {
    CODEX_BY_LABEL,
    CODEX_LETTERS,
    type CodexLetterInfo,
  } from "./codex-boards/codex-letters";
  import {
    parseLetterExplorerEdits,
    parseLetterExplorerRoute,
    writeLetterExplorerEdits,
    writeLetterExplorerRoute,
    type LetterExplorerEdits,
    type LetterExplorerRouteState,
  } from "./codex-boards/letter-explorer-url";
  import {
    buildComposerDraftHref,
    buildLetterDraftSequence,
  } from "./codex-boards/letter-explorer-draft";
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
  import {
    applyTurnsToVariations,
    findMatchingVariation,
    motionAllowsFloat,
  } from "./codex-boards/letter-explorer-variations";
  import { codexData } from "../../codex/_data/codex-groups";
  import {
    CODEX_VISIBILITY_STORAGE_KEY,
    defaultCodexVisibility,
    formatCodexTransforms,
    parseCodexTransforms,
    restoreCodexVisibility,
    transformCodexPictograph,
    type CodexTransformOp,
    type CodexVisibility,
  } from "../../codex/_data/codex-view";
  import { loadFoundingCollectionSequences } from "#lib/features/browse/collections/config/founding-collections.js";
  import { filterSequencesByExactLetter } from "#lib/shared/browse/services/sequence-letter-occurrence.js";
  import { mutateCurrentUrl } from "#lib/shared/navigation/services/url-state.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    codexDataFrom,
    withStartOrientations,
    type CodexStartOrientations,
  } from "../../codex/_data/codex-orientation";

  let {
    initialLetter = "A",
    propType,
    startOrientations,
    boardControls = false,
  }: {
    initialLetter?: string;
    /** Show turns, transforms and layers above the board, and draw the board
     *  with them. Turns are then one setting shared by the board and the
     *  explorer, so they survive opening, closing and changing letters. */
    boardControls?: boolean;
    /** The prop the board and explorer draw; omitted keeps the dataset's own. */
    propType?: PropType;
    /** Where each hand starts on the Atlas board and in the explorer, with
     *  every end recalculated; omitted starts the board thumbs in and keeps
     *  the explorer's stored orientations. */
    startOrientations?: CodexStartOrientations;
  } = $props();

  let transforms = $state<CodexTransformOp[]>([]);
  let visibility = $state<CodexVisibility>(defaultCodexVisibility());

  /** A board cell as drawn: its start, then the transforms in the order
   *  pressed. Turns go on last and never move a hand. */
  function placedCell(
    id: string,
    ops: readonly CodexTransformOp[]
  ): PictographData | null {
    const base = startOrientations
      ? codexDataFrom(id, startOrientations)
      : codexData(id);
    return base && ops.length > 0 ? transformCodexPictograph(base, ops) : base;
  }

  // Every setting is read here, not inside the returned function, so the
  // board redraws when one changes.
  const boardData = $derived.by(() => {
    if (!boardControls) {
      return startOrientations
        ? (id: string) => codexDataFrom(id, startOrientations)
        : undefined;
    }
    const ops = [...transforms];
    const edits = [leftTurns, rightTurns, leftRotation, rightRotation] as const;
    void startOrientations;
    return (id: string): PictographData | null => {
      const placed = placedCell(id, ops);
      return placed
        ? (applyTurnsToVariations([placed], ...edits)[0] ?? null)
        : null;
    };
  });

  function begun(pictographs: readonly PictographData[]): PictographData[] {
    return startOrientations
      ? pictographs.map((p) => withStartOrientations(p, startOrientations))
      : [...pictographs];
  }

  const selection = new SequenceSelection();
  setSequenceSelection(selection);

  const allowedLetters = new Set(CODEX_BY_LABEL.keys());
  const fallback: CodexLetterInfo =
    CODEX_BY_LABEL.get(initialLetter) ?? CODEX_BY_LABEL.get("A")!;

  let selectedId = $state(fallback.id);
  selection.select(fallback.id);

  const info = $derived(CODEX_LETTERS.get(selectedId) ?? fallback);

  let gridMode = $state<GridModeValue>(GridMode.DIAMOND);
  let selectedVariationIndex = $state(0);
  let leftTurns = $state<TurnValue>(0);
  let rightTurns = $state<TurnValue>(0);
  let leftRotation = $state<RotationDirectionValue>(
    RotationDirection.CLOCKWISE
  );
  let rightRotation = $state<RotationDirectionValue>(
    RotationDirection.CLOCKWISE
  );
  let overlayOpen = $state(false);
  // The explorer's own transforms (with Invert), apart from the board's:
  // they start empty for each letter opened and ride in the URL as ?xf=.
  let explorerOps = $state<ExplorerTransformOp[]>([]);
  // The letter this one becomes inverted, looked up once per letter opened.
  let inverted = $state<{ from: string; to: string | null } | null>(null);
  let headerHeight = $state(0);
  // A click on a board cell opens the explorer as a deck dealt from that
  // cell (codex-fan.ts). The dialog skips its own pop so the cards measure
  // their true slots, and takes it back only as it closes, for the exit.
  // Switching back while open, in the same frame the fan restores the
  // dialog's clip, makes Chrome play the pop entrance again: the whole
  // dialog blinks out and fades back in.
  let fan = $state<{ origin: Box; key: number } | null>(null);
  let fanning = $state(false);
  let fanCount = 0;
  let press: { origin: Box; at: number } | null = null;

  function notePress(event: Event): void {
    const picture = (event.target as Element | null)
      ?.closest(".codex-cell")
      ?.querySelector(".picto");
    if (!picture) return;
    const { x, y, width, height } = picture.getBoundingClientRect();
    press = { origin: { x, y, width, height }, at: performance.now() };
  }

  let pictographsByGrid = $state<Record<string, PictographData[]>>({
    [GridMode.DIAMOND]: [],
    [GridMode.BOX]: [],
  });
  let loadingByGrid = $state<Record<string, boolean>>({
    [GridMode.DIAMOND]: true,
    [GridMode.BOX]: true,
  });
  let errorByGrid = $state<Record<string, boolean>>({
    [GridMode.DIAMOND]: false,
    [GridMode.BOX]: false,
  });

  let learningDeck = $state<readonly SequenceData[]>([]);
  let learningLoading = $state(true);
  let learningError = $state(false);

  const variations = $derived(
    begun(
      (pictographsByGrid[gridMode] ?? []).filter(
        (pictograph) => pictograph.letter === info.label
      )
    )
  );
  const shownLabel = $derived(
    invertsLetter(explorerOps) && inverted?.from === info.label && inverted.to
      ? inverted.to
      : info.label
  );
  const shownInfo = $derived(CODEX_BY_LABEL.get(shownLabel) ?? info);
  // Transforms first, then turns, as on the board; turns recompute the ends
  // from the motion types Invert just changed.
  const editedVariations = $derived(
    applyTurnsToVariations(
      variations.map((variation) => ({
        ...transformVariation(variation, explorerOps),
        letter: shownLabel as Letter,
      })),
      leftTurns,
      rightTurns,
      leftRotation,
      rightRotation
    )
  );
  const selectedBase = $derived(
    variations[selectedVariationIndex] ?? variations[0] ?? null
  );
  const draft = $derived(
    editedVariations[selectedVariationIndex] ?? editedVariations[0] ?? null
  );
  const composerHref = $derived.by(() => {
    if (!draft) return null;
    try {
      return buildComposerDraftHref(buildLetterDraftSequence(draft));
    } catch (error) {
      console.error("LetterCodex: Composer draft could not be built", error);
      return null;
    }
  });
  const learningMatches = $derived(
    filterSequencesByExactLetter(learningDeck, shownLabel)
  );

  $effect(() => {
    const base = variations[0];
    const from = info.label;
    if (!base || inverted?.from === from) return;
    let cancelled = false;
    invertedLetterOf(base)
      .then((to) => {
        if (!cancelled) inverted = { from, to };
      })
      .catch((error: unknown) => {
        console.warn("LetterCodex: inverted letter lookup failed", error);
      });
    return () => {
      cancelled = true;
    };
  });
  const isLoading = $derived(loadingByGrid[gridMode] ?? false);
  const loadError = $derived(errorByGrid[gridMode] ?? false);

  function routeState(): LetterExplorerRouteState {
    return {
      letter: info.label,
      gridMode,
      variation: selectedVariationIndex,
      leftTurns,
      rightTurns,
      leftRotation,
      rightRotation,
      transforms: formatExplorerTransforms(explorerOps),
    };
  }

  function edits(): LetterExplorerEdits {
    return { leftTurns, rightTurns, leftRotation, rightRotation };
  }

  function setEdits(next: LetterExplorerEdits): void {
    leftTurns = next.leftTurns;
    rightTurns = next.rightTurns;
    leftRotation = next.leftRotation;
    rightRotation = next.rightRotation;
  }

  /** Turns changed: the whole route while a letter is open, else just the
   *  turns, which the board follows on its own. */
  function commitEdits(): void {
    if (overlayOpen) {
      commitRoute();
      return;
    }
    mutateCurrentUrl((url) => writeLetterExplorerEdits(url, edits()));
  }

  function commitRoute(mode: "push" | "replace" = "replace"): void {
    mutateCurrentUrl((url) => writeLetterExplorerRoute(url, routeState()), {
      mode,
    });
  }

  function resetEdits(): void {
    leftTurns = 0;
    rightTurns = 0;
    leftRotation = RotationDirection.CLOCKWISE;
    rightRotation = RotationDirection.CLOCKWISE;
  }

  function syncFromUrl(): void {
    const params = new URLSearchParams(window.location.search);
    if (boardControls) transforms = parseCodexTransforms(params.get("tf"));
    const state = parseLetterExplorerRoute(params, allowedLetters);
    if (!state) {
      overlayOpen = false;
      explorerOps = [];
      if (boardControls) setEdits(parseLetterExplorerEdits(params));
      return;
    }

    const selectedInfo = CODEX_BY_LABEL.get(state.letter);
    if (!selectedInfo) return;
    selectedId = selectedInfo.id;
    selection.select(selectedInfo.id);
    gridMode = state.gridMode;
    selectedVariationIndex = state.variation;
    pendingCell = null;
    setEdits(state);
    explorerOps = parseExplorerTransforms(state.transforms ?? null);
    overlayOpen = true;
  }

  /** The cell last clicked, waiting for its grid's variations to load so
   *  the explorer can land on the variation it draws. */
  let pendingCell: PictographData | null = null;

  function letterVariations(mode: GridModeValue): PictographData[] {
    return (pictographsByGrid[mode] ?? []).filter(
      (pictograph) => pictograph.letter === info.label
    );
  }

  function landOn(cell: PictographData): void {
    const options = letterVariations(gridMode);
    if (options.length === 0) {
      pendingCell = cell;
      return;
    }
    pendingCell = null;
    selectedVariationIndex = Math.max(0, findMatchingVariation(options, cell));
  }

  function normalizeVariation(mode: GridModeValue): void {
    if (mode !== gridMode) return;
    if (pendingCell) {
      landOn(pendingCell);
      commitRoute();
      return;
    }
    const count = letterVariations(mode).length;
    if (count === 0 || selectedVariationIndex < count) return;
    selectedVariationIndex = 0;
    commitRoute();
  }

  async function loadGrid(mode: GridModeValue): Promise<void> {
    loadingByGrid = { ...loadingByGrid, [mode]: true };
    errorByGrid = { ...errorByGrid, [mode]: false };
    try {
      const pictographs =
        await letterQueryHandler.getAllPictographVariations(mode);
      pictographsByGrid = { ...pictographsByGrid, [mode]: pictographs };
      normalizeVariation(mode);
    } catch (error) {
      console.error(`LetterCodex: ${mode} variations failed to load`, error);
      errorByGrid = { ...errorByGrid, [mode]: true };
    } finally {
      loadingByGrid = { ...loadingByGrid, [mode]: false };
    }
  }

  async function loadLearningDeck(): Promise<void> {
    learningLoading = true;
    learningError = false;
    try {
      learningDeck = await loadFoundingCollectionSequences("founding_tka-1");
    } catch (error) {
      console.error("LetterCodex: Learning Letters deck failed to load", error);
      learningError = true;
    } finally {
      learningLoading = false;
    }
  }

  function persistVisibility(): void {
    try {
      localStorage.setItem(
        CODEX_VISIBILITY_STORAGE_KEY,
        JSON.stringify(visibility)
      );
    } catch {
      // Private mode or a full store: the layers just are not remembered.
    }
  }

  function toggleLayer(key: keyof CodexVisibility): void {
    visibility = { ...visibility, [key]: !visibility[key] };
    persistVisibility();
  }

  function writeTransforms(): void {
    const value = formatCodexTransforms(transforms);
    mutateCurrentUrl((url) => {
      if (value === null) url.searchParams.delete("tf");
      else url.searchParams.set("tf", value);
    });
  }

  function transformBoard(op: CodexTransformOp): void {
    transforms = [...transforms, op];
    writeTransforms();
  }

  function resetTransforms(): void {
    transforms = [];
    writeTransforms();
  }

  onMount(() => {
    if (boardControls) {
      try {
        visibility = restoreCodexVisibility(
          localStorage.getItem(CODEX_VISIBILITY_STORAGE_KEY)
        );
      } catch {
        // Storage blocked: keep the default layers.
      }
    }
    syncFromUrl();
    void Promise.all([loadGrid(GridMode.DIAMOND), loadGrid(GridMode.BOX)]);
    void loadLearningDeck();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  });

  function select(id: string): void {
    const selectedInfo = CODEX_LETTERS.get(id);
    if (!selectedInfo) return;
    selectedId = id;
    selection.select(id);
    // The explorer opens on the variation the clicked cell draws, in that
    // cell's grid: a rotated board shows Box cells.
    const cell = placedCell(id, boardControls ? transforms : []);
    gridMode = cell?.motions?.[HandSide.LEFT]?.gridMode ?? GridMode.DIAMOND;
    selectedVariationIndex = 0;
    if (cell) landOn(cell);
    if (!boardControls) resetEdits();
    explorerOps = [];
    const origin =
      press && performance.now() - press.at < 1500 ? press.origin : null;
    press = null;
    fan = origin ? { origin, key: ++fanCount } : null;
    fanning = fan !== null;
    overlayOpen = true;
    commitRoute("push");
  }

  function closeExplorer(): void {
    overlayOpen = false;
    fan = null;
    fanning = false;
    pendingCell = null;
    explorerOps = [];
    mutateCurrentUrl(
      (url) => {
        writeLetterExplorerRoute(url, null);
        if (boardControls) writeLetterExplorerEdits(url, edits());
      },
      { mode: "push" }
    );
  }

  function transformExplorer(op: ExplorerTransformOp): void {
    // The pictures travel to their new drawing on the shared edit clock.
    announcePictographEdit(editForTransform(op));
    explorerOps = [...explorerOps, op];
    commitRoute();
  }

  function resetExplorerTransforms(): void {
    explorerOps = [];
    commitRoute();
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

  function changeTurns(color: HandSide, delta: number): void {
    // From the board every kind of letter is in play, so float is allowed;
    // letters that cannot float stay at zero (applyTurnsToVariations).
    const allowFloat = !overlayOpen || motionAllowsFloat(selectedBase, color);
    if (color === HandSide.LEFT) {
      leftTurns = nextTurns(leftTurns, delta, allowFloat);
    } else {
      rightTurns = nextTurns(rightTurns, delta, allowFloat);
    }
    commitEdits();
  }

  function changeRotation(
    color: HandSide,
    direction: RotationDirectionValue
  ): void {
    if (color === HandSide.LEFT) leftRotation = direction;
    else rightRotation = direction;
    commitEdits();
  }

  function resetExplorerEdits(): void {
    resetEdits();
    commitEdits();
  }

  async function copyExactLink(): Promise<void> {
    const exactUrl = new URL(window.location.href);
    writeLetterExplorerRoute(exactUrl, routeState());
    mutateCurrentUrl((url) => writeLetterExplorerRoute(url, routeState()));
    try {
      await navigator.clipboard.writeText(exactUrl.href);
      toast.success("Exact letter link copied");
    } catch {
      toast.error("Could not copy the letter link");
    }
  }
</script>

<div
  class="codex codex-dark"
  onpointerdowncapture={notePress}
  onkeydowncapture={notePress}
>
  {#if boardControls}
    <CodexBoardControls
      {leftTurns}
      {rightTurns}
      {leftRotation}
      {rightRotation}
      transformed={transforms.length > 0}
      {visibility}
      onTurnsChange={changeTurns}
      onRotationChange={changeRotation}
      onTransform={transformBoard}
      onResetTransforms={resetTransforms}
      onResetTurns={resetExplorerEdits}
      onToggleLayer={toggleLayer}
    />
  {/if}
  <BoardAtlas
    onSelect={select}
    {propType}
    getData={boardData}
    visibility={boardControls ? visibility : undefined}
  />
</div>

<BaseModal
  bind:open={overlayOpen}
  size="fit"
  animation={fanning ? "none" : "pop"}
  labelledBy="codex-overlay-title"
  class="codex-explorer-modal codex-dark"
  onclose={closeExplorer}
>
  {#snippet header()}
    <div bind:clientHeight={headerHeight}>
      <ModalHeader
        id="codex-overlay-title"
        title={shownInfo.name
          ? `${shownLabel} · ${shownInfo.name}`
          : shownLabel}
        iconColor={shownInfo.typeColor}
        onClose={closeExplorer}
      >
        {#snippet titleContent()}
          <Crossfade key={shownLabel} duration={DURATION.normal}>
            <CodexLetterGlyph letter={shownLabel} />
          </Crossfade>
        {/snippet}
      </ModalHeader>
    </div>
  {/snippet}
  <LetterExplorer
    label={shownLabel}
    tileKey={`${info.id}-${gridMode}`}
    variations={editedVariations}
    selectedIndex={selectedVariationIndex}
    {leftTurns}
    {rightTurns}
    {leftRotation}
    {rightRotation}
    transformed={explorerOps.length > 0}
    {isLoading}
    {loadError}
    {learningMatches}
    {learningError}
    {composerHref}
    {headerHeight}
    onTurnsChange={changeTurns}
    onRotationChange={changeRotation}
    onResetTurns={resetExplorerEdits}
    onTransform={transformExplorer}
    onResetTransforms={resetExplorerTransforms}
    onRetry={() => loadGrid(gridMode)}
    onLearningRetry={loadLearningDeck}
    onCopyLink={copyExactLink}
    {propType}
    {fan}
  />
</BaseModal>

<style>
  .codex {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.35rem 0 0;
  }

  /* The dialog wraps its content (LetterExplorer sizes the variations to the
     screen), up to BaseModal's own height cap. */
  :global(dialog.base-modal.codex-explorer-modal[data-size="fit"]) {
    width: fit-content;
    min-width: min(30rem, calc(100vw - 32px));
    max-width: 94vw;
  }

  /* The letter sits in the middle of the dialog: an empty column the close
     button's width balances it on the left. */
  :global(.codex-explorer-modal .modal-header) {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
  }

  :global(.codex-explorer-modal .modal-header .header-text) {
    grid-column: 2;
  }

  :global(.codex-explorer-modal .header-title) {
    --letter-glyph-h: 3rem;
    display: flex;
    justify-content: center;
  }

  /* While the deck is dealt the dialog appears at once (no pop), and the
     words around the cards rise in with them. */
  :global(
    dialog.codex-explorer-modal[data-animation="none"] .modal-header-slot
  ),
  :global(dialog.codex-explorer-modal[data-animation="none"] .toolbar),
  :global(dialog.codex-explorer-modal[data-animation="none"] .footer) {
    animation: codex-explorer-in var(--duration-emphasis)
      var(--ease-standard-out) both;
  }

  /* The backdrop only fades: a blur growing from zero repaints the whole
     screen on the main thread every frame, under the deck. */
  @starting-style {
    :global(
      dialog.codex-explorer-modal[data-animation="none"][open]::backdrop
    ) {
      backdrop-filter: blur(var(--modal-backdrop-blur));
      -webkit-backdrop-filter: blur(var(--modal-backdrop-blur));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(
      dialog.codex-explorer-modal[data-animation="none"] .modal-header-slot
    ),
    :global(dialog.codex-explorer-modal[data-animation="none"] .toolbar),
    :global(dialog.codex-explorer-modal[data-animation="none"] .footer) {
      animation: none;
    }
  }

  @keyframes -global-codex-explorer-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }

  @media (max-width: 520px) {
    :global(dialog.base-modal.codex-explorer-modal[data-size="fit"]) {
      width: calc(100vw - 32px);
      max-width: none;
    }
  }
</style>
