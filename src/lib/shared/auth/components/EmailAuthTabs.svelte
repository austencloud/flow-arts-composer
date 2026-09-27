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
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { getLastAuthMethod } from "$lib/shared/auth/services/last-auth-method.svelte";
  import { growFade } from "$lib/shared/transitions/motion";

  interface Props {
    mode?: "signin" | "signup";
    compact?: boolean;
    showMethods?: boolean;
  }

  let {
    mode = $bindable("signin"),
    compact = false,
    showMethods = false,
  }: Props = $props();

  const lastMethod = getLastAuthMethod();

  // A code asks the least of someone who does not know how their account was
  // created. Returning password users resume where they left off; everyone
  // else starts on the no-password path.
  let activeTab = $state<"magic" | "password">(
    !compact && lastMethod === "password" ? "password" : "magic"
  );
</script>

<div class="email-auth-tabs">
  {#if !compact || showMethods}
    <div class="tab-bar" role="tablist" transition:growFade>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "magic"}
        class="tab"
        class:active={activeTab === "magic"}
        onclick={() => (activeTab = "magic")}
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
        onclick={() => (activeTab = "password")}
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
    {#if activeTab === "magic"}
      <EmailLinkAuth {compact} />
    {:else}
      <EmailPasswordAuth bind:mode showModeSwitch={!compact} />
    {/if}
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
    gap: 0.875rem;
    width: 100%;
  }

  .tab-bar {
    display: flex;
    gap: 4px;
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
