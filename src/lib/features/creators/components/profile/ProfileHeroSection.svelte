<!--
  The identity rail — who this person is, which is the one thing every profile
  can always answer.

  This was a wide banner sitting above a wall of work. That composition assumed
  work existed, and most accounts have none: they got a banner over two grey
  "Nothing published yet" sentences. Austen (2026-07-29): "Most of the people in
  this app have not created anything yet so it should just show how long they've
  been on and all that kind of stuff."

  So it became a rail. Same data plus the fields the banner was dropping on the
  floor (joined, last active, pronouns, catdog), stacked vertically
  beside the work rather than above it. The parent renders it in the same column
  whether or not the person has any work — an empty profile keeps both columns and
  fills the other one with an invitation (`ProfileWorkEmpty`), so the page never
  changes shape between people.

  Every optional field collapses. Bio, pronouns, Instagram and props
  are all sparse in real data; a rail that reserved space for each would be a
  column of gaps, which is a worse empty state than the one being replaced.
-->
<script lang="ts">
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import { fade } from "svelte/transition";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import type { EnhancedUserProfile } from "$lib/shared/community/domain/models/enhanced-user-profile";
  import AvatarImage from "$lib/shared/browse/components/AvatarImage.svelte";
  import { reportModalState } from "$lib/features/moderation/state/report-modal-state.svelte";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import { getEffectiveProp } from "$lib/shared/community/domain/get-effective-prop";
  import {
    normalizeProfileSkill,
    normalizeProfileSkills,
  } from "$lib/shared/community/domain/profile-prop-catalog";
  import {
    joinedLabel,
    activeLabel,
  } from "$lib/features/creators/domain/profile-tenure";

  let {
    userProfile,
    currentUserId,
    isOwnProfile,
    followInProgress,
    onFollowToggle,
    onFollowersClick,
    onFollowingClick,
    collectionsCount,
  }: {
    userProfile: EnhancedUserProfile;
    currentUserId?: string | null;
    isOwnProfile: boolean;
    followInProgress: boolean;
    onFollowToggle: () => void;
    onFollowersClick?: () => void;
    onFollowingClick?: () => void;
    /**
     * The real number of saved collection items, from the band that shows them.
     *
     * NOT `userProfile.collectionCount` — that counter never increments
     * (`reference_collection_count_broken`), so the header read 0 next to a band
     * reading 46 in Austen's own screenshot. Same invariant the doorway work
     * established: a count comes from the pool it describes. Undefined when the
     * viewer cannot read the collections at all (they are owner-only by
     * Firestore rule), in which case the stat is omitted rather than shown as a
     * zero that would claim this person has saved nothing.
     */
    collectionsCount?: number;
  } = $props();

  const accentColor = $derived(
    userProfile.profileColor || "var(--theme-accent)"
  );

  const curatedProps = $derived(
    normalizeProfileSkills(userProfile.propsISpinWith ?? [])
  );
  const featuredProp = $derived(
    userProfile.favoriteProp
      ? normalizeProfileSkill(userProfile.favoriteProp)
      : null
  );

  // Settings-derived prop shown when the user never curated a props list
  const fallbackProp = $derived(
    curatedProps.length === 0 ? getEffectiveProp(userProfile) : null
  );

  const shownProps = $derived(
    curatedProps.length ? curatedProps : fallbackProp ? [fallbackProp] : []
  );

  const joined = $derived(joinedLabel(userProfile.joinedDate));
  const active = $derived(
    activeLabel(userProfile.lastActiveAt, userProfile.joinedDate)
  );

  const catdog = $derived(userProfile.favoriteCatdog ?? null);

  function handleReportUser() {
    reportModalState.open({
      id: userProfile.id,
      displayName: userProfile.displayName,
    });
  }
</script>

<div
  class="rail"
  transition:fade={{ duration: 300 }}
  style:--profile-color={accentColor}
>
  <div class="rail-ambient" aria-hidden="true"></div>

  <div class="rail-body">
    <div class="identity">
      <div class="avatar-container">
        <div class="avatar-glow" aria-hidden="true"></div>
        <AvatarImage
          src={userProfile.avatar}
          alt={userProfile.displayName}
          name={userProfile.displayName}
          size={120}
          className="avatar"
        />
      </div>

      <div class="naming">
        <h1 class="display-name">{userProfile.displayName}</h1>
        <p class="handle">
          <span class="username">@{userProfile.username}</span>
          {#if userProfile.pronouns}
            <span class="pronouns">{userProfile.pronouns}</span>
          {/if}
        </p>
      </div>
    </div>

    {#if userProfile.bio}
      <p class="bio">{userProfile.bio}</p>
    {/if}

    <!-- Tenure and activity. `joined` always renders: `createdAt` is the only
         field populated on 100% of user documents, which makes it the one fact
         an otherwise-empty profile can always stand on. `active` is omitted
         when it would only restate the join date. -->
    <ul class="facts">
      <li class="fact">
        <i class="fas fa-calendar" aria-hidden="true"></i>
        <span>{t("browse_verified_joined", { date: joined })}</span>
      </li>
      {#if active}
        <li class="fact">
          <i class="fas fa-circle-dot" aria-hidden="true"></i>
          <span>{t("browse_verified_active_time", { time: active })}</span>
        </li>
      {/if}
    </ul>

    {#if shownProps.length > 0 || catdog}
      <div class="props-block">
        <span class="block-label">{t("browse_verified_spins_with")}</span>
        <div class="props-row">
          {#each shownProps as prop (prop)}
            <div
              class="profile-prop-icon"
              class:favorite={prop === featuredProp}
              title={getPropTypeDisplayInfo(prop).label}
            >
              <img
                src={getPropTypeDisplayInfo(prop).image}
                alt={getPropTypeDisplayInfo(prop).label}
              />
              {#if prop === featuredProp}
                <span class="favorite-star" aria-label={t("browse_verified_profile_prop")}
                  >&#9733;</span
                >
              {/if}
            </div>
          {/each}

          {#if catdog}
            <!-- A catdog is one identity made of two props, so it renders as a
                 single paired glyph rather than two more icons in the row. -->
            <div
              class="catdog"
              title={t("browse_verified_catdog_props", {
                left: getPropTypeDisplayInfo(catdog.leftPropType).label,
                right: getPropTypeDisplayInfo(catdog.rightPropType).label,
              })}
            >
              <img
                class="catdog-blue"
                src={getPropTypeDisplayInfo(catdog.leftPropType).image}
                alt={getPropTypeDisplayInfo(catdog.leftPropType).label}
              />
              <img
                class="catdog-red"
                src={getPropTypeDisplayInfo(catdog.rightPropType).image}
                alt={getPropTypeDisplayInfo(catdog.rightPropType).label}
              />
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if userProfile.instagramUsername}
      <a
        href="https://instagram.com/{userProfile.instagramUsername}"
        target="_blank"
        rel="noopener noreferrer"
        class="instagram-link"
        aria-label={t("browse_verified_view_instagram", { name: userProfile.displayName })}
      >
        <i class="fab fa-instagram" aria-hidden="true"></i>
        <span>@{userProfile.instagramUsername}</span>
      </a>
    {/if}

    <!-- Label left, count right — the same shape the work bands' heads use, so
         the rail reads as part of the same page. Counts are `tabular-nums` so a
         changing value never jitters its row (no-layout-shift.md). -->
    <dl class="stats">
      <div class="stat">
        <dt>{t("tab_library_sequences")}</dt>
        <dd>{userProfile.sequenceCount.toLocaleString()}</dd>
      </div>
      {#if collectionsCount !== undefined}
        <div class="stat">
          <dt>{t("tab_library_collections")}</dt>
          <dd>{collectionsCount.toLocaleString()}</dd>
        </div>
      {/if}
      <div class="stat">
        <dt>
          <FilterChipBase
            label={t("browse_ui_followers")}
            icon="fas fa-users"
            mode="action"
            size="sm"
            onclick={() => onFollowersClick?.()}
          />
        </dt>
        <dd>{userProfile.followerCount.toLocaleString()}</dd>
      </div>
      <div class="stat">
        <dt>
          <FilterChipBase
            label={t("browse_audit_following")}
            icon="fas fa-user-check"
            mode="action"
            size="sm"
            onclick={() => onFollowingClick?.()}
          />
        </dt>
        <dd>{userProfile.followingCount.toLocaleString()}</dd>
      </div>
    </dl>

    {#if currentUserId && !isOwnProfile}
      <div class="actions">
        <button
          class="follow-button"
          class:following={userProfile.isFollowing}
          class:loading={followInProgress}
          disabled={followInProgress}
          onclick={onFollowToggle}
          aria-label={userProfile.isFollowing
            ? t("browse_verified_unfollow_person", { name: userProfile.displayName })
            : t("browse_verified_follow_person", { name: userProfile.displayName })}
        >
          {#if followInProgress}
            <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {:else}
            {userProfile.isFollowing ? t("browse_audit_following") : t("browse_audit_follow")}
          {/if}
        </button>

        <button
          class="report-button"
          onclick={handleReportUser}
          aria-label={t("browse_verified_report_person", { name: userProfile.displayName })}
          title={t("browse_verified_report_user")}
        >
          <i class="fas fa-flag" aria-hidden="true"></i>
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .rail {
    --instagram-brand: #e4405f;

    /* The rail recomposes on ITS OWN width, not the viewport's. At desktop it
       is a ~400px column and stacks vertically; stacked above the work on a
       tablet it is ~800px wide, where a vertical column of facts would be
       absurd — the `min-width: 640px` query below turns it into a band. One
       component, two compositions, chosen by the box it was given. */
    container-type: inline-size;
    container-name: profile-rail;

    position: relative;
    overflow: hidden;
    border-radius: 16px;
  }

  .rail-ambient {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      circle 260px at 50% 0%,
      color-mix(in srgb, var(--profile-color) 14%, transparent),
      transparent 70%
    );
    pointer-events: none;
    z-index: 0;
  }

  .rail-body {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: clamp(14px, 2cqi, 20px);
  }

  .identity {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  /* 7.5em == the 120px passed to AvatarImage at the base root size, so nothing
     moves on a laptop — but it now grows with the panel's type ramp instead of
     staying a 120px thumbnail beside 1.5x text at 4K. */
  .avatar-container {
    position: relative;
    width: 7.5em;
    height: 7.5em;
    flex-shrink: 0;
  }

  /* AvatarImage writes `--avatar-size` as an INLINE style on its own wrapper, so
     an ancestor cannot redefine it — the only way to make the image follow the
     container is to override the declarations it feeds. An author `!important`
     beats a non-important inline declaration, which is exactly this case. */
  .avatar-container :global(.avatar-wrapper),
  .avatar-container :global(.avatar-wrapper img) {
    width: 100% !important;
    height: 100% !important;
  }

  .avatar-glow {
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--profile-color) 30%, transparent);
    filter: blur(8px);
    z-index: -1;
  }

  .naming {
    min-width: 0;
  }

  .display-name {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: 700;
    line-height: 1.2;
    color: var(--theme-text, white);
    /* Long display names must wrap inside a rail rather than widen it. */
    overflow-wrap: anywhere;
  }

  .handle {
    margin: 4px 0 0 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  .pronouns {
    padding: 1px 8px;
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    font-size: var(--font-size-compact);
  }

  .bio {
    margin: 0;
    font-size: var(--font-size-sm);
    line-height: 1.6;
    color: var(--theme-text-dim);
  }

  .facts {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .fact {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  .fact i {
    width: 1em;
    flex: 0 0 auto;
    text-align: center;
    opacity: 0.7;
  }

  .block-label {
    display: block;
    font-size: var(--font-size-compact);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--theme-text-dim);
  }

  .props-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .props-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }

  .profile-prop-icon {
    position: relative;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
  }

  .profile-prop-icon.favorite {
    opacity: 1;
  }

  .profile-prop-icon img {
    width: 26px;
    height: 26px;
    object-fit: contain;
    /* The prop SVGs are a dark brand-indigo silhouette that washes out at this
       size; recolor to white so they read against the panel (staff is the worst
       case and the most common prop). */
    filter: brightness(0) invert(1) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
  }

  .favorite-star {
    position: absolute;
    bottom: -4px;
    right: -4px;
    font-size: 0.65rem;
    color: var(--semantic-warning, #f59e0b);
  }

  .catdog {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-left: 6px;
    margin-left: 2px;
    border-left: 1px solid var(--theme-stroke);
  }

  .catdog img {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }

  /* Recoloured to the prop identity they carry rather than washed white, since
     the pairing IS the point of a catdog. */
  .catdog-blue {
    filter: brightness(0) saturate(100%) invert(48%) sepia(72%) saturate(1800%)
      hue-rotate(198deg) brightness(97%) contrast(95%);
  }

  .catdog-red {
    filter: brightness(0) saturate(100%) invert(23%) sepia(89%) saturate(3000%)
      hue-rotate(353deg) brightness(95%) contrast(95%);
  }

  .instagram-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: color-mix(in srgb, var(--instagram-brand) 12%, transparent);
    border: 1px solid
      color-mix(in srgb, var(--instagram-brand) 25%, transparent);
    border-radius: 20px;
    color: var(--instagram-brand);
    font-size: var(--font-size-sm);
    font-weight: 500;
    text-decoration: none;
    transition: all var(--duration-normal) ease;
    width: fit-content;
  }

  .instagram-link:hover {
    background: color-mix(in srgb, var(--instagram-brand) 20%, transparent);
    border-color: color-mix(in srgb, var(--instagram-brand) 40%, transparent);
    transform: translateY(-1px);
  }

  .instagram-link i {
    font-size: 16px;
  }

  .stats {
    margin: 0;
    padding-top: clamp(10px, 1.5cqi, 14px);
    border-top: 1px solid var(--theme-stroke);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 32px;
  }

  .stat dt {
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  .stat dd {
    margin: 0 0 0 auto;
    font-size: var(--font-size-base);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text, white);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .follow-button {
    flex: 1;
    min-height: 44px;
    padding: 12px 24px;
    background: var(--theme-accent);
    border: 1px solid var(--theme-accent);
    border-radius: 8px;
    color: var(--text-on-accent, white);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    white-space: nowrap;
  }

  .follow-button:hover {
    filter: brightness(0.9);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--theme-accent) 40%, transparent);
  }

  .follow-button.following {
    background: var(--theme-card-bg);
    border-color: var(--theme-stroke);
    color: var(--theme-text);
  }

  .follow-button.following:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    filter: none;
  }

  .follow-button.loading {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .follow-button:disabled {
    pointer-events: none;
  }

  .report-button {
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .report-button:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 30%,
      transparent
    );
    color: var(--semantic-error, #ef4444);
  }

  .report-button:focus-visible {
    outline: 2px solid var(--semantic-error, #ef4444);
    outline-offset: 2px;
  }

  .instagram-link:focus-visible {
    outline: 3px solid var(--instagram-brand);
    outline-offset: 2px;
  }

  /*
    Wide box: stop being a rail and become a band.

    This fires when the rail is stacked above the work on a tablet or a folded
    phone in landscape, where it owns the full panel width. A vertical column of
    single facts at 800px+ is the dead-rail failure in miniature, so identity
    goes beside the details and the stats spread into a row.
  */
  @container profile-rail (min-width: 640px) {
    .rail-body {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      column-gap: clamp(16px, 2cqi, 28px);
      row-gap: 0.7em;
      align-items: start;
    }

    /* `display: contents` so the avatar and the name become grid items in their
       own right. Left as one block, the whole identity cluster occupied column
       one and the facts flowed into column one's first row — which rendered the
       location and join date ABOVE the person's name. */
    .identity {
      display: contents;
    }

    .avatar-container {
      grid-column: 1;
      grid-row: 1;
    }

    .naming,
    .bio,
    .facts,
    .props-block,
    .instagram-link,
    .actions {
      grid-column: 2;
    }

    .stats {
      grid-column: 1 / -1;
      flex-direction: row;
      gap: clamp(20px, 3cqi, 48px);
    }

    .stat {
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }

    .stat dd {
      margin-left: 0;
      /* Value above label in a row of stats — the reading order that a
         horizontal stat strip wants. */
      order: -1;
      font-size: var(--font-size-lg);
    }

    .actions {
      justify-content: flex-start;
    }

    .follow-button {
      flex: 0 0 auto;
    }
  }

  /* Narrow: centre the identity the way a phone profile expects, whether or not
     the parent asked for a centred card. */
  @container profile-rail (max-width: 400px) {
    .identity {
      align-items: center;
    }

    /* No avatar shrink here. `AvatarImage size={120}` writes a hard 120px box,
       so shrinking only this container let the image spill 32px past it and land
       on the display name. 120px fits the rail at every width it is used at, so
       the honest fix is to leave the size alone rather than fight the prop from
       CSS. */

    .naming {
      text-align: center;
    }

    .handle {
      justify-content: center;
    }

    .display-name {
      font-size: var(--font-size-xl);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .follow-button,
    .instagram-link,
    .report-button {
      transition: none;
    }

    .follow-button:hover,
    .instagram-link:hover {
      transform: none;
    }
  }
</style>
