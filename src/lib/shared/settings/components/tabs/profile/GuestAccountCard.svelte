<!-- GuestAccountCard.svelte - What the Profile tab shows a guest: one line on
     what an account adds, and two buttons. It never opens a sheet by itself;
     the sheet opens only when the guest taps a button. -->
<script lang="ts">
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { authDrawerState } from "#lib/shared/auth/state/auth-drawer-state.svelte.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
</script>

<section class="guest-card" aria-labelledby="guest-card-body">
  <div class="guest-icon" aria-hidden="true">
    <i class="fas fa-user-astronaut"></i>
  </div>
  <p id="guest-card-body" class="guest-body">
    {t("settings_guest_profile_body")}
  </p>
  <div class="guest-actions">
    <PanelButton
      variant="primary"
      fullWidth
      onclick={() => authDrawerState.showOnRequest("signup")}
    >
      {t("auth_nudge_create_account")}
    </PanelButton>
    <PanelButton
      variant="secondary"
      fullWidth
      onclick={() => authDrawerState.showOnRequest("signin")}
    >
      {t("nav_ui_sign_in")}
    </PanelButton>
  </div>
</section>

<style>
  .guest-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(16px, 4cqi, 24px);
    padding: clamp(16px, 5cqi, 40px);
    max-width: 420px;
    margin: 0 auto;
    width: 100%;
    text-align: center;
  }

  .guest-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(56px, 11cqi, 72px);
    height: clamp(56px, 11cqi, 72px);
    border-radius: clamp(16px, 4cqi, 22px);
    background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 40%, transparent);
    font-size: clamp(24px, 4.5cqi, 30px);
    color: var(--theme-accent);
  }

  .guest-body {
    margin: 0;
    max-width: 34ch;
    font-size: clamp(15px, 2.8cqi, 17px);
    line-height: 1.5;
    color: var(--theme-text);
  }

  .guest-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    max-width: 320px;
  }

  /* A phone held sideways (the Fold's cover on its side, about 340px tall):
     the two buttons stand side by side and the card keeps a tighter rhythm,
     so Sign in stays on screen without the settings body scrolling. */
  @media (max-height: 480px) and (min-width: 700px) {
    .guest-card {
      max-width: 520px;
      gap: 12px;
      padding: 12px 16px;
    }

    .guest-icon {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      font-size: 22px;
    }

    .guest-body {
      max-width: 44ch;
      line-height: 1.4;
    }

    .guest-actions {
      flex-direction: row;
      max-width: 440px;
    }

    .guest-actions > :global(*) {
      flex: 1 1 0;
      min-width: 0;
    }
  }
</style>
