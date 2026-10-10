<script lang="ts">
  import "../customize-accent.css";
  import type { Snippet } from "svelte";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import { portal } from "./portal";

  let {
    isOpen,
    ariaLabel,
    surface = "accent",
    onClose,
    children,
  }: {
    isOpen: boolean;
    ariaLabel: string;
    /**
     * `accent` paints Generate's Customize surface — a near-black ground under a
     * violet sweep, which is that panel's own identity.
     *
     * `panel` paints the app's own panel background instead, for a host whose
     * workspace is right behind the drawer. Fuse is that host: its cards, header
     * and result pane are all `--theme-panel-bg`, so the violet-washed ground
     * arrived belonging to a different application than the one it covers.
     */
    surface?: "accent" | "panel";
    onClose: () => void;
    children: Snippet;
  } = $props();
</script>

<div use:portal>
  <Drawer
    {isOpen}
    placement="right"
    respectLayoutMode={true}
    closeOnBackdrop={true}
    closeOnEscape={true}
    {ariaLabel}
    focusContainerOnOpen={true}
    class="generation-settings-drawer"
    backdropClass="generation-settings-backdrop"
    onclose={onClose}
  >
    <div
      class="generation-settings-content customize-accent-scope"
      data-surface={surface}
    >
      {@render children()}
    </div>
  </Drawer>
</div>

<style>
  :global(.drawer-content.generation-settings-drawer) {
    --sheet-bg: transparent;
    --sheet-border: none;
    --sheet-shadow: 0 -4px 24px rgba(0, 0, 0, 0.5);
  }

  :global(.drawer-overlay.generation-settings-backdrop.side-by-side-layout) {
    top: var(--create-panel-top, 0);
    right: 0;
    bottom: 0;
    left: var(--desktop-sidebar-width, 0);
  }

  :global(.drawer-content.generation-settings-drawer[data-placement="bottom"]) {
    height: 85dvh;
    min-height: 0;
    max-height: 85dvh;
  }

  :global(
    .drawer-content.generation-settings-drawer.side-by-side-layout[data-placement="right"]
  ) {
    width: min(var(--create-panel-width, 480px), clamp(480px, 30vw, 620px));
    max-width: 100%;
  }

  .generation-settings-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 12px 16px calc(16px + env(safe-area-inset-bottom, 0px));
    background-color: var(--customize-surface-solid);
    background-image: var(--customize-surface-gradient),
      var(--customize-surface-wash-layer);
    border: none;
    border-radius: 0;
  }

  /* The host's own surface, opaque, with the app's panel edge on the side it
     meets the workspace — so it reads as this page's panel sliding in rather
     than as a differently-designed window landing on top of it. */
  .generation-settings-content[data-surface="panel"] {
    background-color: var(--theme-surface, #101018);
    background-image: linear-gradient(
      var(--theme-panel-bg, rgba(18, 18, 28, 0.98)),
      var(--theme-panel-bg, rgba(18, 18, 28, 0.98))
    );
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .generation-settings-content > :global(.generation-settings-overlay) {
    position: static;
    flex: 1;
    min-height: 0;
    gap: 10px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .generation-settings-content {
      transition: none;
    }
  }
</style>
