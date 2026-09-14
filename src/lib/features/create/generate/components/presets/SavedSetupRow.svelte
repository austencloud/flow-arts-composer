<script lang="ts">
  import OverflowMenu from "$lib/shared/ui/components/OverflowMenu.svelte";
  import type { SavedGeneratorSetup } from "../../domain/models/favorite-config";

  let {
    setup,
    summary,
    isActive,
    isShared,
    isBusy,
    disableMutations,
    onApply,
    onUpdate,
    onRenameSubmit,
    onShareToggle,
    onDelete,
  }: {
    setup: SavedGeneratorSetup;
    summary: string;
    isActive: boolean;
    isShared: boolean;
    isBusy: boolean;
    disableMutations: boolean;
    onApply: () => void;
    onUpdate: () => void;
    onRenameSubmit: (name: string) => Promise<boolean>;
    onShareToggle: () => void;
    onDelete: () => void;
  } = $props();

  let renaming = $state(false);
  let draft = $state("");
  let renameInput = $state<HTMLInputElement | null>(null);

  const statusLabel = $derived(isActive ? "Active" : "");

  const menuItems = $derived([
    // Overwriting a setup that already equals the live controls is a no-op,
    // so the active row keeps Update disabled.
    {
      label: "Update with current settings",
      icon: "fa-solid fa-arrows-rotate",
      action: onUpdate,
      disabled: isActive || disableMutations || isBusy,
    },
    {
      label: "Rename",
      icon: "fa-solid fa-pen",
      action: startRename,
      disabled: disableMutations || isBusy,
    },
    {
      label: isShared ? "Unshare" : "Share as my Favorite",
      icon: "fa-solid fa-heart",
      action: onShareToggle,
      disabled: disableMutations || isBusy,
    },
    {
      label: "Delete",
      icon: "fa-solid fa-trash",
      action: onDelete,
      variant: "danger" as const,
      disabled: disableMutations || isBusy,
    },
  ]);

  function startRename(): void {
    draft = setup.name;
    renaming = true;
  }

  async function handleRenameKeydown(
    event: KeyboardEvent
  ): Promise<void> {
    if (event.key === "Escape") {
      event.preventDefault();
      renaming = false;
      return;
    }

    if (event.key !== "Enter" || !draft.trim()) return;
    event.preventDefault();
    const renamed = await onRenameSubmit(draft);
    if (renamed) renaming = false;
  }

  $effect(() => {
    if (!renaming || !renameInput) return;
    renameInput.focus();
    renameInput.select();
  });
</script>

<div class="setup-row">
  {#if renaming}
    <input
      class="rename-input"
      bind:this={renameInput}
      bind:value={draft}
      maxlength={60}
      aria-label={"Rename " + setup.name}
      onkeydown={handleRenameKeydown}
    />
  {:else}
    <button
      type="button"
      class="favorite-item"
      class:active={isActive}
      aria-current={isActive ? "true" : undefined}
      aria-busy={isBusy || undefined}
      disabled={isBusy}
      onclick={onApply}
    >
      <span class="favorite-info">
        <span class="name-line">
          <span class="favorite-name">{setup.name}</span>
          <span
            class="shared-slot"
            class:visible={isShared}
            aria-hidden={!isShared}
          >
            Shared
          </span>
        </span>
        <span class="favorite-summary">{summary}</span>
      </span>
      <span class="status-slot">{statusLabel}</span>
    </button>
  {/if}

  <OverflowMenu
    items={menuItems}
    disabled={isBusy}
    placement="bottom"
    ariaLabel={"Actions for " + setup.name}
  />
</div>

<style>
  .setup-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
  }

  .favorite-item,
  .rename-input {
    min-height: var(--min-touch-target, 44px);
    width: 100%;
    border-radius: var(--radius-md, 8px);
    font: inherit;
  }

  .favorite-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0.875rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1.5px solid
      var(--theme-stroke, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, #fff);
    cursor: pointer;
    text-align: left;
    transition:
      border-color var(--duration-fast, 150ms) ease,
      background var(--duration-fast, 150ms) ease;
  }

  .favorite-item:not(:disabled):hover {
    border-color: var(
      --theme-stroke-strong,
      rgba(255, 255, 255, 0.25)
    );
  }

  .favorite-item.active {
    border-color: var(--theme-accent, #3b82f6);
    background: color-mix(
      in srgb,
      var(--theme-accent, #3b82f6) 15%,
      transparent
    );
  }

  .favorite-item:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .favorite-item:focus-visible,
  .rename-input:focus-visible {
    outline: 2px solid var(--theme-accent, #3b82f6);
    outline-offset: 2px;
  }

  .favorite-info {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 0.125rem;
  }

  .name-line {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.5rem;
  }

  .favorite-name {
    min-width: 0;
    overflow: hidden;
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .shared-slot {
    flex-shrink: 0;
    min-width: 3.5rem;
    padding: 0.1rem 0.4rem;
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-error, #e11d48) 55%,
        transparent
      );
    border-radius: 999px;
    color: color-mix(
      in srgb,
      var(--semantic-error, #e11d48) 72%,
      white
    );
    font-size: 0.65rem;
    font-weight: 700;
    line-height: 1.2;
    text-align: center;
    text-transform: uppercase;
    visibility: hidden;
  }

  .shared-slot.visible {
    visibility: visible;
  }

  .favorite-summary {
    overflow: hidden;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.66));
    font-size: var(--font-size-compact, 12px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-slot {
    flex-shrink: 0;
    min-width: 4.5rem;
    color: var(--theme-accent, #3b82f6);
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    text-align: right;
  }

  .rename-input {
    box-sizing: border-box;
    padding: 0.75rem 0.875rem;
    border: 1.5px solid var(--theme-accent, #3b82f6);
    background: var(--theme-input-bg, rgba(0, 0, 0, 0.2));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
  }

  @media (prefers-reduced-motion: reduce) {
    .favorite-item {
      transition: none;
    }
  }
</style>
