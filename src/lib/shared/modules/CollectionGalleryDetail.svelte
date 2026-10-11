<!--
  CollectionGalleryDetail — the shared gallery/detail shell for the Playground
  collections (Tunnels, Mandala, Scene-3D). All three had an identical
  hand-rolled `phase: "gallery" | "detail"` swap over `<Crossfade key={phase}
  fill>` with a floating "back" button. That worked on desktop but on mobile the
  detail was a full-screen phase swap with only a back button — it couldn't be
  swiped away like every other sheet in the app, and the back button (floating
  over the live tunnel canvas) mis-fired taps into the canvas.

  This shell centralises the decision:
  - **Desktop (side-by-side layout):** the detail renders in-flow, crossfading
    with the gallery exactly as before. The consumer's own floating back button
    (rendered when `inDrawer` is false) dismisses it.
  - **Mobile:** the gallery stays mounted and the detail rides the shared
    `Drawer` primitive as a bottom sheet — swipe-down / backdrop / drag-handle
    dismiss, `preventScroll`, focus trap. `onClose` flips the consumer's phase
    back to the gallery. The consumer hides its own back button in this mode
    (`inDrawer` is true) since the drawer owns dismissal.

  Consumers pass two snippets. `gallery` takes no args. `detail` takes
  `{ inDrawer }` so it can drop its floating back button when the drawer already
  provides dismissal. The source of truth for `open` stays in the consumer
  (its `phase`); `onClose` is the consumer's `back()`.
-->
<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import { responsiveLayoutManager } from "#lib/shared/create/services/responsive-layout-manager.js";

  interface DetailArgs {
    /** True when the detail is rendering inside the mobile drawer — the consumer
     *  drops its floating back button (the drawer owns dismissal). */
    inDrawer: boolean;
  }

  let {
    open,
    onClose,
    ariaLabel = "Details",
    gallery,
    detail,
  }: {
    /** Whether the detail view is showing (consumer's phase === "detail"). */
    open: boolean;
    /** Return to the gallery — the consumer's back(). Fired by drawer dismiss. */
    onClose: () => void;
    /** Accessible name for the mobile drawer. */
    ariaLabel?: string;
    gallery: Snippet;
    detail: Snippet<[DetailArgs]>;
  } = $props();

  // Bottom sheet on mobile, in-flow crossfade on desktop. Same signal the Drawer
  // primitive uses for respectLayoutMode, kept live across rotation / resize.
  let sideBySide = $state(true);
  onMount(() => {
    sideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
    return responsiveLayoutManager.onLayoutChange(() => {
      sideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
    });
  });
</script>

{#if sideBySide}
  <!-- Desktop: in-flow phase swap, unchanged. -->
  <Crossfade key={open ? "detail" : "gallery"} fill>
    {#if open}
      {@render detail({ inDrawer: false })}
    {:else}
      {@render gallery()}
    {/if}
  </Crossfade>
{:else}
  <!-- Mobile: gallery stays put; detail is a full-height, swipe-dismissable
       slide-up sheet. Full height (not the default content-sized bottom sheet)
       so the preview is the hero — a content-sized sheet collapses to its 50vh
       floor and squeezes the preview's flex:1 down to nothing (the mandala
       shrank). The sheet's own .drawer-inner scrolls if the controls + hero
       can't all fit. -->
  {@render gallery()}
  <Drawer
    placement="bottom"
    isOpen={open}
    onclose={onClose}
    {ariaLabel}
    respectLayoutMode={false}
    preventScroll
    class="collection-detail-sheet"
  >
    {@render detail({ inDrawer: true })}
  </Drawer>
{/if}

<style>
  /* Force the slide-up sheet to full height so the hero preview fills the screen
     instead of the sheet hugging its (collapsed) content. `height: 100%` (not
     100dvh) because the host modules set `container-type` → `contain: layout`,
     which makes THEM the containing block for this fixed sheet (and clips it via
     overflow). So 100% = the module's height = the mobile content area; 100dvh
     would overrun it and get clipped, hiding the drag handle. `--sheet-max-height`
     is the Drawer's sanctioned height-cap var (no !important / specificity fight).
     Global: the class lands on the Drawer's own <dialog>, a different component. */
  :global(.drawer-content.collection-detail-sheet) {
    height: 100%;
    --sheet-max-height: 100%;
  }
</style>
