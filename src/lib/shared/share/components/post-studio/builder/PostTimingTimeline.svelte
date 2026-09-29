<script lang="ts">
  import type { PostStudioLayerPainter } from "$lib/shared/media-composition/services/post-studio-layer-painter";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
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
</script>

{#if session.take && session.timing}
  <div class="timing-controls">
    <div class="transport">
      <PanelButton
        onclick={session.restart}
        disabled={!session.url}
        ariaLabel="Back to start (Home)"
      >
        <i class="fa-solid fa-backward-fast" aria-hidden="true"></i> Start
      </PanelButton>
      <button
        type="button"
        class="round"
        onclick={session.togglePlay}
        disabled={!session.url}
        aria-label={session.playing
          ? t("share_studio_deep_pause")
          : t("share_studio_deep_play")}
      >
        <i
          class="fa-solid {session.playing ? 'fa-pause' : 'fa-play'}"
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
      <div class="picker">
        <SegmentedControl
          options={[
            {
              value: "1",
              label: "1×",
              ariaLabel: t("share_studio_deep_full_speed"),
            },
            {
              value: "0.75",
              label: "¾×",
              ariaLabel: t("share_studio_deep_three_quarter_speed"),
            },
            {
              value: "0.5",
              label: "½×",
              ariaLabel: t("share_studio_deep_half_speed"),
            },
          ]}
          value={session.speed}
          onchange={(value) => (session.speed = value)}
          size="sm"
          density="compact"
          ariaLabel={t("share_studio_deep_playback_speed")}
        />
      </div>
    </div>

    <div class="lane-heading">
      <span
        >{session.adjustLandings
          ? "Adjust landings · drag a marker to move it"
          : "Landings · drag anywhere to scrub"}</span
      >
      <PanelButton
        onclick={() => {
          session.adjustLandings = !session.adjustLandings;
        }}
      >
        {session.adjustLandings ? "Done adjusting (Esc)" : "Adjust landings"}
      </PanelButton>
    </div>
    <TakeTimingLane
      timing={session.timing}
      resolved={session.resolved}
      durationSeconds={session.durationSeconds}
      mediaSeconds={session.mediaSeconds}
      movesPerPass={session.movesPerPass}
      windowSeconds={fit ? session.durationSeconds : Number(session.zoom)}
      editable={session.adjustLandings}
      onGestureChange={session.setAdjustmentCancel}
      selected={session.selected}
      onseek={(seconds) => {
        session.pause();
        session.seek(seconds);
      }}
      onselect={(landing) => (session.selected = landing)}
      onplace={session.placeLanding}
      dragRange={session.landingRange}
    />

    <div class="options">
      <div class="picker">
        <SegmentedControl
          options={[
            { value: "fit", label: "Fit" },
            { value: "8", label: "8 s" },
            { value: "16", label: "16 s" },
          ]}
          value={fit ? "fit" : session.zoom}
          onchange={(value) => {
            fit = value === "fit";
            if (value !== "fit") session.zoom = value;
          }}
          size="sm"
          density="compact"
          ariaLabel={t("share_studio_deep_closeup_width")}
        />
      </div>
      {#if squarePainter}
        <FilterChipBase
          mode="toggle"
          emphasis="solid"
          size="sm"
          icon={`fa-solid ${ITEM_KIND_ICON.moves}`}
          label={t("share_studio_deep_show_move")}
          active={session.showSquare}
          onclick={() => (session.showSquare = !session.showSquare)}
        />
      {/if}
      <span class="hint"
        >T tap · Space play/pause · ← → frame · Ctrl Z undo · Ctrl Y redo</span
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
  .lane-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--theme-text-secondary, #aaa);
  }
  .transport,
  .options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  /* The shared control fills its box; three short choices only need this much. */
  .picker {
    flex: 0 0 11rem;
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
    font-size: 0.875rem;
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
    font-size: 0.875rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hint {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.75rem;
  }
</style>
