<!--
  FanAppearancePicker.svelte
  One vocabulary for how a fan looks: the build (Pictograph, DoodleGrip Fire,
  Lotus Fire, DoodleGrip Day, Moon LED), then only the details that build
  has. The frame color exists only in 3D, so 2D hosts leave it off.
-->
<script lang="ts">
  import PropBuildPicker from "$lib/shared/3d/components/controls/PropBuildPicker.svelte";
  import {
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
  import { growFade } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";

  let {
    value,
    onchange,
    compact = false,
    frameColor = true,
  }: {
    value: FanAppearance;
    onchange: (value: FanAppearance) => void;
    compact?: boolean;
    /** The black/white frame only shows on the 3D model; 2D hosts hide it. */
    frameColor?: boolean;
  } = $props();

  const appearance = $derived(normalizeFanAppearance(value));
  const buildOptions = $derived(fanBuildPreviewOptions(appearance));
  const compactLookOptions = $derived(compactFanLookPreviewOptions(appearance));
  const frameOptions = $derived(fanFramePreviewOptions(appearance));
  const coverOptions = $derived(fanCoverPreviewOptions(appearance));
  const showFrameColor = $derived(frameColor && appearance.build === "day");
  const showCover = $derived(
    appearance.build === "fire" || appearance.build === "day"
  );

  function chooseBuild(build: FanBuild): void {
    onchange({ ...appearance, build });
  }

  function chooseCompactLook(look: CompactFanLook): void {
    if (look === "covered-fire") {
      onchange({ ...appearance, build: "fire", cover: "covered" });
      return;
    }
    onchange({ ...appearance, build: look, cover: "bare" });
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

<div
  class="fan-appearance-picker"
  class:compact
  style:--prop-picker-accent="var(--theme-accent, #8b7cf6)"
  style:--prop-picker-stroke="var(--theme-stroke, rgba(255,255,255,0.12))"
>
  <div class="build-choice">
    <PropBuildPicker
      label={compact ? undefined : "Build"}
      value={compact ? compactLook : appearance.build}
      options={compact ? compactLookOptions : buildOptions}
      useImageScale={compact}
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
            label="Frame"
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
            label="Cover"
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
