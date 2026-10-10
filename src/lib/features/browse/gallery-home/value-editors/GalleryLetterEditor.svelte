<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
  import { valueDisabled } from "../gallery-value-editor";
  import type {
    GalleryValueHeadSnippet,
    GalleryWorkspaceProps,
  } from "../gallery-workspace-types";

  type Props = Pick<
    GalleryWorkspaceProps,
    | "catalog"
    | "drillWidth"
    | "adaptiveValueLayout"
    | "stackHint"
    | "isValueApplied"
    | "onPickValue"
  > & { valueHead: GalleryValueHeadSnippet };

  let {
    catalog,
    drillWidth,
    adaptiveValueLayout,
    stackHint,
    isValueApplied,
    onPickValue,
    valueHead,
  }: Props = $props();

  const letterGlyphHeight = $derived(
    adaptiveValueLayout && drillWidth < 640
      ? 30
      : adaptiveValueLayout
        ? catalog.PEEK.letterH
        : 26
  );
</script>

<div class="drill-screen screen-letter">
  {@render valueHead(t("browse_audit_pick_starting_letter"), stackHint)}
  <div class="letter-grid">
    {#each catalog.letterValues as v (v.value)}
      {@const letterApplied =
        isValueApplied?.(BrowseFilterType.STARTING_LETTER, v.value) ?? false}
      <button
        class="letter-chip"
        class:value-applied={letterApplied}
        type="button"
        aria-label={t("browse_audit_letter_sequence_count", {
          letter: v.value,
          count: v.count,
        })}
        aria-pressed={isValueApplied ? letterApplied : undefined}
        disabled={valueDisabled(v.count, letterApplied)}
        onclick={() =>
          onPickValue(BrowseFilterType.STARTING_LETTER, v.value, v.value)}
      >
        <!-- fitToParent: the dashed letters (W-, Σ-, θ-) are wider than a
                 chip at the glyph's natural aspect and used to bleed past the
                 tile's right edge. -->
        <span class="letter-glyph" style:height="{letterGlyphHeight}px">
          <TKAWordGlyph
            word={v.value}
            height={letterGlyphHeight}
            darkMode
            fitToParent
          />
        </span>
        <span class="letter-count">{v.count}</span>
      </button>
    {/each}
  </div>
</div>
