<script lang="ts" module>
  // The latest mounted viewer's close callback, for tests that close it.
  export const contentStubCallbacks: { onClose: (() => void) | null } = {
    onClose: null,
  };
</script>

<script lang="ts">
  let {
    sequence,
    dormant,
    onClose,
    onReadyForReveal,
  }: {
    sequence: unknown;
    dormant: boolean;
    onClose: () => void;
    onReadyForReveal: () => void;
  } = $props();

  $effect(() => {
    contentStubCallbacks.onClose = onClose;
    // The real viewer reports ready from an effect once it has drawn.
    if (sequence) onReadyForReveal();
  });
</script>

{#if sequence}
  <div
    data-testid="sequence-viewer-drawer-content-stub"
    data-dormant={String(dormant)}
  ></div>
{/if}
