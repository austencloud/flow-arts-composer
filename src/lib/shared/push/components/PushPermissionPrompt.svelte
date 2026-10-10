<!--
  PushPermissionPrompt.svelte

  Contextual prompt shown when a user has unread messages but hasn't
  granted push notification permission. Slides up from the bottom
  of the screen. The provider limits it to once per account.
-->
<script lang="ts">
  import { getFCMTokenManager } from "#lib/shared/push/get-fcm-token-manager.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

  interface Props {
    userId: string;
    onDismiss: () => void;
  }

  let { userId, onDismiss }: Props = $props();
  let loading = $state(false);

  async function handleEnable() {
    loading = true;
    try {
      const fcmTokenManager = getFCMTokenManager();
      const permission = await fcmTokenManager.requestPermission();
      if (permission === "granted") {
        await fcmTokenManager.registerToken(userId);
        toast.success("Push notifications enabled");
      } else if (permission === "denied") {
        toast.info(
          "Notifications blocked. You can enable them in browser settings."
        );
      }
    } catch (error) {
      console.error("[PushPermissionPrompt] Failed:", error);
    } finally {
      loading = false;
      onDismiss();
    }
  }

  function handleNotNow() {
    onDismiss();
  }
</script>

<div
  class="push-prompt"
  role="alertdialog"
  aria-label="Enable push notifications"
>
  <p class="prompt-text">
    Get notified when you receive messages, even when the app is closed?
  </p>
  <div class="prompt-actions">
    <button class="btn-secondary" onclick={handleNotNow} disabled={loading}>
      Not now
    </button>
    <button class="btn-primary" onclick={handleEnable} disabled={loading}>
      {loading ? "Enabling..." : "Enable"}
    </button>
  </div>
</div>

<style>
  .push-prompt {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-priority);
    background: var(--theme-card-bg, rgba(30, 30, 45, 0.98));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 12px);
    padding: 1rem 1.25rem;
    max-width: 400px;
    width: calc(100% - 2rem);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    animation: slideUp 0.3s ease-out;
  }

  .prompt-text {
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-min, 14px);
    margin: 0 0 0.75rem 0;
    line-height: 1.4;
  }

  .prompt-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .btn-secondary,
  .btn-primary {
    min-height: 44px;
    padding: 0.5rem 1rem;
    border-radius: var(--radius-lg, 8px);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: opacity 0.15s ease;
  }

  .btn-secondary {
    background: transparent;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .btn-primary {
    background: var(--theme-accent, #6366f1);
    color: #fff;
  }

  .btn-secondary:disabled,
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @keyframes slideUp {
    from {
      transform: translateX(-50%) translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .push-prompt {
      animation: none;
    }
  }
</style>
