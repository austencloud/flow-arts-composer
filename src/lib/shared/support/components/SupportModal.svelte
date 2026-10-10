<script lang="ts">
  /**
   * SupportModal — the in-app "buy me a coffee" surface, so a user never leaves
   * the app to give money.
   *
   * Desktop: BaseModal size="fit" — a centered card sized to its content, no
   * scroll (the donation card is short). Mobile (≤520px): a per-instance CSS
   * override below makes THIS modal go edge-to-edge fullscreen, reusing the same
   * fullscreen treatment BaseModal already gives size="full" — without changing
   * the shared primitive for every other modal.
   *
   * Mounted once at the app shell (MainApplication) and driven by
   * supportModalState. The /support route still exists (printed-guide QR +
   * Stripe-return redirect) and shares the SAME SupportContent.
   */
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import SupportContent from "./SupportContent.svelte";
  import { supportModalState } from "../state/support-modal-state.svelte";
</script>

<BaseModal
  open={supportModalState.open}
  size="fit"
  animation="pop"
  onclose={() => supportModalState.hide()}
  labelledBy="support-modal-title"
  class="support-modal"
>
  {#snippet header()}
    <ModalHeader
      title="Support"
      icon="fa-heart"
      iconColor="#f472b6"
      onClose={() => supportModalState.hide()}
      id="support-modal-title"
    />
  {/snippet}

  <div class="support-modal-body">
    <SupportContent variant="modal" />
  </div>
</BaseModal>

<style>
  .support-modal-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 10px 22px 26px;
  }

  /* Desktop: widen past the default fit width (480px) so the 3 payment tiles
     aren't cramped, but stay content-fit and centered. */
  :global(dialog.base-modal.support-modal[data-size="fit"]) {
    width: min(540px, 92vw);
  }

  /* Mobile: go fullscreen. Higher specificity than the shared
     [data-size="fit"] mobile-card rule in modal-tokens.css (extra .support-modal
     class), and placed after the desktop rule, so it wins at ≤520px. */
  @media (max-width: 520px) {
    :global(dialog.base-modal.support-modal[data-size="fit"]) {
      width: 100%;
      max-width: none;
      height: 100%;
      max-height: 100%;
      border-radius: 0;
      margin: 0;
    }
    /* Fill the fullscreen height so the card centers vertically instead of
       pinning to the top (fit-size content-wrapper/body are content-height). */
    :global(dialog.base-modal.support-modal[data-size="fit"] .modal-content-wrapper),
    :global(dialog.base-modal.support-modal[data-size="fit"] .modal-body) {
      height: 100%;
    }
    .support-modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 8px 18px 22px;
    }
  }
</style>
