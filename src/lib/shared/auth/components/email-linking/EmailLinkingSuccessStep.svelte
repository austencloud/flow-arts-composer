<!--
  EmailLinkingSuccessStep Component

  Success step showing confirmation that email has been linked and verified.
  Includes animated checkmark and done button.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  interface Props {
    email: string;
    onComplete: () => void;
  }

  let { email, onComplete }: Props = $props();
</script>

<div class="success-content">
  <div class="success-animation">
    <div class="success-checkmark">
      <i class="fas fa-check" aria-hidden="true"></i>
    </div>
  </div>

  <div class="success-message">
    <p>{t("auth_linking_can_sign_in")}</p>
    <div class="credential-display">
      <i class="fas fa-envelope" aria-hidden="true"></i>
      <span>{email}</span>
    </div>
  </div>

  <button class="done-btn" onclick={onComplete}>
    <i class="fas fa-check" aria-hidden="true"></i>
    <span>{t("auth_linking_done")}</span>
  </button>
</div>

<style>
  .success-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    text-align: center;
    padding: 8px 0;
  }

  .success-animation {
    position: relative;
  }

  .success-checkmark {
    width: 88px;
    height: 88px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 15%,
      transparent
    );
    border-radius: 50%;
    animation: success-pop var(--duration-dramatic) ease-out;
  }

  .success-checkmark i {
    font-size: var(--font-size-3xl);
    color: var(--semantic-success, var(--semantic-success));
  }

  @keyframes success-pop {
    0% {
      transform: scale(0.5);
      opacity: 0;
    }
    50% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .success-message {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .success-message p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: color-mix(in srgb, var(--theme-text, white) 70%, transparent);
  }

  .credential-display {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 24px;
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, var(--theme-accent-strong)) 15%,
      transparent
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 30%,
        transparent
      );
    border-radius: 12px;
  }

  .credential-display i {
    color: var(--theme-accent-strong, var(--theme-accent-strong));
    font-size: var(--font-size-base);
  }

  .credential-display span {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: color-mix(in srgb, var(--theme-text, white) 95%, transparent);
  }

  .done-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    max-width: 220px;
    padding: 14px 28px;
    background: linear-gradient(
      135deg,
      var(--semantic-success, var(--semantic-success)) 0%,
      color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 80%,
          #000
        )
        100%
    );
    border: none;
    border-radius: 12px;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .done-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 20px
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 40%,
        transparent
      );
  }

  .done-btn:active {
    transform: translateY(0);
  }

  /* Focus States */
  .done-btn:focus-visible {
    outline: 2px solid
      color-mix(in srgb, var(--theme-accent-strong) 80%, transparent);
    outline-offset: 2px;
  }

  /* Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    .success-checkmark {
      animation: none;
    }

    .done-btn:hover {
      transform: none;
    }
  }
</style>
