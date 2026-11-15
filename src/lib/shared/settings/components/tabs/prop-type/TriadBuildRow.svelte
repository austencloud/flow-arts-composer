<!--
  TriadBuildRow.svelte

  The triad's physical build on its details page and the triad family page,
  beside Size: Pictograph (the notation glyph) and the two frames the 3D viewer
  builds, Fire and Day. A build is a look like the fan build or the buugeng
  style, so it never changes the prop type, the notation or a share link.

  Exactly one build is always active, so this composes SegmentedControl the way
  BuugengStyleRow does. Each option draws one triad in the left hand's color;
  the wicks and heads keep their own materials.
-->
<script lang="ts" module>
  import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
  import type { TriadBuild as LabelId } from "#lib/shared/pictograph/prop/domain/triad-build.js";

  /** Each option's name, for a summary that names the current one. */
  export const TRIAD_BUILD_LABEL_KEYS: Record<LabelId, TranslationKey> = {
    pictograph: "settings_triad_build_pictograph",
    fire: "settings_triad_build_fire",
    day: "settings_triad_build_day",
  };
</script>

<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { assetFetch } from "#lib/shared/net/asset-fetch.js";
  import { colorPropPreview } from "#lib/shared/pictograph/prop/domain/prop-preview-color.js";
  import { resolveViewerCustomColorPair } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
  import { getMotionColor } from "#lib/shared/utils/svg-color-utils.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    TRIAD_BUILD_OPTIONS,
    normalizeTriadBuild,
    triadBuildArtwork,
    type TriadBuild,
  } from "#lib/shared/pictograph/prop/domain/triad-build.js";
  import type { ViewerCustomColorPair } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";

  let {
    propType,
    build,
    onChange,
    colors,
    fit = false,
  }: {
    /** Triad or Big Triad; the tiles draw this size. */
    propType: PropType;
    build: TriadBuild | null | undefined;
    onChange: (build: TriadBuild) => void;
    colors?: ViewerCustomColorPair | null;
    /** The phone sheet's own Build screen: fill the given height, the tiles
     *  sized from that height, the screen's title standing in for the label. */
    fit?: boolean;
  } = $props();

  const LABEL_KEYS = TRIAD_BUILD_LABEL_KEYS;

  const current = $derived(normalizeTriadBuild(build));
  const options = $derived(
    TRIAD_BUILD_OPTIONS.map((option) => ({
      value: option.id,
      label: t(LABEL_KEYS[option.id]),
      tone: "both" as const,
    }))
  );

  const color = $derived(
    resolveViewerCustomColorPair(colors, {
      left: getMotionColor(HandSide.LEFT, "dark"),
      right: getMotionColor(HandSide.RIGHT, "dark"),
    }).left
  );

  function artPath(id: TriadBuild): string {
    return (
      triadBuildArtwork(propType, id, "buttons") ??
      `/images/props/buttons/${propType.toLowerCase()}.svg`
    );
  }

  let sources = $state<Record<string, string>>({});
  $effect(() => {
    const paths = TRIAD_BUILD_OPTIONS.map((option) => artPath(option.id));
    let live = true;
    void Promise.all(
      paths.map(async (path) => {
        const response = await assetFetch(path);
        if (!response.ok) throw new Error(`Triad build art: ${response.status}`);
        return [path, await response.text()] as const;
      })
    )
      .then((entries) => {
        if (live) sources = Object.fromEntries(entries);
      })
      .catch((error) => console.warn("Could not load triad build art", error));
    return () => {
      live = false;
    };
  });

  function tileSrc(id: TriadBuild): string | null {
    const source = sources[artPath(id)];
    return source
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colorPropPreview(source, propType, color))}`
      : null;
  }

  function choose(next: TriadBuild) {
    if (next !== current) onChange(next);
  }
</script>

<div class="build-row" class:fit data-testid="triad-build-row">
  <span class="build-label">{t("settings_fan_build")}</span>
  <SegmentedControl
    {options}
    value={current}
    onchange={choose}
    color="accent"
    columns={3}
    semantics="radiogroup"
    ariaLabel={t("settings_fan_build")}
  >
    {#snippet optionContent(id)}
      <span class="build-tile" data-testid={`triad-build-${id}`}>
        <span class="build-art" aria-hidden="true">
          {#if tileSrc(id)}
            <img src={tileSrc(id)} alt="" draggable="false" />
          {/if}
        </span>
        <span class="build-name">{t(LABEL_KEYS[id as TriadBuild])}</span>
      </span>
    {/snippet}
  </SegmentedControl>
</div>

<style>
  .build-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    margin: 0 12px 12px;
  }

  .build-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-text);
  }

  .build-row :global(.segment-label) {
    display: block;
    width: 100%;
    min-width: 0;
  }

  .build-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 100%;
    padding: 2px 0;
  }

  .build-art {
    display: grid;
    place-items: center;
    width: 100%;
    max-width: 120px;
    /* The plain triad button frame (248.76 by 219.09), so tiles keep their
       height while the art loads. */
    aspect-ratio: 248.76 / 219.09;
    padding: 4px;
    box-sizing: border-box;
    pointer-events: none;
  }

  .build-art img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .build-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    line-height: 1.2;
  }

  /* Fit: the tiles share the screen's height instead of keeping the frame's
     proportions, so every build shows whole in the phone sheet. */
  .build-row.fit {
    flex: 1 1 0;
    height: 100%;
    min-height: 0;
    margin: 0;
    gap: 0;
  }

  .build-row.fit .build-label {
    display: none;
  }

  .build-row.fit :global(.ui-segments) {
    flex: 1 1 0;
    min-height: 0;
    grid-auto-rows: minmax(0, 1fr);
  }

  .build-row.fit :global(.ui-segments > button) {
    min-height: 0;
    align-items: stretch;
    padding: 4px;
  }

  .build-row.fit :global(.segment-label) {
    height: 100%;
  }

  .build-row.fit .build-tile {
    height: 100%;
    min-height: 0;
    gap: 4px;
    padding: 0;
  }

  .build-row.fit .build-art {
    flex: 1 1 0;
    min-height: 0;
    max-width: none;
    aspect-ratio: auto;
  }

  .build-row.fit .build-name {
    flex: 0 0 auto;
    font-size: var(--font-size-min, 14px);
  }
</style>
