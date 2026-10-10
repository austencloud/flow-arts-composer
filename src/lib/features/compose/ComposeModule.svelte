<script lang="ts">
  import { goto } from "$app/navigation";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { consumeSequenceHandoff } from "$lib/shared/coordinators/sequence-handoff.svelte";
  import { deepLinker } from "$lib/shared/navigation/services/deep-linker";
  import { showToast } from "$lib/shared/toast/state/toast-state.svelte";

  // Keep old /compose and /animate links alive without loading a second editor.
  let started = false;
  $effect(() => {
    if (!authState.initialized || started) return;
    started = true;
    void openStudio();
  });

  async function openStudio(): Promise<void> {
    const handoff = new URL(window.location.href).searchParams.has("handoff")
      ? consumeSequenceHandoff()
      : null;
    const deepLink = deepLinker.consumeData("compose");
    const sequence = handoff?.sequence ?? deepLink?.sequence;

    if (sequence) {
      try {
        const { createStudioArrangement } =
          await import("$lib/features/post/services/studio-arrangement-projects");
        const projectId = await createStudioArrangement(sequence);
        await goto(`/post?project=${encodeURIComponent(projectId)}`, {
          replaceState: true,
        });
        return;
      } catch (error) {
        showToast({
          message:
            error instanceof Error
              ? error.message
              : "Could not open this sequence in Studio.",
          type: "error",
          duration: 5000,
        });
      }
    }

    await goto("/post?library=1", { replaceState: true });
  }
</script>

<p role="status">Opening Studio…</p>
