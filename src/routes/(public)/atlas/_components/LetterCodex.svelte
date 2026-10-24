<!--
  LetterCodex is the host for the visual letter reference. The boards own the
  overview; LetterExplorer owns the focused, shareable letter destination.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    SequenceSelection,
    setSequenceSelection,
  } from "#lib/shared/selection/sequence-selection.svelte.js";
  import "#lib/shared/selection/selection.css";
  import "./codex-boards/codex-dark.css";
  import CodexBoardView from "./codex-boards/CodexBoardView.svelte";
  import CodexDrill from "../../codex/_components/CodexDrill.svelte";
  import { CodexExplorerState } from "./codex-boards/codex-explorer-state.svelte";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type { CodexStartOrientations } from "../../codex/_data/codex-orientation";
  import type { CodexLayoutMode } from "../../codex/_data/codex-fit";
  import type { CodexScreen } from "../../codex/_data/codex-screen";

  let {
    initialLetter = "A",
    propType,
    startOrientations,
    boardControls = false,
    mode = "full-board",
    cell,
    onChooseProp,
    onChooseStart,
    screen = { kind: "home", type: null, letter: null },
    onGo,
    onBack,
    onState,
  }: {
    initialLetter?: string;
    /** Show turns, transforms and layers beside the board, and draw the
     *  board with them. Turns are then one setting shared by the board and
     *  the explorer, so they survive opening, closing and changing letters. */
    boardControls?: boolean;
    /** The prop the board and explorer draw; omitted keeps the dataset's own. */
    propType?: PropType;
    /** Where each hand starts on the Atlas board and in the explorer, with
     *  every end recalculated; omitted starts the board thumbs in and keeps
     *  the explorer's stored orientations. */
    startOrientations?: CodexStartOrientations;
    /** How the page lays itself out (codex-fit.ts). */
    mode?: CodexLayoutMode;
    /** The full board's cell in px; given, the controls stand in a rail. */
    cell?: number;
    onChooseProp?: (next: PropType) => void;
    onChooseStart?: (hand: "left" | "right", next: Orientation) => void;
    /** The drill-down screen (/codex in drill-down mode), and how to move
     *  between screens; the page owns both, since they are URL state. */
    screen?: CodexScreen;
    onGo?: (screen: CodexScreen, options?: { push: boolean }) => void;
    onBack?: () => void;
    /** Hands the page the explorer state, for the URL writes it owns. */
    onState?: (codex: CodexExplorerState) => void;
  } = $props();

  const selection = new SequenceSelection();
  setSequenceSelection(selection);

  // svelte-ignore state_referenced_locally
  const codex = new CodexExplorerState({
    initialLetter,
    boardControls,
    selection,
    propType: () => propType,
    startOrientations: () => startOrientations,
  });

  // svelte-ignore state_referenced_locally
  onState?.(codex);

  onMount(() => codex.mount());
</script>

{#if mode === "drill-down" && onGo && onBack}
  <CodexDrill
    {codex}
    {screen}
    {propType}
    {startOrientations}
    {onChooseProp}
    {onChooseStart}
    {onGo}
    {onBack}
  />
{:else}
  <CodexBoardView
    {codex}
    {propType}
    {startOrientations}
    {onChooseProp}
    {onChooseStart}
    cell={mode === "full-board" ? cell : undefined}
  />
{/if}

<style>
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
</style>
