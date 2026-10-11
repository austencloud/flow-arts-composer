<script lang="ts">
  // Marketing-only trim of the removed creators-discovery CreatorCard
  // (formerly src/lib/features/creators/components/CreatorCard.svelte).
  // Used exclusively by ConnectSection.svelte on the public /composer route,
  // which renders fictional placeholder creators with no auth, no Firestore,
  // and no follow relationship. The follow button + follow state machine,
  // the sequence-sample strip, and the sortBy="joinedDate" branch are all
  // unreachable when driven by ConnectSection (it never passes canFollow,
  // samples, isWorkLoading, or a non-default sortBy), so they were dropped
  // here. The full-featured original still lives at the old path as a
  // compatibility shim for VirtualizedCreatorGrid/FeaturedCreatorsSection
  // until Phase 2 deletes them.
  import type { EnhancedUserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
  import { getEffectiveProp } from "#lib/shared/community/domain/get-effective-prop.js";
  import { formatTimeAgo } from "#lib/shared/i18n/i18n-formatters.js";
  import { buildCreatorPath } from "#lib/shared/navigation/services/creator-routes.js";
  import { getPropTypeDisplayInfo } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
  import RobustAvatar from "#lib/shared/components/avatar/RobustAvatar.svelte";

  interface Props {
    user: EnhancedUserProfile;
    onUserClick: () => void;
  }

  const { user, onUserClick }: Props = $props();

  const effectiveProp = $derived(getEffectiveProp(user));
  const propInfo = $derived(
    effectiveProp ? getPropTypeDisplayInfo(effectiveProp) : null
  );
  const cardAccent = $derived(user.profileColor || "var(--theme-accent)");
  const profilePath = $derived(buildCreatorPath(user.id));

  const activityCopy = $derived(
    user.lastActiveAt
      ? `Active ${formatTimeAgo(user.lastActiveAt)}`
      : "New creator"
  );

  const summary = $derived.by(() => {
    const bio = user.bio?.trim();
    if (bio) return bio;
    if (user.sequenceCount > 0) {
      const noun = user.sequenceCount === 1 ? "sequence" : "sequences";
      return `${user.sequenceCount} public ${noun} to explore.`;
    }
    return "No public sequences yet.";
  });

  function handleProfileClick(event: MouseEvent) {
    event.preventDefault();
    onUserClick();
  }
</script>

<article
  class="creator-card"
  style="--creator-accent: {cardAccent}"
  aria-labelledby="creator-name-{user.id}"
>
  <a
    class="profile-link"
    href={profilePath}
    aria-label="View {user.displayName}'s profile"
    onclick={handleProfileClick}
  ></a>

  <div class="creator-copy">
    <header class="identity-row">
      <RobustAvatar
        src={user.avatar}
        name={user.displayName}
        alt={user.displayName}
        size="lg"
        ring
        ringColor={cardAccent}
      />

      <div class="identity">
        <div class="name-row">
          <h3 id="creator-name-{user.id}">{user.displayName}</h3>
          {#if user.pronouns}
            <span class="pronouns">{user.pronouns}</span>
          {/if}
        </div>
        <span class="username">@{user.username}</span>
        <span class="activity">{activityCopy}</span>
      </div>
    </header>

    <p class="summary">{summary}</p>

    <div class="identity-tags" aria-label="Creator details">
      {#if propInfo}
        <span class="identity-tag" title="Spins with {propInfo.label}">
          <img src={propInfo.image} alt="" aria-hidden="true" />
          {propInfo.label}
        </span>
      {/if}
    </div>

    <div class="creator-stats">
      <span>
        <strong>{user.sequenceCount}</strong>
        {user.sequenceCount === 1 ? "sequence" : "sequences"}
      </span>
      {#if user.followerCount > 0}
        <span>
          <strong>{user.followerCount}</strong>
          {user.followerCount === 1 ? "follower" : "followers"}
        </span>
      {/if}
    </div>
  </div>

  <div class="work-column">
    <div class="work-heading">
      <span>Public work</span>
    </div>

    <div class="empty-work">
      <i class="fas fa-sparkles" aria-hidden="true"></i>
      <span>
        {user.sequenceCount > 0
          ? "Open profile to see their work"
          : "Nothing published yet"}
      </span>
    </div>

    <span class="profile-cue">
      View profile
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </span>
  </div>
</article>

<style>
  .creator-card {
    --creator-accent: var(--theme-accent);
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 212px;
    gap: 16px;
    min-height: 238px;
    padding: 18px;
    overflow: hidden;
    container-type: inline-size;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-xl, 16px);
    color: var(--theme-text);
    transition:
      background var(--duration-normal) ease,
      border-color var(--duration-normal) ease,
      transform var(--duration-normal) ease,
      box-shadow var(--duration-normal) ease;
  }

  .creator-card::before {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--creator-accent);
    opacity: 0.8;
  }

  .creator-card:hover,
  .creator-card:focus-within {
    background: color-mix(
      in srgb,
      var(--creator-accent) 6%,
      var(--theme-card-bg)
    );
    border-color: color-mix(
      in srgb,
      var(--creator-accent) 44%,
      var(--theme-stroke-strong)
    );
    box-shadow: 0 12px 32px
      color-mix(in srgb, var(--creator-accent) 12%, transparent);
    transform: translateY(-2px);
  }

  .profile-link {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
  }

  .profile-link:focus-visible {
    outline: 2px solid var(--creator-accent);
    outline-offset: -3px;
  }

  .creator-copy,
  .work-column {
    min-width: 0;
    pointer-events: none;
  }

  .creator-copy {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .identity-row {
    display: flex;
    align-items: center;
    gap: 13px;
    min-width: 0;
  }

  .identity {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .name-row {
    display: flex;
    align-items: baseline;
    gap: 7px;
    min-width: 0;
  }

  h3 {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-lg);
    font-weight: 700;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pronouns,
  .username,
  .activity {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .pronouns {
    flex: 0 0 auto;
    font-style: italic;
  }

  .username {
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .activity {
    margin-top: 5px;
    color: color-mix(in srgb, var(--creator-accent) 60%, var(--theme-text));
    font-variant-numeric: tabular-nums;
  }

  .summary {
    display: -webkit-box;
    min-height: 2.8em;
    margin: 0;
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-min);
    line-height: 1.4;
    opacity: 0.9;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .identity-tags,
  .creator-stats {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .identity-tags {
    min-height: 28px;
    overflow: hidden;
  }

  .identity-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    padding: 4px 8px;
    overflow: hidden;
    background: color-mix(in srgb, var(--theme-text) 5%, transparent);
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .identity-tag img {
    width: 15px;
    height: 15px;
    object-fit: contain;
    filter: brightness(0) invert(1);
    opacity: 0.85;
  }

  .creator-stats {
    margin-top: auto;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-variant-numeric: tabular-nums;
  }

  .creator-stats span {
    display: inline-flex;
    gap: 4px;
  }

  .creator-stats span + span::before {
    content: "·";
    margin-right: 3px;
    opacity: 0.45;
  }

  .creator-stats strong {
    color: var(--theme-text);
    font-weight: 700;
  }

  .work-column {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-left: 16px;
    border-left: 1px solid var(--theme-stroke);
  }

  .work-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 24px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-weight: 650;
  }

  .empty-work {
    display: flex;
    min-height: 88px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    text-align: center;
    border: 1px dashed var(--theme-stroke);
    border-radius: var(--radius-lg, 12px);
  }

  .empty-work i {
    color: var(--creator-accent);
    opacity: 0.7;
  }

  .profile-cue {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin-top: auto;
    color: var(--theme-text);
    font-size: var(--font-size-compact);
    font-weight: 650;
  }

  .profile-cue i {
    color: var(--creator-accent);
    transition: transform var(--duration-fast) ease;
  }

  .creator-card:hover .profile-cue i {
    transform: translateX(3px);
  }

  @container (max-width: 470px) {
    .creator-card {
      grid-template-columns: 1fr;
      min-height: 356px;
    }

    .work-column {
      padding-top: 12px;
      padding-left: 0;
      border-top: 1px solid var(--theme-stroke);
      border-left: none;
    }

    .profile-cue {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .creator-card,
    .profile-cue i {
      transition: none;
    }

    .creator-card:hover,
    .creator-card:focus-within {
      transform: none;
    }
  }
</style>
