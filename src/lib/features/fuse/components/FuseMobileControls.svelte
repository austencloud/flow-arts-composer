<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import ActionButton from "#lib/shared/components/selection/ActionButton.svelte";
  import { getFuseContext } from "../context/fuse-context";

  let {
    onOpenViewer,
    onShare,
    onSave,
    isSaving = false,
    onToggleCustomize,
    customizeOpen = false,
  }: {
    onOpenViewer: () => Promise<void>;
    onShare: () => Promise<void>;
    onSave: () => Promise<void>;
    isSaving?: boolean;
    /** Opens Customize in place of the controls, or puts it away. */
    onToggleCustomize?: () => void;
    customizeOpen?: boolean;
  } = $props();
  const { state: fuseState } = getFuseContext();

  const sourceControlsDisabled = $derived(
    fuseState.isLoadingLength ||
      fuseState.pendingSide !== null ||
      fuseState.isFusing
  );
  const leftDisabled = $derived(
    sourceControlsDisabled ||
      !fuseState.left.sequence ||
      (fuseState.mode === "symmetry" && fuseState.driverSide !== "left")
  );
  const rightDisabled = $derived(
    sourceControlsDisabled ||
      !fuseState.right.sequence ||
      (fuseState.mode === "symmetry" && fuseState.driverSide !== "right")
  );
</script>

<div
  class="mobile-controls"
  aria-busy={fuseState.isLoadingLength ||
    fuseState.pendingSide !== null ||
    fuseState.isFusing}
>
  <div class="action-row" role="group" aria-label={t("fuse_mobile_actions_aria")}>
    <div class="shuffle-control blue-shuffle">
      <PanelButton
        variant="secondary"
        fullWidth={true}
        disabled={leftDisabled}
        ariaLabel={t("fuse_mobile_new_left_aria")}
        onclick={() => void fuseState.shuffle("left")}
      >
        <i
          class="fas {fuseState.pendingSide === 'left'
            ? 'fa-spinner fa-spin'
            : 'fa-wand-magic-sparkles'}"
          aria-hidden="true"
        ></i>
        <span class="shuffle-full">{t("fuse_mobile_new_left")}</span><span
          class="shuffle-short">{t("fuse_side_left")}</span
        >
      </PanelButton>
    </div>

    <div class="viewer-control">
      <ActionButton
        label={t("fuse_mobile_open_viewer")}
        busyLabel={t("fuse_mobile_opening")}
        icon={fuseState.isFusing ? "fa-spinner fa-spin" : "fa-expand"}
        color="fuse"
        ariaDisabled={!fuseState.canFuse}
        ariaDescribedBy="fuse-action-status"
        busy={fuseState.isFusing}
        onclick={() => void onOpenViewer()}
      />
    </div>

    <div class="shuffle-control red-shuffle">
      <PanelButton
        variant="secondary"
        fullWidth={true}
        disabled={rightDisabled}
        ariaLabel={t("fuse_mobile_new_right_aria")}
        onclick={() => void fuseState.shuffle("right")}
      >
        <i
          class="fas {fuseState.pendingSide === 'right'
            ? 'fa-spinner fa-spin'
            : 'fa-wand-magic-sparkles'}"
          aria-hidden="true"
        ></i>
        <span class="shuffle-full">{t("fuse_mobile_new_right")}</span><span
          class="shuffle-short">{t("fuse_side_right")}</span
        >
      </PanelButton>
    </div>
  </div>

  <div
    class="result-row"
    class:with-customize={!!onToggleCustomize}
    role="group"
    aria-label={t("fuse_result_actions_aria")}
  >
    {#if onToggleCustomize}
      <PanelButton
        variant="secondary"
        fullWidth={true}
        ariaLabel={t("shape_engine_customize_aria")}
        ariaPressed={customizeOpen}
        onclick={onToggleCustomize}
      >
        <i class="fas fa-sliders" aria-hidden="true"></i>
        {t("shape_engine_customize")}
      </PanelButton>
    {/if}
    <PanelButton
      variant="secondary"
      fullWidth={true}
      disabled={!fuseState.canFuse}
      onclick={() => void onShare()}
    >
      {t("fuse_action_share")}
    </PanelButton>
    <PanelButton
      variant="secondary"
      fullWidth={true}
      disabled={!fuseState.canFuse || isSaving}
      ariaBusy={isSaving}
      saveShortcut={true}
      onclick={() => void onSave()}
    >
      <i
        class="fas {isSaving ? 'fa-spinner fa-spin' : 'fa-bookmark'}"
        aria-hidden="true"
      ></i>
      {isSaving ? t("fuse_action_saving") : t("fuse_action_save")}
    </PanelButton>
  </div>

  {#if fuseState.error}
    <div class="compact-error" role="alert">
      <p id="fuse-action-status">{fuseState.statusMessage}</p>
      {#if fuseState.canRetry}
        <PanelButton
          variant="secondary"
          disabled={fuseState.isLoadingLength || fuseState.pendingSide !== null}
          onclick={() => void fuseState.retry()}
        >
          <i class="fas fa-arrow-rotate-right" aria-hidden="true"></i>
          {t("fuse_action_retry")}
        </PanelButton>
      {/if}
    </div>
  {:else}
    <p
      id="fuse-action-status"
      class="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {fuseState.statusMessage}
    </p>
  {/if}
</div>

<style>
  /* Phone controls are 36px (layout law, Tap size); the round viewer button is
     the main action and stays at 44. Two rows: 44 + 8 + 36 = 88px. */
  .mobile-controls {
    --min-touch-target: var(--alt-touch-target, 36px);
    --viewer-size: 44px;
    container: fuse-controls / inline-size;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    flex: 0 0 auto;
    gap: var(--settings-spacing-sm, 8px);
  }

  .action-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: var(--settings-spacing-sm, 8px);
  }

  .result-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--settings-spacing-sm, 8px);
  }

  /* Equal while every name fits; a longer one takes the width it needs from
     the other two. */
  .result-row.with-customize {
    grid-template-columns: repeat(3, minmax(max-content, 1fr));
    gap: 6px;
  }

  .result-row.with-customize :global(.panel-btn) {
    gap: 5px;
    padding-inline: 5px;
    white-space: nowrap;
  }

  .result-row :global(.panel-btn[aria-pressed="true"]) {
    border-color: color-mix(in srgb, var(--theme-accent) 55%, transparent);
    background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
  }

  .result-row :global(.panel-btn) {
    min-width: 0;
    min-height: var(--min-touch-target);
    padding-block: 0;
  }

  .result-row :global(.panel-btn) {
    border-radius: var(--settings-radius-md, 14px);
  }

  .shuffle-control,
  .viewer-control {
    min-width: 0;
  }

  .viewer-control {
    display: grid;
    place-items: center;
  }

  .shuffle-control :global(.panel-btn) {
    min-height: var(--min-touch-target);
    padding-block: 0;
    padding-inline: 8px;
    border-radius: var(--settings-radius-md, 14px);
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    white-space: nowrap;
  }

  .viewer-control :global(.action-button) {
    width: var(--viewer-size);
    min-width: var(--viewer-size);
    height: var(--viewer-size);
    min-height: var(--viewer-size);
    padding: 0;
    border-radius: 50%;
    font-size: 18px;
    box-shadow:
      0 6px 18px
        color-mix(in srgb, var(--semantic-warning, #f97316) 36%, transparent),
      inset 0 1px 0 var(--theme-stroke-strong);
  }

  .viewer-control :global(.action-button i) {
    font-size: 18px;
  }

  .viewer-control :global(.action-button span) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  .blue-shuffle :global(.panel-btn) {
    border-color: color-mix(
      in srgb,
      var(--prop-blue, #2196f3) 52%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--prop-blue, #2196f3) 16%,
      var(--theme-card-bg, #161821)
    );
  }

  .red-shuffle :global(.panel-btn) {
    border-color: color-mix(in srgb, var(--prop-red, #f44336) 52%, transparent);
    background: color-mix(
      in srgb,
      var(--prop-red, #f44336) 16%,
      var(--theme-card-bg, #161821)
    );
  }

  .blue-shuffle :global(.panel-btn:focus-visible) {
    outline: 2px solid var(--prop-blue, #2196f3);
    outline-offset: 2px;
  }

  .red-shuffle :global(.panel-btn:focus-visible) {
    outline: 2px solid var(--prop-red, #f44336);
    outline-offset: 2px;
  }

  .compact-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--settings-spacing-sm, 8px);
    min-height: var(--min-touch-target, 48px);
    padding: 6px 6px 6px 12px;
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #fca5a5) 42%, transparent);
    border-radius: var(--settings-radius-md, 12px);
    background: color-mix(
      in srgb,
      var(--semantic-error, #fca5a5) 10%,
      var(--theme-card-bg, #161821)
    );
  }

  .compact-error p {
    margin: 0;
    color: var(--semantic-error, #fca5a5);
    font-size: var(--font-size-min, 14px);
    line-height: 1.3;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  @media (hover: hover) and (pointer: fine) {
    .blue-shuffle :global(.panel-btn:hover:not(:disabled)) {
      background: color-mix(
        in srgb,
        var(--prop-blue, #2196f3) 24%,
        var(--theme-card-bg, #161821)
      );
    }

    .red-shuffle :global(.panel-btn:hover:not(:disabled)) {
      background: color-mix(
        in srgb,
        var(--prop-red, #f44336) 24%,
        var(--theme-card-bg, #161821)
      );
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shuffle-control :global(.fa-spin) {
      animation: none;
    }
  }

  @media (forced-colors: active) {
    .shuffle-control :global(.panel-btn),
    .compact-error {
      border: 1px solid ButtonText;
    }
  }

  /* The controls' own width decides, not the tab's: in a short landscape slot
     they sit in a side column that can be narrower than a phone, and at 200%
     zoom "New Right" overflowed its button there. */
  .shuffle-short {
    display: none;
  }

  @container fuse-controls (max-width: 300px) {
    .shuffle-full {
      display: none;
    }

    .shuffle-short {
      display: inline;
    }
  }

  @container fuse (max-width: 360px) {
    .shuffle-full {
      display: none;
    }

    .shuffle-short {
      display: inline;
    }

    .action-row {
      gap: 6px;
    }

    .shuffle-control :global(.panel-btn) {
      gap: 5px;
      padding-inline: 5px;
    }
  }
</style>
