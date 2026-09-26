<!-- AuthPrompt.svelte - Sign-in/sign-up prompt for unauthenticated users -->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import SocialAuthCompact from "../../../../auth/components/SocialAuthCompact.svelte";
  import EmailAuthTabs from "../../../../auth/components/EmailAuthTabs.svelte";
  import {
    trackAuthModalAbandoned,
    trackAuthSurfaceOpened,
  } from "$lib/shared/analytics/auth-events";
  import { clearAuthSubmissionBridge } from "$lib/shared/auth/services/auth-analytics-bridge";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte";

  interface Props {
    onFacebookAuth: () => Promise<void>;
  }

  let { onFacebookAuth }: Props = $props();

  let authMode = $state<"signin" | "signup">("signin");

  onMount(() => {
    trackAuthSurfaceOpened({
      surface: "settings_profile",
      origin: "signed_out_profile_tab",
      auth_mode: authMode,
    });
  });

  onDestroy(() => {
    if (!authState.isFullAccount) {
      trackAuthModalAbandoned("unmounted");
    }
    clearAuthSubmissionBridge();
  });
</script>

<div class="auth-section">
  <div class="auth-hero">
    <div class="auth-icon-wrapper">
      <i class="fas fa-user-astronaut" aria-hidden="true"></i>
    </div>
    <h2 class="auth-title">{t("auth_sign_in_composer")}</h2>
    <p class="auth-subtitle">
      {t("auth_save_sync_creations")}
    </p>
  </div>

  <div class="auth-form-container">
    <SocialAuthCompact mode={authMode} {onFacebookAuth} />

    <div class="auth-divider">
      <span
        >{authMode === "signin"
          ? t("auth_or_sign_in_email")
          : t("auth_or_sign_up_email")}</span
      >
    </div>

    <EmailAuthTabs bind:mode={authMode} />
  </div>
</div>

<style>
  .auth-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(20px, 5cqi, 48px);
    padding: clamp(16px, 5cqi, 48px);
    max-width: 440px;
    margin: 0 auto;
    width: 100%;
  }

  .auth-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(14px, 3cqi, 20px);
    text-align: center;
  }

  .auth-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(64px, 12cqi, 80px);
    height: clamp(64px, 12cqi, 80px);
    border-radius: clamp(16px, 4cqi, 24px);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent) 25%, transparent),
      color-mix(in srgb, var(--theme-accent-strong) 25%, transparent)
    );
    border: 2px solid color-mix(in srgb, var(--theme-accent) 40%, transparent);
    font-size: clamp(26px, 5cqi, 32px);
    color: var(--theme-accent);
    box-shadow: 0 0 40px
      color-mix(in srgb, var(--theme-accent) 20%, transparent);
  }

  .auth-title {
    font-size: clamp(20px, 4.5cqi, 30px);
    font-weight: 700;
    color: var(--theme-text);
    margin: 0;
    font-family:
      -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif;
  }

  .auth-subtitle {
    font-size: clamp(13px, 2.5cqi, 16px);
    color: var(--theme-text-dim);
    margin: 0;
    max-width: 340px;
    line-height: 1.5;
  }

  .auth-form-container {
    display: flex;
    flex-direction: column;
    gap: clamp(18px, 4cqi, 24px);
    width: 100%;
  }

  .auth-divider {
    display: flex;
    align-items: center;
    text-align: center;
  }

  .auth-divider::before,
  .auth-divider::after {
    content: "";
    flex: 1;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .auth-divider span {
    padding: 0 clamp(12px, 3cqi, 16px);
    color: var(--theme-text-dim);
    font-size: clamp(12px, 2cqi, 13px);
    font-weight: 500;
  }
</style>
