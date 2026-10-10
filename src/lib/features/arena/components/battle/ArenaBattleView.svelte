<!--
  ArenaBattleView.svelte - Core arena experience

  Two animated sequences side by side (desktop) or stacked (mobile).
  User picks which they prefer. Vote updates Glicko-2 ratings and
  transitions to the next matchup.

  Desktop: Left/Right arrow keys to vote, Space to skip
  Mobile: Tap panel to vote
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { onMount, onDestroy } from "svelte";
  import ArenaMatchupPanel from "./ArenaMatchupPanel.svelte";
  import ArenaDivider from "./ArenaDivider.svelte";
  import ArenaStreakCounter from "./ArenaStreakCounter.svelte";
  import ArenaVoteConfirmation from "./ArenaVoteConfirmation.svelte";
  import BpmChips from "#lib/shared/animation-engine/components/controls/BpmChips.svelte";
  import ArenaPropDrawer from "./ArenaPropDrawer.svelte";
  import { arenaState } from "../../state/arena-state.svelte";
  import { getArenaOrchestrator } from "../../get-arena-orchestrator";
  import { getAuthSync } from "#lib/shared/auth/firebase.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    DEFAULT_PROP_LOOK,
    versionAfterPick,
    type PropLook,
  } from "#lib/shared/pictograph/prop/domain/prop-look.js";
  import {
    PROP_TYPE_DISPLAY_REGISTRY,
    getAllPropTypes,
  } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  // All prop types for the random pool (excludes POI which is momentum-based).
  function pickRandomPropType(): PropType {
    const availableProps = getAllPropTypes().filter(
      (pt) => pt !== PropType.POI
    );
    return availableProps[Math.floor(Math.random() * availableProps.length)]!;
  }

  let mounted = true;

  // Auth context
  let userId = $state<string | null>(null);

  // Get orchestrator from DI
  const orchestrator = getArenaOrchestrator();

  // Vote feedback animation state
  let voteResult = $state<"left" | "right" | null>(null);
  let winnerWord = $state("");
  let transitioning = $state(false);
  let showKeyboardHints = $state(true);

  // Prop type and version per matchup - both sides show the same prop. The
  // version belongs to the arena, never to the account's prop setting.
  let randomPropMode = $state(true);
  let matchupPropType = $state<PropType>(pickRandomPropType());
  let matchupPropLook = $state<PropLook>(DEFAULT_PROP_LOOK);
  let propDrawerOpen = $state(false);

  // A version belongs to the pick (versionAfterPick): a V2 tile sets Version 2,
  // and a different prop, including a random one, starts at Version 1.
  function setMatchupProp(prop: PropType, look?: PropLook): void {
    matchupPropLook = versionAfterPick(matchupPropType, matchupPropLook, prop, look);
    matchupPropType = prop;
  }

  function handlePropSelect(pt: PropType, look?: PropLook) {
    randomPropMode = false;
    setMatchupProp(pt, look);
  }

  function toggleRandomProp() {
    if (randomPropMode) {
      // Already random - open drawer to pick a specific one
      propDrawerOpen = true;
    } else {
      // Switch back to random
      randomPropMode = true;
      setMatchupProp(pickRandomPropType());
    }
  }

  // Current prop's display info for the button
  const currentPropImage = $derived(
    PROP_TYPE_DISPLAY_REGISTRY[matchupPropType]?.image
  );
  const currentPropLabel = $derived(
    PROP_TYPE_DISPLAY_REGISTRY[matchupPropType]?.label ?? "Staff"
  );

  // Shared BPM for both animation players
  let arenaBpm = $state(60);

  onMount(async () => {
    // Get auth state
    try {
      const auth = getAuthSync();
      userId = auth.currentUser?.uid ?? null;

      if (!userId) {
        arenaState.error = t("arena_battle_sign_in_required");
        arenaState.isLoading = false;
        return;
      }

      await orchestrator.initialize(userId);
      arenaState.currentMatchup = orchestrator.getCurrentMatchup();
      if (randomPropMode) setMatchupProp(pickRandomPropType());
      arenaState.isLoading = false;
    } catch (err) {
      console.error("[Arena] Failed to initialize:", err);
      arenaState.error = t("arena_battle_load_failed");
      arenaState.isLoading = false;
    }

    // Hide keyboard hints after first interaction
    const dismissHints = () => {
      showKeyboardHints = false;
      document.removeEventListener("keydown", dismissHints);
    };
    document.addEventListener("keydown", dismissHints);
  });

  function handleKeydown(e: KeyboardEvent) {
    if (transitioning || !arenaState.currentMatchup) return;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      vote("left");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      vote("right");
    } else if (e.key === " ") {
      e.preventDefault();
      skip();
    }
  }

  async function vote(side: "left" | "right") {
    if (transitioning || !arenaState.currentMatchup) return;
    arenaState.isVoting = true;
    transitioning = true;

    const matchup = arenaState.currentMatchup;
    const winnerId = side === "left" ? matchup.entryA.id : matchup.entryB.id;
    winnerWord = side === "left" ? matchup.entryA.word : matchup.entryB.word;
    voteResult = side;

    // Haptic feedback on mobile
    getHapticFeedback().trigger("selection");

    try {
      await orchestrator.vote(winnerId);
    } catch (err) {
      console.error("[Arena] Vote failed:", err);
      arenaState.error = t("arena_battle_vote_failed");
      if (mounted) {
        voteResult = null;
        winnerWord = "";
        transitioning = false;
        arenaState.isVoting = false;
      }
      return;
    }

    // Hold vote feedback animation
    await new Promise<void>((resolve) => {
      const id = setTimeout(resolve, 600);
      if (!mounted) {
        clearTimeout(id);
        resolve();
      }
    });

    if (!mounted) return;

    // Transition to next matchup
    voteResult = null;
    winnerWord = "";
    arenaState.currentMatchup = orchestrator.getCurrentMatchup();
    if (randomPropMode) setMatchupProp(pickRandomPropType());
    arenaState.sessionStreak = orchestrator.getSessionStreak();
    arenaState.matchupsCompleted = orchestrator.getMatchupsCompleted();

    transitioning = false;
    arenaState.isVoting = false;
  }

  async function skip() {
    if (transitioning) return;
    transitioning = true;
    arenaState.sessionStreak = 0;

    await orchestrator.skip();
    arenaState.currentMatchup = orchestrator.getCurrentMatchup();
    if (randomPropMode) setMatchupProp(pickRandomPropType());

    transitioning = false;
  }

  // Global keyboard listener
  let keydownHandler: (e: KeyboardEvent) => void;
  onMount(() => {
    keydownHandler = handleKeydown;
    document.addEventListener("keydown", keydownHandler);
  });
  onDestroy(() => {
    mounted = false;
    if (keydownHandler) {
      document.removeEventListener("keydown", keydownHandler);
    }
  });
</script>

<div class="battle-view">
  {#if arenaState.error}
    <div class="battle-error" role="alert">
      <i class="fas fa-lock" aria-hidden="true"></i>
      <p>{arenaState.error}</p>
    </div>
  {:else if arenaState.isLoading}
    <div
      class="battle-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
      <p>{t("arena_battle_loading")}</p>
    </div>
  {:else if arenaState.currentMatchup}
    {@const matchup = arenaState.currentMatchup}

    <div class="matchup-container">
      <ArenaMatchupPanel
        entry={matchup.entryA}
        rating={matchup.ratingA}
        data={matchup.dataA}
        side="left"
        {voteResult}
        disabled={transitioning}
        onvote={() => vote("left")}
        propType={matchupPropType}
        propLook={matchupPropLook}
        bpm={arenaBpm}
      />

      <ArenaDivider />

      <ArenaMatchupPanel
        entry={matchup.entryB}
        rating={matchup.ratingB}
        data={matchup.dataB}
        side="right"
        {voteResult}
        disabled={transitioning}
        onvote={() => vote("right")}
        propType={matchupPropType}
        propLook={matchupPropLook}
        bpm={arenaBpm}
      />
    </div>

    <div class="controls-bar">
      <div class="controls-row">
        <ArenaStreakCounter streak={arenaState.sessionStreak} />

        <button
          class="skip-button"
          onclick={skip}
          disabled={transitioning}
          aria-label={t("arena_battle_skip_matchup")}
          type="button"
        >
          <i class="fas fa-forward" aria-hidden="true"></i>
          {t("arena_action_skip")}
        </button>

        {#if showKeyboardHints}
          <div class="keyboard-hints" aria-hidden="true">
            <kbd>&larr;</kbd>
            {t("arena_battle_key_left")}
            <kbd>&rarr;</kbd>
            {t("arena_battle_key_right")}
            <kbd>Space</kbd>
            {t("arena_action_skip")}
          </div>
        {/if}
      </div>

      <div class="settings-row">
        <button
          class="prop-button"
          onclick={() => (propDrawerOpen = true)}
          type="button"
          aria-label={t("arena_battle_change_prop", { prop: currentPropLabel })}
          title={currentPropLabel}
        >
          <img
            src={currentPropImage}
            alt={currentPropLabel}
            class="prop-button-icon"
          />
        </button>

        <button
          class="shuffle-button"
          class:active={randomPropMode}
          onclick={toggleRandomProp}
          type="button"
          aria-label={t(
            randomPropMode
              ? "arena_battle_random_active"
              : "arena_battle_random_enable"
          )}
          title={t(
            randomPropMode
              ? "arena_battle_random_click_to_choose"
              : "arena_battle_shuffle"
          )}
        >
          <i class="fas fa-shuffle" aria-hidden="true"></i>
        </button>

        <div class="bpm-section">
          <BpmChips
            bpm={arenaBpm}
            variant="compact"
            onBpmChange={(v) => (arenaBpm = v)}
          />
        </div>
      </div>
    </div>

    <ArenaVoteConfirmation winner={winnerWord} />

    <ArenaPropDrawer
      bind:isOpen={propDrawerOpen}
      selectedPropType={matchupPropType}
      propLook={matchupPropLook}
      onSelect={handlePropSelect}
      onPropLookChange={(look) => (matchupPropLook = look)}
    />
  {:else}
    <div class="battle-empty" role="status">
      <i class="fas fa-inbox" aria-hidden="true"></i>
      <p>{t("arena_battle_empty")}</p>
    </div>
  {/if}
</div>

<style>
  .battle-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 16px;
    gap: 12px;
  }

  .matchup-container {
    display: flex;
    flex: 1;
    gap: 0;
    align-items: stretch;
    min-height: 0;
    position: relative;
  }

  /* Desktop: side by side */
  @media (min-width: 768px) {
    .matchup-container {
      flex-direction: row;
      gap: 8px;
    }
  }

  /* Mobile: stacked */
  @media (max-width: 767px) {
    .matchup-container {
      flex-direction: column;
      gap: 8px;
    }
  }

  .controls-bar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 0;
    flex-shrink: 0;
  }

  .controls-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .settings-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    max-width: 640px;
    margin: 0 auto;
    width: 100%;
  }

  .prop-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
    padding: 6px;
    flex-shrink: 0;
  }

  .prop-button:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
  }

  .prop-button:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .prop-button-icon {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .shuffle-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
    flex-shrink: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: 16px;
  }

  .shuffle-button:hover:not(.active) {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
  }

  .shuffle-button.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 25%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 50%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  .shuffle-button:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .bpm-section {
    flex: 1;
    min-width: 0;
  }

  .skip-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    min-height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition:
      border-color 0.2s ease,
      color 0.2s ease;
  }

  .skip-button:hover:not(:disabled) {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, #fff);
  }

  .skip-button:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .skip-button:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .keyboard-hints {
    display: none;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
  }

  @media (min-width: 768px) {
    .keyboard-hints {
      display: flex;
    }
  }

  .keyboard-hints kbd {
    padding: 2px 6px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 4px;
    font-size: var(--font-size-compact, 12px);
    font-family: inherit;
  }

  .battle-loading,
  .battle-error,
  .battle-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex: 1;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
  }

  .battle-error {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .battle-loading i,
  .battle-error i,
  .battle-empty i {
    font-size: 32px;
  }

  .battle-loading p,
  .battle-error p,
  .battle-empty p {
    margin: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .skip-button,
    .prop-button,
    .shuffle-button {
      transition: none;
    }
  }
</style>
