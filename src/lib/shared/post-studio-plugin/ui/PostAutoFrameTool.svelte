<script lang="ts">
  import { editItemKeyframes, type PostVideoItem } from "@austencloud/video-editor/core";
  import type { VideoEditorState } from "@austencloud/video-editor";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    AUTO_FRAME_EVEN_MOVES,
    autoFrameBoxes,
    autoFrameKeyTimes,
    canvasAspectOf,
    framingAt,
    propsCutShare,
    shownPart,
    solveAutoFrame,
  } from "#lib/shared/media-composition/domain/auto-frame.js";
  import {
    trackForAutoFrame,
    type AutoFrameTracking,
    type AutoFrameTrackPhase,
  } from "#lib/shared/media-composition/services/auto-frame-tracker.js";
  import { REELS_COVERED } from "./reels-preview.svelte";

  /**
   * Auto frame: finds the props in the clip's footage and writes one framing
   * key per move, as tight as it can while the staff ends stay in, the props
   * centred, the body centred with room while the props stay low, a bright
   * ceiling over a dark backdrop kept out of what a Reel shows, and the whole
   * body on the last key. The keys are ordinary ones: drag, delete or re-ease
   * them like hand-made keys. One undo takes the whole set back.
   */
  interface Props {
    editor: VideoEditorState;
    item: PostVideoItem;
    takeKey: string | null;
    mediaUrl: string | null;
    /** The take's beat landings in take seconds, or null when it has none. */
    landings: readonly number[] | null;
    locked: boolean;
  }

  let { editor, item, takeKey, mediaUrl, landings, locked }: Props = $props();

  type Status = "idle" | "tracking" | "confirm" | "done" | "failed";
  let status = $state<Status>("idle");
  let phase = $state<AutoFrameTrackPhase>("model");
  let progress = $state(0);
  let message = $state("");
  let tracking = $state.raw<AutoFrameTracking | null>(null);
  /** The backdrop line used: the found one, one Austen set, or none. */
  let backdropMode = $state<"found" | "set" | "off">("found");
  let backdropSet = $state(0.2);
  let summary = $state("");
  let controller: AbortController | null = null;

  const existingKeys = $derived(
    (item.keyframes?.sourceGeometry?.length ?? 0) + (item.keyframes?.framing?.length ?? 0)
  );
  const keyPlan = $derived(
    autoFrameKeyTimes(item.sourceIn, item.sourceOut, landings, AUTO_FRAME_EVEN_MOVES)
  );
  const backdropLine = $derived(
    backdropMode === "off"
      ? null
      : backdropMode === "set"
        ? backdropSet
        : (tracking?.backdropLine ?? null)
  );
  const percent = $derived(Math.round(progress * 100));
  const phaseLabel: Record<AutoFrameTrackPhase, string> = {
    model: "Loading the body finder",
    stage: "Reading the empty stage",
    track: "Following the props",
  };

  async function run(): Promise<void> {
    if (!takeKey || !mediaUrl || locked) return;
    controller?.abort();
    controller = new AbortController();
    status = "tracking";
    progress = 0;
    message = "";
    const times = keyPlan.times;
    try {
      tracking = await trackForAutoFrame(takeKey, mediaUrl, {
        start: Math.min(times[0]!, item.sourceIn),
        end: Math.max(times[times.length - 1]!, item.sourceOut),
        signal: controller.signal,
        onProgress: (p, fraction) => {
          phase = p;
          progress = fraction;
        },
      });
      if (!tracking.props.some(Boolean)) {
        status = "failed";
        message = "No performer was found in this clip.";
        return;
      }
      if (backdropMode === "found" && tracking.backdropLine !== null) backdropSet = tracking.backdropLine;
      if (existingKeys > 0) status = "confirm";
      else apply();
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        status = "idle";
        return;
      }
      status = "failed";
      message = error instanceof Error ? error.message : String(error);
    } finally {
      controller = null;
    }
  }

  function stop(): void {
    controller?.abort();
  }

  /** Solves with the tracking in hand and writes the keys as one undoable edit. */
  function apply(): void {
    if (!tracking || locked) return;
    const times = keyPlan.times;
    const boxes = autoFrameBoxes(tracking.times, tracking.props, tracking.poses, times[times.length - 1]!);
    const canvasAspect = canvasAspectOf(editor.project.canvas);
    const shape = canvasAspect / tracking.footageAspect;
    // A 9:16 post goes up as a Reel, whose header and caption cover its top and bottom.
    const reel = Math.abs(canvasAspect - 9 / 16) < 0.01;
    const { keys } = solveAutoFrame({
      times: tracking.times,
      mustStay: boxes.mustStay,
      centreOn: boxes.centreOn,
      bodyOn: boxes.bodyOn,
      covered: reel ? { top: REELS_COVERED.top, bottom: REELS_COVERED.bottom } : undefined,
      keyTimes: times,
      shape,
      backdropLine,
      finalBox: boxes.finalBox,
      flip: item.flip,
    });
    const first = keys[0]!.value;
    editor.edit((project, ctx) =>
      editItemKeyframes(
        project,
        item.id,
        (it) => {
          if (it.kind !== "video") return it;
          const { framing: _framing, ...rest } = it.keyframes ?? {};
          return {
            ...it,
            zoom: 1,
            panX: 0,
            panY: 0,
            rotation: 0,
            sourceGeometry: first,
            keyframes: { ...rest, sourceGeometry: keys },
          };
        },
        ctx
      )
    );
    status = "done";
    const from = keyPlan.from === "landings" ? "one per beat landing" : `${AUTO_FRAME_EVEN_MOVES} even moves`;
    // Judged on the clip's own range, along the eased path the renderer plays.
    const canvas = canvasAspectOf(editor.project.canvas);
    const inClip = tracking.times.flatMap((t, i) =>
      t >= item.sourceIn && t <= item.sourceOut ? [i] : []
    );
    const cut = propsCutShare(
      inClip.map((i) => tracking!.times[i]!),
      inClip.map((i) => tracking!.props[i] ?? null),
      (t) => shownPart(framingAt(keys, t), canvas, tracking!.footageAspect, item.flip)
    );
    const tight = cut > 0.01 ? ` The props reach past the edge on ${Math.round(cut * 100)}% of the clip.` : "";
    summary = `${keys.length} keys, ${from}.${tight}`;
  }
</script>

<div class="auto-frame">
  {#if status === "tracking"}
    <div class="finding">
      <div class="finding-head">
        <p class="line" aria-live="polite">{phaseLabel[phase]}, {percent}%</p>
        <PanelButton onclick={stop}>Stop</PanelButton>
      </div>
      <div
        class="bar"
        role="progressbar"
        aria-label="Auto frame"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div class="fill" style:width={`${percent}%`}></div>
      </div>
    </div>
  {:else if status === "confirm"}
    <p class="hint" role="alert">
      This clip already has {existingKeys} framing {existingKeys === 1 ? "key" : "keys"}. Auto frame
      replaces them, and sets zoom, pan and turn back to none.
    </p>
    <div class="actions">
      <PanelButton onclick={apply} disabled={locked}>Replace them</PanelButton>
      <PanelButton onclick={() => (status = "idle")}>Keep mine</PanelButton>
    </div>
  {:else}
    <p class="hint">
      {#if status === "done"}
        {summary} Drag a key to change it, or undo to take them all back.
      {:else if status === "failed"}
        {message}
      {:else}
        Frames the clip as tight as it can while the staff ends stay in, with you
        centred while the props stay low: one key per
        {keyPlan.from === "landings" ? "beat landing" : "move"}, the whole body on the last.
      {/if}
    </p>
    {#if mediaUrl}
      <div class="actions">
        <PanelButton onclick={run} disabled={locked || !takeKey}>
          <i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i>
          {status === "done" ? "Auto frame again" : "Auto frame"}
        </PanelButton>
      </div>
    {:else}
      <p class="hint">{t("share_studio_repick_local")}</p>
    {/if}
  {/if}

  {#if tracking && status !== "tracking"}
    <fieldset class="backdrop">
      <legend class="readout-name">Ceiling line</legend>
      <div class="actions">
        <PanelButton ariaPressed={backdropMode === "found"} onclick={() => (backdropMode = "found")}>
          {tracking.backdropLine === null ? "None found" : "Found"}
        </PanelButton>
        <PanelButton ariaPressed={backdropMode === "set"} onclick={() => (backdropMode = "set")}>
          Set
        </PanelButton>
        <PanelButton ariaPressed={backdropMode === "off"} onclick={() => (backdropMode = "off")}>
          Off
        </PanelButton>
      </div>
      {#if backdropMode === "set"}
        <label class="slider">
          <span>Keep the top below {Math.round(backdropSet * 100)}% down the footage</span>
          <input type="range" min="0" max="0.6" step="0.005" bind:value={backdropSet} />
        </label>
      {/if}
      {#if status === "done"}
        <div class="actions">
          <PanelButton onclick={() => (existingKeys > 0 ? (status = "confirm") : apply())} disabled={locked}>
            Frame again with this line
          </PanelButton>
        </div>
      {/if}
    </fieldset>
  {/if}
</div>

<style>
  .auto-frame {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .hint,
  .line,
  .slider {
    margin: 0;
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }

  .hint {
    color: var(--theme-text-secondary, #aaa);
  }

  .line,
  .slider {
    color: var(--theme-text, #fff);
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .finding,
  .backdrop,
  .slider {
    display: grid;
    gap: 0.625rem;
  }

  .backdrop {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .readout-name {
    padding: 0;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .finding-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 0.75rem;
  }

  .bar {
    height: 0.375rem;
    overflow: hidden;
    border-radius: 999px;
    background: var(--theme-stroke, #484755);
  }

  .fill {
    height: 100%;
    border-radius: inherit;
    background: var(--theme-accent, #60a5fa);
    transition: width var(--duration-normal) var(--ease-standard-out);
  }

  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
</style>
