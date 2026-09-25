<script lang="ts">
  import type { PostBuilderState } from "$lib/shared/media-composition/state/post-builder-state.svelte";
  import {
    CAPTION_STARTERS,
    type Caption,
  } from "$lib/shared/media-composition/domain/post-plan";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { formatPostClock, parseClock } from "./post-builder-format";

  /**
   * Words over the video. A caption belongs to an act and keeps its place
   * inside it when the act is trimmed or slowed; new ones start at the
   * playhead and run three seconds.
   */
  let { builder }: { builder: PostBuilderState } = $props();

  let draft = $state("");
  let focusId = $state<string | null>(null);

  const captions = $derived(
    [...builder.plan.captions].sort((left, right) => {
      const leftAct = actStart(left.actId);
      const rightAct = actStart(right.actId);
      return leftAct + left.startSeconds - (rightAct + right.startSeconds);
    })
  );
  const compiledActs = $derived(builder.compiled?.acts ?? []);

  function actStart(actId: string): number {
    return (
      compiledActs.find((act) => act.actId === actId)?.startSeconds ?? Infinity
    );
  }

  function actLength(actId: string): number {
    const act = compiledActs.find((entry) => entry.actId === actId);
    return act ? act.endSeconds - act.startSeconds : 0;
  }

  function actLabel(actId: string): string {
    return builder.plan.acts.find((act) => act.id === actId)?.label ?? "Act";
  }

  function add(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = builder.addCaptionAtPlayhead(trimmed);
    if (id) {
      draft = "";
      focusId = id;
    }
  }

  function seekTo(caption: Caption): void {
    const start = actStart(caption.actId);
    if (!Number.isFinite(start)) return;
    builder.pause();
    builder.seek(start + caption.startSeconds + 0.05);
  }

  function setTime(
    caption: Caption,
    edge: "start" | "end",
    text: string
  ): void {
    const seconds = parseClock(text);
    if (seconds === null) return;
    const length = actLength(caption.actId);
    builder.updateCaption(caption.id, (current) => {
      if (edge === "start") {
        const start = Math.max(0, Math.min(seconds, current.endSeconds - 0.1));
        return { ...current, startSeconds: start };
      }
      const end = Math.min(
        length > 0 ? length : seconds,
        Math.max(seconds, current.startSeconds + 0.1)
      );
      return { ...current, endSeconds: end };
    });
  }

  function focusOnMount(node: HTMLInputElement, id: string) {
    if (focusId === id) {
      node.focus();
      node.select();
      focusId = null;
    }
  }
</script>

<div class="captions">
  <div class="group">
    <h3>Add at the playhead</h3>
    <div class="starters">
      {#each CAPTION_STARTERS as starter (starter)}
        <button type="button" class="chip" onclick={() => add(starter)}>
          {starter}
        </button>
      {/each}
    </div>
    <form
      class="row"
      onsubmit={(event) => {
        event.preventDefault();
        add(draft);
      }}
    >
      <input
        class="field grow"
        bind:value={draft}
        maxlength="140"
        placeholder="Your own words"
        aria-label="Caption text"
      />
      <PanelButton type="submit" disabled={!draft.trim()}>Add</PanelButton>
    </form>
  </div>

  {#if captions.length === 0}
    <p class="help">
      No captions yet. Move the playhead to where one should appear, then pick a
      starter or type your own.
    </p>
  {:else}
    <ul class="list">
      {#each captions as caption (caption.id)}
        <li class="caption">
          <div class="row">
            <input
              class="field grow"
              value={caption.text}
              maxlength="140"
              aria-label="Caption text"
              use:focusOnMount={caption.id}
              onchange={(event) => {
                const text = event.currentTarget.value;
                builder.updateCaption(caption.id, (current) => ({
                  ...current,
                  text,
                }));
              }}
            />
            <button
              type="button"
              class="icon"
              onclick={() => builder.removeCaption(caption.id)}
              aria-label="Remove caption {caption.text}"
            >
              <i class="fa-solid fa-trash" aria-hidden="true"></i>
            </button>
          </div>
          <div class="row">
            <button type="button" class="jump" onclick={() => seekTo(caption)}>
              {actLabel(caption.actId)}
            </button>
            <label class="time">
              <span>from</span>
              <input
                class="field"
                value={formatPostClock(caption.startSeconds)}
                inputmode="decimal"
                aria-label="Caption starts, seconds into the act"
                onchange={(event) =>
                  setTime(caption, "start", event.currentTarget.value)}
              />
            </label>
            <label class="time">
              <span>to</span>
              <input
                class="field"
                value={formatPostClock(caption.endSeconds)}
                inputmode="decimal"
                aria-label="Caption ends, seconds into the act"
                onchange={(event) =>
                  setTime(caption, "end", event.currentTarget.value)}
              />
            </label>
          </div>
          <div class="row">
            <SegmentedControl
              options={[
                { value: "top", label: "Top" },
                { value: "middle", label: "Middle" },
                { value: "bottom", label: "Bottom" },
              ]}
              value={caption.position}
              onchange={(position) =>
                builder.updateCaption(caption.id, (current) => ({
                  ...current,
                  position,
                }))}
              size="sm"
              density="compact"
              ariaLabel="Caption position"
            />
            <SegmentedControl
              options={[
                { value: "s", label: "S", ariaLabel: "Small" },
                { value: "m", label: "M", ariaLabel: "Medium" },
                { value: "l", label: "L", ariaLabel: "Large" },
              ]}
              value={caption.size}
              onchange={(size) =>
                builder.updateCaption(caption.id, (current) => ({
                  ...current,
                  size,
                }))}
              size="sm"
              density="compact"
              ariaLabel="Caption size"
            />
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .captions,
  .group {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }
  .captions {
    gap: 1rem;
  }
  h3 {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 0.9375rem;
  }
  .help {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }
  .starters,
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .chip {
    min-height: 2.75rem;
    padding: 0 0.875rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 999px;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .chip:focus-visible,
  .icon:focus-visible,
  .jump:focus-visible,
  .field:focus-visible {
    outline: 2px solid var(--theme-primary, currentColor);
    outline-offset: 1px;
  }
  .field {
    min-width: 0;
    min-height: 2.75rem;
    padding: 0 0.5rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.5rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    font: inherit;
    font-size: 0.875rem;
  }
  .grow {
    flex: 1 1 10rem;
  }
  .list {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .caption {
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.625rem;
    background: var(--theme-card-bg);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    flex: none;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.5rem;
    color: var(--theme-text-secondary, #aaa);
    background: transparent;
    cursor: pointer;
  }
  .jump {
    min-height: 2.75rem;
    padding: 0 0.625rem;
    border: 0;
    border-radius: 0.5rem;
    color: var(--theme-primary, #d4813a);
    background: transparent;
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .time {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
  }
  .time .field {
    width: 5.5rem;
    font-variant-numeric: tabular-nums;
  }
</style>
