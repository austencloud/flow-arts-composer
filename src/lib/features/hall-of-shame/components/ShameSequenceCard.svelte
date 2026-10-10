<!--
  ShameSequenceCard.svelte

  Card component for displaying a Hall of Shame entry.
  Shows thumbnail, word, category, vote count, and voting controls.
-->
<script lang="ts">

import { getHallOfShameVoter } from "#lib/features/hall-of-shame/get-hall-of-shame-voter.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import type { HallOfShameEntry } from "../domain/models/hall-of-shame-models";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import type { HallOfShameVoter } from "../services/hall-of-shame-voter";

  interface Props {
    entry: HallOfShameEntry;
    onVoteChange?: (sequenceId: string, newVoteCount: number) => void;
  }

  let { entry, onVoteChange }: Props = $props();

  // State
  let hasVoted = $state(false);
  let isVoting = $state(false);
  let localVoteCount = $state(0);

  const currentUser = $derived(authState.user);

  // Get voter service
  let hallOfShameVoter: HallOfShameVoter | null = null;
  try {
    hallOfShameVoter = getHallOfShameVoter();
  } catch (error) {
    console.warn("Failed to resolve hallOfShameVoter:", error);
  }

  // Check if user has already voted
  $effect(() => {
    if (currentUser && hallOfShameVoter) {
      hallOfShameVoter.hasVoted(entry.id, currentUser.uid).then((voted) => {
        hasVoted = voted;
      });
    }
  });

  // Sync local vote count with prop
  $effect(() => {
    localVoteCount = entry.voteCount || 0;
  });

  async function handleVote() {
    if (!currentUser || !hallOfShameVoter || hasVoted || isVoting) return;

    isVoting = true;

    try {
      await hallOfShameVoter.vote(entry.id, currentUser.uid);
      hasVoted = true;
      localVoteCount++;
      onVoteChange?.(entry.id, localVoteCount);
    } catch (error) {
      console.error("[ShameSequenceCard] Vote failed:", error);
      toast.error("Couldn't record your vote. Please try again.");
    } finally {
      isVoting = false;
    }
  }

  function getCategoryColor(category: string): string {
    switch (category) {
      case "profanity":
        return "#ef4444"; // Red
      case "sexual":
        return "#ec4899"; // Pink
      case "creative":
        return "#8b5cf6"; // Purple
      default:
        return "#6b7280"; // Gray
    }
  }

  function formatDate(timestamp: unknown): string {
    if (!timestamp) return "";
    const date =
      timestamp instanceof Date
        ? timestamp
        : (timestamp as { toDate: () => Date }).toDate?.() ||
          new Date(timestamp as string);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
</script>

<article class="shame-card" class:featured={entry.featured}>
  <div class="card-media">
    {#if entry.thumbnails?.length > 0}
      <img
        src={entry.thumbnails[0]}
        alt="Sequence: {entry.word}"
        class="thumbnail"
        loading="lazy"
      />
    {:else}
      <div class="thumbnail placeholder">
        <i class="fas fa-skull-crossbones" aria-hidden="true"></i>
      </div>
    {/if}

    {#if entry.featured}
      <div class="featured-badge" title={t('hall_of_shame_featured')}>
        <i class="fas fa-star" aria-hidden="true"></i>
      </div>
    {/if}

    <div class="category-badge" style="--category-color: {getCategoryColor(entry.category)}">
      {entry.category}
    </div>
  </div>

  <div class="card-content">
    <h3 class="word">{entry.word}</h3>
    <p class="submitter">
      <i class="fas fa-user" aria-hidden="true"></i>
      {entry.ownerDisplayName}
    </p>
    <p class="date">
      {formatDate(entry.approvedAt || entry.submittedAt)}
    </p>
  </div>

  <div class="card-actions">
    <button
      class="vote-button"
      class:voted={hasVoted}
      onclick={handleVote}
      disabled={!currentUser || hasVoted || isVoting}
      title={hasVoted ? t('hall_of_shame_already_voted') : currentUser ? t('hall_of_shame_vote_for_this') : t('hall_of_shame_sign_in_to_vote')}
      aria-label={hasVoted ? t('hall_of_shame_already_voted') : currentUser ? t('hall_of_shame_vote_for_this') : t('hall_of_shame_sign_in_to_vote')}
    >
      {#if isVoting}
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      {:else}
        <i class="fas fa-fire" aria-hidden="true"></i>
      {/if}
      <span class="vote-count">{localVoteCount}</span>
    </button>
  </div>
</article>

<style>
  .shame-card {
    display: flex;
    flex-direction: column;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    overflow: hidden;
    transition: all var(--duration-normal, 0.2s) ease;
  }

  .shame-card:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    transform: translateY(-2px);
  }

  .shame-card.featured {
    border-color: color-mix(in srgb, var(--semantic-warning, #f59e0b) 50%, transparent);
    box-shadow: 0 0 20px color-mix(in srgb, var(--semantic-warning, #f59e0b) 20%, transparent);
  }

  .card-media {
    position: relative;
    aspect-ratio: 1;
    background: rgba(0, 0, 0, 0.2);
  }

  .thumbnail {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumbnail.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      135deg,
      var(--theme-panel-bg, #1a1a2e) 0%,
      var(--theme-card-bg, #16213e) 100%
    );
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: 2rem;
  }

  .featured-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 28px;
    height: 28px;
    background: var(--semantic-warning, #f59e0b);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 0.75rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .category-badge {
    position: absolute;
    bottom: 8px;
    right: 8px;
    padding: 4px 10px;
    background: color-mix(in srgb, var(--category-color) 80%, black);
    border-radius: 6px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: white;
  }

  .card-content {
    padding: 12px;
    flex: 1;
  }

  .word {
    margin: 0 0 6px;
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--theme-text, #ffffff);
    font-family: var(--font-mono, monospace);
    letter-spacing: 1px;
  }

  .submitter {
    margin: 0;
    font-size: 0.75rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .submitter i {
    font-size: 0.625rem;
    opacity: 0.7;
  }

  .date {
    margin: 4px 0 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .card-actions {
    padding: 0 12px 12px;
  }

  .vote-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 10px;
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    border-radius: 8px;
    color: var(--semantic-error, #ef4444);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 0.15s) ease;
  }

  .vote-button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 25%, transparent);
    border-color: var(--semantic-error, #ef4444);
  }

  .vote-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .vote-button.voted {
    background: var(--semantic-error, #ef4444);
    border-color: var(--semantic-error, #ef4444);
    color: white;
    cursor: default;
  }

  .vote-count {
    min-width: 20px;
  }

  /* Focus states for accessibility */
  .vote-button:focus-visible {
    outline: 2px solid var(--theme-accent, #3b82f6);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .shame-card,
    .vote-button {
      transition: none;
    }

    .shame-card:hover {
      transform: none;
    }
  }
</style>
