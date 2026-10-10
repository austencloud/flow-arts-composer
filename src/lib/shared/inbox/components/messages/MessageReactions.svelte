<!--
  MessageReactions.svelte

  Messenger-style reaction badge: tiny emoji pill at the bubble corner.
  Just the emoji(s) in a small rounded container with a shadow for depth.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { MessageReaction } from "#lib/shared/messaging/domain/models/message-models.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";

  let { reactions, onToggleReaction, currentUserId } = $props<{
    reactions: MessageReaction[];
    onToggleReaction: (emoji: string) => void;
    currentUserId?: string;
  }>();

  const activeUserId = $derived(currentUserId ?? authState.user?.uid);

  function hasUserReacted(reaction: MessageReaction): boolean {
    return activeUserId ? reaction.userIds.includes(activeUserId) : false;
  }
</script>

<div class="reaction-cluster" aria-label={t("inbox_ui_message_reactions")} role="group">
  {#each reactions as reaction}
    <button
      type="button"
      class="reaction-option"
      class:reacted={hasUserReacted(reaction)}
      onclick={() => onToggleReaction(reaction.emoji)}
      aria-pressed={hasUserReacted(reaction)}
      aria-label={t(hasUserReacted(reaction) ? "inbox_reaction_remove_count" : "inbox_reaction_add_count", { emoji: reaction.emoji, count: reaction.userIds.length })}
    >
      <span class="reaction-surface">
        <span class="emoji" aria-hidden="true">{reaction.emoji}</span>
        {#if reaction.userIds.length > 1}
          <span class="count" aria-hidden="true">{reaction.userIds.length}</span
          >
        {/if}
      </span>
    </button>
  {/each}
</div>

<style>
  .reaction-cluster {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    height: var(--touch-target-min, 44px);
  }

  .reaction-option {
    display: grid;
    place-items: center;
    min-width: var(--touch-target-min, 44px);
    min-height: var(--touch-target-min, 44px);
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 999px;
    color: inherit;
    background: transparent;
    box-shadow: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .reaction-surface {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    min-width: 1.875rem;
    min-height: 1.75rem;
    padding: 0.1875rem 0.5rem;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    border-radius: 999px;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #16161e) 92%,
      transparent
    );
    box-shadow:
      0 3px 10px rgba(0, 0, 0, 0.32),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    transition:
      transform var(--duration-fast, 120ms) ease,
      border-color var(--duration-fast, 120ms) ease,
      background var(--duration-fast, 120ms) ease;
  }

  .reaction-option.reacted .reaction-surface {
    border-color: color-mix(in srgb, var(--theme-accent, #22c55e) 68%, white);
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #16161e) 78%,
      var(--theme-accent, #22c55e) 22%
    );
  }

  .reaction-option:hover .reaction-surface {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #22c55e) 48%,
      var(--theme-stroke-strong, rgba(255, 255, 255, 0.18))
    );
    transform: translateY(-1px);
  }

  .reaction-option:active .reaction-surface {
    transform: translateY(0) scale(0.96);
  }

  .reaction-option:focus-visible {
    outline: none;
  }

  .reaction-option:focus-visible .reaction-surface {
    outline: 2px solid var(--theme-accent, #22c55e);
    outline-offset: 2px;
  }

  .emoji {
    font-size: 0.9375rem;
    line-height: 1;
  }

  .count {
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: reduce) {
    .reaction-surface {
      transition: none;
    }
  }
</style>
