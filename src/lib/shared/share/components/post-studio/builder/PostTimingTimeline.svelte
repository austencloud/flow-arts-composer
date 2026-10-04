<script lang="ts">
  import type { PostStudioLayerPainter } from "$lib/shared/media-composition/services/post-studio-layer-painter";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { ITEM_KIND_ICON } from "../editor/post-editor-labels";
  import TakeTimingLane from "./TakeTimingLane.svelte";
  import type { PostTimingSession } from "./post-timing-session.svelte";
  import TypeableValue from "$lib/shared/ui/components/TypeableValue.svelte";
  import { formatTakeClock, parseClock } from "./post-builder-format";

  let {
    session,
    squarePainter = null,
  }: {
    session: PostTimingSession;
    squarePainter?: PostStudioLayerPainter | null;
  } = $props();
  let fit = $state(true);
  let wheelWindowSeconds = $state<number | null>(null);
</script>

{#if session.take && session.timing}
  <div class="timing-controls">
    <div class="transport">
      <button
        type="button"
        class="round"
        onclick={session.restart}
        disabled={!session.url}
        aria-label="Back to start (Home)"
        title="Back to start"
      >
        <i class="fa-solid fa-backward-fast" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        class="round"
        onclick={session.togglePlay}
        disabled={!session.url}
        aria-label={session.reviewPlaying
          ? t("share_studio_deep_pause")
          : t("share_studio_deep_play")}
      >
        <i
          class="fa-solid {session.reviewPlaying ? 'fa-pause' : 'fa-play'}"
          aria-hidden="true"
        ></i>
      </button>
      <button
        type="button"
        class="round"
        onclick={() => session.stepFrame(-1)}
        disabled={!session.url}
        aria-label={t("share_studio_deep_back_one_frame")}
      >
        <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        class="round"
        onclick={() => session.stepFrame(1)}
        disabled={!session.url}
        aria-label={t("share_studio_deep_forward_one_frame")}
      >
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      </button>
      <div class="clock">
        <TypeableValue
          label={t("share_studio_deep_playhead")}
          text={formatTakeClock(session.mediaSeconds)}
          draft={formatTakeClock(session.mediaSeconds)}
          parse={parseClock}
          sizer={formatTakeClock(session.durationSeconds)}
          disabled={!session.url}
          oncommit={(seconds) => {
            session.pause();
            session.seek(seconds);
          }}
        />
        <span class="total">/ {formatTakeClock(session.durationSeconds)}</span>
      </div>
      <span class="readout">{session.readout}</span>
    </div>

    <div class="landing-lane">
      <TakeTimingLane
        timing={session.timing}
        resolved={session.resolved}
        durationSeconds={session.durationSeconds}
        mediaSeconds={session.mediaSeconds}
        movesPerPass={session.movesPerPass}
        windowSeconds={fit
          ? session.durationSeconds
          : (wheelWindowSeconds ?? Number(session.zoom))}
        editable={session.adjustLandings}
        onGestureChange={session.setAdjustmentCancel}
        selected={session.selected}
        onseek={(seconds) => {
          session.pause();
          session.seek(seconds);
        }}
        onselect={(landing) => (session.selected = landing)}
        onplace={session.placeLanding}
        onzoom={(seconds) => {
          fit = false;
          wheelWindowSeconds = seconds;
        }}
        dragRange={session.landingRange}
      />
    </div>

    <div class="options">
      <label class="picker"
        ><span class="sr-only">Playback speed</span>
        <select
          aria-label="Playback speed"
          value={session.speed}
          onchange={(event) => (session.speed = event.currentTarget.value)}
        >
          <option value="1">1×</option><option value="0.75">¾×</option><option
            value="0.5">½×</option
          >
        </select>
      </label>
      <label class="picker"
        ><span class="sr-only">Timeline view</span>
        <select
          aria-label="Timeline view"
          value={fit
            ? "fit"
            : wheelWindowSeconds !== null
              ? "custom"
              : session.zoom}
          onchange={(event) => {
            const value = event.currentTarget.value;
            fit = value === "fit";
            wheelWindowSeconds = null;
            if (value === "8" || value === "16") session.zoom = value;
          }}
        >
          <option value="fit">Fit</option><option value="8">8 s</option><option
            value="16">16 s</option
          >
          {#if wheelWindowSeconds !== null}<option value="custom"
              >{Math.round(wheelWindowSeconds * 10) / 10} s</option
            >{/if}
        </select>
      </label>
      <PanelButton
        onclick={() => (session.adjustLandings = !session.adjustLandings)}
        ariaPressed={session.adjustLandings}
        ariaLabel={session.adjustLandings
          ? "Done adjusting landings"
          : "Adjust landings"}
      >
        <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
        <span class="option-label"
          >{session.adjustLandings ? "Done adjusting" : "Adjust landings"}</span
        >
      </PanelButton>
      {#if squarePainter}
        <PanelButton
          ariaPressed={session.showSquare}
          ariaLabel="Show move"
          onclick={() => (session.showSquare = !session.showSquare)}
        >
          <i class="fa-solid {ITEM_KIND_ICON.moves}" aria-hidden="true"
          ></i><span class="option-label">Show move</span>
        </PanelButton>
      {/if}
      <span class="hint"
        >T tap · Space play/pause · ← → frame · Ctrl + wheel zoom · Ctrl Z undo
        · Ctrl Y redo</span
      >
    </div>
  </div>
{/if}

<style>
  .timing-controls {
    display: grid;
    gap: 0.625rem;
    min-width: 0;
    user-select: none;
    -webkit-user-select: none;
  }
  .landing-lane {
    min-width: 0;
  }
  .transport,
  .options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .picker {
    flex: none;
  }
  .picker select {
    min-height: 2.75rem;
    padding: 0.5rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.5rem;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    font-size: var(--mapping-text-size, 0.875rem);
  }
  .picker select:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .round {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    flex: none;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 50%;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    cursor: pointer;
  }
  .round:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .round:focus-visible {
    outline: 2px solid var(--theme-primary, currentColor);
    outline-offset: 2px;
  }
  .clock {
    --typeable-min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--theme-text, #fff);
    font-size: var(--mapping-text-size, 0.875rem);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .total {
    color: var(--theme-text-secondary, #aaa);
  }
  .readout {
    flex: 1 1 8rem;
    min-width: 0;
    overflow: hidden;
    color: var(--theme-text-secondary, #aaa);
    font-size: var(--mapping-text-size, 0.875rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hint {
    color: var(--theme-text-secondary, #aaa);
    font-size: var(--mapping-meta-size, 0.75rem);
  }
  @media (max-width: 600px) {
    .timing-controls {
      gap: 0.375rem;
    }
    .transport {
      gap: 0.25rem;
      flex-wrap: nowrap;
    }
    .readout,
    .total,
    .hint,
    .option-label {
      display: none;
    }
    .clock {
      margin-left: auto;
    }
    .options {
      gap: 0.375rem;
    }
  }
  @media (max-height: 500px) {
    .hint,
    .readout,
    .total,
    .option-label {
      display: none;
    }
  }
</style>
