<script lang="ts">
  import {
    MIN_MOVE_SECONDS,
    TAKE_MAX_BPM,
    TAKE_MIN_BPM,
  } from "$lib/shared/media-composition/domain/take-timing";
  import { landingName } from "$lib/shared/media-composition/domain/timing-summary";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { PostTimingSession } from "./post-timing-session.svelte";
  import { formatTakeClock } from "./post-builder-format";

  /**
   * The Timing step's controls, top to bottom in the order they are needed:
   * tap along at a typed tempo, read the verdict, fix what it points at,
   * and say the map looks right.
   */
  let { session }: { session: PostTimingSession } = $props();

  let bpmDraft = $state("");
  // A part cut from a fitted grid keeps that grid's exact tempo; the field
  // shows it to the tenth it is typed at.
  const shownBpm = (bpm: number) => String(Math.round(bpm * 10) / 10);
  $effect(() => {
    bpmDraft = session.section ? shownBpm(session.section.bpm) : "";
  });

  function commitBpm(): void {
    if (!session.setBpm(Number(bpmDraft))) {
      bpmDraft = session.section ? shownBpm(session.section.bpm) : "";
    }
  }

  const STATUS_TEXT = $derived({
    untapped: t("share_studio_deep_not_mapped"),
    unconfirmed: t("share_studio_deep_not_checked"),
    confirmed: t("share_studio_deep_checked"),
    stale: t("share_studio_deep_sequence_changed"),
  });
</script>

{#if session.take && session.timing}
  {@const section = session.section}
  {@const fitted = Boolean(session.resolvedSection?.fit)}
  <div class="timing-panel">
    <header class="head">
      <h3>{t("share_studio_deep_map_take", { take: session.take.label })}</h3>
      <span class="status status-{session.status}">
        {STATUS_TEXT[session.status]}
      </span>
    </header>

    <div class="group">
      <button
        type="button"
        class="tap"
        data-space-plays
        onclick={session.tap}
        disabled={!session.url}
        aria-describedby="post-tap-help"
      >
        {#key session.tapCount}<span class="flash" aria-hidden="true"
          ></span>{/key}
        {t("share_studio_deep_tap_landing")}
        <kbd>T</kbd>
      </button>
      <p id="post-tap-help" class="help">
        {t("share_studio_deep_tap_help")}
      </p>
      <div class="row">
        <label class="bpm">
          <span>BPM</span>
          <input
            type="number"
            inputmode="decimal"
            min={TAKE_MIN_BPM}
            max={TAKE_MAX_BPM}
            step="0.1"
            bind:value={bpmDraft}
            onchange={commitBpm}
            onkeydown={(event) => {
              if (event.key === "Enter") commitBpm();
            }}
          />
        </label>
        {#if section}
          <SegmentedControl
            options={[
              { value: "locked", label: t("share_studio_deep_hold_bpm") },
              { value: "follow", label: t("share_studio_deep_follow_video") },
            ]}
            value={section.tempo}
            onchange={session.setTempo}
            size="sm"
            ariaLabel={t("share_studio_deep_tempo")}
          />
        {/if}
      </div>
    </div>

    {#if session.summary}
      {@const summary = session.summary}
      <div class="group verdict tone-{summary.tone}" aria-live="polite">
        <p class="verdict-text">{summary.text}</p>
        {#if summary.suggestedBpm !== null}
          {@const suggested = summary.suggestedBpm}
          <div class="row">
            <PanelButton onclick={() => session.setBpm(suggested)}>
              {t("share_studio_deep_use_bpm", { bpm: suggested })}
            </PanelButton>
          </div>
        {/if}
        {#if summary.ignoredLeadingTaps > 0}
          {@const ignored = summary.ignoredLeadingTaps}
          <p class="help">
            {ignored === 1
              ? t("share_studio_deep_first_tap_before_grid")
              : t("share_studio_deep_first_taps_before_grid", {
                  count: ignored,
                })}
          </p>
          <div class="row">
            <PanelButton onclick={session.firstTapWasMoveOne}>
              {t("share_studio_deep_that_was_move_one")}
            </PanelButton>
            <PanelButton onclick={() => session.dropLeadingTaps(ignored)}>
              {ignored === 1
                ? t("share_studio_deep_drop_it")
                : t("share_studio_deep_drop_them")}
            </PanelButton>
          </div>
        {/if}
      </div>
    {/if}

    <div class="group">
      <h4>{t("share_studio_deep_move_one")}</h4>
      <div class="row">
        <PanelButton onclick={session.beatOneHere}
          >{t("share_studio_deep_lands_here")}</PanelButton
        >
        <PanelButton
          onclick={() => session.shiftBeatOne(-1)}
          disabled={!fitted}
          ariaLabel={t("share_studio_deep_move_one_earlier")}
        >
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
          {t("share_studio_deep_earlier")}
        </PanelButton>
        <PanelButton
          onclick={() => session.shiftBeatOne(1)}
          disabled={!fitted}
          ariaLabel={t("share_studio_deep_move_one_later")}
        >
          {t("share_studio_deep_later")}
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </PanelButton>
      </div>
    </div>

    {#if fitted && section}
      <div class="group">
        <h4>{t("share_studio_deep_whole_grid")}</h4>
        <div class="row">
          <PanelButton
            onclick={() => session.nudgeGrid(-1)}
            ariaLabel={t("share_studio_deep_grid_frame_earlier")}
          >
            <i class="fa-solid fa-chevron-left" aria-hidden="true"></i> 1 frame
          </PanelButton>
          <PanelButton
            onclick={() => session.nudgeGrid(1)}
            ariaLabel={t("share_studio_deep_grid_frame_later")}
          >
            1 frame <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
          </PanelButton>
          <span class="value">
            {section.offsetSeconds !== 0
              ? `${section.offsetSeconds > 0 ? "+" : ""}${section.offsetSeconds.toFixed(2)} s`
              : t("share_studio_deep_on_taps")}
          </span>
        </div>
        <label class="check">
          <input
            type="checkbox"
            checked={section.snap === "taps"}
            onchange={(event) =>
              session.setSnap(event.currentTarget.checked ? "taps" : "grid")}
          />
          {t("share_studio_deep_land_exactly_on_taps")}
        </label>
      </div>

      {#if session.selected && session.selectedLanding}
        {@const landing = session.selectedLanding}
        {@const ref = session.selected}
        <div class="group">
          <h4>{landingName(landing.position, session.movesPerPass)}</h4>
          <p class="help">
            {t("share_studio_deep_at_time", {
              time: formatTakeClock(landing.seconds),
            })}{landing.pinned
              ? t("share_studio_deep_placed_by_hand_suffix")
              : ""}. {t("share_studio_deep_drag_or_nudge")}
          </p>
          <div class="row">
            <PanelButton
              onclick={() =>
                session.placeLanding(ref, landing.seconds - MIN_MOVE_SECONDS)}
              ariaLabel={t("share_studio_deep_landing_frame_earlier")}
            >
              <i class="fa-solid fa-chevron-left" aria-hidden="true"></i> 1 frame
            </PanelButton>
            <PanelButton
              onclick={() =>
                session.placeLanding(ref, landing.seconds + MIN_MOVE_SECONDS)}
              ariaLabel={t("share_studio_deep_landing_frame_later")}
            >
              1 frame <i class="fa-solid fa-chevron-right" aria-hidden="true"
              ></i>
            </PanelButton>
            {#if landing.pinned}
              <PanelButton onclick={session.releaseSelected}>
                {t("share_studio_deep_back_on_grid")}
              </PanelButton>
            {/if}
          </div>
        </div>
      {/if}

      <div class="group">
        <h4>{t("share_studio_deep_end")}</h4>
        <div class="row">
          <PanelButton onclick={session.endHere}
            >{t("share_studio_deep_performance_ends_here")}</PanelButton
          >
          {#if session.endClearable}
            <PanelButton onclick={session.clearEnd}
              >{t("share_studio_deep_clear_end")}</PanelButton
            >
          {/if}
        </div>
      </div>
    {/if}

    <details class="group parts" open={session.timing.sections.length > 1}>
      <summary>{t("share_studio_deep_split_take_summary")}</summary>
      <p class="help">
        {t("share_studio_deep_split_take_help")}
      </p>
      <div class="row">
        <PanelButton
          onclick={() => session.split("continues")}
          disabled={!session.canKeepCounting}
        >
          {t("share_studio_deep_split_keep_counting")}
        </PanelButton>
        <PanelButton
          onclick={() => session.split("restarts")}
          disabled={!session.canSplit}
        >
          {t("share_studio_deep_split_start_over")}
        </PanelButton>
        {#if session.sectionIndex > 0}
          <PanelButton onclick={session.joinWithPrevious}>
            {t("share_studio_deep_join_previous")}
          </PanelButton>
        {/if}
      </div>
      {#if session.canSplit && !session.canKeepCounting}
        <p class="help">{t("share_studio_deep_tap_to_here_first")}</p>
      {/if}
    </details>

    <footer class="foot">
      <PanelButton onclick={session.undo} disabled={!session.canUndo}>
        <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
        {t("share_studio_deep_undo")}
      </PanelButton>
      <PanelButton
        onclick={session.clearTaps}
        disabled={!section || section.taps.length === 0}
      >
        {t("share_studio_deep_clear_taps")}
      </PanelButton>
      <PanelButton
        variant="primary"
        onclick={session.confirm}
        disabled={session.status === "untapped" ||
          session.status === "confirmed"}
      >
        <i class="fa-solid fa-check" aria-hidden="true"></i>
        {t("share_studio_deep_looks_right")}
      </PanelButton>
    </footer>
  </div>
{:else}
  <p class="help">{t("share_studio_deep_add_take_to_map")}</p>
{/if}

<style>
  .timing-panel,
  .group {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }
  .timing-panel {
    gap: 1rem;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }
  h3,
  h4 {
    margin: 0;
    color: var(--theme-text, #fff);
  }
  h3 {
    font-size: 1rem;
  }
  h4 {
    font-size: 0.9375rem;
  }
  .status {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
  }
  .status-confirmed {
    color: var(--semantic-success, #4ade80);
  }
  .status-stale {
    color: var(--semantic-warning, #fbbf24);
  }
  .help {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }
  .verdict-text {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 0.9375rem;
    line-height: 1.4;
  }
  .tone-good .verdict-text {
    color: var(--semantic-success, #4ade80);
  }
  .tone-rough .verdict-text,
  .tone-tempo .verdict-text {
    color: var(--semantic-warning, #fbbf24);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .value {
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }
  .tap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-height: 3.5rem;
    overflow: hidden;
    border: 1px solid var(--theme-primary, #d4813a);
    border-radius: 0.75rem;
    color: var(--theme-text, #fff);
    background: color-mix(
      in srgb,
      var(--theme-primary, #d4813a) 22%,
      transparent
    );
    font: inherit;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }
  .tap:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .tap:focus-visible {
    outline: 2px solid var(--theme-primary, currentColor);
    outline-offset: 2px;
  }
  .tap kbd {
    padding: 0.1rem 0.4rem;
    border: 1px solid currentColor;
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }
  .flash {
    position: absolute;
    inset: 0;
    background: var(--theme-primary, #d4813a);
    opacity: 0;
    animation: tap-flash 220ms ease-out;
    pointer-events: none;
  }
  @keyframes tap-flash {
    from {
      opacity: 0.5;
    }
    to {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .flash {
      animation: none;
    }
  }
  .bpm {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
  }
  .bpm input {
    width: 5.5rem;
    min-height: 2.75rem;
    padding: 0 0.5rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.5rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    font: inherit;
    font-variant-numeric: tabular-nums;
  }
  .bpm input:focus-visible {
    outline: 2px solid var(--theme-primary, currentColor);
    outline-offset: 1px;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
    cursor: pointer;
  }
  .check input {
    width: 1.125rem;
    height: 1.125rem;
    accent-color: var(--theme-primary, #d4813a);
  }
  .parts summary {
    display: flex;
    align-items: center;
    min-height: 2.75rem;
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
    cursor: pointer;
  }
  /* "Looks right" is the step's way out, so it stays in view while the
     controls above it scroll. The wash is translucent on dark themes; the
     blur keeps what scrolls under it from reading through. */
  .foot {
    position: sticky;
    bottom: 0;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding-block: 0.75rem;
    border-top: 1px solid var(--theme-stroke, #484755);
    background: var(--theme-panel-bg, #12121c);
    backdrop-filter: blur(12px);
  }
</style>
