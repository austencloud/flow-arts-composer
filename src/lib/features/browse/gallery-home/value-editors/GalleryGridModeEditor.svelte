<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import LessonGridDisplay from "#lib/shared/pictograph/grid/components/LessonGridDisplay.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
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

<div class="drill-screen screen-gridmode">
  {@render valueHead(t("browse_audit_pick_grid_mode"), stackHint)}
  <div class="value-list">
    {#each catalog.gridModeValues as v (v.value)}
      {@const gridModeApplied =
        isValueApplied?.(BrowseFilterType.GRID_MODE, v.value) ?? false}
      <button
        class="length-row tall monument"
        class:value-applied={gridModeApplied}
        type="button"
        aria-pressed={isValueApplied ? gridModeApplied : undefined}
        disabled={valueDisabled(v.count, gridModeApplied)}
        onclick={() =>
          onPickValue(BrowseFilterType.GRID_MODE, v.value, v.label)}
      >
        <span class="value-grid-preview" aria-hidden="true">
          <LessonGridDisplay
            type={v.value === GridMode.BOX ? "box" : "diamond"}
            size="large"
          />
        </span>
        <span class="value-main">
          <span class="value-label"
            >{v.value === "box"
              ? t("browse_audit_box")
              : t("browse_audit_diamond")}</span
          >
          <span class="value-desc"
            >{v.value === "box"
              ? t("browse_audit_diagonal_points")
              : t("browse_audit_cardinal_points")}</span
          >
          <span class="density-bar">
            <span
              class="density-fill"
              style:width="{(v.count / catalog.maxGridModeCount) * 100}%"
            ></span>
          </span>
        </span>
        <span class="value-count">{v.count}</span>
      </button>
    {/each}
  </div>
</div>
