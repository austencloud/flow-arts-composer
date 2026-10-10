<!--
  TrailSettingsSheet.svelte

  Sheet containing trail customization options.
  Uses SimpleTrailControls for the core presets.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import SimpleTrailControls from "#lib/shared/animation-engine/components/trail/SimpleTrailControls.svelte";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  let {
    isOpen = $bindable(false),
    currentPropType = null,
    leftPropType = null,
    rightPropType = null,
  }: {
    isOpen: boolean;
    currentPropType?: PropType | string | null;
    leftPropType?: PropType | string | null;
    rightPropType?: PropType | string | null;
  } = $props();
</script>

<Drawer
  bind:isOpen
  placement="right"
  respectLayoutMode={true}
  closeOnBackdrop={true}
  closeOnEscape={true}
  ariaLabel="Trail Settings"
  showHandle={true}
  class="trail-settings-sheet"
>
  <div class="sheet-content">
    <header class="sheet-header">
      <h3 class="sheet-title">{t("compose_ui_trail_settings")}</h3>
      <button
        class="sheet-close-btn"
        onclick={() => (isOpen = false)}
        aria-label={t("action_close")}
        type="button"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </header>
    <div class="sheet-body">
      <SimpleTrailControls
        propType={currentPropType}
        {leftPropType}
        {rightPropType}
      />

      <p class="hint-text">
        Trails visualize the path each prop takes through space with a glowing,
        fading effect.
      </p>
    </div>
  </div>
</Drawer>

<style>
  :global(.trail-settings-sheet) {
    --sheet-width: min(320px, 85vw);
    /* Right-placement: 16px on the left (visible) corners. Drawer rounds only
       the left corners for right placement, so this yields 16px 0 0 16px.
       bottom:0 + max-height:100dvh were Drawer right-placement defaults. */
    --sheet-radius-large: 16px;
  }

  .sheet-content {
    display: flex;
    flex-direction: column;
    padding: 20px;
    min-width: 280px;
    height: 100%;
    background: var(--theme-panel-elevated-bg);
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 0;
    border-bottom: 1px solid var(--theme-stroke);
    margin-bottom: 20px;
    flex-shrink: 0;
  }

  .sheet-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--theme-text);
    margin: 0;
  }

  .sheet-close-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    background: var(--theme-card-bg, var(--theme-card-bg));
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .sheet-close-btn:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, var(--theme-text));
  }

  .sheet-body {
    display: flex;
    flex-direction: column;
    gap: 20px;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }

  .hint-text {
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, var(--theme-text-dim));
    line-height: 1.5;
    margin: 0;
  }
</style>
