<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { DropdownMenu } from "bits-ui";
  import type { HTMLButtonAttributes } from "svelte/elements";

  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import {
    KINETIC_SHAPE_ENGINE_NAME,
    ORIGINAL_SHAPE_MATRIX_URL,
  } from "../shape-engine-identity";

  const appState = getShapeMatrixAppContext();
  let open = $state(false);

  function asButtonAttributes(props: unknown): HTMLButtonAttributes {
    return props as HTMLButtonAttributes;
  }

  function openAbout(): void {
    appState.openAbout();
  }

  function openOriginal(): void {
    const original = window.open(
      ORIGINAL_SHAPE_MATRIX_URL,
      "_blank",
      "noopener,noreferrer"
    );
    if (original) original.opener = null;
  }
</script>

<DropdownMenu.Root {open} onOpenChange={(nextOpen) => (open = nextOpen)}>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      {@const triggerProps = asButtonAttributes(props)}
      <button
        {...triggerProps}
        type="button"
        class="overflow-trigger"
        aria-label={t("shape_engine_more_options")}
      >
        <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
      </button>
    {/snippet}
  </DropdownMenu.Trigger>

  <DropdownMenu.Portal>
    <DropdownMenu.Content
      side="bottom"
      align="end"
      sideOffset={8}
      collisionPadding={12}
      class="shape-matrix-overflow"
      aria-label={t("shape_engine_options")}
    >
      <!-- No prop entry here: the Props control under the animation canvas
           owns that choice, where the prop is visible against the shape it
           traces. -->
      <DropdownMenu.Item
        class="shape-matrix-overflow-item"
        textValue="View Lorq Nichols' original 144 Shape Matrix"
        onSelect={openOriginal}
      >
        <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
        <span>{t("shape_engine_original_matrix")}</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="shape-matrix-overflow-item"
        textValue={`About ${KINETIC_SHAPE_ENGINE_NAME}`}
        onSelect={openAbout}
      >
        <i class="fas fa-circle-info" aria-hidden="true"></i>
        <span>{t("shape_engine_about_name")}</span>
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  .overflow-trigger {
    display: grid;
    place-items: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.12));
    border-radius: 10px;
    background: var(--theme-card-bg, rgb(255 255 255 / 0.05));
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
    cursor: pointer;
    font: inherit;
    transition:
      color var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      background var(--duration-fast, 150ms) ease;
  }

  .overflow-trigger:hover {
    border-color: var(--theme-stroke-strong, rgb(255 255 255 / 0.2));
    background: var(--theme-card-hover-bg, rgb(255 255 255 / 0.08));
    color: var(--theme-text, #fff);
  }

  .overflow-trigger:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }

  :global(.shape-matrix-overflow) {
    z-index: var(--z-dropdown, 1000);
    width: min(17rem, calc(100vw - 24px));
    padding: 4px;
    border: 1px solid var(--theme-stroke-strong, rgb(255 255 255 / 0.18));
    border-radius: 12px;
    background-color: var(--theme-bg-deep, #0a0f17);
    background-image: linear-gradient(
      var(--theme-panel-bg, #101721),
      var(--theme-panel-bg, #101721)
    );
    outline: none;
    transform-origin: var(--bits-dropdown-menu-content-transform-origin);
  }

  :global(.shape-matrix-overflow[data-state="open"]) {
    animation: menu-in var(--duration-fast) var(--ease-out) both;
  }

  :global(.shape-matrix-overflow-item) {
    box-sizing: border-box;
    display: flex;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    gap: 0.7rem;
    padding: 0.45rem 0.7rem;
    border-radius: 8px;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
    cursor: pointer;
    font-size: var(--font-size-min, 14px);
    outline: none;
    user-select: none;
  }

  :global(.shape-matrix-overflow-item[data-highlighted]) {
    background: var(--theme-card-hover-bg, rgb(255 255 255 / 0.08));
    color: var(--theme-text, #fff);
  }

  :global(.shape-matrix-overflow-item > i) {
    width: 1.4rem;
    flex: 0 0 1.4rem;
    color: var(--theme-accent, #f59e0b);
    text-align: center;
  }

  @keyframes menu-in {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .overflow-trigger {
      transition: none;
    }

    :global(.shape-matrix-overflow[data-state="open"]) {
      animation: none;
    }
  }
</style>
