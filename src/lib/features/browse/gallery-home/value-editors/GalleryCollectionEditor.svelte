<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { openShareCollectionSheet } from "$lib/shared/inbox/state/send-sequence-state.svelte";
  import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
  import type { CollectionOption } from "../gallery-drill-catalog.svelte";
  import { valueDisabled } from "../gallery-value-editor";
  import type {
    GalleryValueHeadSnippet,
    GalleryWorkspaceProps,
  } from "../gallery-workspace-types";

  type Props = Pick<
    GalleryWorkspaceProps,
    "catalog" | "stackHint" | "isValueApplied" | "onPickValue"
  > & { valueHead: GalleryValueHeadSnippet };

  let { catalog, stackHint, isValueApplied, onPickValue, valueHead }: Props =
    $props();

  function handleCollectionContextMenu(
    event: MouseEvent,
    collection: CollectionOption
  ): void {
    if (!collection.canShare || !collection.ownerId) return;
    event.preventDefault();
    openShareCollectionSheet({
      id: collection.id,
      ownerId: collection.ownerId,
      name: collection.name,
      sequenceCount: collection.size,
      coverImageUrl: collection.coverImageUrl,
      color: collection.color,
      icon: collection.icon,
    });
  }
</script>

<div class="drill-screen screen-collections">
  {@render valueHead(
    t("browse_audit_pick_collection"),
    stackHint ?? t("browse_audit_sequences_in_collection")
  )}
  <div class="value-list">
    {#each catalog.collectionValues as v (v.id)}
      {@const applied =
        isValueApplied?.(BrowseFilterType.COLLECTION, v.id) ?? false}
      <button
        class="length-row tall monument tinted collection-row"
        class:value-applied={applied}
        style:--row-color={v.color ?? "var(--theme-accent, #6366f1)"}
        type="button"
        aria-label={t("browse_audit_collection_sequence_count", {
          name: v.name,
          count: v.count,
        })}
        aria-pressed={isValueApplied ? applied : undefined}
        disabled={valueDisabled(v.count, applied)}
        oncontextmenu={(event) => handleCollectionContextMenu(event, v)}
        onclick={() =>
          onPickValue(
            BrowseFilterType.COLLECTION,
            v.id,
            v.name,
            v.color ?? undefined
          )}
      >
        {#if v.coverImageUrl}
          <img
            class="value-img collection-cover"
            src={v.coverImageUrl}
            alt=""
            width="56"
            height="56"
            loading="lazy"
          />
        {:else}
          <span class="loop-icon" aria-hidden="true">
            <i class="fas {v.icon ?? 'fa-folder'}"></i>
          </span>
        {/if}
        <span class="value-main">
          <span class="value-label" title={v.name}>{v.name}</span>
          {#if v.ownerName}
            <span class="value-desc">Curated by {v.ownerName}</span>
          {/if}
          <span class="density-bar">
            <span
              class="density-fill"
              style:width="{(v.count / catalog.maxCollectionCount) * 100}%"
            ></span>
          </span>
        </span>
        <span class="value-count">{v.count}</span>
      </button>
    {/each}
  </div>
</div>
