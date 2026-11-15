<!--
  VisualsStage.svelte — the front page's stage: a published piece already
  playing when you arrive. It runs edge to edge in its box and changes to the
  next piece of its playlist every few seconds, still first and then the live
  piece. Tapping it opens that piece's page.

  One live renderer exists at a time: the pieces swap through Crossfade in
  "swap" mode, so the old one is gone before the next one mounts. A piece's
  detail loads only when it becomes the one to play, and the loader keeps it
  for the visit. Nothing loads or advances while the tab is hidden or the list
  is not on screen, and the stage's clock (visuals-stage-clock.ts) only runs
  while it is playing.

  Under reduced motion it is the first piece's still and its caption: no tag,
  no pause button, no cycling, nothing loaded.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { PublicArtifactEnvelope } from "#lib/shared/artifact-revisions/domain/public-artifact.js";
  import TkaLabel from "#lib/shared/components/TkaLabel.svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import {
    spend,
    startBudget,
    whenReady,
    whenSpent,
    type StageBudget,
    type StagePhase,
  } from "../domain/visuals-stage-clock.js";
  import type {
    VisualPiece,
    VisualPieceLoader,
  } from "../services/visual-piece-loader.js";
  import { createReducedMotion } from "../state/reduced-motion.svelte.js";
  import LivePieceStage from "./LivePieceStage.svelte";
  import StagePauseButton from "#lib/shared/animation-engine/components/controls/StagePauseButton.svelte";

  let {
    playlist,
    loader,
    active,
    onOpen,
  }: {
    playlist: readonly PublicArtifactEnvelope[];
    loader: VisualPieceLoader;
    /** The list view is on screen. False stops all loading and advancing. */
    active: boolean;
    onOpen: (envelope: PublicArtifactEnvelope) => void;
  } = $props();

  const reduced = createReducedMotion();

  let tabVisible = $state(
    typeof document === "undefined" || document.visibilityState === "visible"
  );
  let userPaused = $state(false);
  let index = $state(0);

  const current = $derived(playlist[index] ?? playlist[0]);
  const canLoad = $derived(active && tabVisible && !reduced.value);
  const running = $derived(canLoad && !userPaused && playlist.length > 0);
  const playing = $derived(!userPaused && canLoad);

  // ---- the piece's detail ----------------------------------------------------

  let loaded = $state<VisualPiece | null>(null);
  const piece = $derived(
    loaded && current && loaded.envelope.artifactId === current.artifactId
      ? loaded
      : null
  );

  $effect(() => {
    const target = current;
    if (!target || !canLoad) return;
    const known = loader.peek(target.artifactId);
    if (known) {
      loaded = known;
      return;
    }
    let stale = false;
    loader
      .load(target.artifactId)
      .then((result) => {
        if (!stale && result.status === "ok") loaded = result.piece;
      })
      // A piece that will not load simply keeps its still for the dwell.
      .catch(() => {});
    return () => {
      stale = true;
    };
  });

  // ---- the clock -------------------------------------------------------------
  // Plain variables, not state: the budget is spent only while a timer runs,
  // and writing state from an effect's cleanup would loop.

  let budget: StageBudget = startBudget();
  let phase = $state<StagePhase>("waiting");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timerStart = 0;

  function setBudget(next: StageBudget) {
    budget = next;
    phase = next.phase;
  }

  function stopTimer() {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    budget = spend(budget, performance.now() - timerStart);
  }

  function startTimer() {
    stopTimer();
    timerStart = performance.now();
    timer = setTimeout(spent, budget.left);
  }

  function spent() {
    timer = undefined;
    const next = whenSpent(spend(budget, budget.left));
    if (next) {
      setBudget(next);
      startTimer();
      return;
    }
    // The next piece starts from the top of its own budget.
    index = (index + 1) % playlist.length;
    setBudget(startBudget());
    startTimer();
  }

  function liveReady() {
    const wasRunning = timer !== undefined;
    stopTimer();
    setBudget(whenReady(budget));
    if (wasRunning) startTimer();
  }

  $effect(() => {
    if (!running) return;
    untrack(startTimer);
    return stopTimer;
  });

  // The playlist can shrink if the list reloads; keep the index inside it.
  $effect(() => {
    if (playlist.length > 0 && index >= playlist.length) index = 0;
  });

  const kindName = $derived(
    current?.artifactType === "mandala"
      ? "browse_visuals_stage_mandala_by"
      : "browse_visuals_stage_tunnel_by"
  );
</script>

<svelte:document
  onvisibilitychange={() => (tabVisible = document.visibilityState === "visible")}
/>

{#if current}
  <div class="stage">
    <div class="pieces">
      <Crossfade key={current.artifactId} fill mode="swap" duration={DURATION.fast}>
        <LivePieceStage
          envelope={current}
          {piece}
          {playing}
          stillOnly={reduced.value}
          hold={phase === "held"}
          onReady={liveReady}
        />
      </Crossfade>
    </div>

    <div class="scrim" aria-hidden="true"></div>

    <button
      type="button"
      class="open"
      aria-label={t("browse_mandala_open_example", { word: current.title })}
      onclick={() => onOpen(current)}
    ></button>

    {#if !reduced.value}
      <!-- Both words sit in one cell so the tag keeps the wider one's width. -->
      <span class="tag">
        <span class="tag-word" class:ghost={userPaused}>
          {t("browse_visuals_stage_playing")}
        </span>
        <span class="tag-word" class:ghost={!userPaused}>
          {t("browse_visuals_stage_paused")}
        </span>
      </span>
      <div class="pause">
        <StagePauseButton
          playing={!userPaused}
          onToggle={() => (userPaused = !userPaused)}
        />
      </div>
    {/if}

    <div class="caption">
      <span class="caption-title">
        <TkaLabel text={current.title} darkMode fitToParent={false} />
      </span>
      <span class="caption-by">
        {t(kindName, { name: current.ownerDisplayName })}
      </span>
    </div>

    <span class="dots" aria-hidden="true">
      {#each playlist as entry, dot (entry.artifactId)}
        <i class="dot" class:on={dot === index}></i>
      {/each}
    </span>
  </div>
{/if}

<style>
  .stage {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-panel-floor);
  }

  .pieces {
    position: absolute;
    inset: 0;
  }

  /* Keeps the caption and the dots readable over a bright frame. */
  .scrim {
    position: absolute;
    inset: auto 0 0;
    height: 34%;
    pointer-events: none;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.62));
  }

  /* The whole stage is one button that opens the piece. The tag, the pause
     button, the caption and the dots are its siblings, never inside it. */
  .open {
    position: absolute;
    inset: 0;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
  }

  .open:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: -3px;
  }

  .tag {
    position: absolute;
    top: 12px;
    left: 14px;
    display: inline-grid;
    padding: 4px 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    pointer-events: none;
  }

  .tag-word {
    grid-area: 1 / 1;
    text-align: center;
  }

  .tag-word.ghost {
    visibility: hidden;
  }

  .pause {
    position: absolute;
    top: 12px;
    right: 12px;
  }

  .caption {
    position: absolute;
    left: 14px;
    right: 96px;
    bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    pointer-events: none;
  }

  .caption-title {
    font-size: var(--font-size-xl, 1.25rem);
    color: #fff;
    overflow: hidden;
    white-space: nowrap;
  }

  .caption-by {
    font-size: var(--font-size-min, 14px);
    color: rgba(255, 255, 255, 0.82);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dots {
    position: absolute;
    right: 14px;
    bottom: 16px;
    display: flex;
    align-items: center;
    gap: 6px;
    pointer-events: none;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.32);
    transition:
      width var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard);
  }

  /* One dot is always the short bar, so the row never changes width. */
  .dot.on {
    width: 18px;
    background: #fff;
  }

  @media (prefers-reduced-motion: reduce) {
    .dot {
      transition: none;
    }
  }
</style>
