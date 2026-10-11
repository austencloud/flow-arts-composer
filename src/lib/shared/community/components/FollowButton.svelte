<script lang="ts">
  /**
   * FollowButton - shared follow/unfollow control.
   *
   * Owns the idle / following / loading display state machine, the
   * touch-target floor, and the guest/self visibility gate, so no consumer
   * can forget to hide it from an anonymous guest or a user's own card.
   * Purely controlled: the caller performs the actual repository write
   * (followUser/unfollowUser) and only flips `following`/`loading` after
   * that write resolves - never optimistically. See
   * .claude/rules/no-layout-shift.md for the ghost-sizer technique used
   * below to keep Follow / Following / the loading spinner from resizing
   * the button.
   */

  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    /** Id of the profile this button follows/unfollows. */
    targetUserId: string;
    /** Display name of that profile, used in the aria-label. */
    displayName: string;
    following: boolean;
    loading?: boolean;
    onToggle: () => void;
    /** CSS color (or gradient) the button tints itself with. */
    accent?: string;
    /**
     * `solid` is the default: a filled call to action, correct when the button
     * is the main thing in view (a profile header, a single card).
     *
     * `quiet` renders the idle state as a tinted outline that fills on hover.
     * Use it wherever MANY follow buttons appear at once — a roster of 20
     * filled buttons becomes a field of colour blocks that outshouts the faces
     * they belong to. The Following state is already an outline in both.
     */
    weight?: "solid" | "quiet";
  }

  let {
    targetUserId,
    displayName,
    following,
    loading = false,
    onToggle,
    accent = "var(--theme-accent-strong)",
    weight = "solid",
  }: Props = $props();

  // Guests hold a real Firebase uid (anonymous sign-in), so a truthy
  // currentUserId alone does NOT prove a real account - isFullAccount
  // explicitly excludes isAnonymous. Owning this check here means no
  // consumer can ship a follow button that a guest can tap.
  const currentUserId = $derived(authState.user?.uid ?? null);
  const canFollow = $derived(
    authState.isFullAccount && !!currentUserId && currentUserId !== targetUserId
  );

  function handleClick(event: MouseEvent) {
    // Follow buttons are routinely nested inside a whole-card click target
    // (a clickable card div, an overlay anchor). Stop the click from also
    // firing the card's own navigation.
    event.stopPropagation();
    onToggle();
  }
</script>

{#if canFollow}
  <button
    type="button"
    class="follow-button"
    class:following
    class:quiet={weight === "quiet"}
    style="--follow-accent: {accent}"
    disabled={loading}
    aria-busy={loading}
    aria-label={following ? `Unfollow ${displayName}` : `Follow ${displayName}`}
    onclick={handleClick}
  >
    <span class="follow-slot">
      <span class="follow-slot-sizer" aria-hidden="true">
        <i class="fas fa-check"></i>
        <span>{t("browse_following")}</span>
      </span>
      <span class="follow-slot-live">
        {#if loading}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        {:else if following}
          <i class="fas fa-check" aria-hidden="true"></i>
          <span>{t("browse_following")}</span>
        {:else}
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{t("browse_follow")}</span>
        {/if}
      </span>
    </span>
  </button>
{/if}

<style>
  .follow-button {
    display: inline-flex;
    width: 100%;
    align-items: center;
    justify-content: center;
    min-height: var(--min-touch-target);
    padding: 6px 12px;
    background: var(--follow-accent);
    border: 1px solid var(--follow-accent);
    border-radius: 6px;
    color: white;
    font-size: var(--font-size-compact);
    font-weight: 500;
    cursor: pointer;
    transition:
      filter var(--duration-emphasis) ease,
      background var(--duration-emphasis) ease,
      border-color var(--duration-emphasis) ease,
      color var(--duration-emphasis) ease,
      box-shadow var(--duration-emphasis) ease;
  }

  .follow-button:hover {
    filter: brightness(1.15);
    box-shadow: 0 2px 8px
      color-mix(in srgb, var(--follow-accent) 25%, transparent);
  }

  .follow-button:focus-visible {
    outline: 2px solid var(--follow-accent);
    outline-offset: 2px;
  }

  /* Quiet idle state: present and obviously tappable, but subordinate to the
     card it sits in. Commits to the full accent on hover so the affordance
     still reads as a button (clickables-look-like-buttons.md). */
  .follow-button.quiet:not(.following) {
    background: color-mix(in srgb, var(--follow-accent) 12%, transparent);
    border-color: color-mix(in srgb, var(--follow-accent) 34%, transparent);
    color: color-mix(in srgb, var(--follow-accent) 40%, #fff);
  }

  .follow-button.quiet:not(.following):hover {
    background: var(--follow-accent);
    border-color: var(--follow-accent);
    color: white;
    filter: none;
  }

  .follow-button.following {
    background: transparent;
    border-color: color-mix(in srgb, var(--follow-accent) 30%, transparent);
    color: var(--theme-text-dim);
  }

  .follow-button.following:hover {
    background: color-mix(in srgb, var(--follow-accent) 10%, transparent);
    border-color: color-mix(in srgb, var(--follow-accent) 50%, transparent);
    color: white;
  }

  .follow-button:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  /* Ghost-sizer: the slot reserves the width of the widest possible
     variant ("Following" + its icon) in a hidden sizer stacked in the same
     grid cell as the live content, so switching between Follow / Following
     / the loading spinner never resizes the button or shoves a neighbour
     (no-layout-shift.md). */
  .follow-slot {
    display: inline-grid;
    align-items: center;
    justify-items: center;
  }

  .follow-slot-sizer,
  .follow-slot-live {
    display: inline-flex;
    grid-area: 1 / 1;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .follow-slot-sizer {
    visibility: hidden;
  }

  @media (prefers-reduced-motion: reduce) {
    .follow-button {
      transition: none;
    }
  }
</style>
