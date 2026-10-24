<!--
  The letter explorer: every variation of one letter, with the turns and
  transforms the board has, plus Invert. One column: the controls, the
  variations, then where the letter is used. The variations are pictures, not
  choices; every control changes all of them at once, and they move the way
  the Composer's step grid moves (the shared pictograph edit clock).

  On a screen with room the variations are laid out to fit the dialog with
  nothing scrolling, and the dialog shrinks around them (LetterCodex sizes it
  to its content). A screen too small for that keeps four across and scrolls.
-->
<script lang="ts">
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import {
    HandSide,
    MotionType,
    type RotationDirection,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { TurnValue } from "#lib/shared/create/domain/turn-pattern-data.js";
  import CodexBoardControls from "./CodexBoardControls.svelte";
  import LetterVariations from "./LetterVariations.svelte";
  import LetterLinks from "./LetterLinks.svelte";
  import type { Box } from "./codex-fan";
  import { type ExplorerTransformOp } from "./letter-explorer-transforms";

  let {
    label,
    tileKey,
    variations,
    selectedIndex,
    leftTurns,
    rightTurns,
    leftRotation,
    rightRotation,
    transformed,
    isLoading,
    loadError,
    learningMatches,
    learningError,
    composerHref,
    headerHeight,
    onTurnsChange,
    onRotationChange,
    onResetTurns,
    onTransform,
    onResetTransforms,
    onRetry,
    onLearningRetry,
    onCopyLink,
    propType,
    fan = null,
    onFanDone,
  }: {
    /** The letter the variations now draw (Invert changes it). */
    label: string;
    /** Stable per letter and grid, so each picture keeps its slot when edited. */
    tileKey: string;
    variations: PictographData[];
    /** The variation the clicked board cell draws: the deck's top card and
     *  the one Continue in Composer opens. */
    selectedIndex: number;
    leftTurns: TurnValue;
    rightTurns: TurnValue;
    leftRotation: RotationDirection;
    rightRotation: RotationDirection;
    transformed: boolean;
    isLoading: boolean;
    loadError: boolean;
    learningMatches: readonly SequenceData[];
    learningError: boolean;
    composerHref: string | null;
    /** The dialog header's height, for the fit below it. */
    headerHeight: number;
    onTurnsChange: (hand: HandSide, delta: number) => void;
    onRotationChange: (hand: HandSide, direction: RotationDirection) => void;
    onResetTurns: () => void;
    onTransform: (op: ExplorerTransformOp) => void;
    onResetTransforms: () => void;
    onRetry: () => void;
    onLearningRetry: () => void;
    onCopyLink: () => void;
    /** The prop drawn in every picture; omitted draws staffs, as the board does. */
    propType?: PropType;
    /** Fan the variations out from this viewport rect (the clicked board
     *  cell) once they are laid out. A new key plays it again. */
    fan?: { origin: Box; key: number } | null;
    onFanDone?: () => void;
  } = $props();

  // Every variation of a letter shares its motion types, so the first one
  // says whether a hand's turns can take a rotation (dash and static only).
  function canRotate(motion: { motionType?: MotionType } | undefined): boolean {
    return (
      motion?.motionType === MotionType.DASH ||
      motion?.motionType === MotionType.STATIC
    );
  }
  const leftCanRotate = $derived(canRotate(variations[0]?.motions?.left));
  const rightCanRotate = $derived(canRotate(variations[0]?.motions?.right));

  // ── Fit ────────────────────────────────────────────────────────────────
  // The dialog may grow to the viewport cap BaseModal gives it (modal-tokens
  // .css, "fit"); the variations (LetterVariations) get what the header,
  // controls and links leave. Cells stop at their cap so a letter with few
  // variations gets a small dialog, not huge pictures.
  const PAD = 16; // 1rem, .explorer padding and gap
  const PHONE = 520; // modal-tokens.css mobile breakpoint
  let viewportWidth = $state(0);
  let viewportHeight = $state(0);
  let toolbarHeight = $state(0);
  let footerHeight = $state(0);
  const measured = $derived(
    viewportWidth > 0 &&
      toolbarHeight > 0 &&
      footerHeight > 0 &&
      headerHeight > 0
  );
  const gridWidth = $derived.by(() => {
    if (!measured) return 0;
    const dialogWidth =
      viewportWidth <= PHONE ? viewportWidth - 32 : viewportWidth * 0.94;
    return dialogWidth - 2 * PAD - 2;
  });
  const gridHeight = $derived.by(() => {
    if (!measured) return 0;
    const dialogHeight = Math.min(viewportHeight * 0.9, viewportHeight - 32);
    return (
      dialogHeight - headerHeight - toolbarHeight - footerHeight - 4 * PAD - 2
    );
  });

</script>

<svelte:window
  bind:innerWidth={viewportWidth}
  bind:innerHeight={viewportHeight}
/>

<div class="explorer">
  <div class="toolbar" bind:clientHeight={toolbarHeight}>
    <CodexBoardControls
      {leftTurns}
      {rightTurns}
      {leftRotation}
      {rightRotation}
      {leftCanRotate}
      {rightCanRotate}
      {transformed}
      {onTurnsChange}
      {onRotationChange}
      {onTransform}
      onInvert={() => onTransform("invert")}
      {onResetTransforms}
      {onResetTurns}
    />
  </div>

  <LetterVariations
    {label}
    {tileKey}
    {variations}
    {selectedIndex}
    {propType}
    {fan}
    {onFanDone}
    width={gridWidth}
    height={gridHeight}
    overflow="scroll"
    {isLoading}
    {loadError}
    {onRetry}
  />

  <div class="footer" bind:clientHeight={footerHeight}>
    <LetterLinks
      {label}
      {learningMatches}
      {learningError}
      {composerHref}
      {onLearningRetry}
      {onCopyLink}
    />
  </div>
</div>

<style>
  .explorer {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
    padding: 0 1rem 1rem;
    --pictograph-border: none;
  }

  .toolbar :global(.board-controls) {
    padding: 0;
  }

  @media (max-width: 520px) {
    .explorer {
      padding: 0 0.75rem 0.75rem;
    }
  }
</style>
