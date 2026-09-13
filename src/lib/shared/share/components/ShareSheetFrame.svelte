<script lang="ts">
  import type { Snippet } from "svelte";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  interface Props {
    isOpen: boolean;
    ariaLabel: string;
    onClose: () => void;
    /** After the native dialog has left the top layer; see BaseModal.onclosed. */
    onClosed?: () => void;
    narrow?: boolean;
    expanded?: boolean;
    children: Snippet<[surface: "modal" | "drawer"]>;
  }
  let {
    isOpen,
    ariaLabel,
    onClose,
    onClosed,
    narrow = false,
    expanded = false,
    children,
  }: Props = $props();
  const headingId = $props.id();
</script>

<!-- The native modal layer keeps editor toolbars behind sharing on phones too. -->
<BaseModal
  open={isOpen}
  class={`share-sheet-modal${narrow ? " share-sheet-modal--narrow" : ""}${expanded ? " share-sheet-modal--expanded" : ""}`}
  size="full"
  position="center"
  animation="pop"
  labelledBy={headingId}
  onclose={onClose}
  onclosed={onClosed}
>
  <span id={headingId} class="sr-only">{ariaLabel}</span>
  {@render children("modal")}
</BaseModal>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  :global(dialog.base-modal.share-sheet-modal[data-size]) {
    width: min(72rem, calc(100vw - 3rem));
    max-width: none;
    height: min(48rem, calc(var(--viewport-height, 100dvh) - 3rem));
    max-height: calc(var(--viewport-height, 100dvh) - 3rem);
    padding: 0;
    background:
      linear-gradient(var(--theme-panel-bg), var(--theme-panel-bg)), #17171f;
    backdrop-filter: none;
    border: 1px solid var(--theme-stroke);
    border-radius: 1.25rem;
  }
  :global(.share-sheet-modal .modal-content-wrapper),
  :global(.share-sheet-modal .modal-body) {
    height: 100%;
    min-height: 0;
  }
  :global(.share-sheet-modal .modal-body) {
    overflow-y: auto;
    overflow-x: hidden;
  }
  :global(dialog.base-modal.share-sheet-modal--narrow[data-size]) {
    width: min(30rem, calc(100vw - 2rem));
    height: min(38rem, calc(var(--viewport-height, 100dvh) - 2rem));
  }
  :global(dialog.base-modal.share-sheet-modal--expanded[data-size]) {
    width: calc(100vw - 1rem);
    height: calc(var(--viewport-height, 100dvh) - 1rem);
    max-height: calc(var(--viewport-height, 100dvh) - 1rem);
  }
  @media (max-width: 899px) {
    :global(dialog.base-modal.share-sheet-modal[data-size]) {
      width: min(38rem, 100vw);
      height: calc(var(--viewport-height, 100dvh) - 0.75rem);
      max-height: calc(var(--viewport-height, 100dvh) - 0.75rem);
      margin-block: auto 0;
      border-radius: 1.25rem 1.25rem 0 0;
      border-bottom: 0;
    }
  }
</style>
