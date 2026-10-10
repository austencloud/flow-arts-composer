<!--
  SpinnerNowPlaying.svelte

  The one line of identity above the stage: canonical LOOP chips for whatever
  is playing right now, same in both modes. The word itself lives on the
  canvas (TKA glyph font); step counts and stats intentionally do not exist —
  the notation shows them better than a number can.
-->
<script lang="ts">
  import LoopChips from "#lib/features/store/components/LoopChips.svelte";
  import { parseLoopComponents } from "#lib/shared/create/services/loop-type-utils.js";
  import { Period } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
  import {
    tryGetLoopDisplayResolver,
    type LoopDisplay,
  } from "#lib/shared/loop-labeler/get-loop-display-resolver.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { GeneratedSequenceInfo } from "#lib/features/landing/domain/models/spinner-models.js";

  let {
    sequence,
    generatedInfo = null,
  }: {
    sequence: SequenceData | null;
    /** Infinite mode's generation record; null in Library mode. */
    generatedInfo?: GeneratedSequenceInfo | null;
  } = $props();

  const EMPTY_LOOP_DISPLAY: LoopDisplay = {
    components: new Set(),
    period: 1,
  };
  const loopDisplay = $derived.by(() => {
    const resolve = tryGetLoopDisplayResolver();
    return sequence && resolve ? resolve(sequence) : EMPTY_LOOP_DISPLAY;
  });

  // A mixed LOOP can use one interval for rotation and another for inversion.
  // The canonical resolver preserves both from loopSpec; the lightweight
  // metadata path remains the fallback while app services are booting.
  const components = $derived.by((): string[] => {
    if (loopDisplay.components.size > 0) return [...loopDisplay.components];
    if (sequence?.components?.length) return [...sequence.components];
    const loopType =
      sequence?.loopType ?? generatedInfo?.settings.loopType ?? null;
    return [...parseLoopComponents(loopType)];
  });

  const metadataPeriod = $derived.by((): Period | undefined => {
    if (sequence?.period === 4) return Period.QUARTERED;
    if (sequence?.period === 2) return Period.HALVED;
    return generatedInfo?.settings.period;
  });
  const rotationPeriod = $derived(loopDisplay.rotationPeriod ?? metadataPeriod);
  const inversionPeriod = $derived(
    loopDisplay.inversionPeriod ?? metadataPeriod
  );
</script>

{#if components.length > 0}
  <LoopChips {components} {rotationPeriod} {inversionPeriod} />
{/if}
