<script lang="ts">
  import type {
    PostTextAnimation,
    PostTextStyle,
  } from "#lib/shared/media-composition/domain/post-project.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import TypeableValue from "#lib/shared/ui/components/TypeableValue.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";

  interface Props {
    style: PostTextStyle;
    animation?: PostTextAnimation;
    locked: boolean;
    onStyle: (style: PostTextStyle, field: string) => void;
    onAnimation: (animation: PostTextAnimation | null, field: string) => void;
  }

  let { style, animation, locked, onStyle, onAnimation }: Props = $props();

  function numeric(
    field:
      | "fontSizeNative"
      | "fontScale"
      | "letterSpacing"
      | "lineSpacing"
      | "alpha",
    value: number
  ): void {
    if (!Number.isFinite(value)) return;
    const next =
      field === "alpha"
        ? Math.max(0, Math.min(1, value / 100))
        : field === "fontSizeNative" ||
            field === "fontScale" ||
            field === "lineSpacing"
          ? Math.max(0.001, value)
          : value;
    onStyle({ ...style, [field]: next }, field);
  }

  function duration(
    field: "inDurationSeconds" | "outDurationSeconds",
    value: number
  ): void {
    if (!animation || !Number.isFinite(value)) return;
    onAnimation({ ...animation, [field]: Math.max(0, value) }, field);
  }
</script>

<div class="native-text-tool">
  <label class="font-label" for="native-font-family">Font</label>
  <input
    id="native-font-family"
    class="font-field"
    value={style.fontFamily.replace(/\.ttf$/i, "")}
    disabled={locked}
    onchange={(event) => {
      const fontFamily = event.currentTarget.value.trim();
      if (fontFamily) onStyle({ ...style, fontFamily }, "font-family");
    }}
  />
  <div class="fields" role="group" aria-label="Text style">
    <span class="name" aria-hidden="true">Size</span>
    <TypeableValue
      label="Size"
      text={`${Number(style.fontSizeNative.toFixed(2))} px`}
      disabled={locked}
      oncommit={(value) => numeric("fontSizeNative", value)}
    />
    <span class="name" aria-hidden="true">Scale</span>
    <TypeableValue
      label="Scale"
      text={`${Number(((style.fontScale ?? 1) * 100).toFixed(2))}%`}
      disabled={locked}
      oncommit={(value) => numeric("fontScale", value / 100)}
    />
    <span class="name" aria-hidden="true">Letter spacing</span>
    <TypeableValue
      label="Letter spacing"
      text={`${Number(style.letterSpacing.toFixed(2))} px`}
      signed
      disabled={locked}
      oncommit={(value) => numeric("letterSpacing", value)}
    />
    <span class="name" aria-hidden="true">Line spacing</span>
    <TypeableValue
      label="Line spacing"
      text={`${Number(style.lineSpacing.toFixed(2))} ×`}
      disabled={locked}
      oncommit={(value) => numeric("lineSpacing", value)}
    />
    <span class="name" aria-hidden="true">Opacity</span>
    <TypeableValue
      label="Opacity"
      text={`${Number((style.alpha * 100).toFixed(1))}%`}
      disabled={locked}
      oncommit={(value) => numeric("alpha", value)}
    />
  </div>
  <SegmentedControl
    color="accent"
    options={[
      { value: "left", label: "Left", disabled: locked },
      { value: "center", label: "Center", disabled: locked },
      { value: "right", label: "Right", disabled: locked },
    ]}
    value={style.alignment}
    onchange={(alignment) => onStyle({ ...style, alignment }, "alignment")}
    ariaLabel="Text alignment"
  />
  <div class="animation-heading">
    <span>Letter entrance and exit</span>
    <PanelButton
      disabled={locked}
      onclick={() =>
        onAnimation(
          animation
            ? null
            : {
                kind: "letter-slide",
                inDurationSeconds: 0.95,
                outDurationSeconds: 0.95,
                entranceProgress: 0,
                exitProgress: 0,
              },
          "enabled"
        )}>{animation ? "Turn off" : "Turn on"}</PanelButton
    >
  </div>
  {#if animation}
    <div class="fields" role="group" aria-label="Letter animation duration">
      <span class="name" aria-hidden="true">Entrance</span>
      <TypeableValue
        label="Entrance duration"
        text={`${Number(animation.inDurationSeconds.toFixed(3))} s`}
        disabled={locked}
        oncommit={(value) => duration("inDurationSeconds", value)}
      />
      <span class="name" aria-hidden="true">Exit</span>
      <TypeableValue
        label="Exit duration"
        text={`${Number(animation.outDurationSeconds.toFixed(3))} s`}
        disabled={locked}
        oncommit={(value) => duration("outDurationSeconds", value)}
      />
    </div>
    <p class="hint">
      Letter motion follows an approximation of the original animation.
    </p>
  {/if}
</div>

<style>
  .native-text-tool {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }
  .font-label,
  .name,
  .animation-heading {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
  }
  .font-field {
    box-sizing: border-box;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.625rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.5rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    font: inherit;
  }
  .font-field:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 1px;
  }
  .fields {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem 0.625rem;
  }
  .animation-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .hint {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
    line-height: 1.4;
  }
</style>
