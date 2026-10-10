<script lang="ts">
  import { goto } from "$app/navigation";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import {
    consumeSequenceHandoff,
    saveSequenceHandoff,
  } from "#lib/shared/coordinators/sequence-handoff.svelte.js";
  import { deepLinker } from "#lib/shared/navigation/services/deep-linker.js";
  import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";

  // Keep old /compose and /animate links alive without loading a second editor.
  let started = false;
  let openError = $state<string | null>(null);
  $effect(() => {
    if (!authState.initialized || started) return;
    started = true;
    void openStudio();
  });

  async function openStudio(): Promise<void> {
    openError = null;
    const handoff = consumeSequenceHandoff();
    const deepLink = deepLinker.consumeData("compose");
    const sequence = handoff?.sequence ?? deepLink?.sequence;

    if (sequence) {
      try {
        const { createStudioArrangement } =
          await import("#lib/features/post/services/studio-arrangement-projects.js");
        const projectId = await createStudioArrangement(sequence);
        await goto(`/post?project=${encodeURIComponent(projectId)}`, {
          replaceState: true,
        });
        return;
      } catch (error) {
        // A failed save must leave the source available for retry or refresh.
        saveSequenceHandoff(handoff ?? { sequence });
        openError =
          error instanceof Error
            ? error.message
            : "Could not open this sequence in Studio.";
        showToast({
          message: openError,
          type: "error",
          duration: 5000,
        });
        return;
      }
    }

    await goto("/post?library=1", { replaceState: true });
  }
</script>

{#if openError}
  <div role="alert">
    <p>{openError}</p>
    <button type="button" onclick={() => void openStudio()}>Try again</button>
  </div>
{:else}
  <p role="status">Opening Studio…</p>
{/if}
