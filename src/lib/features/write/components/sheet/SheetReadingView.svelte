<!--
  Sheet Reading View — the act, read on a phone.

  The page preview sizes everything from `--pt: 100cqw / pageWidthPt`, so a
  landscape US-Letter sheet squeezed into 375px takes all of its type down with
  it: 32px pictographs and 3.6px note text. No amount of CSS rescues that model,
  because the model IS uniform scaling. This view drops the page metaphor and
  reflows instead — bands stack vertically, sized in rem/px, at a column count
  chosen for the screen rather than for paper.

  It shares `buildBands` with the printed sheet, so chunking and annotation
  placement have exactly one implementation. Re-chunking at a different column
  count is safe only because cues and notes address an ABSOLUTE step index; when
  they were band-relative this view would have scrambled every one of them.

  Editing uses the same callbacks as the page preview. The affordances differ
  because the targets do: a note pins by tapping its pictograph (a real 83px
  target) rather than by hitting one of eight invisible column strips.
-->
<script lang="ts">
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { SheetBand } from "../../services/sheet-row-planner";
  import type {
    ChoreoSheetLayout,
    SheetHeader,
  } from "../../domain/types/choreo-sheet";
  import { SHEET_CELL_VISIBILITY } from "../../services/sheet-cell-config";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";

  let {
    bands = [],
    columns,
    layout,
    sheetName = "",
    header,
    sequenceNames = {},
    actStepIndex = null,
    onSetCue,
    onAddNote,
    onSetNote,
    onRemoveNote,
  }: {
    bands?: SheetBand[];
    /**
     * The column count these bands were BUILT with. The grid must render exactly
     * this many tracks — a CSS-only override would leave a 4-cell band sitting
     * in an 8-track row. The caller owns the count and rebuilds bands when it
     * changes, so markup and data cannot drift.
     */
    columns: number;
    layout: ChoreoSheetLayout;
    sheetName?: string;
    header?: SheetHeader;
    /** sequenceId → display word, for the per-sequence heading. */
    sequenceNames?: Record<string, string>;
    /**
     * The act's current step while it plays, 0-based into the concatenated act
     * sequence. The matching pictograph lights up and earlier ones dim, so you
     * can follow the act on a phone. null when not playing.
     */
    actStepIndex?: number | null;
    onSetCue?: (
      sequenceId: string,
      stepIndex: number,
      patch: { timestamp?: string; text?: string }
    ) => void;
    onAddNote?: (
      sequenceId: string,
      stepIndex: number,
      pinned: boolean
    ) => string;
    onSetNote?: (id: string, patch: { text?: string }) => void;
    onRemoveNote?: (id: string) => void;
  } = $props();

  const showHandPoints = SHEET_CELL_VISIBILITY.handPointVisibility !== "none";

  // Act playback highlight — the planner stamps each cell with its position in
  // the act, so this is a direct comparison against the player's reported step.
  const isActCurrent = (cell: { actStepIndex: number | null }) =>
    actStepIndex !== null && cell.actStepIndex === actStepIndex;
  const isActPlayed = (cell: { actStepIndex: number | null }) =>
    actStepIndex !== null &&
    cell.actStepIndex !== null &&
    cell.actStepIndex < actStepIndex;

  // A repeated word always displays in its smallest form.
  const title = $derived(
    simplifyRepeatedWord(header?.songName || sheetName || "Untitled")
  );
  const label = (id: string) => simplifyRepeatedWord(sequenceNames[id] ?? "");

  /**
   * The rail's slots for a band: always one anchored to the band's first step so
   * an un-cued band still offers somewhere to type, plus any cue that landed on
   * a later step (which happens when a wider layout merged two rows).
   */
  function cueSlots(band: SheetBand) {
    const primary =
      band.cues.find((c) => c.stepIndex === band.firstStepIndex) ?? null;
    const extras = band.cues.filter((c) => c.stepIndex !== band.firstStepIndex);
    // `isExtra` marks a cue that a wider layout merged into this band; it is
    // labelled by STEP NUMBER, the same number printed on its pictograph.
    return [
      { stepIndex: band.firstStepIndex, cue: primary, isExtra: false },
      ...extras.map((c) => ({ stepIndex: c.stepIndex, cue: c, isExtra: true })),
    ];
  }

  // Tapping a pictograph pins a fresh note to that step and focuses it, so the
  // add-then-type flow is one gesture. Falls back silently when no handler.
  let focusNoteId = $state<string | null>(null);
  function addPinnedNote(band: SheetBand, cellIndex: number) {
    const id = onAddNote?.(
      band.sequenceId,
      band.firstStepIndex + cellIndex,
      true
    );
    if (id) focusNoteId = id;
  }
  function addBullet(band: SheetBand) {
    const id = onAddNote?.(band.sequenceId, band.firstStepIndex, false);
    if (id) focusNoteId = id;
  }
  function autofocus(node: HTMLInputElement, id: string) {
    if (focusNoteId === id) {
      node.focus();
      focusNoteId = null;
    }
  }
</script>

<div class="reading" style="--rb-cols: {columns};">
  <header class="reading-head">
    <h2 class="reading-title">{title}</h2>
    {#if header?.songArtist || header?.choreographer}
      <p class="reading-sub">
        {#if header?.songArtist}<span>{header.songArtist}</span>{/if}
        {#if header?.songArtist && header?.choreographer}<span
            aria-hidden="true"
          >
            ·
          </span>{/if}
        {#if header?.choreographer}<span>{header.choreographer}</span>{/if}
      </p>
    {/if}
  </header>

  {#if bands.length === 0}
    <p class="reading-empty">
      Nothing to read yet — add a sequence to this act.
    </p>
  {/if}

  {#each bands as band (band.key)}
    <section class="rb" class:starts-sequence={band.isSequenceStart}>
      {#if band.isSequenceStart && label(band.sequenceId)}
        <h3 class="rb-seq">{label(band.sequenceId)}</h3>
      {/if}

      {#if layout.showCueRail}
        <div class="rb-cues">
          {#each cueSlots(band) as slot (slot.stepIndex)}
            <div class="rb-cue">
              {#if slot.isExtra}
                <span class="rb-badge" aria-hidden="true"
                  >{slot.stepIndex + 1}</span
                >
              {/if}
              <input
                class="rb-ts"
                value={slot.cue?.timestamp ?? ""}
                placeholder="0:00"
                inputmode="numeric"
                aria-label={slot.isExtra
                  ? `Cue timestamp at step ${slot.stepIndex + 1}`
                  : "Cue timestamp"}
                oninput={(e) =>
                  onSetCue?.(band.sequenceId, slot.stepIndex, {
                    timestamp: e.currentTarget.value,
                  })}
              />
              <input
                class="rb-cue-text"
                value={slot.cue?.text ?? ""}
                placeholder="cue…"
                aria-label={slot.isExtra
                  ? `Cue text at step ${slot.stepIndex + 1}`
                  : "Cue text"}
                oninput={(e) =>
                  onSetCue?.(band.sequenceId, slot.stepIndex, {
                    text: e.currentTarget.value,
                  })}
              />
            </div>
          {/each}
        </div>
      {/if}

      <div class="rb-cells">
        {#each band.cells as cell, ci (ci)}
          <button
            type="button"
            class="rb-cell"
            class:act-current={isActCurrent(cell)}
            class:act-played={isActPlayed(cell)}
            disabled={!onAddNote || !cell.step}
            aria-label={`Add a note on count ${band.firstStepIndex + ci + 1}`}
            onclick={() => addPinnedNote(band, ci)}
          >
            {#if cell.step}
              <PictographContainer
                pictographData={cell.step}
                disableTransitions={true}
                printMode={true}
                darkMode={false}
                showGrid={SHEET_CELL_VISIBILITY.showGrid}
                showTKA={SHEET_CELL_VISIBILITY.showTKA}
                showReversals={SHEET_CELL_VISIBILITY.showReversals}
                showNonRadialPoints={SHEET_CELL_VISIBILITY.showNonRadialPoints}
                showTnD={SHEET_CELL_VISIBILITY.showTnD}
                showElemental={SHEET_CELL_VISIBILITY.showElemental}
                showPlacements={SHEET_CELL_VISIBILITY.showPlacements}
                stepNumberOverride={layout.showStepNumbers}
                {showHandPoints}
              />
            {/if}
          </button>
        {/each}
      </div>

      {#if layout.showNoteStrips}
        <div class="rb-notes">
          {#each band.notes as note (note.id)}
            <div class="rb-note">
              <!-- The badge is the STEP NUMBER, matching the number printed on
                   the pictograph it refers to. `count` is a within-band column,
                   which differs per column count — a badge reading "1" beside a
                   cell labelled "5" is worse than no badge at all. -->
              <span
                class="rb-badge"
                class:is-bullet={note.count == null}
                aria-hidden="true"
              >
                {note.count == null ? "•" : note.stepIndex + 1}
              </span>
              <input
                class="rb-note-text"
                value={note.text}
                placeholder="note…"
                aria-label={note.count != null
                  ? `Note on step ${note.stepIndex + 1}`
                  : "Note"}
                use:autofocus={note.id}
                oninput={(e) =>
                  onSetNote?.(note.id, { text: e.currentTarget.value })}
              />
              <button
                type="button"
                class="rb-remove"
                aria-label="Remove note"
                onclick={() => onRemoveNote?.(note.id)}
              >
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
          {/each}
          {#if onAddNote}
            <button
              type="button"
              class="rb-add"
              onclick={() => addBullet(band)}
            >
              <i class="fa-solid fa-plus" aria-hidden="true"></i> note
            </button>
          {/if}
        </div>
      {/if}
    </section>
  {/each}
</div>

<style>
  /* Sized in rem/px, deliberately NOT in --pt. The page preview's pt model is
     what crushes this content on a phone; nothing here may inherit it. */
  .reading {
    --reading-playback-ring: var(--semantic-warning);
    --reading-playback-ring-strong: color-mix(
      in srgb,
      var(--semantic-warning) 90%,
      transparent
    );
    --reading-playback-glow: color-mix(
      in srgb,
      var(--semantic-warning) 45%,
      transparent
    );
    --rb-gap: 0.375rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.75rem;
    color: var(--theme-text);
  }

  .reading-head {
    padding-bottom: 0.25rem;
  }
  .reading-title {
    margin: 0;
    font-size: 1.375rem;
    font-weight: 700;
    line-height: 1.15;
  }
  .reading-sub {
    margin: 0.125rem 0 0;
    font-size: 0.8125rem;
    color: var(--theme-text-dim);
  }
  .reading-empty {
    margin: 0;
    font-size: 0.9375rem;
    color: var(--theme-text-dim);
  }

  .rb {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  /* A sequence boundary is the one structural cue print gets from separators. */
  .rb.starts-sequence:not(:first-of-type) {
    border-top: 1px solid var(--theme-stroke);
    padding-top: 0.875rem;
  }
  .rb-seq {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: var(--theme-text);
  }

  .rb-cues {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .rb-cue {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .rb-ts {
    flex: 0 0 auto;
    width: 4.25rem;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .rb-cue-text {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* Tracks come from the count the bands were built with, never from a media
     query — see the `columns` prop. Four across makes an 83px cell at 375px,
     which is legible, and chunks 4/8/16-step sequences without a ragged row. */
  .rb-cells {
    display: grid;
    grid-template-columns: repeat(var(--rb-cols, 4), 1fr);
    gap: var(--rb-gap);
  }
  .rb-cell {
    aspect-ratio: 1;
    padding: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    background: var(--reading-paper, var(--print-bg));
    overflow: hidden;
    cursor: pointer;
    position: relative;
    /* The pictograph is ink-on-paper artwork; it needs its white ground in
       either theme, exactly as the printed cell does. */
  }
  .rb-cell:disabled {
    cursor: default;
  }
  .rb-cell:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* Act playback highlight — same amber language as the viewer's playback cell
     and the page preview, so all three read as one system. Cells here are
     spaced, so this one can afford the viewer's lift. */
  .rb-cell.act-current {
    z-index: 2;
    border-color: var(--reading-playback-ring);
    transform: scale(1.04);
    box-shadow:
      0 0 0 2px var(--reading-playback-ring-strong),
      0 0 14px 2px var(--reading-playback-glow);
    transition:
      transform 0.16s ease-out,
      box-shadow 0.16s ease-out;
  }
  .rb-cell.act-played {
    opacity: 0.5;
    transition: opacity 0.2s ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .rb-cell.act-current {
      transform: none;
      transition: none;
    }
    .rb-cell.act-played {
      transition: none;
    }
  }

  .rb-notes {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .rb-note {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  /* The count badge replaces the printed sheet's absolutely-positioned pin.
     A list cannot collide with itself the way adjacent pins can. */
  .rb-badge {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    height: 1.5rem;
    padding: 0 0.25rem;
    border-radius: 999px;
    background: var(--theme-accent-bg);
    color: var(--theme-text);
    font-size: 0.75rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .rb-badge.is-bullet {
    background: transparent;
    font-size: 1rem;
  }
  .rb-note-text {
    flex: 1 1 auto;
    min-width: 0;
  }

  .rb-ts,
  .rb-cue-text,
  .rb-note-text {
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.5rem;
    font-size: 1rem; /* 16px — anything smaller makes iOS zoom on focus. */
    color: inherit;
    background: var(--theme-surface);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
  }
  .rb-ts:focus-visible,
  .rb-cue-text:focus-visible,
  .rb-note-text:focus-visible {
    outline: none;
    border-color: var(--theme-accent);
    background: var(--theme-accent-bg);
  }

  .rb-remove,
  .rb-add {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
    cursor: pointer;
  }
  .rb-add {
    align-self: flex-start;
    padding: 0 0.875rem;
    border-color: var(--theme-stroke);
  }
  .rb-remove:hover,
  .rb-add:hover {
    color: var(--theme-text);
    background: var(--theme-surface);
  }

  /* Wider screens only get roomier — the column count is the caller's, so
     nothing here may touch the grid. */
  @container reading-stage (min-width: 60rem) {
    .reading {
      padding: 1.25rem 1.5rem;
      gap: 1.5rem;
    }
    .reading-title {
      font-size: 1.75rem;
    }
  }
</style>
