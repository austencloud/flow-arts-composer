<!--
  MandalaWall: every family of look-alike mandalas, simplest first, on one
  wall that pans inside its own area, with the scrubber under it.

  A fixed frame: the heading row, the grid, the scrubber. The page never
  scrolls; only the grid does, with the browser's own wheel, touch and keys.
  Every family is in the page at all times (nothing virtual, added or removed
  while panning), so the boxes in the DOM are the wall. Off-screen stills skip
  painting through `content-visibility`, nothing more.

  Searching narrows the wall without regrouping it: the boxes of mandalas no
  matching sequence draws are hidden in place, and every count, the scrubber
  and its range run over the boxes still shown. Clearing the search returns
  the wall to the place it was before the search began.

  The scrubber is the shared ValueSlider, and it IS the grid's scroll
  position: its value is the grid's scrollTop, a drag writes scrollTop at
  once, and the grid's scroll event writes the value back. Writing the same
  number back is a no-op, so the two cannot chase each other. The step boxes
  move one screenful of whole rows with the browser's smooth scroll (instant
  under reduced motion), and the one with nowhere to go is not drawn while
  its slot stays.

  Spec: docs/superpowers/specs/2026-11-11-mandala-wall-design.md.
-->
<script lang="ts" module>
  // Where the wall was before a search began. It outlives one wall: opening a
  // mandala while searching swaps the wall out, and clearing the search after
  // coming back still returns to this place.
  let placeBeforeSearch: string | null = null;
</script>

<script lang="ts">
  import { tick, untrack } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";
  import MandalaStill from "#lib/shared/mandala/components/MandalaStill.svelte";
  import ShimmerBlock from "#lib/shared/components/loading/ShimmerBlock.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";
  import type { MandalaClimbFamily } from "#lib/shared/browse/services/mandala-climb.svelte.js";
  import { tryGetBrowseQueryContext } from "#lib/shared/browse/state/browse-query-state.svelte.js";
  import { familyMatches, familySequences, searchMatches } from "./mandala-search";

  interface Props {
    families: readonly MandalaClimbFamily[];
    /** False while families are built: placeholders hold the wall's shape. */
    ready: boolean;
    /** Ready with nothing to draw. */
    empty: boolean;
    /** The family first in view when the wall was left. */
    anchor: string | null;
    /** The family last opened from the wall; it takes focus on return. */
    lastOpened: string | null;
    onAnchor: (familyId: string | null) => void;
    onOpen: (family: MandalaClimbFamily) => void;
    onBack: () => void;
    /** True once families are final for the complete pool. The wall draws
     *  what it has meanwhile and only reports itself busy. */
    settled?: boolean;
  }

  let {
    families,
    ready,
    empty,
    anchor,
    lastOpened,
    onAnchor,
    onOpen,
    onBack,
    settled = true,
  }: Props = $props();

  /** A box's least width: 148px, growing to 232px with the grid (9% of its
   *  width) so a wide screen gets bigger pictures, not just more of them; a
   *  phone gets at least three across. */
  const MIN_BOX_PX = 148;
  const MAX_MIN_BOX_PX = 232;
  const GAP_PX = 10;
  /** The widths stills are drawn for, so a resize does not redraw every one. */
  const STILL_SIZES = [128, 160, 200, 256, 320] as const;

  // The words in Browse's one search bar, matched the way the grid matches them.
  const browseQuery = tryGetBrowseQueryContext();
  const query = $derived(browseQuery?.search.trim() ?? "");
  const shownIds = $derived.by(() => {
    const matches = searchMatches(families.flatMap(familySequences), query);
    if (!matches) return null;
    return new Set(
      families.filter((family) => familyMatches(family, matches)).map((family) => family.id)
    );
  });
  /** The families on show, in climb order: all of them unless searching. */
  const shown = $derived(
    shownIds ? families.filter((family) => shownIds.has(family.id)) : families
  );
  const noMatch = $derived(ready && families.length > 0 && shown.length === 0);

  let grid = $state<HTMLElement | null>(null);
  let scrollTop = $state(0);
  let maxScroll = $state(0);
  let viewHeight = $state(0);
  let cols = $state(1);
  let boxPx = $state(MIN_BOX_PX);

  const rowPitch = $derived(boxPx + GAP_PX);
  /** Whole rows that fit the area, at least one. */
  const rowsInView = $derived(Math.max(1, Math.floor((viewHeight + GAP_PX) / rowPitch)));
  const stillSize = $derived(
    STILL_SIZES.find((size) => size >= boxPx) ?? STILL_SIZES[STILL_SIZES.length - 1]
  );
  /** Enough placeholders to fill the area while families are built. */
  const placeholderCount = $derived(cols * (rowsInView + 1));
  const atStart = $derived(scrollTop <= 1);
  const atEnd = $derived(scrollTop >= maxScroll - 1);

  function countLabel(count: number): string {
    return count === 1
      ? t("browse_ui_mandala_one_sequence")
      : t("browse_ui_mandala_sequences", { count });
  }

  /** The index of the first family whose row is at least half in view at `top`. */
  function firstIndexAt(top: number): number {
    return Math.min(
      Math.max(0, shown.length - 1),
      Math.max(0, Math.ceil((top - boxPx / 2) / rowPitch)) * cols
    );
  }

  /** From the first row at least half in view to the last; the end of the
   *  grid always ends at the total. */
  function rangeText(top: number): string {
    const total = shown.length;
    if (!total) return t("browse_ui_mandala_range", { from: 0, to: 0, total });
    const from = firstIndexAt(top) + 1;
    const lastRow = Math.floor((top + viewHeight - boxPx / 2) / rowPitch);
    const atBottom = top >= maxScroll - 1;
    const to = atBottom ? total : Math.min(total, Math.max(from, (lastRow + 1) * cols));
    return t("browse_ui_mandala_range", { from, to, total });
  }

  /** The grid's measures: columns, box size, the room it pans through. */
  function measure(): void {
    if (!grid) return;
    const tracks = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean);
    cols = Math.max(1, tracks.length);
    const first = parseFloat(tracks[0] ?? "");
    boxPx = Number.isFinite(first) && first > 0 ? first : MIN_BOX_PX;
    viewHeight = grid.clientHeight;
    maxScroll = Math.max(0, grid.scrollHeight - grid.clientHeight);
    scrollTop = grid.scrollTop;
  }

  function trackGrid(node: HTMLElement) {
    grid = node;
    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    measure();
    return {
      destroy: () => {
        observer.disconnect();
        if (grid === node) grid = null;
      },
    };
  }

  // The scroll event writes the thumb; the anchor follows once per frame.
  let anchorFrame = 0;
  /** The family first in view, kept as plain state for the search to read. */
  let topId: string | null = untrack(() => anchor);
  function onScroll(): void {
    if (!grid) return;
    scrollTop = grid.scrollTop;
    if (anchorFrame || !ready) return;
    anchorFrame = requestAnimationFrame(() => {
      anchorFrame = 0;
      topId = shown[firstIndexAt(scrollTop)]?.id ?? null;
      onAnchor(topId);
    });
  }
  $effect(() => () => cancelAnimationFrame(anchorFrame));

  /** The thumb in the hand: the grid follows at once, no easing behind it. */
  function scrub(value: number): void {
    if (!grid) return;
    grid.scrollTop = value;
    scrollTop = grid.scrollTop;
  }

  /** One screenful of whole rows, back or on. */
  function stepBy(direction: -1 | 1): void {
    if (!grid) return;
    const row = Math.round(grid.scrollTop / rowPitch) + direction * rowsInView;
    const top = Math.min(maxScroll, Math.max(0, row * rowPitch));
    grid.scrollTo({ top, behavior: reducedMotion() ? "instant" : "smooth" });
  }

  // Coming back: once the families are in, the wall returns to the place it
  // was left and the box that was opened takes focus.
  let restored = false;
  $effect(() => {
    if (restored || !ready || !grid || shown.length === 0) return;
    restored = true;
    const node = grid;
    const at = anchor ? shown.findIndex((family) => family.id === anchor) : -1;
    void tick().then(() => {
      measure();
      if (at > 0) {
        node.scrollTop = Math.floor(at / cols) * rowPitch;
        scrollTop = node.scrollTop;
      }
      if (lastOpened) {
        const box = node.querySelector<HTMLElement>(
          `[data-value="${CSS.escape(lastOpened)}"]`
        );
        box?.focus({ preventScroll: true });
        // The place he left holds the box he opened; if it does not (a link
        // straight to the page), the wall brings the box into view.
        box?.scrollIntoView({ block: "nearest", behavior: "instant" });
        scrollTop = node.scrollTop;
      }
    });
  });

  // Families arriving or the area changing size change the room to pan.
  $effect(() => {
    void shown.length;
    void ready;
    void tick().then(measure);
  });

  // A new search keeps the family first in view when it is still shown, and
  // starts at the top when it is not. Clearing the search goes back to where
  // the wall was before the search began.
  let appliedQuery = untrack(() => query);
  $effect(() => {
    const next = query;
    if (next === appliedQuery) return;
    const wasSearching = appliedQuery !== "";
    appliedQuery = next;
    if (!wasSearching) placeBeforeSearch = topId;
    const keep = next === "" ? placeBeforeSearch : topId;
    void tick().then(() => {
      const node = grid;
      if (!node) return;
      measure();
      const at = keep ? shown.findIndex((family) => family.id === keep) : -1;
      node.scrollTop = at > 0 ? Math.floor(at / cols) * rowPitch : 0;
      measure();
      topId = shown[firstIndexAt(node.scrollTop)]?.id ?? null;
    });
  });
</script>

<div class="mandala-wall">
  <header class="wall-head">
    <button
      class="place-box back"
      type="button"
      aria-label={t("common_back")}
      onclick={onBack}
    >
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
    </button>
    <div class="wall-words">
      <h2 tabindex="-1">{t("browse_mandala_wall_title")}</h2>
      <p>{t("browse_mandala_wall_hint")}</p>
    </div>
  </header>

  {#if empty}
    <p class="wall-empty" role="status">{t("browse_ui_no_mandalas")}</p>
  {:else}
    <div
      class="wall-grid"
      style:--min-box="{MIN_BOX_PX}px"
      style:--max-min-box="{MAX_MIN_BOX_PX}px"
      style:--gap="{GAP_PX}px"
      style:--row="{boxPx}px"
      aria-busy={!ready || !settled}
      use:trackGrid
      onscroll={onScroll}
    >
      {#if ready}
        {#each families as family (family.id)}
          <button
            class="wall-box"
            type="button"
            data-value={family.value}
            hidden={shownIds !== null && !shownIds.has(family.id)}
            aria-label={t("browse_ui_mandala_box_name", {
              count: countLabel(family.sequenceCount),
            })}
            onclick={() => onOpen(family)}
          >
            <span class="wall-still">
              <MandalaStill
                key={family.representative.key}
                paths={family.representative.paths}
                size={stillSize}
                tone="ink"
              />
            </span>
          </button>
        {/each}
        {#if noMatch}
          <p class="wall-no-match" role="status">{t("browse_ui_mandala_no_match")}</p>
        {/if}
      {:else}
        {#each { length: placeholderCount } as _, i (i)}
          <span class="wall-box placeholder" aria-hidden="true">
            <ShimmerBlock height="100%" borderRadius="0" />
          </span>
        {/each}
      {/if}
    </div>
  {/if}

  <div class="wall-scrub">
    {#if ready && !atStart}
      <button
        class="place-box step"
        type="button"
        aria-label={t("browse_ui_mandala_simpler")}
        onclick={() => stepBy(-1)}
      >
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>
    {:else}
      <span class="step-slot" aria-hidden="true"></span>
    {/if}
    <ValueSlider
      label={t("browse_ui_simple_to_complex")}
      value={scrollTop}
      min={0}
      max={Math.max(1, maxScroll)}
      step={1}
      ends={[t("browse_ui_mandala_simple"), t("browse_ui_mandala_complex")]}
      valueText={rangeText}
      disabled={!ready || empty || noMatch || maxScroll <= 0}
      onchange={scrub}
    />
    {#if ready && !atEnd}
      <button
        class="place-box step"
        type="button"
        aria-label={t("browse_ui_mandala_more_complex")}
        onclick={() => stepBy(1)}
      >
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
    {:else}
      <span class="step-slot" aria-hidden="true"></span>
    {/if}
  </div>
</div>

<style>
  /* A fixed frame: heading, the grid (the only part that pans), scrubber. */
  .mandala-wall {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    padding: 0.75rem clamp(0.75rem, 2cqi, 1.5rem) 0.9rem;
    box-sizing: border-box;
    overflow: hidden;
  }

  .wall-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }
  .wall-words {
    min-width: 0;
  }
  .wall-words h2 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 800;
    color: var(--theme-text, #e8edf6);
  }
  .wall-words h2:focus {
    outline: none;
  }
  .wall-words p {
    margin: 0.1rem 0 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-muted, #9aa6b8);
  }

  .wall-grid {
    display: grid;
    /* At least three across a phone; 148px boxes once there is room, growing
       to 232px with the grid so wide screens get bigger pictures. */
    grid-template-columns: repeat(
      auto-fill,
      minmax(
        min(
          clamp(var(--min-box), 9%, var(--max-min-box)),
          calc((100% - 2 * var(--gap)) / 3)
        ),
        1fr
      )
    );
    /* Rows are as tall as the measured columns are wide, so every box is
       square. Chrome gives an aspect-ratio button in an auto row only its
       44px touch floor, and the squares overlapped. */
    grid-auto-rows: var(--row, var(--min-box));
    gap: var(--gap);
    align-content: start;
    min-height: 0;
    overflow-y: auto; /* scrolls: the wall of every mandala family, a long list in its own area */
    overscroll-behavior: contain;
    /* The focus ring sits inside each box, so nothing needs room outside. */
    padding: 2px;
  }
  .wall-empty {
    display: grid;
    place-items: center;
    margin: 0;
    color: var(--theme-text-muted, #9aa6b8);
  }
  /* Spans the grid's first row while a search finds nothing. */
  .wall-no-match {
    grid-column: 1 / -1;
    align-self: center;
    margin: 0;
    padding: 1rem;
    text-align: center;
    font-size: var(--font-size-base);
    color: var(--theme-text-muted, #9aa6b8);
  }
  /* A box no search match draws stays in place, out of the flow. */
  .wall-box[hidden] {
    display: none;
  }

  .wall-box {
    position: relative;
    display: block;
    min-width: 0;
    overflow: hidden;
    padding: 0;
    border-radius: 16px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #e8edf6);
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background-color var(--duration-fast) var(--ease-standard);
  }
  .wall-box.placeholder {
    cursor: default;
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
  }
  button.wall-box:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }
  button.wall-box:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: -2px;
  }
  /* Off-screen stills skip painting; the box keeps its square either way. */
  .wall-still {
    position: absolute;
    inset: 0.45rem;
    content-visibility: auto;
    contain-intrinsic-size: auto var(--row, var(--min-box));
  }

  .wall-scrub {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: start;
    gap: 0.5rem;
    width: 100%;
    max-width: 960px;
    justify-self: center;
  }
  .step-slot {
    width: 44px;
    height: 44px;
  }

  .place-box {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    padding: 0;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #e8edf6);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background-color var(--duration-fast) var(--ease-standard);
  }
  .place-box:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }
  .place-box:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }
  /* Right to left, the track and the arrows run the other way. */
  .place-box i:dir(rtl) {
    transform: scaleX(-1);
  }

  @media (prefers-reduced-motion: reduce) {
    .wall-box,
    .place-box {
      transition: none;
    }
  }
</style>
