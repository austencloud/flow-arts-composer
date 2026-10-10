<script lang="ts">
  import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
  import { getFirestoreInstance } from '#lib/shared/auth/firebase.js';
  import { authState, getEffectiveUserId } from '#lib/shared/auth/state/auth-state.svelte.js';
  import { acknowledgeWarning } from '../services/warning-acknowledger';
  import { t } from '#lib/shared/i18n/i18n.svelte.js';
  import { toast } from '#lib/shared/toast/state/toast-state.svelte.js';

  let isAcknowledging = $state(false);
  let hasActiveWarning = $state(false);
  let unsubscribe: Unsubscribe | null = null;

  async function handleAcknowledge() {
    if (isAcknowledging) return;

    isAcknowledging = true;
    try {
      await acknowledgeWarning();
      // The subscription will update hasActiveWarning automatically
    } catch (error) {
      console.error('Failed to acknowledge warning:', error);
      // i18n NOTE: needs a dedicated key (e.g. moderation_acknowledge_failed) added to
      // messages/en.json, which is outside this feature's edit scope.
      toast.error('Could not acknowledge the warning. Please try again.');
    } finally {
      isAcknowledging = false;
    }
  }

  // Subscribe to user document for warning status
  async function subscribeToWarningStatus(userId: string) {
    // Clean up existing subscription
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    try {
      const firestore = await getFirestoreInstance();
      const userRef = doc(firestore, `users/${userId}/moderation/status`);

      unsubscribe = onSnapshot(
        userRef,
        (snapshot) => {
          if (snapshot.exists()) {
            hasActiveWarning = snapshot.data()?.hasActiveWarning === true;
          } else {
            hasActiveWarning = false;
          }
        },
        (error) => {
          console.error('Warning status subscription error:', error);
          hasActiveWarning = false;
        }
      );
    } catch (error) {
      console.error('Failed to subscribe to warning status:', error);
    }
  }

  // Track auth state changes (uses effective user ID for impersonation support)
  $effect(() => {
    const userId = getEffectiveUserId();

    if (userId) {
      subscribeToWarningStatus(userId);
    } else {
      // User logged out, clean up
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      hasActiveWarning = false;
    }

    // Tear down the snapshot listener whenever the effect re-runs (userId change)
    // or the component unmounts, so a rapid auth change can't leave a stale
    // subscription open. subscribeToWarningStatus resolves async, so guard on
    // the current ref at cleanup time.
    return () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };
  });

  // Only show if user is logged in and has an active warning
  const shouldShow = $derived(
    authState.isAuthenticated && hasActiveWarning
  );
</script>

{#if shouldShow}
  <div class="warning-banner" role="alert">
    <div class="warning-content">
      <i class="fa-solid fa-triangle-exclamation warning-icon" aria-hidden="true"></i>
      <div class="warning-text">
        <p class="warning-title">{t('moderation_warning_title')}</p>
        <p class="warning-message">
          {t('moderation_warning_message')}
        </p>
      </div>
    </div>
    <button
      class="acknowledge-button"
      onclick={handleAcknowledge}
      disabled={isAcknowledging}
      aria-label={t('moderation_acknowledge')}
    >
      {#if isAcknowledging}
        <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
      {:else}
        {t('moderation_acknowledge')}
      {/if}
    </button>
  </div>
{/if}

<style>
  .warning-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: var(--z-toast);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-error, #ef4444) 88%, black) 0%,
      color-mix(in srgb, var(--semantic-error, #ef4444) 72%, black) 100%
    );
    color: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .warning-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }

  .warning-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .warning-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .warning-title {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
  }

  .warning-message {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    opacity: 0.9;
  }

  .acknowledge-button {
    flex-shrink: 0;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 6px;
    color: white;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;
    min-width: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .acknowledge-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.3);
    border-color: rgba(255, 255, 255, 0.6);
  }

  .acknowledge-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  /* Mobile: stack vertically */
  @media (max-width: 480px) {
    .warning-banner {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }

    .acknowledge-button {
      width: 100%;
    }
  }
</style>
