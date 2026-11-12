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
  /* The dialog listens for taps (outside closes it), so a phone flashed the
     whole sheet on every tap, the QR code included, as if it were a button.
     Only real controls keep the tap flash. */
  :global(dialog.base-modal.share-sheet-modal) {
    -webkit-tap-highlight-color: transparent;
  }
  :global(
    dialog.base-modal.share-sheet-modal
      :is(button, a[href], [role="button"], label, summary)
  ) {
    -webkit-tap-highlight-color: initial;
  }
  :global(dialog.base-modal.share-sheet-modal[data-size]) {
    width: min(63rem, calc(100vw - 3rem));
    max-width: none;
    /* The content inherits the dialog's cap less its block borders, so a
       trimmed sheet fills the dialog exactly instead of overflowing it by
       the border's width. */
    --share-sheet-max-h: calc(var(--viewport-height, 100dvh) - 3rem);
    --share-sheet-border-block: 2px;
    height: fit-content;
    max-height: var(--share-sheet-max-h);
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
    max-height: calc(
      var(--share-sheet-max-h, 100dvh) - var(--share-sheet-border-block, 0px)
    );
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
    --share-sheet-max-h: calc(var(--viewport-height, 100dvh) - 1rem);
    height: var(--share-sheet-max-h);
    max-height: var(--share-sheet-max-h);
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
  /* Phones and portrait tablets get a narrower, taller dialog. It stays
     centred like every other size: a sheet pinned to the bottom edge left a
     dark band above it on the Fold's cover screen (412x915), which Austen
     rejected on 2026-11-01. A landscape window from 720px wide and over
     560px tall (an unfolded Fold held sideways, 823x707) keeps the wide
     dialog: PostShareSheet lays it out as the split there. */
  @media (max-width: 719px),
    (max-width: 899px) and (orientation: portrait),
    (max-width: 899px) and (max-height: 560px) {
    :global(dialog.base-modal.share-sheet-modal[data-size]) {
      width: min(38rem, 100vw);
      --share-sheet-max-h: calc(var(--viewport-height, 100dvh) - 1.5rem);
      height: fit-content;
      max-height: var(--share-sheet-max-h);
      /* modal-tokens.css zeroes the margin of a full-size phone dialog so it
         fills the screen; this one is shorter than the screen and centres. */
      margin: auto;
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
