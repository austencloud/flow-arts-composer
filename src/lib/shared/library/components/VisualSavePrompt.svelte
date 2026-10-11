<script lang="ts">
  import { onDestroy } from "svelte";
  import SavePropDialog from "./SavePropDialog.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { VisualSequenceSaveIntent } from "../services/contracts/IVisualSequenceSaveCoordinator";
  import {
    captureActivePropConfig,
    type ResolvedPropConfig,
  } from "#lib/shared/foundation/services/recorded-prop-intent.js";
  import { resolveViewingProps } from "#lib/shared/foundation/services/prop-viewing.js";
  import { parseCollectionProp } from "../domain/collection-prop";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { getVisualSequenceSaveCoordinator } from "../get-visual-sequence-save-coordinator";
  import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";

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
    // The caller (ContextMenu.runAction) awaits this action with no catch of
    // its own, so a rejection here would otherwise vanish as an unhandled
    // promise rejection - the person would see the dialog close and nothing
    // else. getVisualSequenceSaveCoordinator() only throws/rejects for a setup
    // problem (e.g. the lazy registration chunk failed to load); coordinator.save()
    // already reports its own outcomes via toast and never rejects.
    try {
      const coordinator = await getVisualSequenceSaveCoordinator();
      await coordinator.save(sequence, {
        ...intent,
        ...choice,
        catDogModeEnabled: choice.catDogMode,
      });
    } catch (error) {
      console.error("[VisualSavePrompt] Could not reach library saving:", error);
      showToast("Couldn't save this sequence right now", "error");
    }
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
