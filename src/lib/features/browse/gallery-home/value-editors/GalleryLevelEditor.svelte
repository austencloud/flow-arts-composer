<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import DifficultyBadge from "#lib/shared/components/DifficultyBadge.svelte";
  import SequencePeek from "#lib/shared/browse/components/SequencePeek.svelte";
  import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
  import { DIFFICULTY_LEVELS } from "#lib/shared/config/difficulty-styles.js";
  import { valueDisabled } from "../gallery-value-editor";
  import type {
    GalleryValueHeadSnippet,
    GalleryWorkspaceProps,
  } from "../gallery-workspace-types";

  type Props = Pick<
    GalleryWorkspaceProps,
    | "catalog"
    | "drillWidth"
    | "splitPane"
    | "adaptiveValueLayout"
    | "stackHint"
    | "isValueApplied"
    | "onPickValue"
  > & { valueHead: GalleryValueHeadSnippet };

  let {
    catalog,
    drillWidth,
    splitPane = false,
    adaptiveValueLayout,
    stackHint,
    isValueApplied,
    onPickValue,
    valueHead,
  }: Props = $props();

  const paneWideArt = $derived(splitPane && drillWidth >= 620);
  const levelPeekWidth = $derived(
    paneWideArt
      ? 150
      : adaptiveValueLayout && drillWidth >= 640 && drillWidth < 900
        ? 120
        : adaptiveValueLayout && drillWidth >= 480 && drillWidth < 640
          ? 104
          : catalog.PEEK.levelW
  );
  const levelPeekHeight = $derived(
    paneWideArt
      ? 140
      : adaptiveValueLayout && drillWidth >= 640 && drillWidth < 900
        ? 112
        : adaptiveValueLayout && drillWidth >= 480 && drillWidth < 640
          ? 97
          : catalog.PEEK.levelH
  );
</script>

<div class="drill-screen screen-level">
  {@render valueHead(t("browse_audit_pick_level"), stackHint)}
  <div class="value-list">
    {#each catalog.levelValues as v (v.value)}
      {@const style = DIFFICULTY_LEVELS[v.value]}
      {@const levelApplied =
        isValueApplied?.(BrowseFilterType.DIFFICULTY, v.value) ?? false}
      <button
        class="level-tile"
        class:value-applied={levelApplied}
        type="button"
        style:background={style?.cssBg}
        style:color={style?.text ?? "#000"}
        aria-pressed={isValueApplied ? levelApplied : undefined}
        disabled={valueDisabled(v.count, levelApplied)}
        onclick={() =>
          onPickValue(BrowseFilterType.DIFFICULTY, v.value, v.label)}
      >
        <span class="value-numeral">{v.value}</span>
        <span class="value-main">
          <span class="value-label"
            >{t("browse_audit_level_number", { level: v.value })}</span
          >
          <span class="value-desc on-gradient"
            >{v.value === 1
              ? t("browse_audit_level_1_description")
              : v.value === 2
                ? t("browse_audit_level_2_description")
                : t("browse_audit_level_3_description")}</span
          >
          <span class="density-bar on-gradient">
            <span
              class="density-fill"
              style:width="{(v.count / catalog.maxLevelCount) * 100}%"
            ></span>
          </span>
        </span>
        <span class="value-count">{v.count}</span>
        <SequencePeek
          sequence={catalog.levelReps.get(v.value)}
          width={levelPeekWidth}
          height={levelPeekHeight}
          eager
        />
      </button>
    {/each}
  </div>
</div>
