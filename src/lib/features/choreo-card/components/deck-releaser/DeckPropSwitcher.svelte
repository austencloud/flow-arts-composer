<!--
  DeckPropSwitcher — compact header button that shows the deck's current prop and
  opens the canonical BentoPropGrid picker in a modal. Used in the TnD compose
  header (LOOP decks set the prop via the bento Prop tile instead). Reads/writes
  rs.selectedPropType directly, matching LoopBentoBoard's rs-aware children.
  BaseModal owns focus, Escape, backdrop dismissal, motion, and focus restore.
-->
<script lang="ts">
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import BentoPropGrid from "$lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "$lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import ModalFooter from "$lib/shared/foundation/ui/modal/ModalFooter.svelte";
  import { getDeckReleaserContext } from "./context/deck-releaser-context";

  const { state: rs } = getDeckReleaserContext();

  let open = $state(false);

  const propLabel = $derived(getPropTypeDisplayInfo(rs.leftPropType).label);
</script>

<button
  type="button"
  class="prop-toggle"
  onclick={() => (open = true)}
  aria-label="Prop {propLabel}. Change deck prop"
  aria-haspopup="dialog"
>
  <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
  <span class="prop-toggle-label">Prop</span>
  <span class="prop-toggle-value">{propLabel}</span>
</button>

<BaseModal
  bind:open
  size="xl"
  animation="pop"
  class="prop-picker-modal"
  labelledBy="deck-prop-picker-title"
  onclose={() => (open = false)}
>
  {#snippet header()}
    <ModalHeader
      id="deck-prop-picker-title"
      title="Deck Prop"
      icon="fa-wand-magic-sparkles"
      onClose={() => (open = false)}
    />
  {/snippet}

  <div class="picker-body">
    <BentoPropGrid
      selectedPropType={rs.leftPropType}
      variant="inline"
      showColors={false}
      title="Select Prop"
      onSelect={(p: PropType) => {
        rs.selectedPropType = p;
        rs.persist();
        open = false;
      }}
    />
  </div>

  {#snippet footer()}
    <ModalFooter align="stretch">
      <button type="button" class="primary" onclick={() => (open = false)}>
        Done
      </button>
    </ModalFooter>
  {/snippet}
</BaseModal>

<style>
  .prop-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 10px 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition:
      transform var(--transition-spring),
      border-color var(--transition-fast),
      background var(--transition-fast),
      box-shadow var(--transition-fast);
    white-space: nowrap;
  }
  .prop-toggle:hover {
    transform: translateY(var(--hover-lift-sm, -1px));
    border-color: var(--theme-accent, #8b5cf6);
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    box-shadow: 0 8px 20px
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 18%, transparent);
  }
  .prop-toggle:active {
    transform: scale(0.98);
  }
  .prop-toggle i {
    color: var(--theme-accent, #a78bfa);
    font-size: 13px;
  }
  .prop-toggle-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }
  .prop-toggle-value {
    color: var(--theme-text, #fff);
  }

  :global(dialog.base-modal.prop-picker-modal[data-size="xl"]) {
    width: min(880px, 94vw);
    max-height: min(840px, 90vh);
  }

  .picker-body {
    padding: 16px;
  }

  @media (prefers-reduced-motion: reduce) {
    .prop-toggle {
      transition: none;
    }
  }
</style>
