<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    postCanvasOf,
    postOutputSize,
    updateItem,
  } from "@austencloud/video-editor/core";
  import { tkaEditorOf } from "./tka-editor-context";
  import type { VideoEditorState } from "@austencloud/video-editor";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";
  import type { PostAnimationItem } from "#lib/shared/post-studio-plugin/index.js";
  import {
    POST_SPLIT_DEFAULT_FLASH,
    POST_SPLIT_DEFAULT_OPEN_SECONDS,
    POST_SPLIT_DEFAULT_STYLE,
    POST_SPLIT_MAX_FLASH,
    POST_SPLIT_MAX_MIDDLE,
    POST_SPLIT_MAX_MOVE_SECONDS,
    POST_SPLIT_MAX_SCALE,
    POST_SPLIT_MAX_SPREAD,
    POST_SPLIT_MIN_MIDDLE,
    POST_SPLIT_MIN_MOVE_SECONDS,
    POST_SPLIT_MIN_SCALE,
    POST_SPLIT_STYLES,
    POST_SPLIT_THREE_DEFAULTS,
    splitFitScale,
    splitSpreadOf,
    type PostAnimationSplit,
    type PostSplitStyle,
  } from "#lib/shared/media-composition/domain/post-animation-split.js";

  /**
   * The animation clip's "Split hands" panel: on or off, when the hands part
   * and rejoin (each settable from the playhead), how long the opening takes,
   * its style, the flash, spread and size, and whether the single canvas
   * stays in the middle (three across). Every change is an ordinary
   * item edit, so the preview shows it at once.
   */
  let {
    editor,
    item,
    locked,
  }: {
    editor: VideoEditorState;
    item: PostAnimationItem;
    locked: boolean;
  } = $props();

  /** Slider steps: a frame at 30 fps for times, hundredths for the rest. */
  const TIME_STEP = 1 / 30;
  const SHARE_STEP = 0.01;
  /** The longest opening the slider offers; the data allows more. */
  const SLIDER_MAX_MOVE_SECONDS = Math.min(3, POST_SPLIT_MAX_MOVE_SECONDS);

  const split = $derived(item.split ?? null);
  /** The playhead on the clip's own clock, kept inside the clip. */
  const playhead = $derived(
    Math.min(item.duration, Math.max(0, editor.previewSeconds - item.start))
  );
  /** The size a split without its own draws at in this clip's box. */
  const fittedScale = $derived.by(() => {
    const frame = postOutputSize(postCanvasOf(editor.project));
    return splitFitScale(
      item.box.width * frame.width,
      item.box.height * frame.height,
      tkaEditorOf(editor)?.sequence?.gridMode
    );
  });
  const seconds = (value: number) => `${value.toFixed(2)} s`;
  const percent = (value: number) => `${Math.round(value * 100)}%`;

  function commit(next: PostAnimationSplit | null, field: string): void {
    if (locked) return;
    const id = item.id;
    editor.editSetting(`${id}:split:${field}`, (project, ctx) =>
      updateItem(project, id, { split: next }, ctx)
    );
  }
  function patch(change: Partial<PostAnimationSplit>, field: string): void {
    if (!split) return;
    commit({ ...split, ...change }, field);
  }
  /**
   * Three across writes its own layout, since the two-apart sizes do not
   * fit three in a row; going back to two apart drops it for the fitted
   * defaults.
   */
  function withLayout(
    current: PostAnimationSplit,
    three: boolean
  ): PostAnimationSplit {
    const {
      three: _three,
      middle: _middle,
      scale: _scale,
      spread: _spread,
      ...rest
    } = current;
    return three
      ? { ...rest, three: true, ...POST_SPLIT_THREE_DEFAULTS }
      : rest;
  }
  function withoutClose(current: PostAnimationSplit): PostAnimationSplit {
    const { closeAt: _at, closeSeconds: _seconds, ...rest } = current;
    return rest;
  }

  const STYLE_LABEL: Record<PostSplitStyle, () => string> = {
    glide: () => t("post_editor_split_glide"),
    spring: () => t("post_editor_split_spring"),
    peel: () => t("post_editor_split_peel"),
    echo: () => t("post_editor_split_echo"),
  };
</script>

<p class="hint">
  {item.part?.hand
    ? t("post_editor_split_ignored")
    : t("post_editor_split_hands_hint")}
</p>
<SegmentedControl
  color="accent"
  options={[
    { value: "off", label: t("post_editor_split_off"), disabled: locked },
    { value: "on", label: t("post_editor_split_on"), disabled: locked },
  ]}
  value={split ? "on" : "off"}
  onchange={(value) =>
    commit(
      value === "on"
        ? (split ?? {
            openAt: playhead,
            openSeconds: POST_SPLIT_DEFAULT_OPEN_SECONDS,
          })
        : null,
      "on"
    )}
  ariaLabel={t("post_editor_tool_split_hands")}
/>
{#if split}
  <ValueSlider
    label={t("post_editor_split_opens_at")}
    value={split.openAt}
    min={0}
    max={item.duration}
    step={TIME_STEP}
    format={seconds}
    disabled={locked}
    onchange={(openAt) => patch({ openAt }, "openAt")}
  />
  <PanelButton
    disabled={locked}
    onclick={() => patch({ openAt: playhead }, "openAt")}
  >
    {t("post_editor_split_set_playhead")}
  </PanelButton>
  <ValueSlider
    label={t("post_editor_split_open_length")}
    value={split.openSeconds}
    min={POST_SPLIT_MIN_MOVE_SECONDS}
    max={SLIDER_MAX_MOVE_SECONDS}
    step={SHARE_STEP}
    format={seconds}
    disabled={locked}
    onchange={(openSeconds) => patch({ openSeconds }, "openSeconds")}
  />
  {#if split.closeAt !== undefined}
    <ValueSlider
      label={t("post_editor_split_closes_at")}
      value={split.closeAt}
      min={0}
      max={item.duration}
      step={TIME_STEP}
      format={seconds}
      disabled={locked}
      onchange={(closeAt) => patch({ closeAt }, "closeAt")}
    />
    <PanelButton
      disabled={locked}
      onclick={() => patch({ closeAt: playhead }, "closeAt")}
    >
      {t("post_editor_split_set_playhead")}
    </PanelButton>
    <ValueSlider
      label={t("post_editor_split_close_length")}
      value={split.closeSeconds ?? split.openSeconds}
      min={POST_SPLIT_MIN_MOVE_SECONDS}
      max={SLIDER_MAX_MOVE_SECONDS}
      step={SHARE_STEP}
      format={seconds}
      disabled={locked}
      onchange={(closeSeconds) => patch({ closeSeconds }, "closeSeconds")}
    />
    <PanelButton
      disabled={locked}
      onclick={() => commit(withoutClose(split), "closeAt")}
    >
      {t("post_editor_split_stays_apart")}
    </PanelButton>
  {:else}
    <PanelButton
      disabled={locked}
      onclick={() => patch({ closeAt: playhead }, "closeAt")}
    >
      {t("post_editor_split_close_here")}
    </PanelButton>
  {/if}
  <SegmentedControl
    color="accent"
    options={POST_SPLIT_STYLES.map((style) => ({
      value: style,
      label: STYLE_LABEL[style](),
      disabled: locked,
    }))}
    value={split.style ?? POST_SPLIT_DEFAULT_STYLE}
    onchange={(style) => patch({ style: style as PostSplitStyle }, "style")}
    ariaLabel={t("post_editor_split_style")}
  />
  <ValueSlider
    label={t("post_editor_split_flash")}
    value={split.flash ?? POST_SPLIT_DEFAULT_FLASH}
    min={0}
    max={POST_SPLIT_MAX_FLASH}
    step={SHARE_STEP}
    format={percent}
    disabled={locked || (split.style ?? POST_SPLIT_DEFAULT_STYLE) === "glide"}
    onchange={(flash) => patch({ flash }, "flash")}
  />
  <SegmentedControl
    color="accent"
    options={[
      {
        value: "two",
        label: t("post_editor_split_two_apart"),
        disabled: locked,
      },
      {
        value: "three",
        label: t("post_editor_split_three_across"),
        disabled: locked,
      },
    ]}
    value={split.three ? "three" : "two"}
    onchange={(value) => commit(withLayout(split, value === "three"), "three")}
    ariaLabel={t("post_editor_split_layout")}
  />
  {#if split.three}
    <ValueSlider
      label={t("post_editor_split_middle_size")}
      value={split.middle ?? POST_SPLIT_THREE_DEFAULTS.middle}
      min={POST_SPLIT_MIN_MIDDLE}
      max={POST_SPLIT_MAX_MIDDLE}
      step={SHARE_STEP}
      format={percent}
      disabled={locked}
      onchange={(middle) => patch({ middle }, "middle")}
    />
  {/if}
  <ValueSlider
    label={split.three
      ? t("post_editor_split_side_spread")
      : t("post_editor_split_spread")}
    value={splitSpreadOf(split)}
    min={0}
    max={POST_SPLIT_MAX_SPREAD}
    step={SHARE_STEP}
    format={percent}
    disabled={locked}
    onchange={(spread) => patch({ spread }, "spread")}
  />
  <ValueSlider
    label={split.three
      ? t("post_editor_split_side_size")
      : t("post_editor_split_size")}
    value={split.scale ??
      (split.three ? POST_SPLIT_THREE_DEFAULTS.scale : fittedScale)}
    min={POST_SPLIT_MIN_SCALE}
    max={POST_SPLIT_MAX_SCALE}
    step={SHARE_STEP}
    format={percent}
    disabled={locked}
    onchange={(scale) => patch({ scale }, "scale")}
  />
{/if}

<style>
  .hint {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }
</style>
