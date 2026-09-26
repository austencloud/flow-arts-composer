<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
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

<div class="drill-screen screen-placements">
  {@render valueHead(t("browse_audit_pick_placement"), stackHint)}
  <div class="value-list">
    {#each catalog.placementValues as v (v.value)}
      {@const placementApplied =
        isValueApplied?.(BrowseFilterType.STARTING_PLACEMENT, v.value) ?? false}
      <button
        class="length-row tall monument"
        class:value-applied={placementApplied}
        type="button"
        aria-pressed={isValueApplied ? placementApplied : undefined}
        disabled={valueDisabled(v.count, placementApplied)}
        onclick={() =>
          onPickValue(BrowseFilterType.STARTING_PLACEMENT, v.value, v.label)}
      >
        <span class="value-pictograph" aria-hidden="true">
          {#if catalog.startPlacementPictographs.get(v.value)}
            <PictographContainer
              pictographData={catalog.startPlacementPictographs.get(v.value)}
              showTKA={false}
              showPlacements={false}
              showTnD={false}
              showElemental={false}
            />
          {/if}
        </span>
        <span class="value-main">
          <span class="value-label"
            >{v.value === "alpha"
              ? t("browse_audit_alpha")
              : v.value === "beta"
                ? t("browse_audit_beta")
                : t("browse_audit_gamma")}</span
          >
          <span class="value-desc"
            >{v.value === "alpha"
              ? t("browse_audit_hands_apart")
              : v.value === "beta"
                ? t("browse_audit_hands_together")
                : t("browse_audit_hands_right_angle")}</span
          >
          <span class="density-bar">
            <span
              class="density-fill"
              style:width="{(v.count / catalog.maxPlacementCount) * 100}%"
            ></span>
          </span>
        </span>
        <span class="value-count">{v.count}</span>
      </button>
    {/each}
  </div>
</div>
