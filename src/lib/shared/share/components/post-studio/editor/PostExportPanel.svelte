<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { formatPostClock } from "../builder/post-builder-format";

  /**
   * The finished file: its sound, what still needs doing, the render and
   * what to do with the result.
   */
  interface Props {
    editor: PostEditorState;
    canRender: boolean;
    exporting: boolean;
    exportPercent: number;
    exportedUrl: string | null;
    exportFilename: string;
    exportError: string;
    onRender: () => void;
    onCancel: () => void;
    onTapBeats: (takeId: string) => void;
    onSharePost?: () => void;
  }

  let {
    editor,
    canRender,
    exporting,
    exportPercent,
    exportedUrl,
    exportFilename,
    exportError,
    onRender,
    onCancel,
    onTapBeats,
    onSharePost,
  }: Props = $props();

  const output = $derived(editor.compiled?.preset.output ?? null);
  /** The rendered file's length, not the timeline's: a hidden track past the
   * end would make `editor.durationSeconds` show a longer time than the
   * export actually produces. */
  const exportDurationSeconds = $derived(editor.compiled?.durationSeconds ?? 0);

  /** Takes whose beats are not checked yet, and takes with no file. */
  const todo = $derived.by(() => {
    const items: { key: string; text: string; takeId: string | null }[] = [];
    for (const take of editor.takesInUse) {
      if (!editor.mediaUrl(take.id)) {
        items.push({
          key: `${take.id}:file`,
          text: `${t("share_studio_pick_take_again")} ${take.label}`,
          takeId: null,
        });
        continue;
      }
      const status = editor.timingStatus(take.id);
      if (status !== "confirmed") {
        items.push({
          key: take.id,
          text:
            status === "untapped"
              ? `${t("share_studio_map_timing_for")} ${take.label}`
              : `${t("share_studio_check_timing_for")} ${take.label}`,
          takeId: take.id,
        });
      }
    }
    return items;
  });
</script>

<div class="export">
  {#if output && exportDurationSeconds > 0}
    <p class="facts">
      {formatPostClock(exportDurationSeconds)} · {output.width}×{output.height}
      · {output.frameRate} fps
    </p>
  {/if}

  <div class="group">
    <h4>{t("share_studio_sound")}</h4>
    <SegmentedControl
      options={[
        { value: "takes", label: t("share_studio_takes_sound") },
        { value: "silent", label: t("share_studio_silent") },
      ]}
      value={editor.project.audio}
      onchange={editor.setAudio}
      size="sm"
      ariaLabel={t("share_studio_sound")}
    />
    <p class="help">
      {editor.project.audio === "takes"
        ? t("post_editor_takes_sound_hint")
        : t("share_studio_silent_hint")}
    </p>
  </div>

  {#if todo.length > 0}
    <div class="group">
      <h4>{t("share_studio_before_render")}</h4>
      <ul class="todo">
        {#each todo as item (item.key)}
          <li>
            {#if item.takeId}
              {@const takeId = item.takeId}
              <button type="button" class="link" onclick={() => onTapBeats(takeId)}>
                {item.text}
              </button>
            {:else}
              <span class="warn">{item.text}</span>
            {/if}
          </li>
        {/each}
      </ul>
      <p class="help">{t("share_studio_unchecked_timing_hint")}</p>
    </div>
  {/if}

  <div class="group">
    {#if exporting}
      <div
        class="progress"
        role="progressbar"
        aria-label={t("share_studio_rendering")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={exportPercent}
      >
        <span style:width="{exportPercent}%"></span>
      </div>
      <div class="row">
        <PanelButton onclick={onCancel}>{t("share_studio_cancel")}</PanelButton>
      </div>
    {:else}
      <PanelButton
        variant="primary"
        onclick={onRender}
        disabled={!canRender}
        fullWidth
      >
        <i class="fa-solid fa-file-export" aria-hidden="true"></i>
        {exportedUrl
          ? t("share_studio_render_again")
          : t("share_studio_render_post")}
      </PanelButton>
      <!-- The render paints each frame on an animation frame, and a browser
           stops those in a hidden tab. -->
      <p class="help">{t("share_studio_keep_tab_front")}</p>
    {/if}
    {#if exportError}
      <p class="error" role="alert">{exportError}</p>
    {/if}
  </div>

  {#if exportedUrl && !exporting}
    <div class="group">
      <h4>{t("share_studio_done")}</h4>
      <div class="row">
        <a class="download" href={exportedUrl} download={exportFilename}>
          <i class="fa-solid fa-download" aria-hidden="true"></i>
          {t("share_download")}
          {exportFilename}
        </a>
        {#if onSharePost}
          <PanelButton onclick={onSharePost}>
            <i class="fa-solid fa-share" aria-hidden="true"></i>
            {t("share_title")}
          </PanelButton>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .export,
  .group {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .export {
    gap: 1rem;
  }

  h4 {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
  }

  .facts {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 0.9375rem;
    font-variant-numeric: tabular-nums;
  }

  .help,
  .warn {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .warn {
    color: var(--semantic-warning, #fbbf24);
  }

  .error {
    margin: 0;
    color: var(--semantic-error, #f87171);
    font-size: 0.875rem;
  }

  .todo {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .link {
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.75rem;
    border: 1px solid var(--semantic-warning, #fbbf24);
    border-radius: 0.5rem;
    color: var(--theme-text, #fff);
    background: transparent;
    font: inherit;
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
  }

  .link:focus-visible,
  .download:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 2px;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .progress {
    height: 0.5rem;
    overflow: hidden;
    border-radius: 999px;
    background: var(--theme-card-bg);
  }

  .progress span {
    display: block;
    height: 100%;
    background: var(--theme-accent, #d4813a);
  }

  .download {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0 1rem;
    border: 1px solid var(--theme-accent, #d4813a);
    border-radius: 0.625rem;
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
    text-decoration: none;
    overflow-wrap: anywhere;
  }
</style>
