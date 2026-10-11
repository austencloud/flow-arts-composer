<script lang="ts">
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import ActionButton from "#lib/shared/components/selection/ActionButton.svelte";
  import { getFuseContext } from "../context/fuse-context";

  let {
    onOpenViewer,
    onShare,
    onSave,
    isSaving = false,
  }: {
    onOpenViewer: () => Promise<void>;
    onShare: () => Promise<void>;
    onSave: () => Promise<void>;
    isSaving?: boolean;
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
  <div class="action-row" role="group" aria-label="Fuse actions">
    <div class="shuffle-control blue-shuffle">
      <PanelButton
        variant="secondary"
        fullWidth={true}
        disabled={leftDisabled}
        ariaLabel="Generate another left-hand LOOP"
        onclick={() => void fuseState.shuffle("left")}
      >
        <i
          class="fas {fuseState.pendingSide === 'left'
            ? 'fa-spinner fa-spin'
            : 'fa-wand-magic-sparkles'}"
          aria-hidden="true"
        ></i>
        <span class="shuffle-verb">New</span> Left
      </PanelButton>
    </div>

    <div class="viewer-control">
      <ActionButton
        label="Open combined sequence viewer"
        busyLabel="Opening combined sequence"
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
        ariaLabel="Generate another right-hand LOOP"
        onclick={() => void fuseState.shuffle("right")}
      >
        <i
          class="fas {fuseState.pendingSide === 'right'
            ? 'fa-spinner fa-spin'
            : 'fa-wand-magic-sparkles'}"
          aria-hidden="true"
        ></i>
        <span class="shuffle-verb">New</span> Right
      </PanelButton>
    </div>
  </div>

  <div class="result-row" role="group" aria-label="Combined sequence actions">
    <PanelButton
      variant="secondary"
      fullWidth={true}
      disabled={!fuseState.canFuse}
      onclick={() => void onShare()}
    >
      Share
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
      {isSaving ? "Saving..." : "Save"}
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
          Retry
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
  .mobile-controls {
    display: grid;
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

  .result-row :global(.panel-btn) {
    min-width: 0;
    min-height: var(--min-touch-target, 48px);
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
    padding-inline: 8px;
    border-radius: var(--settings-radius-md, 14px);
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    white-space: nowrap;
  }

  .viewer-control :global(.action-button) {
    width: 58px;
    height: 58px;
    min-height: 58px;
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

  @container fuse (max-width: 360px) {
    .shuffle-verb {
      display: none;
    }

    .action-row {
      gap: 6px;
    }

    .shuffle-control :global(.panel-btn),
    .viewer-control :global(.action-button) {
      gap: 5px;
      padding-inline: 5px;
    }

    .viewer-control :global(.action-button) {
      width: 54px;
      height: 54px;
      min-height: 54px;
      padding: 0;
    }
  }
</style>
