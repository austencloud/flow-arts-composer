<script lang="ts">
  import { onMount } from "svelte";

  const STORAGE_KEY = "tka-pwa-migration-dismissed";

  let show = $state(false);

  onMount(() => {
    // Only show inside an installed PWA
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;

    if (!isStandalone) return;

    // Only show on the old domain - users on tkaflowarts.com installed correctly
    const isOldDomain = window.location.hostname.includes("tkascribe");
    if (!isOldDomain) return;

    // Only show if not already dismissed
    if (localStorage.getItem(STORAGE_KEY)) return;

    show = true;
  });

  // Admin trigger: force-show the banner regardless of standalone/dismissed state
  $effect(() => {
    const handler = () => {
      localStorage.removeItem(STORAGE_KEY);
      show = true;
    };
    window.addEventListener("pwaMigrationBannerShow", handler);
    return () => window.removeEventListener("pwaMigrationBannerShow", handler);
  });

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    show = false;
  }
</script>

{#if show}
  <div class="pwa-migration-banner" role="alert">
    <p class="banner-text">
      Hey, it's Austen. Flow Arts Composer has a new home at <strong>tkaflowarts.com</strong>.
      To get rid of the URL bar at the top:
    </p>
    <ol class="banner-steps">
      <li>Long-press the Flow Arts Composer icon on your home screen and delete it</li>
      <li>Open <strong>tkaflowarts.com</strong> in your browser</li>
      <li>Tap the menu (three dots) and "Add to Home Screen"</li>
    </ol>
    <button class="dismiss-btn" onclick={dismiss} aria-label="Dismiss">
      Got it
    </button>
  </div>
{/if}

<style>
  .pwa-migration-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    background: var(--theme-card-bg, rgba(30, 30, 50, 0.97));
    border-bottom: 1px solid var(--theme-accent, #8b5cf6);
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
  }

  .banner-text {
    margin: 0;
    line-height: 1.4;
  }

  .banner-steps {
    margin: 6px 0 0;
    padding-left: 20px;
    line-height: 1.5;
    font-size: var(--font-size-min, 14px);
  }

  .dismiss-btn {
    align-self: flex-end;
    padding: 6px 14px;
    border: 1px solid var(--theme-accent, #8b5cf6);
    border-radius: 6px;
    background: transparent;
    color: var(--theme-accent, #8b5cf6);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .dismiss-btn:hover {
    background: var(--theme-accent, #8b5cf6);
    color: #fff;
  }
</style>
