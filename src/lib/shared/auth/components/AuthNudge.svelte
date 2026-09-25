<script lang="ts">
  import type { AuthNudgeTrigger } from "../domain/auth-nudge-trigger";
  import { authNudgeCopy } from "../domain/auth-prompt-copy";
  import { t } from "$lib/shared/i18n/i18n.svelte";

  interface Props {
    trigger: AuthNudgeTrigger;
    /** Overrides the trigger's default copy (e.g. a per-config lock reason). */
    text?: string;
    /** Stable id for a modal wrapper's aria-labelledby relationship. */
    textId?: string;
    onCreateAccount: () => void;
    onLogin: () => void;
    onDismiss: () => void;
  }

  let {
    trigger,
    text: textOverride,
    textId,
    onCreateAccount,
    onLogin,
    onDismiss,
  }: Props = $props();

  const text = $derived(textOverride ?? authNudgeCopy(trigger));
</script>

<div class="auth-nudge" role="alert">
  <span class="auth-nudge-glyph" aria-hidden="true">
    <i class="fa-solid fa-wand-magic-sparkles"></i>
  </span>

  <p id={textId} class="auth-nudge-text">{text}</p>

  <div class="auth-nudge-actions">
    <button type="button" class="auth-nudge-primary" onclick={onCreateAccount}>
      {t("auth_nudge_create_account")}
    </button>
    <button type="button" class="auth-nudge-login-btn" onclick={onLogin}>
      {t("auth_nudge_log_in")}
    </button>
  </div>

  <button type="button" class="auth-nudge-dismiss" onclick={onDismiss}>
    {t("auth_nudge_not_now")}
  </button>
</div>

<style>
  /*
    The card owns NO backdrop. It renders identically as a centered modal
    (wrapped in BaseModal at the 3 overlay sites) and inline inside
    .module-gate (ModuleRenderer). Stable width + a reserved glyph slot keep
    it from reflowing as the trigger text / CTA label changes.
  */
  .auth-nudge {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 16px;

    width: min(384px, 100%);
    max-width: 384px;
    padding: 28px 24px 20px;
    margin: 0 auto;

    background: var(--theme-panel-bg, rgba(22, 24, 32, 0.82));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-xl, 20px);
    box-shadow:
      0 18px 48px var(--theme-shadow, rgba(0, 0, 0, 0.45)),
      0 2px 8px rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(20px) saturate(1.2);
    -webkit-backdrop-filter: blur(20px) saturate(1.2);
  }

  /* Leading accent glyph — "unlock more". Fixed box, no layout shift. */
  .auth-nudge-glyph {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    flex: 0 0 48px;
    border-radius: 50%;
    font-size: 20px;
    color: var(--theme-accent, #6366f1);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 16%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 32%, transparent);
  }

  .auth-nudge-text {
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-min, 14px);
    line-height: 1.55;
    margin: 0;
    text-wrap: balance;
  }

  .auth-nudge-actions {
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: 10px;
    width: 100%;
    margin-top: 4px;
  }

  /* Equal-width pair so the row reads as two peer choices. */
  .auth-nudge-primary,
  .auth-nudge-login-btn {
    flex: 1 1 0;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    border-radius: var(--radius-md, 10px);
    padding: 10px 16px;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      box-shadow var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .auth-nudge-primary {
    background: linear-gradient(
      135deg,
      var(--theme-accent, #6366f1) 0%,
      var(--theme-accent-strong, #4f46e5) 100%
    );
    color: #ffffff;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent-strong, #4f46e5) 70%, transparent);
    box-shadow: 0 4px 14px
      color-mix(in srgb, var(--theme-accent, #6366f1) 35%, transparent);
  }

  .auth-nudge-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px
      color-mix(in srgb, var(--theme-accent, #6366f1) 45%, transparent);
  }

  .auth-nudge-primary:active {
    transform: translateY(0);
  }

  .auth-nudge-login-btn {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 10%,
      transparent
    );
    color: var(--theme-text, #ffffff);
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 40%, transparent);
  }

  .auth-nudge-login-btn:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 65%,
      transparent
    );
  }

  .auth-nudge-primary:focus-visible,
  .auth-nudge-login-btn:focus-visible,
  .auth-nudge-dismiss:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Quiet tertiary dismiss. */
  .auth-nudge-dismiss {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-height: var(--min-touch-target, 44px);
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    border: none;
    padding: 6px 12px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition: color var(--duration-fast, 150ms) ease;
  }

  .auth-nudge-dismiss:hover {
    color: var(--theme-text, #ffffff);
  }

  @media (prefers-contrast: more) {
    .auth-nudge {
      border-color: var(--theme-text, #ffffff);
    }
    .auth-nudge-login-btn {
      border-color: var(--theme-text, #ffffff);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .auth-nudge-primary,
    .auth-nudge-login-btn,
    .auth-nudge-dismiss {
      transition: none;
    }
    .auth-nudge-primary:hover {
      transform: none;
    }
  }
</style>
