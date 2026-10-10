<!--
  CreatorCell — one person in the roster.

  This renders FOUR fields, because four fields is what the directory
  reliably has: a face (94.8%), a prop (96.6%), a last-active time (96.6%)
  and a join date (100%). Bio is 0% populated, pinnedItems is 0%, isFeatured
  is 0%, profileColor is 1.7%, and follower counts never exceed 4 — so a card
  with a bio slot, a stat cluster and a follow button is mostly empty space
  wearing a border. That is the failure this replaces.

  Two densities, chosen by the band rather than by the cell:
  - `portrait` for creators who have actually been around (stacked, larger
    face, one evidence line)
  - `index`    for the long tail (a row: small face, name, prop mark)

  Weight follows evidence. Someone active this week gets more pixels than
  someone who joined last spring and never came back, because that is the
  actual difference a visitor is trying to see.
-->
<script lang="ts">
  /*
   * The prop is named in WORDS, never drawn. The marks in
   * PROP_TYPE_DISPLAY_REGISTRY are line art sized to sit inside a pictograph;
   * at the ~16px an identity row can spare, the staff mark is a horizontal
   * rule, so the evidence line rendered as "— Staff · 3 days ago" and the
   * index rows ended in what looked like a "→" navigation arrow.
   */
  import RobustAvatar from "#lib/shared/components/avatar/RobustAvatar.svelte";
  import FollowButton from "#lib/shared/community/components/FollowButton.svelte";
  import { getEffectiveProp } from "#lib/shared/community/domain/get-effective-prop.js";
  import { getPropTypeDisplayInfo } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
  import { formatTimeAgo } from "#lib/shared/i18n/i18n-formatters.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { EnhancedUserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
  import type { BandKey } from "../domain/creator-recency";
  import { ringToneFor } from "../domain/creator-recency";

  interface Props {
    creator: EnhancedUserProfile;
    band: BandKey;
    density: "portrait" | "index";
    /** px-per-em from the panel ramp. Avatars are sized in px by
     * RobustAvatar, so without this they stay 88px while the rest of the
     * page ramps at 4K - the disjointed-4K failure. */
    unitPx: number;
    /** Joined within 30 days. The only badge on the entire page. */
    isNew?: boolean;
    onselect: (creator: EnhancedUserProfile) => void;
    /** Follow/unfollow without leaving the roster. */
    onfollow: (creator: EnhancedUserProfile) => void;
    /** This creator's follow write is in flight. */
    followPending?: boolean;
    /**
     * Cells below the fold defer their avatar fetch. The roster is ~56 faces;
     * firing every <img> on mount is the dominant cold-cache cost of a page
     * whose job is faces.
     */
    loading?: "lazy" | "eager";
  }

  let {
    creator,
    band,
    density,
    unitPx,
    isNew = false,
    onselect,
    onfollow,
    followPending = false,
    loading = "lazy",
  }: Props = $props();

  const prop = $derived(getEffectiveProp(creator));
  const propLabel = $derived(prop ? getPropTypeDisplayInfo(prop)?.label : null);
  const ringTone = $derived(ringToneFor(band));

  // The two creators with no lastActiveAt did not "fail to report" — they
  // joined and never returned, which is a real and useful thing to say.
  const activity = $derived(
    creator.lastActiveAt
      ? formatTimeAgo(creator.lastActiveAt)
      : t("browse_verified_never_returned")
  );

  const isPortrait = $derived(density === "portrait");
  const avatarSize = $derived(Math.round((isPortrait ? 5.5 : 2.5) * unitPx));
</script>

<!--
  A container, not a button. FollowButton is itself a <button>, and a button
  inside a button is invalid markup that strands the inner control for
  keyboard and assistive tech. The card's open action and its follow action
  are siblings; the card surface and hover live on this wrapper.
-->
<div class="cell {density}" style:--ring-tone={ringTone}>
  {#if isNew && isPortrait}
    <span class="badge">{t("browse_verified_new")}</span>
  {/if}

  <button class="open" type="button" onclick={() => onselect(creator)}>
    <span class="face">
      <RobustAvatar
        src={creator.avatar}
        name={creator.displayName}
        alt=""
        customSize={avatarSize}
        ring
        ringColor={ringTone}
        {loading}
      />
    </span>

    <span class="text">
      <span class="name">{creator.displayName}</span>

      {#if isPortrait}
        <!-- ONE evidence line. Prop identity plus when they were last here —
             the two facts that separate this person from the next one. -->
        <span class="evidence">
          {#if propLabel}
            <span class="prop">{propLabel}</span>
            <span class="dot" aria-hidden="true">·</span>
          {/if}
          <span class="when">{activity}</span>
        </span>
      {/if}
      <!-- Index rows carry NO prop glyph. Unlabelled at ~16px the marks read
           as punctuation rather than as props: the staff mark is a horizontal
           line that scans as an em dash, and with the row's trailing space it
           reads as "→", which falsely suggests a separate navigation
           affordance. The band header already states the recency range, so
           there is no time text here either. Face plus name is the whole
           row. -->
    </span>
  </button>

  <!--
    Portrait only. FollowButton carries a "Following" label plus its
    ghost-sizer, which is most of the width of a 178px index row — 37 of them
    down the tail would be a wall of buttons over a list whose whole point is
    that these people stopped showing up. Follow them from their profile.

    The primitive renders NOTHING for a guest, an anonymous session, or your
    own card; that gate lives inside it so no consumer can leak a follow
    control to someone who cannot use it.
  -->
  {#if isPortrait}
    <span class="follow">
      <FollowButton
        targetUserId={creator.id}
        displayName={creator.displayName}
        following={creator.isFollowing ?? false}
        loading={followPending}
        onToggle={() => onfollow(creator)}
        weight="quiet"
      />
    </span>
  {/if}
</div>

<style>
  .cell {
    position: relative; /* the "New" badge anchors to the card's corner */
    display: flex;
    flex-direction: column;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.75em;
    transition:
      background-color var(--duration-quick, 120ms) ease,
      border-color var(--duration-quick, 120ms) ease,
      transform var(--duration-quick, 120ms) ease;
  }

  .open {
    /* A real button — clickables-look-like-buttons.md. The hit area clears the
       44px floor in both densities. */
    display: flex;
    align-items: center;
    flex: 1;
    min-height: var(--min-touch-target, 44px);
    background: none;
    border: none;
    border-radius: inherit;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .cell:hover,
  .cell:focus-within {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.16));
  }

  .open:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: -2px;
  }

  .portrait {
    padding: 1.1em 0.6em 0.9em;
    /* A real surface, not a transparent hit area. Without it the faces and
       names float directly on the animated background and the gaps between
       them read as void rather than as spacing between objects. */
    background: rgba(255, 255, 255, 0.035);
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.07));
  }

  .portrait .open {
    flex-direction: column;
    align-items: center;
    gap: 0.6em;
    text-align: center;
  }

  .portrait:hover,
  .portrait:focus-within {
    transform: translateY(-2px);
    background: rgba(255, 255, 255, 0.075);
  }

  .portrait .text {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.28em;
    min-width: 0;
    width: 100%;
  }

  .portrait .name {
    font-size: 0.95em;
    font-weight: 600;
    line-height: 1.25;
  }

  .index {
    flex-direction: row;
    align-items: center;
    gap: 0.4em;
    padding: 0.4em 0.6em;
  }

  .index .open {
    gap: 0.6em;
    min-width: 0;
  }

  .index .text {
    display: flex;
    align-items: center;
    gap: 0.45em;
    min-width: 0;
    flex: 1;
  }

  .index .name {
    font-size: 0.875em;
    font-weight: 500;
    flex: 1;
  }

  .face {
    position: relative;
    flex: 0 0 auto;
    line-height: 0;
  }

  .name {
    /* Long names truncate rather than wrapping to a second line, which would
       make one cell taller than its neighbours and break the grid rhythm. */
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-text, rgba(255, 255, 255, 0.94));
  }

  .evidence {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.3em;
    min-width: 0;
    font-size: 0.8em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    /* The recency phrase changes length as time passes ("2h" → "3 months").
       Tabular figures stop the digits from jittering the row on re-render. */
    font-variant-numeric: tabular-nums;
  }

  .prop,
  .when {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dot {
    opacity: 0.5;
  }

  .follow {
    display: flex;
    justify-content: center;
  }

  /* FollowButton renders NOTHING for a guest, an anonymous session, or your
     own card, so the spacing hangs off whether a button actually exists —
     `:has`, not `:not(:empty)`, because Svelte leaves whitespace text nodes
     inside the slot and `:empty` would never match. Otherwise every gated
     card carries a phantom gap. */
  .follow:has(button) {
    margin-top: 0.7em;
  }

  .badge {
    /* Sits on the CARD's corner, not clamped to the avatar. A filled pill on
       the face read as an unread-notification dot — an alarm — and roughly
       half the roster carries it, so an alarm is exactly the wrong register.
       Outlined and tinted, it reads as a quiet label. */
    position: absolute;
    top: 0.5em;
    right: 0.5em;
    padding: 0.15em 0.45em;
    border-radius: 999px;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 40%, transparent);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 14%,
      transparent
    );
    color: color-mix(in srgb, var(--theme-accent, #6366f1) 55%, #fff);
    font-size: 0.5625em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    line-height: 1.6;
  }

  @media (prefers-reduced-motion: reduce) {
    .cell,
    .portrait:hover {
      transition: none;
      transform: none;
    }
  }
</style>
