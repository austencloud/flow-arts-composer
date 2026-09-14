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
    compact?: boolean;
    expanded?: boolean;
    focused?: boolean;
    children: Snippet<[surface: "modal" | "drawer"]>;
  }
  let {
    isOpen,
    ariaLabel,
    onClose,
    onClosed,
    narrow = false,
    compact = false,
    expanded = false,
    focused = false,
    children,
  }: Props = $props();
  const headingId = $props.id();
</script>

<!-- The native modal layer keeps editor toolbars behind sharing on phones too. -->
<BaseModal
  open={isOpen}
  class={`share-sheet-modal${narrow ? " share-sheet-modal--narrow" : ""}${compact ? " share-sheet-modal--compact" : ""}${expanded ? " share-sheet-modal--expanded" : ""}${focused ? " share-sheet-modal--focused" : ""}`}
  size={compact ? "fit" : "full"}
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
    height: fit-content;
    max-height: calc(var(--viewport-height, 100dvh) - 3rem);
    padding: 0;
    background:
      linear-gradient(var(--theme-panel-bg), var(--theme-panel-bg)), #17171f;
    backdrop-filter: none;
    border: 1px solid var(--theme-stroke);
    border-radius: 1.25rem;
    interpolate-size: allow-keywords;
    transition:
      width var(--transition-normal),
      height var(--transition-normal);
  }
  :global(dialog.share-sheet-modal[data-size="full"] .modal-content-wrapper) {
    height: auto;
    max-height: inherit;
    min-height: 0;
  }
  :global(dialog.share-sheet-modal[data-size="full"] .modal-body) {
    max-height: inherit;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: hidden;
    overflow-x: hidden;
  }
  :global(dialog.share-sheet-modal[data-size="full"] .modal-body > .sheet) {
    width: 100%;
    height: auto;
    max-height: inherit;
  }
  :global(dialog.base-modal.share-sheet-modal--narrow[data-size]) {
    width: min(30rem, calc(100vw - 2rem));
    height: fit-content;
  }
  :global(dialog.base-modal.share-sheet-modal--compact[data-size]) {
    width: min(32rem, calc(100vw - 2rem));
    height: fit-content;
    max-height: calc(var(--viewport-height, 100dvh) - 2rem);
  }
  :global(dialog.base-modal.share-sheet-modal--focused[data-size]) {
    width: min(42rem, calc(100vw - 2rem));
  }
  :global(dialog.base-modal.share-sheet-modal--expanded[data-size]) {
    width: calc(100vw - 1rem);
    height: calc(var(--viewport-height, 100dvh) - 1rem);
    max-height: calc(var(--viewport-height, 100dvh) - 1rem);
  }
  @media (max-width: 899px) {
    :global(dialog.base-modal.share-sheet-modal[data-size]) {
      width: min(38rem, 100vw);
      height: fit-content;
      max-height: calc(var(--viewport-height, 100dvh) - 0.75rem);
      margin-block: auto 0;
      border-radius: 1.25rem 1.25rem 0 0;
      border-bottom: 0;
    }
    :global(dialog.base-modal.share-sheet-modal--compact[data-size]) {
      width: min(32rem, calc(100vw - 1rem));
      height: fit-content;
      max-height: calc(var(--viewport-height, 100dvh) - 0.75rem);
      margin: auto auto 0;
      border: 1px solid var(--theme-stroke);
      border-radius: 1.25rem 1.25rem 0 0;
    }
  }
  @media (min-width: 600px) and (max-width: 899px) {
    :global(dialog.base-modal.share-sheet-modal--compact[data-size]) {
      width: min(32rem, calc(100vw - 3rem));
      height: fit-content;
      max-height: calc(var(--viewport-height, 100dvh) - 3rem);
      margin: auto;
      border: 1px solid var(--theme-stroke);
      border-radius: 1.25rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(dialog.base-modal.share-sheet-modal[data-size]) {
      transition: none;
    }
  }
</style>
