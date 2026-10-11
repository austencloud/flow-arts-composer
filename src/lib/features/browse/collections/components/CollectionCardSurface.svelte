<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { Snippet } from "svelte";
  import type { LibraryCollection } from "#lib/shared/library/domain/models/collection.js";
  import type { CollectionAccessRole } from "#lib/shared/library/domain/models/collection.js";

  interface Props {
    collection: LibraryCollection;
    onOpen: () => void;
    ownerName?: string;
    accessRole?: CollectionAccessRole;
    readonly?: boolean;
    selected?: boolean;
    countLabel?: string;
    minimalMetadata?: boolean;
    editing?: boolean;
    editor?: Snippet;
    onOptions?: (event: MouseEvent) => void;
    onContextMenu?: (event: MouseEvent) => void;
  }

  let {
    collection,
    onOpen,
    ownerName,
    accessRole,
    readonly: isReadonly = false,
    selected = false,
    countLabel: countLabelOverride,
    minimalMetadata = false,
    editing = false,
    editor,
    onOptions,
    onContextMenu,
  }: Props = $props();

  const tileColor = $derived(
    collection.color ?? "var(--theme-accent, #8b6cff)"
  );
  const isSmart = $derived(collection.kind === "smart");
  const isBuiltInSmart = $derived(
    isSmart && collection.systemType === "founding"
  );
  const smartSourceLabel = $derived(
    collection.filterSpec?.source === "my-library"
      ? t("browse_audit_my_library")
      : t("browse_audit_community")
  );

  function defaultCountLabel(n: number): string {
    return n === 1
      ? t("browse_audit_one_sequence", { count: n })
      : t("browse_audit_many_sequences", { count: n });
  }

  function smartCountLabel(n: number): string {
    return n === 1
      ? t("browse_audit_one_match", { count: n })
      : t("browse_audit_matches_count", { count: n });
  }
</script>

{#if editing && editor}
  <div class="collection-card rename-mode" style:--tile-color={tileColor}>
    <span class="tile-icon">
      <i class={`fas ${collection.icon ?? "fa-folder"}`} aria-hidden="true"></i>
    </span>
    {@render editor()}
  </div>
{:else}
  <div class="collection-card" class:selected style:--tile-color={tileColor}>
    <button
      type="button"
      class="card-main"
      aria-current={selected ? "true" : undefined}
      onclick={onOpen}
      oncontextmenu={onContextMenu}
    >
      <span class="tile-icon" class:has-cover={!!collection.coverImageUrl}>
        {#if collection.coverImageUrl}
          <img class="tile-cover-img" src={collection.coverImageUrl} alt="" />
        {:else}
          <i class={`fas ${collection.icon ?? "fa-folder"}`} aria-hidden="true"
          ></i>
        {/if}
      </span>
      <span class="tile-text">
        <span class="tile-name-row">
          <span class="tile-name">{collection.name}</span>
          {#if isSmart && !minimalMetadata}
            <span class="smart-label">
              <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
              {t("browse_audit_smart")}
            </span>
          {/if}
        </span>
        <span class="tile-count">
          <!-- Svelte trims the leading whitespace of these continuation lines,
               so the separators carry their own spaces explicitly — otherwise
               the card reads "8 matches· My Library". -->
          {countLabelOverride ??
            (isSmart
              ? smartCountLabel(collection.sequenceCount)
              : defaultCountLabel(
                  collection.sequenceCount
                ))}{#if isSmart && !minimalMetadata}{" · "}{smartSourceLabel}{#if isBuiltInSmart}{" · "}{t(
                "browse_audit_built_in"
              )}{/if}{/if}{#if !isReadonly && collection.isPublic}{" · "}<i
              class="fas fa-globe public-globe"
              aria-hidden="true"
            ></i>
            {t("browse_audit_public")}{/if}
        </span>
        {#if ownerName}
          <span class="tile-owner">
            {t("browse_audit_by_owner", { owner: ownerName })}{#if accessRole}
              · {accessRole === "editor"
                ? t("browse_audit_can_edit")
                : t("browse_audit_can_view")}{/if}
          </span>
        {:else if collection.credit}
          <!-- Hand-written attribution for a contributor with no profile to
               link to. Same slot as ownerName, so a card never shows both. -->
          <span class="tile-owner credit">{collection.credit}</span>
        {/if}
      </span>
    </button>

    {#if onOptions}
      <button
        type="button"
        class="kebab"
        aria-label={t("browse_audit_options_for", { name: collection.name })}
        onclick={onOptions}
      >
        <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
      </button>
    {/if}
  </div>
{/if}

<style>
  .collection-card {
    display: flex;
    min-height: 72px;
    align-items: stretch;
    overflow: hidden;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .collection-card:hover {
    border-color: color-mix(in srgb, var(--tile-color) 45%, transparent);
    background: color-mix(in srgb, var(--tile-color) 8%, var(--theme-card-bg));
  }

  .collection-card:active {
    transform: scale(0.98);
  }

  .collection-card.selected {
    border-color: color-mix(in srgb, var(--tile-color) 55%, transparent);
    background: color-mix(in srgb, var(--tile-color) 12%, var(--theme-card-bg));
    box-shadow: inset 3px 0 0 0 var(--tile-color);
  }

  .card-main {
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border: none;
    background: none;
    color: var(--theme-text, white);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .card-main:focus-visible {
    border-radius: 14px;
    outline: 2px solid var(--tile-color);
    outline-offset: -2px;
  }

  .tile-icon {
    display: flex;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    background: color-mix(in srgb, var(--tile-color) 20%, transparent);
    color: var(--tile-color);
    font-size: 17px;
  }

  .tile-icon.has-cover {
    overflow: hidden;
    padding: 0;
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    box-shadow: 0 0 0 1.5px
      color-mix(in srgb, var(--tile-color) 55%, transparent);
  }

  .tile-cover-img {
    width: 100%;
    height: 100%;
    border-radius: inherit;
    object-fit: cover;
  }

  .tile-text {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .tile-name-row {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  .tile-name {
    min-width: 0;
    overflow: hidden;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile-count,
  .tile-owner {
    overflow: hidden;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* "by Adam Molski" fits on one line; a written credit is a phrase and often
     doesn't. Give it two, then clamp. */
  .tile-owner.credit {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    white-space: normal;
    line-height: 1.35;
  }

  .tile-count {
    font-variant-numeric: tabular-nums;
  }

  .tile-owner {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  .public-globe {
    color: color-mix(in srgb, var(--tile-color) 80%, white);
    font-size: 10px;
  }

  .smart-label {
    display: inline-flex;
    min-height: 22px;
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
    padding: 3px 7px;
    border: 1px solid color-mix(in srgb, var(--tile-color) 30%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--tile-color) 11%, transparent);
    color: color-mix(in srgb, var(--tile-color) 76%, white);
    font-size: 11px;
    font-weight: 650;
    line-height: 1;
  }

  .smart-label i {
    font-size: 9px;
  }

  .kebab {
    display: flex;
    width: 44px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    cursor: pointer;
    transition: color var(--duration-fast, 150ms) ease;
  }

  .kebab:hover {
    color: var(--theme-text, white);
  }

  .kebab:focus-visible {
    border-radius: 10px;
    outline: 2px solid var(--tile-color);
    outline-offset: -2px;
  }

  .rename-mode {
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
  }

  @media (prefers-reduced-motion: reduce) {
    .collection-card,
    .kebab {
      transition: none;
    }

    .collection-card:active {
      transform: none;
    }
  }
</style>
