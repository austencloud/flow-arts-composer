<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
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

<div class="drill-screen screen-length">
  {@render valueHead(t("browse_audit_pick_length"), stackHint)}
  <div class="value-list" class:dense={catalog.lengthValues.length > 8}>
    {#each catalog.lengthValues as v (v.value)}
      {@const lengthApplied =
        isValueApplied?.(BrowseFilterType.LENGTH, v.value) ?? false}
      <button
        class="length-row monument"
        class:value-applied={lengthApplied}
        type="button"
        aria-pressed={isValueApplied ? lengthApplied : undefined}
        disabled={valueDisabled(v.count, lengthApplied)}
        onclick={() => onPickValue(BrowseFilterType.LENGTH, v.value, v.label)}
      >
        <span class="value-numeral small">{v.value}</span>
        <span class="value-main">
          <span class="value-label muted">{t("browse_audit_steps")}</span>
          <span class="density-bar">
            <span
              class="density-fill"
              style:width="{(v.count / catalog.maxLengthCount) * 100}%"
            ></span>
          </span>
        </span>
        <span class="value-count">{v.count}</span>
      </button>
    {/each}
  </div>
</div>
