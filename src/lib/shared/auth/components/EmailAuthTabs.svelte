<script lang="ts">
  /**
   * EmailAuthTabs
   *
   * Tabbed interface for email authentication methods:
   * - Email code (passwordless)
   * - Password
   */

  import EmailPasswordAuth from "./EmailPasswordAuth.svelte";
  import EmailLinkAuth from "./EmailLinkAuth.svelte";
  import LastUsedBadge from "$lib/shared/components/LastUsedBadge.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { getLastAuthMethod } from "$lib/shared/auth/services/last-auth-method.svelte";
  import { readPendingEmailCode } from "$lib/shared/auth/services/pending-email-code";
  import { growFade } from "$lib/shared/transitions/motion";

  type Tab = "magic" | "password";

  interface Props {
    mode?: "signin" | "signup";
    compact?: boolean;
    showMethods?: boolean;
    /** Off when the host already offers its own sign-in/sign-up switch. */
    showModeSwitch?: boolean;
  }

  let {
    mode = $bindable("signin"),
    compact = false,
    showMethods = false,
    showModeSwitch = true,
  }: Props = $props();

  const lastMethod = $derived(getLastAuthMethod());
  // A code already on its way stays in front, so coming back from the inbox
  // lands on the box that takes it.
  const codePending = readPendingEmailCode() !== null;

  // Both forms edit the same address, so switching tabs never retypes it.
  let email = $state("");
  let chosenTab = $state<Tab | null>(null);
  let sendCodeOnOpen = $state(false);

  // Someone signing in expects a password box. Someone creating an account
  // gets the code, which needs no password invented. What this device last
  // used beats both, and a tab the person picked beats everything.
  function defaultTab(): Tab {
    if (compact || codePending) return "magic";
    if (lastMethod === "password") return "password";
    if (lastMethod === "magic-link") return "magic";
    return mode === "signin" ? "password" : "magic";
  }

  const activeTab = $derived(chosenTab ?? defaultTab());

  function chooseTab(tab: Tab) {
    chosenTab = tab;
    sendCodeOnOpen = false;
  }

  function useCodeInstead() {
    chosenTab = "magic";
    sendCodeOnOpen = true;
  }
</script>

<div class="email-auth-tabs">
  {#if !compact || showMethods}
    <div
      class="tab-bar"
      role="tablist"
      transition:growFade
      onoutrostart={(event) =>
        ((event.currentTarget as HTMLElement).inert = true)}
      onintrostart={(event) =>
        ((event.currentTarget as HTMLElement).inert = false)}
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "magic"}
        class="tab"
        class:active={activeTab === "magic"}
        onclick={() => chooseTab("magic")}
        aria-label={lastMethod === "magic-link"
          ? t("auth_email_code_last_used")
          : undefined}
      >
        {#if lastMethod === "magic-link"}
          <LastUsedBadge />
        {/if}
        <i class="fas fa-envelope" aria-hidden="true"></i>
        <span>{t("auth_email_code")}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "password"}
        class="tab"
        class:active={activeTab === "password"}
        onclick={() => chooseTab("password")}
        aria-label={lastMethod === "password"
          ? t("auth_password_last_used")
          : undefined}
      >
        {#if lastMethod === "password"}
          <LastUsedBadge />
        {/if}
        <i class="fas fa-key" aria-hidden="true"></i>
        <span>{t("auth_password")}</span>
      </button>
    </div>
  {/if}

  <div
    class="tab-content"
    role={!compact || showMethods ? "tabpanel" : undefined}
  >
    <Crossfade key={activeTab} animateHeight>
      {#if activeTab === "magic"}
        <EmailLinkAuth {compact} bind:email sendOnOpen={sendCodeOnOpen} />
      {:else}
        <EmailPasswordAuth
          bind:mode
          bind:email
          showModeSwitch={showModeSwitch && !compact}
          onUseCode={useCodeInstead}
        />
      {/if}
    </Crossfade>
  </div>
</div>

<style>
  .email-auth-tabs {
    --auth-input-background: color-mix(
      in srgb,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 88%,
      var(--theme-text, white) 12%
    );
    --auth-input-border: color-mix(
      in srgb,
      var(--theme-text, white) 26%,
      transparent
    );
    --auth-input-border-hover: color-mix(
      in srgb,
      var(--theme-text, white) 38%,
      transparent
    );
    --auth-input-placeholder: color-mix(
      in srgb,
      var(--theme-text, white) 54%,
      transparent
    );
    --auth-input-inset-highlight: color-mix(
      in srgb,
      var(--theme-text, white) 10%,
      transparent
    );
    --auth-input-focus-background: color-mix(
      in srgb,
      var(--theme-accent, #7c6af7) 10%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    --auth-input-focus-border: var(
      --theme-accent-strong,
      var(--theme-accent, #7c6af7)
    );
    --auth-input-focus-outline: color-mix(
      in srgb,
      var(--theme-accent, #7c6af7) 38%,
      transparent
    );
    --auth-input-focus-shadow: color-mix(
      in srgb,
      var(--theme-accent-strong, var(--theme-accent, #7c6af7)) 18%,
      transparent
    );

    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .tab-bar {
    display: flex;
    gap: 4px;
    margin-block-end: 0.875rem;
    /* Extra top padding reserves the space the "Last used" badge straddles
       into, keeping it inside the bar's own border rather than poking over
       it. Unconditional, so the bar's height never depends on the badge. */
    padding: 0.75rem 0.25rem 0.25rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: var(--radius-md, 0.75rem);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .tab {
    flex: 1;
    /* Anchor for the absolutely-positioned LastUsedBadge. */
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.75rem 1rem;
    border: none;
    border-radius: var(--radius-sm, 0.5rem);
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--duration-normal, 200ms) ease,
      color var(--duration-normal, 200ms) ease;
  }

  .tab:hover:not(.active) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, white);
  }

  .tab.active {
    background: var(--theme-accent, #8b5cf6);
    color: white;
    font-weight: 600;
  }

  .tab i {
    font-size: 0.875em;
  }

  .tab-content {
    width: 100%;
  }

  .tab:focus-visible {
    outline: 3px solid
      color-mix(in srgb, var(--theme-accent, #7c6af7) 72%, white);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .tab {
      transition: none;
    }
  }
</style>
