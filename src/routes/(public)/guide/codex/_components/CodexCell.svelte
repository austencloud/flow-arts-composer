<script lang="ts">
  /**
   * A single codex cell - one letter's pictograph plus its transition/name
   * captions. Print/card callers (the /codex sheets, poster, Choreo Card
   * printing) pass NOTHING beyond `cell`: they get the exact byte-identical
   * static Double-Staff rendering this component always produced.
   *
   * The interactive guide reader (GuideCodexPage.svelte) additionally passes
   * `propType`/`visibility`/`dataOverride`/`onSelect` - the SAME sheet, live:
   * propType re-skins the pictograph, visibility toggles its layers, and
   * `onSelect` makes the cell clickable via the shared sequence-selection
   * primitive (`SelectionHit` + `.tka-seq-cell`, the same hover/select ring
   * used elsewhere in the guide - see feedback_sequence_selection_primitive),
   * never a hand-rolled button/hover style. No gray fill is added either way -
   * the printable white-paper look is preserved.
   */
  import GuidePictograph from "../../level-1/_components/GuidePictograph.svelte";
  import CodexTransitionGlyph from "./CodexTransitionGlyph.svelte";
  import PictographTypeFrame from "$lib/shared/pictograph/shared/components/PictographTypeFrame.svelte";
  import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
  import { getSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { codexData, type CodexCellDef } from "../_data/codex-groups";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

  let {
    cell,
    propType = PropType.STAFF,
    showGlyph = false,
    showGrid = true,
    showTKA = true,
    showPlacements = false,
    showReversals = false,
    showNonRadialPoints = false,
    showName = true,
    showTransition = true,
    theme = "print",
    dataOverride,
    href,
    onSelect,
  }: {
    cell: CodexCellDef;
    propType?: PropType;
    /** "print" is the canonical ink-on-white sheet every existing caller gets.
     *  "dark" renders the same cell for a dark host (the public glossary): the
     *  pictograph flips via GuidePictograph's forceTheme, and the frame/caption
     *  colours come from the --codex-* tokens below, which the host overrides. */
    theme?: "print" | "dark";
    showGlyph?: boolean;
    showGrid?: boolean;
    showTKA?: boolean;
    showPlacements?: boolean;
    showReversals?: boolean;
    showNonRadialPoints?: boolean;
    /** Glossary type grids show the letter itself without repeating the
     *  transition caption that the surrounding definition already explains. */
    showTransition?: boolean;
    /** The spelled-out Greek name under the cell (Sigma, Alpha). On paper it is
     *  a reader's aid at a fixed cell size. On a screen board it is the only
     *  thing that varies the cell's height, so a row mixing named and unnamed
     *  cells lands its type rules on two different lines - and the name repeats
     *  a glyph the pictograph already draws. Boards pass false and surface the
     *  name through the cell's accessible label and the inspector instead. */
    showName?: boolean;
    /** Live-transformed pictograph (rotate/mirror/color-swap) to render instead
     *  of the canonical dataset. Only the interactive reader supplies this. */
    dataOverride?: PictographData | null;
    /** Presence makes the whole cell a semantic navigation link. */
    href?: string;
    /** Presence makes the cell clickable - only the reader supplies it. */
    onSelect?: (id: string) => void;
  } = $props();

  const data = $derived(dataOverride ?? codexData(cell.id));
  const selection = onSelect || href ? getSequenceSelection() : null;
</script>

{#snippet cellBody()}
  {#if cell.top && showTransition}
    <span class="cell-top"><CodexTransitionGlyph text={cell.top} /></span>
  {/if}
  <div class="picto">
    {#if theme === "dark"}
      <PictographTypeFrame letter={data?.letter}>
        <GuidePictograph
          {data}
          size="sm"
          {showGrid}
          showArrows={true}
          {propType}
          {showTKA}
          showTnD={showGlyph}
          showElemental={showGlyph}
          {showPlacements}
          {showReversals}
          {showNonRadialPoints}
          printMode={true}
          darkMode={false}
          forceTheme="dark"
          eager={true}
        />
      </PictographTypeFrame>
    {:else}
      <GuidePictograph
        {data}
        size="sm"
        {showGrid}
        showArrows={true}
        {propType}
        {showTKA}
        showTnD={showGlyph}
        showElemental={showGlyph}
        {showPlacements}
        {showReversals}
        {showNonRadialPoints}
        printMode={true}
        darkMode={false}
        eager={true}
      />
    {/if}
  </div>
  {#if cell.name && showName}
    <span class="cell-name">{cell.name}</span>
  {/if}
{/snippet}

{#if onSelect || href}
  <div
    class="codex-cell interactive tka-seq-cell"
    class:is-hovered={selection?.isHovered(cell.id)}
    class:is-selected={selection?.isSelected(cell.id)}
  >
    {@render cellBody()}
    <SelectionHit
      groupId={cell.id}
      isGroupStart
      label={`Explore ${cell.label}${cell.name ? `, ${cell.name}` : ""} variations`}
      {href}
      onselect={() => onSelect?.(cell.id)}
    />
  </div>
{:else}
  <div class="codex-cell">
    {@render cellBody()}
  </div>
{/if}

<style>
  .codex-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 0;
    border-radius: var(--codex-cell-radius, 0);
  }

  /* Every colour and caption size below is a token whose DEFAULT is the value
     this sheet has always printed, so print/card callers are byte-identical. A
     dark host (the public glossary) redefines the tokens on an ancestor instead
     of forking the component. Sizes are tokens as well as colours because a
     screen board sizes its cells off the viewport: at print scale these
     captions hold ~10px on a 4K board, which reads as punctuation. */
  .cell-top {
    font-size: var(--codex-caption-size, 0.62rem);
    font-weight: 600;
    color: var(--codex-caption, #333);
    line-height: 1.1;
  }

  /* ONE fixed pictograph size across the whole codex (both pages, every type) -
     never sized off the row's leftover space, which made 4-cell/full-width rows
     render bigger pictographs than 3-cell rows. Each pictograph carries its own
     plain 1px border and sits flush against its neighbors (CodexBox collapses
     the shared walls), reproducing the original guide's table look - no inset
     floating squares. The pictograph's dark-mode outline (--pictograph-border)
     is suppressed so the only frame is this border. aspect-ratio keeps the box
     square so the async pictograph swap never reflows neighbors. */
  .picto {
    width: var(--codex-picto-size, 110px);
    aspect-ratio: 1;
    box-sizing: border-box;
    border: var(
      --codex-cell-frame,
      1px solid var(--codex-cell-border, #2b2b2b)
    );
    border-radius: var(--codex-cell-radius, 0);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    --pictograph-border: none;
  }

  /* Force the whole pictograph (wrapper + SVG) to fill the 64px box. The
     size-sm wrapper otherwise keeps its own ~120px intrinsic size (max-width
     140px + its own aspect-ratio) and ignores this box, so it overflowed -
     spilling into neighbors, or cropped once the box clipped it. The SVG
     viewBox is a clean square, so filling the box shows the whole pictograph
     at cell size: no overflow, no crop. */
  .picto :global(.guide-pictograph) {
    width: 100%;
    height: 100%;
    gap: 0;
  }
  /* !important, and not for style: GuidePictograph caps a size-sm wrapper at
     max-width 140px with `.guide-pictograph.size-sm .pictograph-wrapper`, which
     out-specifies a plain override here. On the printed sheets the cell is
     ~110px so the cap never bound and nobody noticed. On a screen board sized
     off the viewport it binds hard: a 247px 4K cell rendered a 140px pictograph
     floating in 107px of dead box - the letters look tiny and the board looks
     empty, which is the exact defect the screen boards exist to fix. The two
     other guide surfaces that size pictographs off their container (TurnStrip,
     GuideStepStrip) already break the cap the same way. */
  .picto :global(.pictograph-wrapper) {
    width: 100%;
    height: 100%;
    max-width: none !important;
  }

  .cell-name {
    font-style: italic;
    font-size: var(--codex-name-size, 0.6rem);
    color: var(--codex-name, #555);
    line-height: 1.1;
  }

  /* Interactive (reader) cells: cursor affordance only - the hover/select
   * ring comes entirely from the shared .tka-seq-cell primitive above, never
   * a gray fill. Keeps the print-sheet white-paper look intact. */
  .codex-cell.interactive {
    cursor: pointer;
  }
</style>
