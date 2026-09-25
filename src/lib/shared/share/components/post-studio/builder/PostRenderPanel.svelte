<script lang="ts">
  import type { PostBuilderState } from "$lib/shared/media-composition/state/post-builder-state.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { formatPostClock } from "./post-builder-format";

  /**
   * The finished file: its sound, what still needs doing, the render and
   * what to do with the result.
   */
  interface Props {
    builder: PostBuilderState;
    canRender: boolean;
    exporting: boolean;
    exportPercent: number;
    exportedUrl: string | null;
    exportFilename: string;
    exportError: string;
    onRender: () => void;
    onCancel: () => void;
    onSharePost?: () => void;
  }

  let {
    builder,
    canRender,
    exporting,
    exportPercent,
    exportedUrl,
    exportFilename,
    exportError,
    onRender,
    onCancel,
    onSharePost,
  }: Props = $props();

  const output = $derived(builder.compiled?.preset.output ?? null);

  const todo = $derived.by(() => {
    const items: { key: string; text: string; step: "takes" | "timing" }[] =
      [];
    if (builder.plan.takes.length === 0) {
      items.push({ key: "add", text: "Add a take", step: "takes" });
    }
    for (const take of builder.takesInUse) {
      if (!builder.mediaUrl(take.id)) {
        items.push({
          key: take.id,
          text: `Pick ${take.label} again`,
          step: "takes",
        });
        continue;
      }
      const status = builder.timingStatus(take.id);
      if (status !== "confirmed") {
        items.push({
          key: take.id,
          text:
            status === "untapped"
              ? `Map ${take.label}'s timing`
              : `Check ${take.label}'s timing`,
          step: "timing",
        });
      }
    }
    return items;
  });
</script>

<div class="render">
  {#if output && builder.durationSeconds > 0}
    <p class="facts">
      {formatPostClock(builder.durationSeconds)} · {output.width}×{output.height}
      ·
      {output.frameRate} fps
    </p>
  {/if}

  <div class="group">
    <h3>Sound</h3>
    <SegmentedControl
      options={[
        { value: "takes", label: "The takes' own sound" },
        { value: "silent", label: "Silent" },
      ]}
      value={builder.plan.audio}
      onchange={builder.setAudio}
      size="sm"
      ariaLabel="Sound"
    />
    <p class="help">
      {builder.plan.audio === "takes"
        ? "Full-speed acts keep their take's sound. Slowed acts are silent."
        : "No sound, for music added in the app you post from."}
    </p>
  </div>

  {#if todo.length > 0}
    <div class="group">
      <h3>Before you render</h3>
      <ul class="todo">
        {#each todo as item (item.key)}
          <li>
            <button
              type="button"
              class="link"
              onclick={() => (builder.step = item.step)}
            >
              {item.text}
            </button>
          </li>
        {/each}
      </ul>
      <p class="help">
        You can render anyway. Unchecked timing shows whatever the map says now.
      </p>
    </div>
  {/if}

  <div class="group">
    {#if exporting}
      <div
        class="progress"
        role="progressbar"
        aria-label="Rendering"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={exportPercent}
      >
        <span style:width="{exportPercent}%"></span>
      </div>
      <div class="row">
        <PanelButton onclick={onCancel}>Cancel</PanelButton>
      </div>
    {:else}
      <PanelButton
        variant="primary"
        onclick={onRender}
        disabled={!canRender}
        fullWidth
      >
        <i class="fa-solid fa-film" aria-hidden="true"></i>
        {exportedUrl ? "Render again" : "Render the post"}
      </PanelButton>
    {/if}
    {#if exportError}
      <p class="error" role="alert">{exportError}</p>
    {/if}
  </div>

  {#if exportedUrl && !exporting}
    <div class="group">
      <h3>Done</h3>
      <div class="row">
        <a class="download" href={exportedUrl} download={exportFilename}>
          <i class="fa-solid fa-download" aria-hidden="true"></i>
          Download {exportFilename}
        </a>
        {#if onSharePost}
          <PanelButton onclick={onSharePost}>
            <i class="fa-solid fa-share" aria-hidden="true"></i> Share
          </PanelButton>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .render,
  .group {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }
  .render {
    gap: 1rem;
  }
  h3 {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 0.9375rem;
  }
  .facts {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 0.9375rem;
    font-variant-numeric: tabular-nums;
  }
  .help {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
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
    min-height: 2.75rem;
    padding: 0;
    border: 0;
    color: var(--semantic-warning, #fbbf24);
    background: none;
    font: inherit;
    font-size: 0.875rem;
    text-align: left;
    text-decoration: underline;
    cursor: pointer;
  }
  .link:focus-visible,
  .download:focus-visible {
    outline: 2px solid var(--theme-primary, currentColor);
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
    background: var(--theme-primary, #d4813a);
  }
  .download {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    padding: 0 1rem;
    border: 1px solid var(--theme-primary, #d4813a);
    border-radius: 0.625rem;
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
    text-decoration: none;
    overflow-wrap: anywhere;
  }
</style>
