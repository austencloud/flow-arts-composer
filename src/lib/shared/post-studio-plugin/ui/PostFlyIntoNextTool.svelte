<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { VideoEditorState } from "@austencloud/video-editor";
  import type { PostItem } from "@austencloud/video-editor/core";
  import {
    FLY_DEFAULT_SECONDS,
    FLY_MAX_SECONDS,
    FLY_MIN_SECONDS,
    canFlyIntoNext,
    flyIntoNext,
  } from "#lib/shared/media-composition/domain/post-flash-join-edits.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";

  /**
   * Fly into next clip: the clip dissolves into the clip after it on its
   * lane while both ride one box path, from this clip's box to the next
   * one's. The length sets the cross-fade and the flight together. A clip
   * already joined starts from its own cross-fade's length.
   */
  let {
    editor,
    item,
    locked,
  }: { editor: VideoEditorState; item: PostItem; locked: boolean } = $props();

  const able = $derived(canFlyIntoNext(editor.project, item.id));
  const joinedSeconds = $derived(item.transitionOut?.duration ?? null);
  /** A length the author picked here, per clip; else the join's own or the default. */
  let picked = $state<{ id: string; seconds: number } | null>(null);
  const seconds = $derived(
    picked?.id === item.id
      ? picked.seconds
      : (joinedSeconds ?? FLY_DEFAULT_SECONDS)
  );
  const secondsText = (value: number) => `${value.toFixed(2)} s`;

  function fly(): void {
    if (locked || !able) return;
    const id = item.id;
    const length = seconds;
    editor.edit((project, ctx) => flyIntoNext(project, id, length, ctx));
  }
</script>

<div class="fly">
  <ValueSlider
    label={t("post_editor_fly_length")}
    value={seconds}
    min={FLY_MIN_SECONDS}
    max={FLY_MAX_SECONDS}
    step={0.01}
    format={secondsText}
    disabled={locked || !able}
    onchange={(value) => (picked = { id: item.id, seconds: value })}
  />
  <PanelButton disabled={locked || !able} onclick={fly}>
    {joinedSeconds === null
      ? t("post_editor_fly_run")
      : t("post_editor_fly_again")}
  </PanelButton>
  <p class="hint">
    {able ? t("post_editor_fly_hint") : t("post_editor_fly_unavailable")}
  </p>
</div>

<style>
  .fly {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .hint {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }
</style>
