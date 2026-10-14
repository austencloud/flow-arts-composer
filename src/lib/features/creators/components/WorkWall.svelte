<!--
  WorkWall — what the community has actually made, above the list of who they
  are.

  This is the half of the page that has substance. The roster is 56 faces at a
  bounded cell size, which on a 3840px canvas cannot fill the room no matter
  how the whitespace is tuned — measured 2026-07-26, the portrait bands
  reached ~68% of the width and the page thinned out below the fold. Work
  tiles are the content that earns the canvas.

  Column count is computed, never `repeat(auto-fill, minmax(Npx, 1fr))`:
  auto-fill against a floor yields more, thinner tiles as the screen grows and
  strands the last one (4k-native-layout.md).

  Only a few tiles animate at once. Every live tile owns a full animation
  stack (playback clock, 2D canvas, WebGL2 trail overlay, step strip), and a
  wide wall mounts one per column: fourteen of them at 3840px pinned the main
  thread at 1.3 fps, because once a frame outlasts a beat every tile changes
  step on every frame and remounts its strip pictographs. The profile stage's
  LiveSlots already budgets this; the wall reuses it and the rest of the tiles
  show their still card, which is the same square so nothing moves.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import WorkTile from "./WorkTile.svelte";
  import { LiveSlots } from "./profile/stage/live-slots.svelte";
  import { fitColumns } from "../domain/fit-columns";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { EnhancedUserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";

  interface Props {
    items: { sequence: SequenceData; creator: EnhancedUserProfile }[];
    /** Max columns for the current panel width, computed by the panel. */
    cap: number;
    unitPx: number;
    onselect: (sequence: SequenceData) => void;
    oncreator: (creator: EnhancedUserProfile) => void;
  }

  let { items, cap, unitPx, onselect, oncreator }: Props = $props();

  const columns = $derived(
    fitColumns(items.length, Math.min(cap, Math.max(1, items.length)))
  );

  /** How many wall tiles may animate at once. One live tile costs about
   *  5 ms of main-thread time per frame at 4K; two keeps the row moving
   *  without starting the step-change cascade described above. */
  const WALL_LIVE_BUDGET = 2;

  const slots = new LiveSlots();
  slots.budgets.sequence = WALL_LIVE_BUDGET;
  onDestroy(() => slots.destroy());
</script>

{#if items.length > 0}
  <section class="wall" aria-labelledby="creators-wall-heading">
    <header class="wall-header">
      <h3 class="wall-name" id="creators-wall-heading">
        {t("browse_verified_recent_work")}
      </h3>
      <span class="rule" aria-hidden="true"></span>
      <span class="count">{items.length}</span>
    </header>

    <div class="tiles" style:--cols={columns}>
      {#each items as item (item.sequence.id)}
        <WorkTile
          sequence={item.sequence}
          creator={item.creator}
          {unitPx}
          {slots}
          {onselect}
          {oncreator}
        />
      {/each}
    </div>
  </section>
{/if}

<style>
  .wall {
    display: flex;
    flex-direction: column;
    gap: 0.75em;
  }

  .wall-header {
    display: flex;
    align-items: center;
    gap: 0.75em;
  }

  .wall-name {
    margin: 0;
    font-size: 0.8125em;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    white-space: nowrap;
  }

  .rule {
    flex: 1;
    height: 1px;
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.12));
  }

  .count {
    font-size: 0.8125em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
    font-variant-numeric: tabular-nums;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: 0.75em;
    /* Every showcase owns a square media stage; the credit strip is the only
       content below it, so the row stays aligned at every sequence length. */
    align-items: start;
  }
</style>
