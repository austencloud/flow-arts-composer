<!--
  AuthHeader.svelte - Authentication Sheet Header

  Header with dynamic title/subtitle based on auth mode and close button
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  // Props
  let { mode = "signin", onClose } = $props<{
    mode: "signin" | "signup";
    onClose: () => void;
  }>();
</script>

<header class="auth-header">
  <div class="auth-header__content">
    <h2 id="auth-sheet-title" class="auth-header__title">
      {mode === "signin" ? t("auth_welcome") : t("auth_create_account")}
    </h2>
    <p class="auth-header__subtitle">
      {mode === "signin" ? t("auth_signin_subtitle") : t("auth_signup_subtitle")}
    </p>
  </div>
  <button
    class="auth-header__close"
    onclick={onClose}
    aria-label={mode === "signin" ? t("auth_close_signin") : t("auth_close_signup")}
  >
    <i class="fas fa-times" aria-hidden="true"></i>
  </button>
</header>

<style>
  .auth-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 24px;
    border-bottom: 1px solid var(--theme-stroke, var(--theme-stroke));
    flex-shrink: 0;
  }

  .auth-header__content {
    flex: 1;
    min-width: 0;
  }

  .auth-header__title {
    font-size: var(--font-size-2xl);
    font-weight: 700;
    color: color-mix(in srgb, var(--theme-text, white) 95%, transparent);
    margin: 0 0 8px 0;
  }

  .auth-header__subtitle {
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, var(--theme-text-dim));
    margin: 0;
    line-height: 1.5;
  }

  .auth-header__close {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    border-radius: 50%;
    border: none;
    background: var(--theme-card-bg, var(--theme-card-bg));
    color: color-mix(in srgb, var(--theme-text, white) 90%, transparent);
    font-size: var(--font-size-xl);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-left: 16px;
  }

  .auth-header__close:hover {
    background: var(--theme-card-hover-bg);
    transform: scale(1.05);
  }

  .auth-header__close:active {
    transform: scale(0.95);
  }

  .auth-header__close:focus-visible {
    outline: 2px solid
      color-mix(in srgb, var(--theme-accent-strong) 70%, transparent);
    outline-offset: 2px;
  }

  @media (max-width: 480px) {
    .auth-header {
      padding: 16px;
    }

    .auth-header__title {
      font-size: var(--font-size-xl);
    }

    .auth-header__subtitle {
      font-size: var(--font-size-compact);
    }
  }

  /* iPhone SE 2/3 and similar (667px height) */
  @media (max-height: 700px) {
    .auth-header {
      padding: 8px 16px;
    }

    .auth-header__title {
      font-size: var(--font-size-lg);
      margin-bottom: 4px;
    }

    .auth-header__subtitle {
      font-size: 12.5px;
    }
  }

  /* Small screens */
  @media (max-height: 600px) {
    .auth-header {
      padding: 10px 14px;
    }

    .auth-header__title {
      font-size: var(--font-size-lg);
      margin-bottom: 4px;
    }

    .auth-header__subtitle {
      font-size: var(--font-size-compact);
    }
  }

  /* iPhone SE 1st gen and very small devices (568px height) */
  @media (max-height: 568px) {
    .auth-header {
      padding: 8px 12px;
    }

    .auth-header__title {
      font-size: var(--font-size-base);
      margin-bottom: 0;
    }

    /* Hide subtitle on very small screens */
    .auth-header__subtitle {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .auth-header__close {
      transition: none;
    }

    .auth-header__close:hover,
    .auth-header__close:active {
      transform: none;
    }
  }

  @media (prefers-contrast: high) {
    .auth-header {
      border-color: white;
    }
  }
</style>
