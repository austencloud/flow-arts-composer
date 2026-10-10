<!--
  RosterBand — one group of the roster, at one density.

  The band does NOT decide its own geometry. Column count and cell width are
  computed once for every band together in CreatorsPanel, because a band cannot
  see its siblings and the two facts that make the page look composed are
  cross-band: every band shares one cell size, and the busiest band fills the
  row exactly so the rest can centre against the same edges. When each band
  sized itself, three of them landed at three different widths with three
  different insets under a full-width wall.

  A group with a null `heading` is not a recency band at all — it is a filtered
  view or a search result set. It renders as a plain grid with no header, and
  its recency rings come from each person's own last-active date rather than
  from the group.

  The header is deliberately not sticky. The page has a bottom and should feel
  finite; a stack of accumulating sticky headers on a 56-person directory
  reads as "there is more of this than there is."
-->
<script lang="ts">
  import CreatorCell from "./CreatorCell.svelte";
  import { bandOf, type BandKey } from "../domain/creator-recency";
  import type { EnhancedUserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";

  interface Props {
    band: BandKey;
    /** Header text, or null for a group that is not a recency band. */
    heading: string | null;
    members: EnhancedUserProfile[];
    density: "portrait" | "index";
    /** Column count, decided across all bands by the panel. */
    columns: number;
    /** Cell width in px, shared by every band of this density. */
    cellPx: number;
    /** ids of creators who joined within 30 days */
    newCreatorIds: Set<string>;
    /** px-per-em from the panel ramp, so avatars scale with the type. */
    unitPx: number;
    /** Bands past the first defer avatar loading. */
    loading?: "lazy" | "eager";
    onselect: (creator: EnhancedUserProfile) => void;
    onfollow: (creator: EnhancedUserProfile) => void;
    /** Creator ids with a follow write in flight. */
    followPending: Set<string>;
  }

  let {
    band,
    heading,
    members,
    density,
    columns,
    cellPx,
    newCreatorIds,
    unitPx,
    loading = "lazy",
    onselect,
    onfollow,
    followPending,
  }: Props = $props();

  /**
   * `fitColumns` avoids stranding one person in the final row wherever a
   * column count exists that can avoid it — but for some pairs none does
   * (37 people at a 4-column cap: 37 % 4, % 3 and % 2 are all 1). Observed at
   * 820, at 960x412, and at 375 with 7 people in 2 columns. When it is
   * genuinely unavoidable the leftover is centred under the group instead of
   * hugging the left edge, which reads as the end of a list rather than as a
   * dropped cell.
   */
  const strandsOne = $derived(
    columns > 1 && members.length > columns && members.length % columns === 1
  );

  const ringBandOf = (creator: EnhancedUserProfile): BandKey =>
    heading === null ? bandOf(creator.lastActiveAt, Date.now()) : band;

  const headingId = $derived(`roster-band-${band}`);
</script>

{#if members.length > 0}
  <section class="band" aria-labelledby={heading ? headingId : undefined}>
    {#if heading}
      <header class="band-header">
        <h3 class="band-name" id={headingId}>{heading}</h3>
        <span class="rule" aria-hidden="true"></span>
        <span class="count">{members.length}</span>
      </header>
    {/if}

    <div
      class="cells {density}"
      class:strands-one={strandsOne}
      style:--cols={columns}
      style:--cell-w="{cellPx}px"
    >
      {#each members as creator (creator.id)}
        <CreatorCell
          {creator}
          band={ringBandOf(creator)}
          {density}
          isNew={newCreatorIds.has(creator.id)}
          {unitPx}
          {loading}
          {onselect}
          {onfollow}
          followPending={followPending.has(creator.id)}
        />
      {/each}
    </div>
  </section>
{/if}

<style>
  .band {
    display: flex;
    flex-direction: column;
    gap: 0.75em;
  }

  .band-header {
    display: flex;
    align-items: center;
    gap: 0.75em;
  }

  .band-name {
    margin: 0;
    font-size: 0.8125em;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    white-space: nowrap;
  }

  .rule {
    /* The rule fills whatever is left, so the header reads as one line at
       every width instead of the count drifting away from the name. */
    flex: 1;
    height: 1px;
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.12));
  }

  .count {
    font-size: 0.8125em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
    /* The counts change as search narrows the roster; tabular figures keep
       the header from reflowing on every keystroke (no-layout-shift.md). */
    font-variant-numeric: tabular-nums;
  }

  .cells {
    display: grid;
    /* Fixed tracks, not `1fr`, and the grid spans the full band width: that
       pair is what makes every band share one left edge AND one cell size.
       `justify-content: center` then centres the track group, so the busiest
       band (whose width the panel sized these tracks from) lands flush edge
       to edge and shorter bands sit centred inside the same span. */
    grid-template-columns: repeat(var(--cols), var(--cell-w));
    justify-content: center;
    width: 100%;
  }

  .cells.portrait {
    gap: 0.5em;
  }

  .cells.index {
    gap: 0.125em 0.5em;
  }

  /* The unavoidable leftover, centred under the group rather than stranded at
     its left edge. Keeps its own cell width so it stays the same object as
     its neighbours, not a stretched one. */
  .cells.strands-one > :global(:last-child) {
    grid-column: 1 / -1;
    justify-self: center;
    width: var(--cell-w);
  }
</style>
