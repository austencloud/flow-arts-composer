<!--
CollectionPickerContent.svelte

The collections picker body, with no sheet chrome so it can live inside
the Drawer-based CollectionPickerSheet (browse card menu) OR inline inside a
save panel. Collections render as selectable tiles in a responsive grid that
fills its container — a few tiles read as an intentional row on a wide desktop
panel, and stack to a list on a narrow sheet. Tiles are aria-pressed buttons,
never checkboxes. An "＋ New collection" tile creates and selects in one step.

This is a membership editor, not a one-way add: a ticked tile means the
sequence is in that collection, and unticking takes it out. Moving a sequence
between collections is that pair of taps in one visit — there's no separate
"move" verb to learn.

Two modes:
  - live   → operates on a real, saved sequenceId; toggles write to Firestore
             immediately through collections-state.
  - select → operates on a bindable selectedIds list (the sequence isn't saved
             yet, e.g. the save panel); the parent applies membership on save.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { collectionsState } from "#lib/features/library/state/collections-state.svelte.js";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import type { LibraryCollection } from "#lib/shared/library/domain/models/collection.js";

  let {
    mode = "live",
    sequenceId,
    sequenceIds = [],
    selectedIds = $bindable<string[]>([]),
    onChange,
    sequenceLabel,
    currentCollectionId = null,
    onBulkComplete,
  }: {
    mode?: "live" | "select" | "bulk";
    /** Required in live mode: the saved sequence to file. */
    sequenceId?: string;
    /** Bulk mode: the saved sequences to add together. */
    sequenceIds?: string[];
    /** Select mode: the collection ids chosen so far (parent-owned). */
    selectedIds?: string[];
    /** Select mode: fired with the new id list on every change. */
    onChange?: (ids: string[]) => void;
    /** Optional name of the sequence being filed, shown in the header. */
    sequenceLabel?: string;
    /**
     * Set when the picker was opened from inside a collection. That tile is
     * marked "Currently here", so unticking it reads as taking the sequence
     * out of the folder you're looking at rather than an unexplained vanish.
     */
    currentCollectionId?: string | null;
    /** Bulk mode: called after every selected sequence has been filed. */
    onBulkComplete?: () => void;
  } = $props();

  // A repeating word always displays in its smallest form (FΨFΨFΨFΨ → FΨ).
  const displayLabel = $derived(
    sequenceLabel ? simplifyRepeatedWord(sequenceLabel) : undefined
  );

  $effect(() => {
    collectionsState.ensureStarted();
  });

  // Smart collections derive members from a rule — you can't hand-file a
  // sequence into one, so they're never valid add targets here.
  const collections = $derived(
    collectionsState.collections.filter((c) => c.kind !== "smart")
  );
  const loading = $derived(collectionsState.loading);
  const bulkSequenceIds = $derived([...new Set(sequenceIds)]);
  const bulkCount = $derived(bulkSequenceIds.length);

  let showInput = $state(false);
  let newName = $state("");
  let creating = $state(false);
  let addingCollectionId = $state<string | null>(null);

  function isMember(c: LibraryCollection): boolean {
    return mode === "live"
      ? !!sequenceId && collectionsState.isIn(sequenceId, c.id)
      : selectedIds.includes(c.id);
  }

  function handleToggle(c: LibraryCollection): void {
    getHapticFeedback()?.trigger("selection");
    if (mode === "live") {
      if (sequenceId) void collectionsState.toggle(sequenceId, c.id);
      return;
    }
    const next = isMember(c)
      ? selectedIds.filter((id) => id !== c.id)
      : [...selectedIds, c.id];
    selectedIds = next;
    onChange?.(next);
  }

  function bulkMemberCount(c: LibraryCollection): number {
    if (mode !== "bulk") return 0;
    const members = new Set(c.sequenceIds);
    return bulkSequenceIds.filter((id) => members.has(id)).length;
  }

  async function handleBulkAdd(c: LibraryCollection): Promise<void> {
    if (addingCollectionId || bulkCount === 0) return;
    addingCollectionId = c.id;
    try {
      const added = await collectionsState.addMany(bulkSequenceIds, c.id);
      if (added) onBulkComplete?.();
    } finally {
      addingCollectionId = null;
    }
  }

  function handleCollectionPress(c: LibraryCollection): void {
    if (mode === "bulk") {
      void handleBulkAdd(c);
      return;
    }
    handleToggle(c);
  }

  async function handleCreate(): Promise<void> {
    const name = newName.trim();
    if (!name || creating) return;
    creating = true;
    try {
      let created = false;
      if (mode === "live") {
        if (sequenceId) {
          created = !!(await collectionsState.createAndAdd(name, sequenceId));
        }
      } else if (mode === "bulk") {
        created = !!(await collectionsState.createAndAddMany(
          name,
          bulkSequenceIds
        ));
      } else {
        const collection = await collectionsState.create(name);
        if (collection) {
          const next = [...selectedIds, collection.id];
          selectedIds = next;
          onChange?.(next);
          created = true;
        }
      }
      if (created) {
        newName = "";
        showInput = false;
        if (mode === "bulk") onBulkComplete?.();
      }
    } finally {
      creating = false;
    }
  }

  function handleInputKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleCreate();
    } else if (e.key === "Escape") {
      e.preventDefault();
      showInput = false;
      newName = "";
    }
  }

  function countLabel(n: number): string {
    return `${n} ${n === 1 ? "sequence" : "sequences"}`;
  }
</script>

<div class="collection-picker">
  {#if mode === "bulk"}
    <p class="picker-subtitle">
      Choose a collection for <strong
        >{bulkCount} selected {bulkCount === 1
          ? "sequence"
          : "sequences"}</strong
      >.
    </p>
  {:else if displayLabel}
    <p class="picker-subtitle">
      Tap to file <strong>{displayLabel}</strong>, tap again to take it out.
    </p>
  {/if}

  {#if loading && collections.length === 0}
    <div class="tile-grid" aria-hidden="true">
      {#each Array(4) as _}
        <span class="tile-skeleton"></span>
      {/each}
    </div>
  {:else}
    <div
      class="tile-grid"
      role="group"
      aria-label={t("tab_library_collections")}
    >
      {#each collections as c (c.id)}
        {@const selected = isMember(c)}
        {@const bulkMembers = bulkMemberCount(c)}
        {@const allBulkMembers =
          mode === "bulk" && bulkCount > 0 && bulkMembers === bulkCount}
        {@const mixedBulkMembers =
          mode === "bulk" && bulkMembers > 0 && !allBulkMembers}
        {@const busy = addingCollectionId === c.id}
        <button
          type="button"
          class="collection-tile"
          class:selected={selected || allBulkMembers}
          class:mixed={mixedBulkMembers}
          class:busy
          style="--tile-color: {c.color ?? 'var(--theme-accent)'};"
          aria-pressed={selected || allBulkMembers}
          aria-label={mode === "bulk"
            ? `${c.name}, ${
                allBulkMembers
                  ? `all ${bulkCount} already here`
                  : mixedBulkMembers
                    ? `${bulkMembers} of ${bulkCount} already here`
                    : countLabel(c.sequenceCount)
              }`
            : undefined}
          aria-busy={busy || undefined}
          disabled={addingCollectionId !== null || allBulkMembers}
          title={allBulkMembers ? "Already in this collection" : undefined}
          onclick={() => handleCollectionPress(c)}
        >
          <span class="tile-icon">
            <!-- Icons are stored bare ("fa-heart"); FontAwesome only paints them
						     with a style class alongside, so prepend "fas". -->
            <i class={`fas ${c.icon ?? "fa-folder"}`} aria-hidden="true"></i>
          </span>
          <span class="tile-text">
            <span class="tile-name">{c.name}</span>
            {#if mode === "bulk" && allBulkMembers}
              <span class="tile-here">All {bulkCount} already here</span>
            {:else if mode === "bulk" && mixedBulkMembers}
              <span class="tile-mixed"
                >{bulkMembers} of {bulkCount} already here</span
              >
            {:else if c.id === currentCollectionId}
              <span class="tile-here">{t("library_ui_currently_here")}</span>
            {:else}
              <span class="tile-count">{countLabel(c.sequenceCount)}</span>
            {/if}
          </span>
          <span class="tile-check" aria-hidden="true">
            {#if busy}
              <i class="fas fa-circle-notch fa-spin"></i>
            {:else if mixedBulkMembers}
              <i class="fas fa-minus"></i>
            {:else}
              <i class="fas fa-check"></i>
            {/if}
          </span>
        </button>
      {/each}

      {#if showInput}
        <div class="new-tile-input">
          <!-- svelte-ignore a11y_autofocus -->
          <input
            type="text"
            class="name-field"
            placeholder={t("library_ui_collection_name")}
            aria-label={t("library_ui_new_collection_name")}
            bind:value={newName}
            onkeydown={handleInputKeydown}
            maxlength="60"
            autofocus
          />
          <button
            type="button"
            class="confirm-create"
            onclick={handleCreate}
            disabled={!newName.trim() ||
              creating ||
              addingCollectionId !== null}
            aria-label={t("library_ui_create_collection")}
          >
            <i class="fas fa-check" aria-hidden="true"></i>
          </button>
        </div>
      {:else}
        <button
          type="button"
          class="collection-tile add-tile"
          disabled={addingCollectionId !== null}
          onclick={() => (showInput = true)}
        >
          <span class="tile-icon">
            <i class="fas fa-plus" aria-hidden="true"></i>
          </span>
          <span class="tile-text">
            <span class="tile-name">{t("library_ui_new_collection")}</span>
          </span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .collection-picker {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .picker-subtitle {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .picker-subtitle strong {
    color: var(--theme-text, white);
    font-weight: 600;
  }

  /* Auto-fill grid: fills a wide panel (several across) and collapses to a
	   single stacked column on a narrow sheet. */
  .tile-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
  }

  .collection-tile {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 60px;
    padding: 12px 14px;
    text-align: left;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    color: var(--theme-text, white);
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .collection-tile:hover {
    border-color: color-mix(in srgb, var(--tile-color) 45%, transparent);
    background: color-mix(in srgb, var(--tile-color) 8%, var(--theme-card-bg));
  }

  .collection-tile:active {
    transform: scale(0.98);
  }

  .collection-tile:focus-visible {
    outline: 2px solid var(--tile-color);
    outline-offset: 2px;
  }

  .collection-tile.selected {
    border-color: color-mix(in srgb, var(--tile-color) 65%, transparent);
    background: color-mix(in srgb, var(--tile-color) 16%, transparent);
  }

  .collection-tile.mixed {
    border-color: color-mix(in srgb, var(--tile-color) 42%, transparent);
    background: color-mix(in srgb, var(--tile-color) 9%, transparent);
  }

  .collection-tile:disabled {
    cursor: wait;
  }

  .collection-tile:disabled:not(.busy) {
    opacity: 0.58;
  }

  .tile-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: 10px;
    background: color-mix(in srgb, var(--tile-color) 20%, transparent);
    color: var(--tile-color);
    font-size: 15px;
  }

  .tile-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .tile-name {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tile-count {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-variant-numeric: tabular-nums;
  }

  /* Replaces the count on the collection you're browsing, so unticking that
	   tile reads as "take it out of here" rather than an unexplained vanish. */
  .tile-here {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--tile-color);
  }

  .tile-mixed {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: color-mix(in srgb, var(--tile-color) 76%, var(--theme-text));
    font-variant-numeric: tabular-nums;
  }

  /* Reserve the check slot so selecting doesn't shift the text width. */
  .tile-check {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--tile-color);
    color: #fff;
    font-size: 11px;
    opacity: 0;
    transform: scale(0.6);
    transition:
      opacity var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .collection-tile.selected .tile-check,
  .collection-tile.mixed .tile-check,
  .collection-tile.busy .tile-check {
    opacity: 1;
    transform: scale(1);
  }

  .collection-tile.mixed .tile-check {
    background: color-mix(in srgb, var(--tile-color) 58%, transparent);
  }

  /* Add tile: dashed, quieter, same footprint as a collection tile. */
  .add-tile {
    border-style: dashed;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .add-tile .tile-icon {
    background: color-mix(
      in srgb,
      var(--theme-text-dim, #888) 14%,
      transparent
    );
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.8));
  }

  .new-tile-input {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 60px;
  }

  .name-field {
    flex: 1;
    min-width: 0;
    height: 44px;
    padding: 0 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid color-mix(in srgb, var(--theme-accent) 45%, transparent);
    border-radius: 12px;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    font-family: inherit;
  }

  .name-field:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--theme-accent) 70%, transparent);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--theme-accent) 14%, transparent);
  }

  .name-field::placeholder {
    color: color-mix(in srgb, var(--theme-text-dim, #888) 70%, transparent);
  }

  .confirm-create {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 45%, transparent);
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-accent) 22%, transparent);
    color: var(--theme-text, white);
    cursor: pointer;
    transition: background var(--duration-fast, 150ms) ease;
  }

  .confirm-create:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent) 34%, transparent);
  }

  .confirm-create:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .confirm-create:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .tile-skeleton {
    min-height: 60px;
    border-radius: 14px;
    background: color-mix(
      in srgb,
      var(--theme-text-dim, #888) 12%,
      transparent
    );
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  @keyframes skeleton-pulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 0.85;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .collection-tile,
    .tile-check,
    .confirm-create {
      transition: none;
    }
    .tile-skeleton {
      animation: none;
    }
  }
</style>
