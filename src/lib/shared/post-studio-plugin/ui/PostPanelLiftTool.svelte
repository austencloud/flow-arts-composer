<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { updateItem } from "@austencloud/video-editor/core";
  import type { VideoEditorState } from "@austencloud/video-editor";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";
  import type { PostAnimationItem } from "#lib/shared/post-studio-plugin/index.js";
  import {
    POST_LIFT_DEFAULTS,
    POST_LIFT_DEFAULT_BAR_EDGE,
    POST_LIFT_DEFAULT_CANVAS_SCALE,
    POST_LIFT_DEFAULT_CANVAS_Y,
    POST_LIFT_DEFAULT_IN_SECONDS,
    POST_LIFT_DEFAULT_OUT_SECONDS,
    POST_LIFT_DEFAULT_STEP_INSET_X,
    POST_LIFT_DEFAULT_STEP_INSET_Y,
    POST_LIFT_MAX_CANVAS_SCALE,
    POST_LIFT_MAX_CANVAS_Y,
    POST_LIFT_MAX_MOVE_SECONDS,
    POST_LIFT_MIN_CANVAS_SCALE,
    POST_LIFT_MIN_CANVAS_Y,
    POST_LIFT_MIN_MOVE_SECONDS,
    type PostLiftBarEdge,
    type PostPanelLift,
  } from "#lib/shared/media-composition/domain/post-panel-lift.js";

  /**
   * The animation clip's "Lift panel" panel: on or off, where the canvas sits
   * and how large, the step number's corner inset, the strip's edge, and when
   * the lift is fully in and starts going back (each settable from the
   * playhead), with each move's length. Every change is an ordinary item
   * edit, so the preview shows it at once.
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

  /** Slider steps: a frame at 30 fps for times, a thousandth for shares. */
  const TIME_STEP = 1 / 30;
  const SHARE_STEP = 0.001;
  const MOVE_STEP = 0.01;
  /** The longest move and widest inset the sliders offer; the data allows more. */
  const SLIDER_MAX_MOVE_SECONDS = Math.min(3, POST_LIFT_MAX_MOVE_SECONDS);
  const SLIDER_MAX_STEP_INSET = 0.25;

  const lift = $derived(item.panelLift ?? null);
  /** The playhead on the clip's own clock, kept inside the clip. */
  const playhead = $derived(
    Math.min(item.duration, Math.max(0, editor.previewSeconds - item.start))
  );
  const seconds = (value: number) => `${value.toFixed(2)} s`;
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

  function commit(next: PostPanelLift | null, field: string): void {
    if (locked) return;
    const id = item.id;
    editor.editSetting(`${id}:panelLift:${field}`, (project, ctx) =>
      updateItem(project, id, { panelLift: next }, ctx)
    );
  }
  function patch(change: Partial<PostPanelLift>, field: string): void {
    if (!lift) return;
    commit({ ...lift, ...change }, field);
  }
  function without(
    current: PostPanelLift,
    keys: readonly (keyof PostPanelLift)[]
  ): PostPanelLift {
    const next = { ...current };
    for (const key of keys) delete next[key];
    return next;
  }
</script>

<p class="hint">{t("post_editor_lift_hint")}</p>
<SegmentedControl
  color="accent"
  options={[
    { value: "off", label: t("post_editor_lift_off"), disabled: locked },
    { value: "on", label: t("post_editor_lift_on"), disabled: locked },
  ]}
  value={lift ? "on" : "off"}
  onchange={(value) =>
    commit(value === "on" ? (lift ?? { ...POST_LIFT_DEFAULTS }) : null, "on")}
  ariaLabel={t("post_editor_tool_panel_lift")}
/>
{#if lift}
  <ValueSlider
    label={t("post_editor_lift_height")}
    value={lift.canvasY ?? POST_LIFT_DEFAULT_CANVAS_Y}
    min={POST_LIFT_MIN_CANVAS_Y}
    max={POST_LIFT_MAX_CANVAS_Y}
    step={SHARE_STEP}
    format={percent}
    disabled={locked}
    onchange={(canvasY) => patch({ canvasY }, "canvasY")}
  />
  <ValueSlider
    label={t("post_editor_lift_size")}
    value={lift.canvasScale ?? POST_LIFT_DEFAULT_CANVAS_SCALE}
    min={POST_LIFT_MIN_CANVAS_SCALE}
    max={POST_LIFT_MAX_CANVAS_SCALE}
    step={SHARE_STEP}
    format={percent}
    disabled={locked}
    onchange={(canvasScale) => patch({ canvasScale }, "canvasScale")}
  />
  <ValueSlider
    label={t("post_editor_lift_step_across")}
    value={lift.stepInsetX ?? POST_LIFT_DEFAULT_STEP_INSET_X}
    min={0}
    max={SLIDER_MAX_STEP_INSET}
    step={SHARE_STEP}
    format={percent}
    disabled={locked}
    onchange={(stepInsetX) => patch({ stepInsetX }, "stepInsetX")}
  />
  <ValueSlider
    label={t("post_editor_lift_step_down")}
    value={lift.stepInsetY ?? POST_LIFT_DEFAULT_STEP_INSET_Y}
    min={0}
    max={SLIDER_MAX_STEP_INSET}
    step={SHARE_STEP}
    format={percent}
    disabled={locked}
    onchange={(stepInsetY) => patch({ stepInsetY }, "stepInsetY")}
  />
  <SegmentedControl
    color="accent"
    options={[
      {
        value: "top",
        label: t("post_editor_lift_bar_top"),
        disabled: locked,
      },
      {
        value: "bottom",
        label: t("post_editor_lift_bar_bottom"),
        disabled: locked,
      },
    ]}
    value={lift.barEdge ?? POST_LIFT_DEFAULT_BAR_EDGE}
    onchange={(edge) =>
      patch({ barEdge: edge as PostLiftBarEdge }, "barEdge")}
    ariaLabel={t("post_editor_lift_bar_edge")}
  />
  {#if lift.inAt !== undefined}
    <ValueSlider
      label={t("post_editor_lift_in_at")}
      value={lift.inAt}
      min={0}
      max={item.duration}
      step={TIME_STEP}
      format={seconds}
      disabled={locked}
      onchange={(inAt) => patch({ inAt }, "inAt")}
    />
    <PanelButton
      disabled={locked}
      onclick={() => patch({ inAt: playhead }, "inAt")}
    >
      {t("post_editor_lift_set_playhead")}
    </PanelButton>
    <ValueSlider
      label={t("post_editor_lift_in_length")}
      value={lift.inSeconds ?? POST_LIFT_DEFAULT_IN_SECONDS}
      min={POST_LIFT_MIN_MOVE_SECONDS}
      max={SLIDER_MAX_MOVE_SECONDS}
      step={MOVE_STEP}
      format={seconds}
      disabled={locked}
      onchange={(inSeconds) => patch({ inSeconds }, "inSeconds")}
    />
    <PanelButton
      disabled={locked}
      onclick={() => commit(without(lift, ["inAt", "inSeconds"]), "inAt")}
    >
      {t("post_editor_lift_from_start")}
    </PanelButton>
  {:else}
    <PanelButton
      disabled={locked}
      onclick={() =>
        patch(
          { inAt: playhead, inSeconds: POST_LIFT_DEFAULT_IN_SECONDS },
          "inAt"
        )}
    >
      {t("post_editor_lift_in_here")}
    </PanelButton>
  {/if}
  {#if lift.outAt !== undefined}
    <ValueSlider
      label={t("post_editor_lift_out_at")}
      value={lift.outAt}
      min={0}
      max={item.duration}
      step={TIME_STEP}
      format={seconds}
      disabled={locked}
      onchange={(outAt) => patch({ outAt }, "outAt")}
    />
    <PanelButton
      disabled={locked}
      onclick={() => patch({ outAt: playhead }, "outAt")}
    >
      {t("post_editor_lift_set_playhead")}
    </PanelButton>
    <ValueSlider
      label={t("post_editor_lift_out_length")}
      value={lift.outSeconds ?? POST_LIFT_DEFAULT_OUT_SECONDS}
      min={POST_LIFT_MIN_MOVE_SECONDS}
      max={SLIDER_MAX_MOVE_SECONDS}
      step={MOVE_STEP}
      format={seconds}
      disabled={locked}
      onchange={(outSeconds) => patch({ outSeconds }, "outSeconds")}
    />
    <PanelButton
      disabled={locked}
      onclick={() => commit(without(lift, ["outAt", "outSeconds"]), "outAt")}
    >
      {t("post_editor_lift_to_end")}
    </PanelButton>
  {:else}
    <PanelButton
      disabled={locked}
      onclick={() =>
        patch(
          { outAt: playhead, outSeconds: POST_LIFT_DEFAULT_OUT_SECONDS },
          "outAt"
        )}
    >
      {t("post_editor_lift_out_here")}
    </PanelButton>
  {/if}
{/if}

<style>
  .hint {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }
</style>
