<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { updateItem } from "@austencloud/video-editor/core";
  import type { VideoEditorState } from "@austencloud/video-editor";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";
  import type { PostAnimationItem } from "#lib/shared/post-studio-plugin/index.js";
  import {
    POST_BAR_FILL_MIN_LENGTH,
    type PostBarFill,
  } from "#lib/shared/media-composition/domain/post-bar-fill.js";

  /**
   * The animation clip's "Bar fill" panel: the progress bar follows each
   * pass of the sequence, or fills once between two times on the clip's own
   * clock, each settable from the playhead. Turning it on takes the lifted
   * panel's times when the clip has them (the bar is then full as the panel
   * leaves), else the clip's whole length.
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

  /** A frame at 30 fps. */
  const TIME_STEP = 1 / 30;

  const fill = $derived(item.barFill ?? null);
  /** The playhead on the clip's own clock, kept inside the clip. */
  const playhead = $derived(
    Math.min(item.duration, Math.max(0, editor.previewSeconds - item.start))
  );
  const seconds = (value: number) => `${value.toFixed(2)} s`;

  function commit(next: PostBarFill | null, field: string): void {
    if (locked) return;
    const id = item.id;
    editor.editSetting(`${id}:barFill:${field}`, (project, ctx) =>
      updateItem(project, id, { barFill: next }, ctx)
    );
  }
  /** The fill the panel writes when it is turned on. */
  function startingFill(): PostBarFill {
    const lift = item.panelLift;
    const emptyAt = lift?.inAt ?? 0;
    const fullAt = lift?.outAt ?? item.duration;
    return fullAt - emptyAt >= POST_BAR_FILL_MIN_LENGTH
      ? { emptyAt, fullAt }
      : {
          emptyAt: 0,
          fullAt: Math.max(item.duration, POST_BAR_FILL_MIN_LENGTH),
        };
  }
  // Each end stays a frame clear of the other, so every edit is a valid fill.
  function setEmpty(emptyAt: number): void {
    if (!fill) return;
    commit(
      {
        ...fill,
        emptyAt: Math.min(emptyAt, fill.fullAt - POST_BAR_FILL_MIN_LENGTH),
      },
      "emptyAt"
    );
  }
  function setFull(fullAt: number): void {
    if (!fill) return;
    commit(
      {
        ...fill,
        fullAt: Math.max(fullAt, fill.emptyAt + POST_BAR_FILL_MIN_LENGTH),
      },
      "fullAt"
    );
  }
</script>

<p class="hint">{t("post_editor_bar_fill_hint")}</p>
<SegmentedControl
  color="accent"
  options={[
    { value: "pass", label: t("post_editor_bar_fill_pass"), disabled: locked },
    { value: "once", label: t("post_editor_bar_fill_once"), disabled: locked },
  ]}
  value={fill ? "once" : "pass"}
  onchange={(value) =>
    commit(value === "once" ? (fill ?? startingFill()) : null, "on")}
  ariaLabel={t("post_editor_tool_bar_fill")}
/>
{#if fill}
  <ValueSlider
    label={t("post_editor_bar_fill_empty_at")}
    value={fill.emptyAt}
    min={Math.min(0, fill.emptyAt)}
    max={Math.max(item.duration, fill.fullAt)}
    step={TIME_STEP}
    format={seconds}
    disabled={locked}
    onchange={setEmpty}
  />
  <PanelButton disabled={locked} onclick={() => setEmpty(playhead)}>
    {t("post_editor_lift_set_playhead")}
  </PanelButton>
  <ValueSlider
    label={t("post_editor_bar_fill_full_at")}
    value={fill.fullAt}
    min={Math.min(0, fill.emptyAt)}
    max={Math.max(item.duration, fill.fullAt)}
    step={TIME_STEP}
    format={seconds}
    disabled={locked}
    onchange={setFull}
  />
  <PanelButton disabled={locked} onclick={() => setFull(playhead)}>
    {t("post_editor_lift_set_playhead")}
  </PanelButton>
{/if}

<style>
  .hint {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }
</style>
