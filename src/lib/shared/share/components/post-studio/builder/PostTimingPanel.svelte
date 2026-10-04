<script lang="ts">
  import type { Snippet } from "svelte";
  import PostTimingDisclosure from "./PostTimingDisclosure.svelte";
  import PostTimingTap from "./PostTimingTap.svelte";
  import {
    MIN_MOVE_SECONDS,
    TAKE_MAX_BPM,
    TAKE_MIN_BPM,
  } from "$lib/shared/media-composition/domain/take-timing";
  import { landingName } from "$lib/shared/media-composition/domain/timing-summary";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import TypeableValue from "$lib/shared/ui/components/TypeableValue.svelte";
  import type { PostTimingSession } from "./post-timing-session.svelte";
  import { formatTakeClock, parseClock } from "./post-builder-format";

  /**
   * The Timing step's controls, top to bottom in the order they are needed:
   * tap along at a typed tempo, read the verdict, fix what it points at,
   * and say the map looks right.
   */
  let {
    session,
    animation,
    animationOpen = $bindable(false),
    showPrimary = true,
  }: {
    session: PostTimingSession;
    animation?: Snippet;
    animationOpen?: boolean;
    showPrimary?: boolean;
  } = $props();

  let bpmDraft = $state("");
  let holdDraft = $state(0);
  // A part cut from a fitted grid keeps that grid's exact tempo; the field
  // shows it to the tenth it is typed at.
  const shownBpm = (bpm: number) => String(Math.round(bpm * 10) / 10);
  $effect(() => {
    bpmDraft = session.section ? shownBpm(session.section.bpm) : "";
    holdDraft = Math.round((session.section?.landingHoldRatio ?? 0) * 100);
  });

  function commitBpm(): void {
    if (!session.setBpm(Number(bpmDraft))) {
      bpmDraft = session.section ? shownBpm(session.section.bpm) : "";
    }
  }

  function commitHold(): void {
    if (!session.setLandingHoldPercent(holdDraft)) {
      holdDraft = Math.round((session.section?.landingHoldRatio ?? 0) * 100);
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
      <h3>Map landings</h3>
      <span class="status status-{session.status}">
        {STATUS_TEXT[session.status]}
      </span>
    </header>

    {#if showPrimary}
      <div class="primary-action">
        <PostTimingTap {session} />
        <p class="help">Play the take and tap when the props land.</p>
      </div>
    {/if}

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

    <PostTimingDisclosure
      title="Align sequence"
      description="Choose where move 1 lands"
    >
      <p class="help">
        At the first landing, set move 1. Shift it if the sequence is one move
        off.
      </p>
      <div class="row">
        <PanelButton onclick={session.beatOneHere}
          >Move 1 lands here</PanelButton
        >
      </div>
      <div class="paired">
        <PanelButton
          onclick={() => session.shiftBeatOne(-1)}
          disabled={!fitted}
          ariaLabel="Move 1 one landing earlier"
        >
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Earlier
        </PanelButton>
        <span class="step-unit">1 move</span>
        <PanelButton
          onclick={() => session.shiftBeatOne(1)}
          disabled={!fitted}
          ariaLabel="Move 1 one landing later"
        >
          Later <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </PanelButton>
      </div>
    </PostTimingDisclosure>

    {#if animation}
      <PostTimingDisclosure
        title="Animation"
        description="Effort, playback, effects & display"
        bind:open={animationOpen}
      >
        {@render animation()}
      </PostTimingDisclosure>
    {/if}

    {#if fitted && section}
      {#if session.selected && session.selectedLanding}
        {@const landing = session.selectedLanding}
        {@const ref = session.selected}
        <div class="group">
          <div class="head">
            <h4>{landingName(landing.position, session.movesPerPass)}</h4>
            <PanelButton onclick={session.deselect}>Deselect (Esc)</PanelButton>
          </div>
          <p class="help">
            {landing.pinned
              ? `${t("share_studio_deep_placed_by_hand")} `
              : ""}{t("share_studio_deep_drag_nudge_or_type")}
          </p>
          <div class="paired">
            <PanelButton
              onclick={() =>
                session.placeLanding(ref, landing.seconds - MIN_MOVE_SECONDS)}
              ariaLabel={t("share_studio_deep_landing_frame_earlier")}
            >
              <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
              {t("share_studio_deep_one_frame")}
            </PanelButton>
            <TypeableValue
              label={landingName(landing.position, session.movesPerPass)}
              text={formatTakeClock(landing.seconds)}
              draft={formatTakeClock(landing.seconds)}
              parse={parseClock}
              oncommit={(seconds) => session.placeLanding(ref, seconds)}
            />
            <PanelButton
              onclick={() =>
                session.placeLanding(ref, landing.seconds + MIN_MOVE_SECONDS)}
              ariaLabel={t("share_studio_deep_landing_frame_later")}
            >
              {t("share_studio_deep_one_frame")}
              <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
            </PanelButton>
          </div>
          {#if landing.pinned}
            <PanelButton onclick={session.releaseSelected}>
              {t("share_studio_deep_back_on_grid")}
            </PanelButton>
          {/if}
        </div>
      {/if}
    {/if}

    <PostTimingDisclosure
      title="Tempo & fine timing"
      description={section
        ? `${shownBpm(section.bpm)} BPM · ${section.tempo === "follow" ? "Follow video" : "Hold BPM"}`
        : "Set a tempo or shift the grid"}
    >
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
            size="md"
            ariaLabel={t("share_studio_deep_tempo")}
          />
        {/if}
      </div>
      {#if section}
        <div class="group">
          <label class="bpm">
            <span>Hold after landing</span>
            <input
              type="number"
              inputmode="numeric"
              min="0"
              max="90"
              step="1"
              bind:value={holdDraft}
              onchange={commitHold}
            />
            <span>%</span>
          </label>
          <p class="help">
            Keep each landed pose for this part of the next move interval, then
            catch up by the next landing.
          </p>
        </div>
      {/if}
      {#if fitted && section}
        <div class="group">
          <h4>{t("share_studio_deep_whole_grid")}</h4>
          <div class="paired">
            <PanelButton
              onclick={() => session.nudgeGrid(-1)}
              ariaLabel={t("share_studio_deep_grid_frame_earlier")}
            >
              <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
              {t("share_studio_deep_one_frame")}
            </PanelButton>
            <TypeableValue
              label={t("share_studio_deep_whole_grid")}
              text={section.offsetSeconds !== 0
                ? `${section.offsetSeconds > 0 ? "+" : ""}${section.offsetSeconds.toFixed(2)} s`
                : t("share_studio_deep_on_taps")}
              draft={section.offsetSeconds.toFixed(2)}
              unit="s"
              signed
              oncommit={session.setGridOffset}
            />
            <PanelButton
              onclick={() => session.nudgeGrid(1)}
              ariaLabel={t("share_studio_deep_grid_frame_later")}
            >
              {t("share_studio_deep_one_frame")}
              <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
            </PanelButton>
          </div>
          <SegmentedControl
            options={[
              { value: "grid", label: t("share_studio_deep_land_on_grid") },
              { value: "taps", label: t("share_studio_deep_land_on_taps") },
            ]}
            value={section.snap}
            onchange={session.setSnap}
            size="md"
            ariaLabel={t("share_studio_deep_landings")}
          />
        </div>
      {/if}
    </PostTimingDisclosure>

    <PostTimingDisclosure
      title="Parts & end"
      description="Split an edited take or mark its ending"
    >
      {#if fitted && section}
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
      <PanelButton
        onclick={session.clearTaps}
        disabled={!section || section.taps.length === 0}
      >
        {session.timing.sections.length > 1
          ? "Clear this part & restart"
          : "Clear taps & restart"}
      </PanelButton>
    </PostTimingDisclosure>

    <footer class="foot">
      <PanelButton
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
  <p class="help">{t("post_editor_add_video_to_tap")}</p>
{/if}

<style>
  .timing-panel,
  .group {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }
  .timing-panel {
    gap: 0;
  }
  .head {
    padding-bottom: 0.75rem;
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
    font-size: var(--mapping-heading-size, 1rem);
  }
  h4 {
    font-size: var(--mapping-text-size, 0.9375rem);
  }
  .status {
    color: var(--theme-text-dim, #aaa);
    font-size: var(--mapping-meta-size, 0.8125rem);
  }
  .status-confirmed {
    color: var(--semantic-success, #4ade80);
  }
  .status-stale {
    color: var(--semantic-warning, #fbbf24);
  }
  .help {
    margin: 0;
    color: var(--theme-text-dim, #aaa);
    font-size: var(--mapping-text-size, 0.875rem);
    line-height: 1.4;
  }
  .verdict-text {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: var(--mapping-text-size, 0.9375rem);
    line-height: 1.4;
  }
  .tone-good .verdict-text {
    color: var(--semantic-success, #4ade80);
  }
  .tone-rough .verdict-text,
  .tone-tempo .verdict-text {
    color: var(--semantic-warning, #fbbf24);
  }
  .primary-action {
    display: grid;
    justify-items: start;
    gap: 0.75rem;
    padding-block: 0.25rem 1rem;
  }
  .verdict {
    padding-bottom: 1rem;
  }
  .paired {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem;
  }
  .step-unit {
    font-size: var(--mapping-text-size, 0.875rem);
    color: var(--theme-text-dim, #aaa);
    text-align: center;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .bpm {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--theme-text, #fff);
    font-size: var(--mapping-text-size, 0.875rem);
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
  .foot {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding-block: 0.75rem;
    border-top: 1px solid var(--theme-stroke, #484755);
    background: var(--theme-panel-bg, #12121c);
  }
</style>
