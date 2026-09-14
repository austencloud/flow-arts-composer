<script lang="ts">
  import { onDestroy } from "svelte";
  import SavePropDialog from "./SavePropDialog.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { VisualSequenceSaveIntent } from "../services/contracts/IVisualSequenceSaveCoordinator";
  import {
    captureActivePropConfig,
    type ResolvedPropConfig,
  } from "$lib/shared/foundation/services/recorded-prop-intent";
  import { resolveViewingProps } from "$lib/shared/foundation/services/prop-viewing";
  import { parseCollectionProp } from "../domain/collection-prop";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { getVisualSequenceSaveCoordinator } from "../get-visual-sequence-save-coordinator";

  let value = $state<ResolvedPropConfig | null>(null);
  let finish: ((config: ResolvedPropConfig | null) => void) | null = null;
  export async function request(
    sequence: SequenceData,
    intent: VisualSequenceSaveIntent = {}
  ): Promise<void> {
    if (finish) return;
    const viewed = resolveViewingProps(getSettings(), sequence).config;
    value = captureActivePropConfig({
      leftPropType:
        parseCollectionProp(intent.leftPropType) ?? viewed.leftPropType,
      rightPropType:
        parseCollectionProp(intent.rightPropType) ?? viewed.rightPropType,
      catDogMode: intent.catDogModeEnabled ?? viewed.catDogMode,
    });
    const choice = await new Promise<ResolvedPropConfig | null>((resolve) => {
      finish = resolve;
    });
    if (!choice) return;
    const coordinator = await getVisualSequenceSaveCoordinator();
    await coordinator.save(sequence, {
      ...intent,
      ...choice,
      catDogModeEnabled: choice.catDogMode,
    });
  }
  function close(save: boolean) {
    finish?.(save ? value : null);
    finish = null;
    value = null;
  }
  onDestroy(() => close(false));
</script>

{#if value}
  <SavePropDialog
    bind:value
    onSave={() => close(true)}
    onCancel={() => close(false)}
  />
{/if}
