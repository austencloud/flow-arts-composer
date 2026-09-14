<script lang="ts">
  import { Popover } from "bits-ui";
  import SequenceTransformActions from "$lib/shared/create/components/SequenceTransformActions.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";
  import type { FuseSourceAdjustment } from "../state/fuse-state.svelte";
  import { getFuseContext } from "../context/fuse-context";

  let {
    side,
    disabled = false,
    compactTrigger = false,
    onChooseFirstStep,
  }: {
    side: FuseSide;
    disabled?: boolean;
    /** Icon-only trigger used by the phone source cards. */
    compactTrigger?: boolean;
    onChooseFirstStep: (side: FuseSide) => void;
  } = $props();

  const { state: fuseState } = getFuseContext();
  let open = $state(false);
  const source = $derived(side === "left" ? fuseState.left : fuseState.right);
  const label = $derived(side === "left" ? "Left" : "Right");
  const isTransforming = $derived(fuseState.pendingSide === side);
  const canShiftStart = $derived((source.sequence?.steps.length ?? 0) > 1);

  function apply(adjustment: FuseSourceAdjustment): void {
    void fuseState.adjustSource(side, adjustment);
  }

  function chooseFirstStep(): void {
    open = false;
    onChooseFirstStep(side);
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class="adjust-trigger"
        class:compact-trigger={compactTrigger}
        {disabled}
        aria-label="Edit {label} path"
      >
        {#if compactTrigger}
          <i class="fas fa-sliders" aria-hidden="true"></i>
        {:else}
          Edit path
        {/if}
      </button>
    {/snippet}
  </Popover.Trigger>

  <Popover.Portal>
    <Popover.Content
      side="bottom"
      align="end"
      sideOffset={10}
      collisionPadding={16}
      class="fuse-source-action-popover {side}"
    >
      <header class="palette-header">
        <div>
          <span>{label} LOOP</span>
          <strong>Edit this path</strong>
        </div>
        <div class="palette-header-actions">
          <PanelButton
            variant="secondary"
            disabled={isTransforming}
            ariaLabel="Reset {label} path adjustments"
            onclick={() => apply({ kind: "reset" })}
          >
            <i class="fas fa-arrow-rotate-left" aria-hidden="true"></i>
            Reset
          </PanelButton>
          <button
            type="button"
            class="close-palette"
            onclick={() => (open = false)}
            aria-label="Close path actions"
          >
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      <div class="palette-actions">
        <SequenceTransformActions
          hasSequence={source.sequence !== null}
          hasSelection={false}
          {isTransforming}
          {canShiftStart}
          showEditInConstructor={false}
          isDesktopPanel={false}
          rotationDegrees={45}
          showRotationDegreesInLabel={true}
          shiftStartPlacement="transform"
          onMirror={() => apply({ kind: "mirror" })}
          onFlip={() => apply({ kind: "flip" })}
          onInvert={() => apply({ kind: "invert" })}
          onRotateCW={() => apply({ kind: "rotate", rotationSteps: 1 })}
          onRotateCCW={() => apply({ kind: "rotate", rotationSteps: -1 })}
          onShiftStart={chooseFirstStep}
        />
      </div>

      <p class="palette-note">
        {compactTrigger
          ? "Choose Start lets you pick the pose the LOOP begins from."
          : "Choose Start lets you tap the pose on the source card the LOOP should begin from."}
      </p>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  .adjust-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 10px 16px;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text, white);
    background: var(--theme-card-bg);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--duration-normal) ease,
      border-color var(--duration-normal) ease;
  }

  .adjust-trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .adjust-trigger.compact-trigger {
    width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    padding: 0;
    border-color: color-mix(
      in srgb,
      var(--source-color) 38%,
      var(--theme-stroke)
    );
    border-radius: 10px;
    background: color-mix(
      in srgb,
      var(--source-color) 12%,
      var(--theme-card-bg)
    );
    font-size: var(--font-size-min, 14px);
  }

  .adjust-trigger:focus-visible,
  .close-palette:focus-visible {
    outline: 2px solid var(--source-color, var(--theme-accent));
    outline-offset: 2px;
  }

  :global(.fuse-source-action-popover) {
    --source-color: var(--prop-blue, #2196f3);
    z-index: var(--z-dropdown, 1000);
    display: grid;
    grid-template-rows: auto 1fr auto;
    width: min(32rem, calc(100vw - 32px));
    height: auto;
    max-height: calc(100vh - 32px);
    padding: 14px;
    overflow: hidden;
    border: 1px solid
      color-mix(in srgb, var(--source-color) 44%, var(--theme-stroke));
    border-radius: 18px;
    /* The source card stays visually busy while this palette is open. Layer
       the themed panel color over an opaque theme-derived floor so arrows and
       step numbers cannot ghost through the controls. */
    background:
      linear-gradient(var(--theme-panel-bg), var(--theme-panel-bg)),
      color-mix(in srgb, var(--theme-text) 8%, black);
    box-shadow:
      0 24px 70px var(--theme-shadow),
      0 0 34px color-mix(in srgb, var(--source-color) 12%, transparent);
  }

  :global(.fuse-source-action-popover.red) {
    --source-color: var(--prop-red, #f44336);
  }

  :global(.fuse-source-action-popover[data-state="open"]) {
    animation: palette-in var(--duration-fast) var(--ease-out);
  }

  .palette-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 0 10px 4px;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .palette-header > div:first-child {
    display: grid;
    gap: 1px;
  }

  .palette-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .palette-header-actions :global(.panel-btn) {
    min-height: var(--min-touch-target, 44px);
    padding-inline: 12px;
  }

  .palette-header span,
  .palette-note {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .palette-header strong {
    color: var(--theme-text, white);
    font-size: 1rem;
  }

  .close-palette {
    display: grid;
    place-items: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    color: var(--theme-text, white);
    background: var(--theme-card-bg);
    cursor: pointer;
  }

  .palette-actions {
    height: clamp(12rem, 24cqh, 14rem);
    min-height: 0;
    padding-block: 10px;
    container: fuse-action-palette / size;
  }

  .palette-note {
    margin: 0;
    padding: 9px 10px 2px;
    border-top: 1px solid var(--theme-stroke);
    line-height: 1.35;
  }

  @keyframes palette-in {
    from {
      opacity: 0;
      transform: translateY(-6px) scale(0.985);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .adjust-trigger:hover:not(:disabled),
    .close-palette:hover {
      border-color: var(--theme-stroke-strong);
      background: var(--theme-card-hover-bg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .adjust-trigger {
      transition: none;
    }

    :global(.fuse-source-action-popover[data-state="open"]) {
      animation: none;
    }
  }
</style>
