<script lang="ts">
  import DifficultyBadge from "$lib/shared/components/DifficultyBadge.svelte";
  import LOOPIconStrip from "$lib/shared/components/LOOPIconStrip.svelte";
  import { analyzeDifficulty } from "$lib/shared/browse/services/sequence-difficulty-calculator";
  import { parseLoopComponents } from "$lib/shared/create/services/loop-type-utils";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type {
    LOOPType,
    Period,
  } from "$lib/shared/foundation/domain/models/generation/circular-models";
  import type { LoopDisplay } from "$lib/shared/loop-labeler/get-loop-display-resolver";

  let {
    sequence = null,
    loopType = null,
    period = null,
    loopDisplay = null,
    presentation = "rail",
  } = $props<{
    sequence?: SequenceData | null;
    loopType?: LOOPType | null;
    period?: Period | null;
    loopDisplay?: LoopDisplay | null;
    presentation?: "rail" | "inline" | "corners";
  }>();

  const hasSteps = $derived((sequence?.steps.length ?? 0) > 0);
  const difficultyLevel = $derived(
    analyzeDifficulty(sequence ? [...sequence.steps] : []).level
  );
  const loopComponents = $derived(
    loopDisplay?.components ?? parseLoopComponents(loopType)
  );
  const hasLoop = $derived(loopComponents.size > 0);
</script>

<div
  class="metadata-rail"
  class:inline={presentation === "inline"}
  class:corners={presentation === "corners"}
  aria-label="Sequence metadata"
>
  <div
    class="difficulty-slot"
    class:visible={hasSteps}
    aria-hidden={!hasSteps}
    aria-label="Difficulty level {difficultyLevel}"
  >
    <DifficultyBadge level={difficultyLevel} size="20px" fontSize="12px" />
  </div>

  <div class="loop-slot" class:visible={hasLoop} aria-hidden={!hasLoop}>
    <LOOPIconStrip
      activeComponents={loopComponents}
      rotationPeriod={loopDisplay?.rotationPeriod ?? period ?? undefined}
      inversionPeriod={loopDisplay?.inversionPeriod ?? period ?? undefined}
      reflectionAxis={loopDisplay?.reflectionAxis}
      overlayComponents={loopDisplay?.overlayComponents}
      size={18}
      darkMode={true}
      showFreeformWhenEmpty={false}
    />
  </div>
</div>

<style>
  .metadata-rail {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 20px;
    flex: 0 0 20px;
  }

  .metadata-rail.inline {
    justify-content: flex-start;
    width: max-content;
    max-width: 100%;
    flex: 0 1 auto;
  }

  .metadata-rail.corners {
    justify-content: space-between;
  }

  .metadata-rail.corners .difficulty-slot,
  .metadata-rail.corners .loop-slot {
    position: relative;
    flex: 0 0 auto;
  }

  .metadata-rail.inline .difficulty-slot,
  .metadata-rail.inline .loop-slot {
    flex: 0 0 auto;
  }

  .difficulty-slot,
  .loop-slot {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 20px;
    visibility: hidden;
    opacity: 0;
  }

  .difficulty-slot.visible,
  .loop-slot.visible {
    position: relative;
    visibility: visible;
    opacity: 1;
  }

  .difficulty-slot {
    width: 20px;
  }

  .loop-slot {
    min-width: 18px;
    width: max-content;
    line-height: 1;
  }

  .loop-slot :global(.loop-icon-strip) {
    line-height: 1;
  }
</style>
