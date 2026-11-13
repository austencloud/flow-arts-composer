<!--
  MandalaPlace: Browse's third view, where a person picks how busy a mandala
  they want. It hands the engine's whole pool to the mandala index (the
  engine itself feeds the index only while a Mandala filter is on), splits
  the sequences Browse would show into the five levels, and shows the levels
  screen. Showing a level applies the Mandala filter for it; Browse then
  takes him to the grid.

  The pool split is the engine's facet pool for the Mandala filter: the
  search's results under every other active filter. So each level's count is
  the number the grid shows after "Show".
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { mandalaIndex } from "#lib/shared/browse/services/mandala-index.svelte.js";
  import { mandalaIndexSettled } from "#lib/shared/browse/services/mandala-climb.svelte.js";
  import { peekMandalaSignature } from "#lib/shared/browse/services/sequence-density.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { mandalaLevels, startingLevel } from "./mandala-levels";
  import { mandalaPlace } from "./mandala-place-state.svelte";
  import MandalaLevels from "./MandalaLevels.svelte";

  interface Props {
    /** Every sequence Browse has, and whether the engine has a first stage of it. */
    pool: readonly SequenceData[];
    poolReady: boolean;
    /** True once no further stage of the pool is coming (or loading failed):
     *  the engine's `poolComplete`. Without it the first stage counts. */
    poolComplete?: boolean;
    /** The sequences a Mandala level would narrow: the search's results
     *  under every other active filter. */
    facetPool: readonly SequenceData[];
    /** The level the applied Mandala filter names, if it names one. */
    appliedLevel: number | null;
    /** Apply the Mandala filter for `level`. */
    onShow: (level: number) => void;
    /** Open one sequence, from a tap on its mandala. */
    onOpenSequence: (sequence: SequenceData) => void;
  }

  let {
    pool,
    poolReady,
    poolComplete,
    facetPool,
    appliedLevel,
    onShow,
    onOpenSequence,
  }: Props = $props();

  $effect(() => {
    if (!poolReady) return;
    const sequences = pool;
    untrack(() => mandalaIndex.setPool(sequences));
  });

  // Every sequence measured, for the complete pool: counts no longer change.
  const settled = $derived(
    poolReady &&
      (poolComplete ?? true) &&
      mandalaIndexSettled(mandalaIndex, pool)
  );

  const levels = $derived.by(() => {
    void mandalaIndex.version;
    return settled ? mandalaLevels(facetPool, peekMandalaSignature) : [];
  });
  const empty = $derived(settled && mandalaIndex.empty);
  const level = $derived(
    mandalaPlace.level ?? startingLevel(levels, appliedLevel)
  );
</script>

<div class="mandala-place">
  <MandalaLevels
    {levels}
    {level}
    ready={settled}
    {empty}
    pathsOf={(key) => mandalaIndex.groupOf(key)?.paths}
    onLevel={(next) => mandalaPlace.setLevel(next)}
    onShow={() => onShow(level)}
    onOpen={onOpenSequence}
    onBack={() => mandalaPlace.close()}
  />
</div>

<style>
  .mandala-place {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    container-type: size;
  }
</style>
