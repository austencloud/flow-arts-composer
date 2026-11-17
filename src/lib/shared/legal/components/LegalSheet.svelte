<script lang="ts">
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import PrivacyPolicyContent from "./PrivacyPolicyContent.svelte";
  import { PRIVACY_LAST_UPDATED, TERMS_LAST_UPDATED } from "./legal-dates.js";
  import { FocusTrap } from "#lib/shared/foundation/ui/drawer/focus-trap.js";

  type SheetType = "terms" | "privacy";

  interface Props {
    isOpen?: boolean;
    type?: SheetType;
    onClose: () => void;
  }

  let { isOpen = false, type = "terms", onClose }: Props = $props();

  let sheetEl = $state<HTMLDivElement | null>(null);

  // Modal sheet: Tab and Shift+Tab stay inside, the page behind goes inert,
  // and focus returns to whatever opened it when the sheet closes.
  const focusTrap = new FocusTrap({
    focusContainerOnInitial: true,
    inertExclusions: [],
  });

  $effect(() => {
    if (!isOpen || !sheetEl) return;
    focusTrap.activate(sheetEl);
    return () => focusTrap.deactivate();
  });

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (isOpen && e.key === "Escape") {
      onClose();
    }
  }

  const lastUpdated: Record<SheetType, string> = {
    terms: TERMS_LAST_UPDATED,
    privacy: PRIVACY_LAST_UPDATED,
  };

  const titles: Record<SheetType, string> = {
    terms: "Terms of Service",
    privacy: "Privacy Policy",
  };
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="sheet-backdrop" onclick={handleBackdropClick}>
    <div
      bind:this={sheetEl}
      class="sheet"
      role="dialog"
      aria-labelledby="sheet-title"
      aria-modal="true"
    >
      <header class="sheet-header">
        <h2 id="sheet-title">{titles[type]}</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div class="sheet-content">
        <p class="last-updated">
          Last Updated: {lastUpdated[type]}
        </p>

        {#if type === "terms"}
          <div class="summary-banner">
            <p>
              <strong>This is a summary for quick reference.</strong> The full
              and authoritative Terms of Service are at
              <LinkChip size="inline" href="/terms">/terms</LinkChip>. In case
              of any difference between this summary and the full terms, the
              full terms control.
            </p>
          </div>

          <section>
            <h3>1. Acceptance of Terms</h3>
            <p>
              By accessing and using The Kinetic Alphabet (TKA) application, you
              agree to be bound by these Terms of Service. If you do not agree
              to these terms, please do not use the application.
            </p>
          </section>

          <section>
            <h3>2. Description of Service</h3>
            <p>
              Flow Arts Composer is an educational platform for learning,
              creating, and sharing TKA sequences. Some features require a paid
              subscription.
            </p>
          </section>

          <section>
            <h3>3. User Accounts</h3>
            <p>
              You are responsible for maintaining the confidentiality of your
              account credentials and all activities under your account.
            </p>
          </section>

          <section>
            <h3>4. User Content (Including Videos)</h3>
            <p>
              You retain ownership of sequences, videos, images, and other
              content you upload. You grant Flow Arts Composer the rights needed
              to host, display, transcode, back up, and deliver your content
              through the service, including sublicensing those rights to
              service providers (CDNs, storage). See the full terms for the
              complete license grant and DMCA takedown procedure.
            </p>
          </section>

          <section>
            <h3>5. Acceptable Use</h3>
            <p>You agree not to:</p>
            <ul>
              <li>Use the service for illegal purposes</li>
              <li>Gain unauthorized access to the service or other accounts</li>
              <li>Interfere with or disrupt the service</li>
              <li>Upload malicious code or harmful content</li>
              <li>Harass or harm other users</li>
            </ul>
          </section>

          <section>
            <h3>6. Automated Access</h3>
            <p>
              You may not use bots, scrapers, or automated tools to extract data
              from the service. You may not reverse-engineer or decompile the
              application. The TKA notation and sequence data are open
              knowledge; this restriction targets automated bulk extraction from
              the hosted service.
            </p>
          </section>

          <section>
            <h3>7. Competing Service</h3>
            <p>
              You may not use the service, its source code, or data obtained
              through it to build or operate a competing product or service.
              Personal tools and educational materials using TKA notation are
              welcome.
            </p>
          </section>

          <section>
            <h3>8. Intellectual Property</h3>
            <p>
              The Flow Arts Composer application is licensed under the Elastic
              License 2.0. "The Kinetic Alphabet", "TKA", and "Flow Arts
              Composer" are trademarks of Austen Cloud. The TKA notation system
              is an open standard under CC BY-SA 4.0.
            </p>
            <p>
              If you believe content on the service infringes your copyright,
              send a DMCA notice per the procedure in
              <LinkChip size="inline" href="/terms#dmca"
                >the full terms</LinkChip
              >.
            </p>
          </section>

          <section>
            <h3>9. Subscriptions</h3>
            <p>
              Some features require a paid subscription. Subscriptions renew
              automatically unless cancelled. Refunds may be issued at the
              developer's discretion.
            </p>
          </section>

          <section>
            <h3>10. Code Contributions</h3>
            <p>
              By submitting code contributions to TKA repositories, you agree to
              the inbound=outbound terms in
              <code>CONTRIBUTING.md</code>: your contribution is licensed under
              the same license as the file you modify, and you grant Austen
              Cloud the right to relicense it under the Post-Mortem Open Source
              Provision. You retain ownership of your work.
            </p>
          </section>

          <section>
            <h3>11. Disclaimers &amp; Liability</h3>
            <p>
              Flow Arts Composer is provided "as is" without warranties of any
              kind. Total liability shall not exceed the amount you paid in the
              twelve months preceding the claim.
            </p>
          </section>

          <section>
            <h3>12. Governing Law</h3>
            <p>
              These Terms are governed by the laws of the State of Illinois,
              United States. Exclusive venue is Cook County, Illinois.
            </p>
          </section>

          <section>
            <h3>13. Contact</h3>
            <p>
              Questions? Email
              <LinkChip size="inline" href="mailto:austencloud@gmail.com"
                >austencloud@gmail.com</LinkChip
              >.
            </p>
            <p>
              <LinkChip href="/terms">View full Terms of Service</LinkChip>
            </p>
          </section>
        {:else}
          <PrivacyPolicyContent inSheet />
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .sheet-backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0, 0, 0);
    z-index: var(--z-modal);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    animation: fadeIn var(--duration-normal) var(--ease-standard);
    isolation: isolate;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .sheet:focus {
    outline: none;
  }

  .sheet {
    width: 100%;
    max-height: 85vh;
    background-color: #0a0a0f;
    border-radius: 20px 20px 0 0;
    display: flex;
    flex-direction: column;
    animation: slideUp var(--duration-emphasis) var(--ease-standard);
    isolation: isolate;
    position: relative;
    z-index: 1;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
    background-color: #0a0a0f;
  }

  .sheet-header h2 {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
    color: #fff;
  }

  .close-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard);
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
  }

  .sheet-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    -webkit-overflow-scrolling: touch;
    background-color: #0a0a0f;
  }

  /* These two carry .sheet-content so they outrank the :global(p) rule below,
     which has to reach the privacy component's markup. */
  .sheet-content .last-updated {
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.875rem;
    margin: 0 0 24px 0;
  }

  .summary-banner {
    background: rgba(129, 140, 248, 0.08);
    border: 1px solid rgba(129, 140, 248, 0.25);
    border-radius: 12px;
    padding: 14px 16px;
    margin: 0 0 24px 0;
  }

  .sheet-content .summary-banner p {
    margin: 0;
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .sheet-content :global(section) {
    margin-bottom: 24px;
  }

  .sheet-content :global(h3) {
    font-size: 1rem;
    font-weight: 600;
    color: #fff;
    margin: 0 0 12px 0;
  }

  .sheet-content :global(p) {
    color: rgba(255, 255, 255, 0.75);
    line-height: 1.6;
    margin: 0 0 12px 0;
    font-size: 0.9375rem;
  }

  .sheet-content :global(ul) {
    color: rgba(255, 255, 255, 0.75);
    line-height: 1.6;
    margin: 0 0 12px 0;
    padding-left: 20px;
    font-size: 0.9375rem;
  }

  .sheet-content :global(li) {
    margin-bottom: 8px;
  }

  .sheet-content :global(strong) {
    color: #fff;
  }

  @media (min-width: 640px) {
    .sheet {
      max-width: 500px;
      max-height: 80vh;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet-backdrop,
    .sheet {
      animation: none;
    }

    .close-btn {
      transition: none;
    }
  }
</style>
