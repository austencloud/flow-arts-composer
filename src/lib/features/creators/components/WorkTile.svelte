<!--
  WorkTile — one published sequence on the Wall, credited to its creator.

  The tile exists to do something the roster cannot: show that these people
  MAKE things. A directory of 56 faces is a list; a wall of their work is a
  reason to scroll. The attribution strip is the load-bearing half — an
  uncredited thumbnail is browse, not creators.

  The media stage is the same animation + pictograph-strip showcase used by
  sequence attachments in Messages. This tile only adds creator attribution
  and navigation; it does not own another preview player.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import RobustAvatar from "#lib/shared/components/avatar/RobustAvatar.svelte";
  import SequenceShowcasePreview from "#lib/shared/sequence-preview/components/SequenceShowcasePreview.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { EnhancedUserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
  import { deriveWord } from "#lib/shared/foundation/services/word-deriver.js";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";

  interface Props {
    sequence: SequenceData;
    creator: EnhancedUserProfile;
    /** px-per-em from the panel ramp; RobustAvatar sizes in px. */
    unitPx: number;
    onselect: (sequence: SequenceData) => void;
    /** Jump to the maker's profile rather than opening the work. */
    oncreator: (creator: EnhancedUserProfile) => void;
  }

  let { sequence, creator, unitPx, onselect, oncreator }: Props = $props();

  const avatarSize = $derived(Math.round(1.5 * unitPx));
  const sequenceWord = $derived(simplifyRepeatedWord(deriveWord(sequence)));

  function loadSequence(): Promise<SequenceData> {
    return Promise.resolve(sequence);
  }
</script>

<div class="tile">
  <div class="art">
    <SequenceShowcasePreview
      word={sequenceWord}
      {loadSequence}
      activation="ambient"
      allowQR={false}
      onopen={() => onselect(sequence)}
      openLabel={t("browse_verified_open_creators_sequence", { name: creator.displayName, word: sequenceWord })}
    />
  </div>

  <!--
    A separate control, not a nested button: the thumbnail opens the work and
    the credit opens the maker, and nesting them would make one unreachable
    by keyboard and invalid HTML besides.
  -->
  <button
    class="credit"
    type="button"
    onclick={() => oncreator(creator)}
    aria-label={t("browse_verified_view_creator_profile", { name: creator.displayName })}
  >
    <RobustAvatar
      src={creator.avatar}
      name={creator.displayName}
      alt=""
      customSize={avatarSize}
      loading="lazy"
    />
    <span class="credit-name">{creator.displayName}</span>
  </button>
</div>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 0.85em;
    overflow: hidden;
    transition:
      border-color var(--duration-quick, 120ms) ease,
      transform var(--duration-quick, 120ms) ease;
  }

  .tile:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    transform: translateY(-2px);
  }

  .art {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    --sequence-showcase-border: 0;
    --sequence-showcase-radius: 0;
  }

  .credit {
    display: flex;
    align-items: center;
    gap: 0.45em;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 0.4em 0.6em;
    background: none;
    border: none;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.07));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    font: inherit;
    font-size: 0.8em;
    text-align: left;
    cursor: pointer;
    transition: color var(--duration-quick, 120ms) ease;
  }

  .credit:hover,
  .credit:focus-visible {
    color: var(--theme-text, rgba(255, 255, 255, 0.95));
  }

  .credit:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: -2px;
  }

  .credit-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .tile,
    .tile:hover {
      transition: none;
      transform: none;
    }
  }
</style>
