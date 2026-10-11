<!--
  GameCard — one arcade machine on the PlayHub wall.

  The whole card is a single real <button> (clickables look like buttons): a
  fixed 16/10 dark preview stage with the game's live animation and an accent
  glow rising from its floor, then title, tagline, and a stats row whose
  height is reserved whether or not the game has been played (no layout
  shift). Per-game color arrives ONLY through the sanctioned --game-accent
  local var — never a --theme-* redeclaration.

  Entrance: @starting-style rise staggered by --card-index. The stagger delay
  lives on the outer button while hover lift/glow live on .card-inner, so the
  entrance delay can never lag the hover response. Hover and press animate
  transform/box-shadow only (compositor).
-->
<script lang="ts">
  import type {
    GameDefinition,
    GameProgress,
    Grade,
  } from "../domain/arcade-types";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getGamePreview } from "./previews/preview-map";
  import { gameTitle, gameTagline } from "../domain/play-labels";

  let {
    game,
    progress,
    index,
    onSelect,
  }: {
    game: GameDefinition;
    progress: GameProgress;
    index: number;
    onSelect: () => void;
  } = $props();

  /* The id→preview mapping lives in previews/preview-map.ts, shared with
     ChallengePicker's game-detail screen so both surfaces show the same preview
     per game. */
  const Preview = $derived(getGamePreview(game.id));

  const totalStars = $derived(
    Object.values(progress.starsByChallenge).reduce<number>(
      (sum, s) => sum + s,
      0
    )
  );
  const maxStars = $derived(game.challenges.length * 3);
  const played = $derived(progress.totalPlays > 0);
  const challengesReached = $derived(
    Math.min(progress.challengesUnlocked, game.challenges.length)
  );

  /* Same grade palette as Train's PersonalBests/SessionHistory so a grade
     letter means the same color everywhere in the app. */
  function gradeColor(grade: Grade): string {
    switch (grade) {
      case "S":
        return "#fbbf24";
      case "A":
        return "#22c55e";
      case "B":
        return "#3b82f6";
      case "C":
        return "#f59e0b";
      case "D":
        return "#ef4444";
    }
  }
</script>

<button
  type="button"
  class="game-card"
  style="--game-accent: {game.accentColor}; --card-index: {index}"
  onclick={onSelect}
>
  <span class="card-inner">
    <span class="preview-stage" aria-hidden="true">
      <Preview accent={game.accentColor} />
    </span>

    <span class="card-copy">
      <span class="card-title">{gameTitle(game)}</span>
      <span class="card-tagline">{gameTagline(game)}</span>
    </span>

    <span class="card-stats">
      {#if played}
        <span class="best">
          <span class="best-label">{t("learn_ui_best")}</span>
          <span class="best-score">{progress.bestScore.toLocaleString()}</span>
          {#if progress.bestGrade}
            <span
              class="grade-badge"
              style="--grade-color: {gradeColor(progress.bestGrade)}"
              >{progress.bestGrade}</span
            >
          {/if}
        </span>
      {:else}
        <span class="best">
          <span class="unplayed"
            >{t("learn_ui_challenge_count", {
              count: game.challenges.length,
            })}</span
          >
        </span>
      {/if}

      <span class="ladder">
        <span class="ladder-text">
          <span class="stars-text">★ {totalStars}/{maxStars}</span>
          <span class="challenge-text"
            >{t("learn_ui_challenge_progress", {
              current: challengesReached,
              total: game.challenges.length,
            })}</span
          >
        </span>
        <ProgressRing
          percent={maxStars > 0 ? (totalStars / maxStars) * 100 : 0}
          size={26}
          strokeWidth={3}
          color={game.accentColor}
        />
      </span>
    </span>
  </span>
</button>

<style>
  .game-card {
    /* Whole card is the button; visual chrome lives on .card-inner. */
    display: block;
    width: 100%;
    padding: 0;
    margin: 0;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    color: inherit;
    font: inherit;

    /* Offscreen cards skip render work; the reserved size keeps the
       scrollbar honest. */
    content-visibility: auto;
    contain-intrinsic-size: auto 340px;

    /* Staggered entrance. The delay sits HERE, not on .card-inner, so the
       hover transition below never inherits it. */
    opacity: 1;
    transform: translateY(0);
    transition:
      opacity var(--duration-dramatic, 350ms) var(--ease-out, ease-out),
      transform var(--duration-dramatic, 350ms) var(--ease-out, ease-out);
    transition-delay: calc(var(--card-index) * 40ms);
  }

  @starting-style {
    .game-card {
      opacity: 0;
      transform: translateY(16px);
    }
  }

  .game-card:focus-visible {
    outline: 2px solid var(--game-accent);
    outline-offset: 3px;
    border-radius: var(--radius-2026-lg, 18px);
  }

  .card-inner {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    background: linear-gradient(
      165deg,
      color-mix(
        in srgb,
        var(--game-accent) 8%,
        var(--theme-card-bg, rgba(255, 255, 255, 0.04))
      ),
      var(--theme-card-bg, rgba(255, 255, 255, 0.03)) 70%
    );
    border: 1px solid color-mix(in srgb, var(--game-accent) 24%, transparent);
    border-radius: var(--radius-2026-lg, 18px);
    /* Hover/press animate transform + box-shadow only (compositor). */
    transition:
      transform var(--duration-normal, 200ms) var(--ease-out, ease-out),
      box-shadow var(--duration-normal, 200ms) var(--ease-out, ease-out);
  }

  .game-card:hover .card-inner {
    transform: translateY(-4px);
    box-shadow:
      0 12px 32px color-mix(in srgb, var(--game-accent) 28%, transparent),
      0 4px 12px rgba(0, 0, 0, 0.25);
  }

  .game-card:active .card-inner {
    transform: translateY(-4px) scale(0.98);
  }

  /* The lit machine window: fixed aspect so preview mount never shifts
     layout; deliberately dark in every theme (it is a stage), with the
     game's accent glowing up from the floor. */
  .preview-stage {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 16 / 10;
    /* The stage is a size container so previews scale their contents with
       cq units instead of fixed px — the fix for tiny art lost in a big cell. */
    container-type: size;
    border-radius: var(--radius-2026-md, 14px);
    overflow: hidden;
    background:
      radial-gradient(
        120% 85% at 50% 112%,
        color-mix(in srgb, var(--game-accent) 26%, transparent),
        transparent 62%
      ),
      linear-gradient(180deg, rgba(12, 14, 22, 0.6), rgba(7, 9, 15, 0.82));
    border: 1px solid color-mix(in srgb, var(--game-accent) 15%, transparent);
  }

  .card-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 var(--spacing-xs);
  }

  .card-title {
    font-size: var(--font-size-lg);
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--theme-text, #ffffff);
  }

  .card-tagline {
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  /* Reserved-height stats row: played and unplayed branches occupy the same
     box, so a first win never reflows the card. */
  .card-stats {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    min-height: 34px;
    padding: 0 var(--spacing-xs) var(--spacing-xs);
  }

  .best {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
  }

  .best-label {
    font-size: var(--font-size-compact);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  .best-score {
    font-size: var(--font-size-base);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text, #ffffff);
  }

  .grade-badge {
    align-self: center;
    font-size: var(--font-size-compact);
    font-weight: 800;
    line-height: 1;
    padding: 3px 7px;
    border-radius: 6px;
    color: var(--grade-color);
    border: 1px solid color-mix(in srgb, var(--grade-color) 55%, transparent);
    background: color-mix(in srgb, var(--grade-color) 14%, transparent);
  }

  .unplayed {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  .ladder {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-shrink: 0;
  }

  .ladder-text {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }

  .stars-text {
    font-size: var(--font-size-compact);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: color-mix(in srgb, var(--game-accent) 80%, white);
  }

  .challenge-text {
    font-size: var(--font-size-compact);
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  /* Desktop density: 3-up rows must fit two-high in a ~1000px-tall viewport
     (hero + 2 rows, no scroll), so the stage goes shorter as the hub widens.
     16/10 is the phone/tablet shape; 2/1 → 21/10 keeps rows short enough at
     3 columns. Queries resolve against the PlayHub inline-size container. */
  @container (min-width: 1024px) {
    .preview-stage {
      aspect-ratio: 2 / 1;
    }

    .game-card {
      contain-intrinsic-size: auto 330px;
    }
  }

  @container (min-width: 1600px) {
    .preview-stage {
      aspect-ratio: 21 / 10;
    }

    .game-card {
      contain-intrinsic-size: auto 380px;
    }
  }

  /* 4K-native tier — the card stops reading as a stretched phone card:
     interior breathing room grows and the ladder ring scales with it.
     transform:scale on the ring is deliberate (compositor-only, no reflow of
     ProgressRing's own SVG geometry) rather than threading a container-aware
     size prop through. */
  @container (min-width: 2000px) {
    .game-card {
      contain-intrinsic-size: auto 430px;
    }

    /* The interior padding below grows at this tier, so the stage flattens a
       step further to keep hero + two rows inside a ~1000px-tall viewport:
       621px-wide stage / 2.3 ≈ 270px tall → 432px card → 884px for two rows. */
    .preview-stage {
      aspect-ratio: 23 / 10;
    }

    .card-inner {
      padding: var(--spacing-md);
      gap: var(--spacing-md);
    }

    .preview-stage {
      border-radius: var(--radius-2026-lg, 18px);
    }

    .card-stats {
      min-height: 44px;
    }

    .ladder :global(.progress-ring) {
      transform: scale(1.2);
    }
  }

  @container (min-width: 2560px) {
    .card-title {
      font-size: 1.5rem;
    }

    .card-tagline {
      font-size: var(--font-size-base);
    }

    .best-score {
      font-size: var(--font-size-lg);
    }

    .stars-text,
    .challenge-text {
      font-size: var(--font-size-base);
    }

    .card-copy {
      gap: 4px;
      padding: 0 var(--spacing-sm);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .game-card {
      transition: none;
    }

    .card-inner {
      transition: none;
    }

    .game-card:hover .card-inner,
    .game-card:active .card-inner {
      transform: none;
    }
  }
</style>
