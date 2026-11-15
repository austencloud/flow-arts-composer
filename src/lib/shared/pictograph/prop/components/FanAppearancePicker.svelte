<!--
  FanAppearancePicker.svelte
  One vocabulary for how a fan looks: the build (Pictograph, DoodleGrip Fire,
  Lotus Fire, DoodleGrip Day, Moon LED), then only the details that build
  has. The frame color exists only in 3D, so 2D hosts leave it off. A look
  modelled on a maker's product shows as waiting, and cannot be chosen, until
  its maker has approved it.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PropBuildPicker from "#lib/shared/3d/components/controls/PropBuildPicker.svelte";
  import PropCompositionPreview from "./PropCompositionPreview.svelte";
  import { PropType } from "../domain/enums/prop-type";
  import {
    chooseCompactFanLook,
    chooseFanBuild,
    fanBuildPreviewOptions,
    compactFanLookPreviewOptions,
    fanCoverPreviewOptions,
    fanFramePreviewOptions,
    normalizeFanAppearance,
    type FanAppearance,
    type FanBuild,
    type CompactFanLook,
    type FanCover,
    type FanFrameColor,
  } from "../domain/fan-appearance";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  let {
    value,
    onchange,
    compact = false,
    frameColor = true,
    pairPreview = false,
    pairPropType = PropType.FAN,
  }: {
    value: FanAppearance;
    onchange: (value: FanAppearance) => void;
    compact?: boolean;
    /** The black/white frame only shows on the 3D model; 2D hosts hide it. */
    frameColor?: boolean;
    /**
     * Each tile draws the blue and red pair in this look's line artwork, the
     * way 2D draws it, instead of a photo of the 3D model. Compact list only.
     */
    pairPreview?: boolean;
    /** Which fan the pair is drawn with: Fan or Big Fan. */
    pairPropType?: PropType;
  } = $props();

  // The look a compact tile stands for, as the appearance 2D would draw.
  function pairAppearance(look: CompactFanLook) {
    return {
      fanAppearance: normalizeFanAppearance({
        ...appearance,
        build: look === "covered-fire" ? "fire" : look,
        cover: look === "covered-fire" ? "covered" : "bare",
      }),
    };
  }

  function buildLabel(id: FanBuild): string {
    switch (id) {
      case "pictograph":
        return t("viewer_ui_pictograph");
      case "fire":
        return t("shared_fan_build_fire");
      case "lotus":
        return t("shared_fan_build_lotus");
      case "flat-grip":
        return t("shared_fan_build_flat_grip");
      case "day":
        return t("shared_fan_build_day");
      case "moon":
        return t("shared_fan_build_moon");
      case "star":
        return t("shared_fan_build_star");
      case "sense":
        return t("shared_fan_build_sense");
    }
  }

  const appearance = $derived(normalizeFanAppearance(value));
  const buildOptions = $derived(
    fanBuildPreviewOptions(appearance).map((option) => ({
      ...option,
      label: buildLabel(option.id),
    }))
  );
  const compactLookOptions = $derived(
    compactFanLookPreviewOptions(appearance).map((option) => ({
      ...option,
      label:
        option.id === "pictograph"
          ? t("viewer_ui_pictograph")
          : option.id === "covered-fire"
            ? t("settings_fan_covered_look")
            : buildLabel(option.id),
    }))
  );
  const frameOptions = $derived(
    fanFramePreviewOptions(appearance).map((option) => ({
      ...option,
      label:
        option.id === "black"
          ? t("settings_fan_frame_black")
          : t("settings_fan_frame_white"),
    }))
  );
  const coverOptions = $derived(
    fanCoverPreviewOptions(appearance).map((option) => ({
      ...option,
      label:
        option.id === "bare"
          ? t("settings_fan_cover_bare")
          : t("settings_fan_cover_covered"),
    }))
  );
  const showFrameColor = $derived(frameColor && appearance.build === "day");
  const showCover = $derived(
    appearance.build === "fire" || appearance.build === "day"
  );

  // A look waiting on its maker comes back as null and writes nothing.
  function chooseBuild(build: FanBuild): void {
    const next = chooseFanBuild(appearance, build);
    if (next) onchange(next);
  }

  function chooseCompactLook(look: CompactFanLook): void {
    const next = chooseCompactFanLook(appearance, look);
    if (next) onchange(next);
  }

  const compactLook = $derived<CompactFanLook>(
    appearance.build === "fire" && appearance.cover === "covered"
      ? "covered-fire"
      : appearance.build
  );

  function chooseFrameColor(frameColor: FanFrameColor): void {
    onchange({ ...appearance, frameColor });
  }

  function chooseCover(cover: FanCover): void {
    onchange({ ...appearance, cover });
  }
</script>

{#snippet pairTile(option: { id: string })}
  <!-- Square 100x100 drawing, fitted to the frame's height and centred; no
       colors prop, so the pair wears the user's saved prop colors. -->
  <span class="pair-tile">
    <PropCompositionPreview
      propType={pairPropType}
      size={120}
      pairedGlyph
      appearanceOverride={pairAppearance(option.id as CompactFanLook)}
    />
  </span>
{/snippet}

<div
  class="fan-appearance-picker"
  class:compact
  style:--prop-picker-accent="var(--theme-accent, #8b7cf6)"
  style:--prop-picker-stroke="var(--theme-stroke, rgba(255,255,255,0.12))"
>
  <div class="build-choice">
    <PropBuildPicker
      label={compact ? undefined : t("settings_fan_build")}
      value={compact ? compactLook : appearance.build}
      options={compact ? compactLookOptions : buildOptions}
      useImageScale={compact}
      showCredit={compact}
      preview={compact && pairPreview ? pairTile : undefined}
      onchange={(next) =>
        compact
          ? chooseCompactLook(next as CompactFanLook)
          : chooseBuild(next as FanBuild)}
    />
  </div>

  {#if !compact && (showFrameColor || showCover)}
    <div
      class="modifier-grid"
      class:single={!(showFrameColor && showCover)}
      transition:growFade={{ duration: DURATION.normal, axis: "y" }}
    >
      {#if showFrameColor}
        <div transition:growFade={{ duration: DURATION.normal, axis: "y" }}>
          <PropBuildPicker
            label={t("settings_fan_frame")}
            value={appearance.frameColor}
            options={frameOptions}
            onchange={chooseFrameColor}
            density="secondary"
          />
        </div>
      {/if}
      {#if showCover}
        <div>
          <PropBuildPicker
            label={t("settings_fan_cover")}
            value={appearance.cover}
            options={coverOptions}
            onchange={chooseCover}
            density="secondary"
          />
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .fan-appearance-picker {
    --build-option-count: 2;
    container-type: inline-size;
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .pair-tile {
    position: absolute;
    inset: 0;
    container-type: size;
    display: grid;
    place-items: center;
    pointer-events: none;
  }

  /* The pair inks about 88% of its square drawing's width and 70% of its
     height, so a drawing fitted to the frame's height left half the frame
     empty. Sized from the frame's width instead, the pair spans about 80% of
     it; the height bound keeps its ink inside a flat frame. */
  .pair-tile > :global(svg) {
    width: min(90cqw, 136cqh);
    height: auto;
    max-width: none;
    aspect-ratio: 1;
    flex: none;
  }

  .build-choice,
  .modifier-grid,
  .modifier-grid > div {
    min-width: 0;
  }

  .modifier-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .modifier-grid.single {
    grid-template-columns: minmax(0, 1fr);
  }

  @container (min-width: 620px) {
    .fan-appearance-picker:not(.compact) {
      --build-option-count: 5;
    }
  }

  @media (max-height: 560px) {
    .fan-appearance-picker {
      gap: 8px;
    }
  }
</style>
