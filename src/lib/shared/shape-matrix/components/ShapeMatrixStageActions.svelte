<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { getShapeMatrixAnimationContext } from "../app/context/shape-matrix-animation-context";
  import { getShapeMatrixAppContext } from "../app/context/shape-matrix-app-context";
  import { surfaceHasPair } from "../app/state/shape-matrix-customize";

  interface Props {
    placement?: "overlay" | "panel";
  }

  const { placement = "overlay" }: Props = $props();

  const appState = getShapeMatrixAppContext();
  const animationState = getShapeMatrixAnimationContext();

  /* A surface with no pair yet shows its empty stage: a workspace opened over
     it would close at once, so the gear waits for a pair rather than
     answering a press with nothing. */
  const hasPair = $derived(surfaceHasPair(appState));

  /* A prop sheet left open on a compact host arrives on the wide host as the
     workspace's Props page, so it counts as open here too. */
  const open = $derived(
    animationState.activeSection !== null || appState.propPickerOpen
  );

  /* The gear is the mode's switch in both directions. The workspace also has
     its own labelled way back, so the grid is never more than one press away
     from either side. */
  function toggle(): void {
    if (open) {
      appState.closePropPicker();
      animationState.showRelationships();
      return;
    }
    animationState.openCustomize();
  }
</script>

{#if placement === "panel"}
  <PanelButton
    ariaLabel={open
      ? t("shape_engine_customize_workspace_close")
      : t("shape_engine_customize_aria")}
    ariaPressed={open}
    disabled={!hasPair}
    onclick={toggle}
  >
    <i class="fas fa-sliders" aria-hidden="true"></i>
    {t("shape_engine_customize")}
  </PanelButton>
{:else}
  <div class="stage-actions">
    <button
      type="button"
      class="stage-action"
      class:open
      aria-pressed={open}
      aria-label={open
        ? t("shape_engine_customize_workspace_close")
        : t("shape_engine_customize_aria")}
      title={open
        ? t("shape_engine_close_customize")
        : t("shape_engine_customize")}
      disabled={!hasPair}
      onclick={toggle}
    >
      <i class="fas fa-sliders" aria-hidden="true"></i>
    </button>
  </div>
{/if}

<style>
  /* Over the stage, out of the mandala's way. The stage is a square in a
     taller box, so the corner is empty space in every layout the drill has. */
  .stage-actions {
    position: absolute;
    z-index: 4;
    top: 0.5rem;
    right: 0.5rem;
    display: flex;
    gap: 0.375rem;
  }

  .stage-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* .fas is a fixed 1.25em box; the UA's own button padding would push the
       glyph off centre in a square this size. */
    padding: 0;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.12));
    border-radius: 12px;
    background: var(--theme-panel-bg, rgb(16 23 33 / 0.72));
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
    font-size: 1rem;
    cursor: pointer;
    /* The mandala reads through the corner while the gear is idle, and the
       gear reads over the mandala the moment it is wanted. */
    opacity: 0.55;
    transition:
      opacity var(--duration-fast, 0.15s) ease,
      background var(--duration-fast, 0.15s) ease,
      color var(--duration-fast, 0.15s) ease,
      border-color var(--duration-fast, 0.15s) ease;
  }

  .stage-action:hover:not(:disabled),
  .stage-action:focus-visible {
    opacity: 1;
    color: var(--theme-text, #fff);
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 45%,
      transparent
    );
  }

  .stage-action.open {
    opacity: 1;
    color: var(--theme-text, #fff);
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 22%,
      var(--theme-panel-bg, rgb(16 23 33 / 0.72))
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 55%,
      transparent
    );
  }

  .stage-action:disabled {
    opacity: 0.25;
    cursor: default;
  }

  .stage-action:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }

  /* A coarse pointer has no hover to reveal it with, so it stays legible. */
  @media (hover: none) {
    .stage-action {
      opacity: 0.9;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .stage-action {
      transition: none;
    }
  }
</style>
