<!--
  BuugengStyleRow.svelte

  The buugeng's blade style on its details page, beside Size and the Buugeng
  pair: Classic (the notation glyph) and the five generated cuts. A style is a
  look like the fan build or the triangle grip, so it never changes the prop
  type, the notation or a share link.

  Exactly one style is always active, so this composes SegmentedControl the way
  PropChiralityRow does. Each option draws one buugeng, lying flat and filling
  its tile, in the left hand's color: the teeth, holes and blade widths that
  tell the styles apart are lost at pair-preview size (Austen, 2026-11-07).
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { assetFetch } from "#lib/shared/net/asset-fetch.js";
  import { colorPropPreview } from "#lib/shared/pictograph/prop/domain/prop-preview-color.js";
  import { resolveViewerCustomColorPair } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
  import { getMotionColor } from "#lib/shared/utils/svg-color-utils.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    BUUGENG_STYLE_OPTIONS,
    buugengAppearanceArtwork,
    normalizeBuugengStyle,
    type BuugengStyle,
  } from "#lib/shared/pictograph/prop/domain/buugeng-appearance.js";
  import type { ViewerCustomColorPair } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";

  let {
    propType,
    style,
    onChange,
    colors,
  }: {
    /** Buugeng or Big Buugeng; the tiles draw this size. */
    propType: PropType;
    style: BuugengStyle | null | undefined;
    onChange: (style: BuugengStyle) => void;
    colors?: ViewerCustomColorPair | null;
  } = $props();

  const LABEL_KEYS: Record<BuugengStyle, TranslationKey> = {
    classic: "settings_buugeng_style_classic",
    crescent: "settings_buugeng_style_crescent",
    perforated: "settings_buugeng_style_perforated",
    fire: "settings_buugeng_style_fire",
    filigree: "settings_buugeng_style_filigree",
  };

  const current = $derived(normalizeBuugengStyle(style));
  const options = $derived(
    BUUGENG_STYLE_OPTIONS.map((option) => ({
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

  function artPath(id: BuugengStyle): string {
    return (
      buugengAppearanceArtwork(propType, id, "pictograph") ??
      `/images/props/pictograph/${propType.toLowerCase()}.svg`
    );
  }

  let sources = $state<Record<string, string>>({});
  $effect(() => {
    const paths = BUUGENG_STYLE_OPTIONS.map((option) => artPath(option.id));
    let live = true;
    void Promise.all(
      paths.map(async (path) => {
        const response = await assetFetch(path);
        if (!response.ok) throw new Error(`Buugeng style art: ${response.status}`);
        return [path, await response.text()] as const;
      })
    )
      .then((entries) => {
        if (live) sources = Object.fromEntries(entries);
      })
      .catch((error) => console.warn("Could not load buugeng style art", error));
    return () => {
      live = false;
    };
  });

  function tileSrc(id: BuugengStyle): string | null {
    const source = sources[artPath(id)];
    return source
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colorPropPreview(source, propType, color))}`
      : null;
  }

  let width = $state(0);
  // Two rows of three, short enough that the details page never scrolls on
  // the Fold; the phone's narrow, tall sheet takes three rows of two so each
  // blade still draws about 130px wide.
  const columns = $derived(width > 0 && width < 380 ? 2 : 3);

  function choose(next: BuugengStyle) {
    if (next !== current) onChange(next);
  }
</script>

<div class="style-row" bind:clientWidth={width} data-testid="buugeng-style-row">
  <span class="style-label">{t("settings_buugeng_style")}</span>
  <SegmentedControl
    {options}
    value={current}
    onchange={choose}
    color="accent"
    {columns}
    semantics="radiogroup"
    ariaLabel={t("settings_buugeng_style")}
  >
    {#snippet optionContent(id)}
      <span class="style-tile" data-testid={`buugeng-style-${id}`}>
        <span class="style-art" aria-hidden="true">
          {#if tileSrc(id)}
            <img src={tileSrc(id)} alt="" draggable="false" />
          {/if}
        </span>
        <span class="style-name">{t(LABEL_KEYS[id])}</span>
      </span>
    {/snippet}
  </SegmentedControl>
</div>

<style>
  .style-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    margin: 0 12px 12px;
  }

  .style-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-text);
  }

  .style-row :global(.segment-label) {
    display: block;
    width: 100%;
    min-width: 0;
  }

  .style-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 100%;
    padding: 2px 0;
  }

  .style-art {
    display: grid;
    place-items: center;
    width: 100%;
    max-width: 240px;
    /* The plain buugeng frame (262.6 by 135.9), so tiles keep their height
       while the art loads. */
    aspect-ratio: 262.6 / 135.9;
    padding: 2px 8px;
    box-sizing: border-box;
    pointer-events: none;
  }

  .style-art img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .style-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    line-height: 1.2;
  }
</style>
