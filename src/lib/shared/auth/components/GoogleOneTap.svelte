<script module lang="ts">
  // GoogleOneTap mounts on multiple surfaces (landing page, auth drawer,
  // sequence viewer). The Google Identity library only wants one initialize()
  // call per page load - additional calls produce a GSI_LOGGER warning and
  // only the last config wins (which would silently break whichever surface
  // mounted first).
  //
  // We solve both problems by calling initialize() exactly once with a
  // dispatcher callback. Each instance registers its own handler; the
  // dispatcher forwards the credential to every active instance so whichever
  // surface the user tapped gets the result.
  //
  // These live in `<script module>` so they are genuinely module-scoped.
  // A plain `<script>` in Svelte 5 is per-instance, which defeats the guard.
  type CredentialHandler = (credential: string) => void;
  const credentialHandlers = new Set<CredentialHandler>();
  let gsiInitialized = false;

  function dispatchCredential(response: { credential: string }) {
    for (const handler of credentialHandlers) {
      handler(response.credential);
    }
  }
</script>

<script lang="ts">
  /**
   * Google One Tap Component
   *
   * Provides frictionless Google sign-in with a single tap.
   * No redirects - just a small popup that appears automatically.
   *
   * Benefits:
   * - 90% increase in signups reported by implementers
   * - No page redirects - stays in context
   * - Works for both sign-in AND sign-up
   *
   * FedCM (Federated Credential Management) is enabled as it becomes
   * mandatory in August 2025. With FedCM, the browser controls prompt
   * position and shows the domain name instead of app name.
   * See: https://developers.google.com/identity/gsi/web/guides/fedcm-migration
   */

  import { signInWithGoogleCredential } from "#lib/shared/auth/services/authenticator.js";
  import { onMount, onDestroy } from "svelte";
  import { GOOGLE_CLIENT_ID } from "../config/google-oauth";
  import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";

  const debug = createComponentLogger("GoogleOneTap");

  interface Props {
    /** Called when sign-in succeeds */
    onSuccess?: () => void;
    /** Called when sign-in fails or user dismisses */
    onError?: (error: Error) => void;
    /** Called when One Tap prompt is not available (FedCM disabled, cooldown, etc.) */
    onUnavailable?: () => void;
    /** Show the One Tap prompt automatically on mount */
    autoPrompt?: boolean;
    /** Position of the One Tap prompt */
    promptParentId?: string;
  }

  let {
    onSuccess,
    onError,
    onUnavailable,
    autoPrompt = true,
    promptParentId,
  }: Props = $props();

  let scriptLoaded = $state(false);

  function loadGoogleScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }

      // Check if script is already in DOM
      const existingScript = document.querySelector(
        'script[src="https://accounts.google.com/gsi/client"]'
      );
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve());
        existingScript.addEventListener("error", reject);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Failed to load Google Identity Services"));
      document.head.appendChild(script);
    });
  }

  async function handleCredentialResponse(credential: string) {
    debug.info("Received Google credential, signing in...");

    try {
      await signInWithGoogleCredential(credential);
      debug.success("Google One Tap sign-in successful!");
      onSuccess?.();
    } catch (error) {
      debug.error("Google One Tap sign-in failed:", error);
      onError?.(error instanceof Error ? error : new Error("Sign-in failed"));
    }
  }

  function initializeOneTap() {
    if (!window.google?.accounts?.id) {
      debug.error("Google Identity Services not loaded");
      return;
    }

    if (!GOOGLE_CLIENT_ID) {
      debug.error("Google Client ID not configured");
      return;
    }

    // Register this instance's handler. The first mount initializes GSI with
    // the shared dispatcher; subsequent mounts just subscribe.
    credentialHandlers.add(handleCredentialResponse);

    if (!gsiInitialized) {
      // Configuration for One Tap
      // FedCM becomes mandatory in August 2025 for real browsers
      // With FedCM: browser controls position, shows domain instead of app name
      const config: GoogleOneTapConfig = {
        client_id: GOOGLE_CLIENT_ID,
        callback: dispatchCredential,
        auto_select: true,
        cancel_on_tap_outside: false,
        context: "signin",
        itp_support: true,
      };

      if (promptParentId) {
        config.prompt_parent_id = promptParentId;
      }

      window.google.accounts.id.initialize(config);
      gsiInitialized = true;
      debug.success("Google One Tap initialized");
    }

    if (autoPrompt) {
      // Small delay to let the page settle
      setTimeout(() => {
        try {
          // With FedCM enabled, don't use the notification callback
          // The legacy moment-based methods (isNotDisplayed, isSkippedMoment, etc.)
          // don't work reliably with FedCM and trigger deprecation warnings.
          // The credential response is still handled via the config callback.
          window.google?.accounts.id.prompt();
          debug.info("One Tap prompt requested (FedCM mode)");
        } catch (error) {
          // FedCM may throw if disabled or on cooldown
          debug.warn("One Tap prompt unavailable:", error);
          onUnavailable?.();
        }
      }, 500);
    }
  }

  onMount(async () => {
    // GIS accepts web origins only. Capacitor uses the native Firebase plugin,
    // while Tauri uses its loopback desktop OAuth bridge; loading GIS in either
    // shell produces an unregistered-origin failure before the user can sign in.
    const { isWeb } =
      await import("#lib/shared/platform/services/platform-detector.js");
    if (!isWeb()) return;

    try {
      await loadGoogleScript();
      scriptLoaded = true;
      initializeOneTap();
    } catch (error) {
      debug.error("Failed to initialize Google One Tap:", error);
    }
  });

  onDestroy(() => {
    credentialHandlers.delete(handleCredentialResponse);
    // Cancel any pending prompts
    window.google?.accounts.id.cancel();
  });

  /**
   * Manually trigger the One Tap prompt
   * Useful for showing it on button click if autoPrompt is false
   */
  export function showPrompt() {
    try {
      window.google?.accounts.id.prompt();
    } catch {
      onUnavailable?.();
    }
  }
</script>

<!--
  This component is invisible - it just initializes One Tap.
  The prompt appears as an overlay from Google.
-->
