<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { GridJoinFilterValue } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
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
</script>

<div class="drill-screen screen-gridjoin">
  {@render valueHead(t("browse_audit_pick_grid_join"), stackHint)}
  <div class="value-list">
    {#each catalog.gridJoinValues as v (v.value)}
      {@const applied = isValueApplied?.(v.type, v.value) ?? false}
      <button
        class="length-row tall monument"
        class:value-applied={applied}
        type="button"
        aria-pressed={isValueApplied ? applied : undefined}
        disabled={valueDisabled(v.count, applied)}
        onclick={() => onPickValue(v.type, v.value, v.label)}
      >
        <span class="loop-icon" aria-hidden="true">
          <i class="fas {v.icon}"></i>
        </span>
        <span class="value-main">
          <span class="value-label"
            >{v.value === GridJoinFilterValue.JOINED
              ? t("browse_audit_joined_grids")
              : t("browse_audit_one_grid")}</span
          >
          <span class="value-desc"
            >{v.value === GridJoinFilterValue.JOINED
              ? t("browse_audit_joined_grids_desc")
              : t("browse_audit_one_grid_desc")}</span
          >
          <span class="density-bar">
            <span
              class="density-fill"
              style:width="{(v.count / catalog.maxGridJoinCount) * 100}%"
            ></span>
          </span>
        </span>
        <span class="value-count">{v.count}</span>
      </button>
    {/each}
  </div>
</div>
