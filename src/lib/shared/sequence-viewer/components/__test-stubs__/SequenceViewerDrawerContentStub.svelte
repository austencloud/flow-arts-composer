<script lang="ts" module>
  // The latest mounted viewer's close callback, for tests that close it.
  export const contentStubCallbacks: { onClose: (() => void) | null } = {
    onClose: null,
  };
</script>

<script lang="ts">
  let {
    sequence,
    sessionKey,
    dormant,
    onClose,
    onCardReady,
    onReadyForReveal,
  }: {
    sequence: unknown;
    sessionKey: number;
    dormant: boolean;
    onClose: () => void;
    onCardReady: () => void;
    onReadyForReveal: () => void;
  } = $props();

  $effect(() => {
    contentStubCallbacks.onClose = onClose;
    // The real viewer reports its card ready from a microtask and itself
    // ready from an effect once it has drawn.
    if (sequence) {
      queueMicrotask(onCardReady);
      onReadyForReveal();
    }
  });
</script>

{#if sequence}
  <div
    data-testid="sequence-viewer-drawer-content-stub"
    data-dormant={String(dormant)}
    data-session-key={String(sessionKey)}
  ></div>
{/if}
