<script lang="ts">
  import type { Snippet } from "svelte";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  interface Props {
    isOpen: boolean;
    ariaLabel: string;
    onClose: () => void;
    /** After the native dialog has left the top layer; see BaseModal.onclosed. */
    onClosed?: () => void;
    /** The phone-transfer QR view: one centred column instead of the split shell. */
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
<!-- One width for Home, Download and Publish, so moving between them never
     resizes the dialog; only the content inside it changes. -->
<BaseModal
  open={isOpen}
  class={`share-sheet-modal${narrow ? " share-sheet-modal--narrow" : ""}${expanded ? " share-sheet-modal--expanded" : ""}`}
  size="full"
  position="center"
  animation="pop"
  animateSize
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
    width: min(63rem, calc(100vw - 3rem));
    max-width: none;
    height: fit-content;
    max-height: calc(var(--viewport-height, 100dvh) - 3rem);
    padding: 0;
    background:
      linear-gradient(var(--theme-panel-bg), var(--theme-panel-bg)), #17171f;
    backdrop-filter: none;
    border: 1px solid var(--theme-stroke);
    border-radius: 1.25rem;
    transition: width var(--transition-normal);
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
  :global(dialog.share-sheet-modal[data-size="full"] .modal-body > .crossfade),
  :global(
    dialog.share-sheet-modal[data-size="full"] .modal-body > .crossfade > .layer
  ),
  :global(
    dialog.share-sheet-modal[data-size="full"]
      .modal-body
      > .crossfade
      > .layer
      > .sheet
  ) {
    width: 100%;
    height: auto;
    max-height: inherit;
    min-height: 0;
  }
  /* The phone-transfer QR is a single column; the split shell steps aside. */
  :global(dialog.base-modal.share-sheet-modal--narrow[data-size]) {
    width: min(30rem, calc(100vw - 2rem));
    height: fit-content;
  }
  :global(dialog.base-modal.share-sheet-modal--expanded[data-size]) {
    width: calc(100vw - 1rem);
    height: calc(var(--viewport-height, 100dvh) - 1rem);
    max-height: calc(var(--viewport-height, 100dvh) - 1rem);
  }
  /* Wider canvases recompose the same split with a larger stage; controls
     keep their size (4k-native-layout.md). */
  /* Scoped to the regular mode: the explicit narrow and expanded widths above
     have equal specificity, so an unscoped wide rule would override them. */
  @media (min-width: 1680px) and (min-height: 1000px) {
    :global(
      dialog.base-modal.share-sheet-modal:not(.share-sheet-modal--narrow):not(
          .share-sheet-modal--expanded
        )[data-size]
    ) {
      width: min(69rem, calc(100vw - 3rem));
    }
  }
  @media (min-width: 2600px) and (min-height: 1600px) {
    :global(
      dialog.base-modal.share-sheet-modal:not(.share-sheet-modal--narrow):not(
          .share-sheet-modal--expanded
        )[data-size]
    ) {
      width: min(79rem, calc(100vw - 3rem));
    }
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
    :global(dialog.base-modal.share-sheet-modal--narrow[data-size]) {
      width: min(30rem, calc(100vw - 1rem));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(dialog.base-modal.share-sheet-modal[data-size]) {
      transition: none;
    }
  }
</style>
