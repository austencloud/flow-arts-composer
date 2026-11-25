<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getFuseContext } from "../context/fuse-context";
  import type { FuseMode } from "../state/fuse-state.svelte";
  import FuseModeBar from "./FuseModeBar.svelte";

  let {
    onModeChange,
  }: {
    onModeChange: (mode: FuseMode) => void;
  } = $props();

  const { state: fuseState } = getFuseContext();

  // One line on what the switch's choice does, rather than its own word again.
  const note = $derived.by(() => {
    if (fuseState.mode === "shuffle") return t("fuse_header_each_own_path");
    return t(
      fuseState.previewDriverSide === "left"
        ? "fuse_header_left_leads"
        : "fuse_header_right_leads"
    );
  });
</script>

<!-- Separate | Linked is the first thing on the tab, top left: it is the one
     choice that changes what the whole screen is. Each hand's settings for new
     paths live on that hand's card, beside its Regenerate, never up here: a
     header full of settings read as controls for the paths on screen. -->
<header class="fuse-header">
  <h2 class="visually-hidden">{t("fuse_header_title")}</h2>
  <div class="mode-switch">
    <FuseModeBar compact={true} onSelect={onModeChange} />
  </div>
  <p class="mode-note">{note}</p>
</header>

<style>
  .fuse-header {
    grid-area: header;
    display: flex;
    align-items: center;
    gap: var(--settings-spacing-md, 14px);
    min-height: var(--min-touch-target, 48px);
    padding: var(--settings-spacing-sm, 8px) var(--settings-spacing-md, 14px);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-lg, 20px);
    background: var(--theme-panel-bg);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  .mode-switch {
    display: flex;
    flex: 0 0 auto;
    min-width: 0;
  }

  /* Two short words: size to them. */
  .mode-switch :global(.fuse-mode-bar) {
    width: 16rem;
    min-width: 0;
  }

  .mode-note {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The phone header is the switch alone, full width: 7 + 44 (36px segments
     in the control's 3px padding and 1px border) + 7, plus the header's 1px
     border top and bottom. The note would only crowd it. */
  @container fuse (max-width: 520px) {
    .fuse-header {
      gap: 8px;
      padding: 7px 8px;
    }

    .mode-switch {
      flex: 1 1 auto;
    }

    .mode-switch :global(.fuse-mode-bar) {
      width: 100%;
    }

    .mode-switch :global(.segment) {
      min-height: var(--alt-touch-target, 36px);
      padding-block: 0;
    }

    .mode-note {
      display: none;
    }
  }

  /* On a short phone the switch is its own box, and the height of the header's
     goes to the result. */
  @container fuse (max-width: 520px) and (max-height: 640px) {
    .fuse-header {
      min-height: 0;
      padding: 0;
      border: 0;
      background: none;
    }
  }

  @container fuse (min-width: 1680px) and (min-height: 900px) {
    .fuse-header {
      gap: 18px;
      padding: 10px 18px;
    }

    .mode-switch :global(.fuse-mode-bar) {
      width: 18rem;
    }

    .mode-note {
      font-size: var(--font-size-min, 14px);
    }
  }
</style>
