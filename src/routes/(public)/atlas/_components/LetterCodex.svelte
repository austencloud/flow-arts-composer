<!--
  LetterCodex is the host for the visual letter reference. The boards own the
  overview; LetterExplorer owns the focused, shareable letter destination.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import {
    SequenceSelection,
    setSequenceSelection,
  } from "#lib/shared/selection/sequence-selection.svelte.js";
  import "#lib/shared/selection/selection.css";
  import "./codex-boards/codex-dark.css";
  import BoardSheets from "./codex-boards/BoardSheets.svelte";
  import BoardAtlas from "./codex-boards/BoardAtlas.svelte";
  import BoardStage from "./codex-boards/BoardStage.svelte";
  import CodexTypeLegend from "./codex-boards/CodexTypeLegend.svelte";
  import LetterExplorer from "./codex-boards/LetterExplorer.svelte";
  import type { BoardKey } from "./codex-boards/board-choice";
  import {
    CODEX_BY_LABEL,
    CODEX_LETTERS,
    type CodexLetterInfo,
  } from "./codex-boards/codex-letters";
  import {
    hasLetterExplorerEdits,
    parseLetterExplorerRoute,
    writeLetterExplorerRoute,
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
    motionAllowsFloat,
  } from "./codex-boards/letter-explorer-variations";
  import { loadFoundingCollectionSequences } from "#lib/features/browse/collections/config/founding-collections.js";
  import { filterSequencesByExactLetter } from "#lib/shared/browse/services/sequence-letter-occurrence.js";
  import { mutateCurrentUrl } from "#lib/shared/navigation/services/url-state.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

  let {
    initialLetter = "A",
    board = "atlas",
  }: {
    initialLetter?: string;
    board?: BoardKey;
  } = $props();

  const selection = new SequenceSelection();
  setSequenceSelection(selection);

  const allowedLetters = new Set(CODEX_BY_LABEL.keys());
  const fallback: CodexLetterInfo =
    CODEX_BY_LABEL.get(initialLetter) ?? CODEX_BY_LABEL.get("A")!;

  let selectedId = $state(fallback.id);
  selection.select(fallback.id);

  const info = $derived(CODEX_LETTERS.get(selectedId) ?? fallback);
  const overlayBoard = $derived(board !== "stage");

  let gridMode = $state<GridModeValue>(GridMode.DIAMOND);
  let selectedVariationIndex = $state(0);
  let leftTurns = $state<TurnValue>(0);
  let rightTurns = $state<TurnValue>(0);
  let leftRotation = $state<RotationDirectionValue>(
    RotationDirection.CLOCKWISE
  );
  let rightRotation = $state<RotationDirectionValue>(RotationDirection.CLOCKWISE);
  let overlayOpen = $state(false);
  let stageBoard = $state<ReturnType<typeof BoardStage> | undefined>();

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
    (pictographsByGrid[gridMode] ?? []).filter(
      (pictograph) => pictograph.letter === info.label
    )
  );
  const stageVariations = $derived(
    (pictographsByGrid[GridMode.DIAMOND] ?? []).filter(
      (pictograph) => pictograph.letter === info.label
    )
  );
  const editedVariations = $derived(
    applyTurnsToVariations(
      variations,
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
    filterSequencesByExactLetter(learningDeck, info.label)
  );
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
    };
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
    const state = parseLetterExplorerRoute(
      new URLSearchParams(window.location.search),
      allowedLetters
    );
    if (!state) {
      overlayOpen = false;
      return;
    }

    const selectedInfo = CODEX_BY_LABEL.get(state.letter);
    if (!selectedInfo) return;
    selectedId = selectedInfo.id;
    selection.select(selectedInfo.id);
    gridMode = state.gridMode;
    selectedVariationIndex = state.variation;
    leftTurns = state.leftTurns;
    rightTurns = state.rightTurns;
    leftRotation = state.leftRotation;
    rightRotation = state.rightRotation;
    overlayOpen = overlayBoard;
  }

  function normalizeVariation(mode: GridModeValue): void {
    if (mode !== gridMode) return;
    const count = (pictographsByGrid[mode] ?? []).filter(
      (pictograph) => pictograph.letter === info.label
    ).length;
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

  onMount(() => {
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

    if (overlayBoard) {
      selectedVariationIndex = 0;
      resetEdits();
      overlayOpen = true;
      commitRoute("push");
      return;
    }

    tick().then(() => stageBoard?.revealStage());
  }

  function closeExplorer(): void {
    overlayOpen = false;
    mutateCurrentUrl((url) => writeLetterExplorerRoute(url, null), {
      mode: "push",
    });
  }

  function selectGrid(next: GridModeValue): void {
    if (next === gridMode) return;
    gridMode = next;
    selectedVariationIndex = 0;
    resetEdits();
    commitRoute("push");
  }

  function selectVariation(index: number): void {
    if (index < 0 || index >= variations.length) return;
    selectedVariationIndex = index;
    commitRoute("push");
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
    if (color === HandSide.LEFT) {
      leftTurns = nextTurns(
        leftTurns,
        delta,
        motionAllowsFloat(selectedBase, color)
      );
    } else {
      rightTurns = nextTurns(
        rightTurns,
        delta,
        motionAllowsFloat(selectedBase, color)
      );
    }
    commitRoute();
  }

  function changeRotation(
    color: HandSide,
    direction: RotationDirectionValue
  ): void {
    if (color === HandSide.LEFT) leftRotation = direction;
    else rightRotation = direction;
    commitRoute();
  }

  function resetExplorerEdits(): void {
    resetEdits();
    commitRoute();
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

<div class="codex codex-dark">
  {#if board === "stage"}
    <CodexTypeLegend />
  {/if}

  {#if board === "sheets"}
    <BoardSheets onSelect={select} />
  {:else if board === "atlas"}
    <BoardAtlas onSelect={select} />
  {:else}
    <BoardStage
      bind:this={stageBoard}
      onSelect={select}
      {info}
      variations={stageVariations}
      isLoading={loadingByGrid[GridMode.DIAMOND]}
      loadError={errorByGrid[GridMode.DIAMOND]}
      onRetry={() => loadGrid(GridMode.DIAMOND)}
    />
  {/if}
</div>

{#if overlayBoard}
  <BaseModal
    bind:open={overlayOpen}
    size="xl"
    labelledBy="codex-overlay-title"
    class="codex-explorer-modal codex-dark"
    onclose={closeExplorer}
  >
    {#snippet header()}
      <ModalHeader
        id="codex-overlay-title"
        title={info.name ? `${info.label} · ${info.name}` : info.label}
        subtitle={`${gridMode === GridMode.BOX ? "Box" : "Diamond"} pictographs`}
        iconColor={info.typeColor}
        onClose={closeExplorer}
      />
    {/snippet}
    <LetterExplorer
      {info}
      {gridMode}
      variations={editedVariations}
      selectedIndex={selectedVariationIndex}
      {draft}
      {leftTurns}
      {rightTurns}
      {leftRotation}
      {rightRotation}
      edited={hasLetterExplorerEdits(routeState())}
      {isLoading}
      {loadError}
      {learningMatches}
      {learningLoading}
      {learningError}
      {composerHref}
      onGridChange={selectGrid}
      onVariationChange={selectVariation}
      onTurnsChange={changeTurns}
      onRotationChange={changeRotation}
      onReset={resetExplorerEdits}
      onRetry={() => loadGrid(gridMode)}
      onLearningRetry={loadLearningDeck}
      onCopyLink={copyExactLink}
    />
  </BaseModal>
{/if}

<style>
  .codex {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.35rem 0 0;
  }

  :global(dialog.codex-explorer-modal[data-size="xl"]) {
    width: min(94vw, 2200px);
    height: min(92dvh, 1200px);
    max-width: none;
  }

  @media (max-width: 520px) {
    :global(dialog.codex-explorer-modal[data-size="xl"]) {
      width: 100vw;
      height: 100dvh;
      max-height: none;
      border-radius: 0;
    }
  }
</style>
