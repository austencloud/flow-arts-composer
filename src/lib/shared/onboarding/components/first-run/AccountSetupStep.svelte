<!--
  AccountSetupStep - Display-name setup for sign-up methods that still use the
  first-run overlay. Magic-link accounts bypass this component and go straight
  to Create.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import {
    logAccountSetupNameSave,
    logAccountSetupViewed,
  } from "#lib/shared/analytics/services/onboarding-events.js";
  import { reportErrorTelemetry } from "#lib/shared/error/services/error-telemetry-reporter.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    /** Admin "preview" — render the card even for accounts that don't need it. */
    forcePreview?: boolean;
    onComplete: () => void;
  }

  const { forcePreview = false, onComplete }: Props = $props();

  const authDisplayName = $derived(authState.user?.displayName?.trim() || "");
  const hasProviderName = $derived(!!authDisplayName);
  const showName = $derived(forcePreview || !hasProviderName);

  let name = $state("");
  let submitting = $state(false);

  const nameValue = $derived(name.trim() || authDisplayName);
  const isValid = $derived(!showName || nameValue.length > 0);

  // Prefill the name with whatever the provider gave (usually empty for magic link).
  $effect(() => {
    if (authDisplayName && !name) name = authDisplayName;
  });

  onMount(() => {
    // Accounts that already have a provider name need no setup screen.
    if (!showName) {
      onComplete();
      return;
    }
    logAccountSetupViewed({
      surface: "first_run_wizard",
      completed_count: 0,
      total_count: 1,
    });
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!isValid || submitting) return;
    submitting = true;

    if (showName) {
      logAccountSetupNameSave("started");
      try {
        await settingsService.updateSetting("userName", nameValue);
        logAccountSetupNameSave("succeeded");
      } catch (err) {
        const failureCode =
          typeof (err as { code?: unknown } | null)?.code === "string"
            ? String((err as { code: string }).code).slice(0, 80)
            : "unknown";
        logAccountSetupNameSave("failed", { failure_code: failureCode });
        void reportErrorTelemetry({
          message: "Account setup display name could not be saved",
          error: err instanceof Error ? err : new Error(String(err)),
          severity: "warning",
          context: {
            module: "onboarding",
            action: "save_display_name",
          },
        });
        console.error("Failed to save name:", err);
        toast.warning(t("onboarding_name_save_warning"));
      }
    }

    onComplete();
  }
</script>

<div class="account-setup-step">
  <div class="icon-container">
    <i class="fas fa-user" aria-hidden="true"></i>
  </div>

  <h1 id="account-setup-title" class="title">
    {t("onboarding_choose_display_name")}
  </h1>
  <p class="subtitle">{t("onboarding_community_name_desc")}</p>

  <form class="setup-form" onsubmit={handleSubmit}>
    {#if showName}
      <input
        type="text"
        class="text-input"
        placeholder={t("onboarding_name_placeholder")}
        bind:value={name}
        maxlength="50"
        autocomplete="name"
        spellcheck="false"
        disabled={submitting}
      />
    {/if}

    <button
      type="submit"
      class="action-button"
      disabled={!isValid || submitting}
    >
      {submitting ? t("onboarding_saving") : t("action_continue")}
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </button>
  </form>
</div>

<style>
  .account-setup-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    max-width: 400px;
    width: 100%;
    text-align: center;
    padding: 32px;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.6));
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 24px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .icon-container {
    width: 72px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, #8b5cf6) 15%,
      transparent
    );
    border-radius: 20px;
    font-size: 1.75rem;
    color: var(--theme-accent-strong, #8b5cf6);
  }

  .title {
    font-size: 1.5rem;
    font-weight: 700;
    color: white;
    margin: 0;
    letter-spacing: -0.01em;
  }

  .subtitle {
    font-size: 1rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    margin: 0;
    line-height: 1.5;
  }

  .setup-form {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    width: 100%;
    margin-top: 8px;
  }

  .text-input {
    width: 100%;
    padding: 15px 18px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    color: white;
    font-size: 1.1rem;
    font-weight: 500;
    text-align: left;
    transition: all var(--duration-normal) ease;
  }

  .text-input::placeholder {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .text-input:focus {
    outline: none;
    border-color: var(--theme-accent, #a78bfa);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 8%,
      transparent
    );
  }

  .action-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 24px;
    min-height: var(--min-touch-target);
    border-radius: 12px;
    color: white;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, #8b5cf6) 40%,
      transparent
    );
    border: 2px solid
      color-mix(in srgb, var(--theme-accent-strong, #8b5cf6) 60%, transparent);
  }

  .action-button:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, #8b5cf6) 50%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent-strong, #8b5cf6) 80%,
      transparent
    );
  }

  .action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-button:active:not(:disabled) {
    transform: scale(0.98);
  }

  @media (max-width: 480px) {
    .account-setup-step {
      padding: 16px;
    }
    .icon-container {
      width: 64px;
      height: 64px;
      font-size: 1.5rem;
    }
    .title {
      font-size: 1.3rem;
    }
    .text-input {
      padding: 13px 16px;
      font-size: 1rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .text-input,
    .action-button {
      transition: none;
    }
    .action-button:active:not(:disabled) {
      transform: none;
    }
  }
</style>
