<!--
  SocialAuthCompact.svelte - Compact Social Authentication Buttons

  Google, Facebook, and Instagram auth buttons for sign-in/sign-up flows.

  Auth Flow Priority:
  1. Google One Tap (FedCM-native, no redirects) - via GoogleOneTap.svelte
  2. Popup-based auth (fallback for all providers)
  3. Error message (no redirect fallback - it never worked)
-->
<script lang="ts">
  import FacebookIcon from "./icons/FacebookIcon.svelte";
  import GoogleIcon from "./icons/GoogleIcon.svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { browser } from "$app/environment";
  import { configureAuthPersistence, getAuthInstance } from "../firebase";
  import {
    signInWithGoogle,
    signInWithInstagram,
  } from "$lib/shared/auth/services/authenticator";
  import { isNative } from "$lib/shared/platform/services/platform-detector";
  import { upgradeAnonymousWithGoogle } from "$lib/shared/auth/services/anonymous-upgrade";
  import { promptAnonymousImport } from "$lib/shared/auth/state/anonymous-import-prompt.svelte";
  import {
    FACEBOOK_LOGIN_ENABLED,
    INSTAGRAM_LOGIN_ENABLED,
  } from "$lib/shared/auth/services/auth-providers.config";
  import {
    mapAuthError,
    getAuthErrorCode,
    isExpectedAuthInterruption,
  } from "$lib/shared/auth/services/auth-error-messages";
  import { getLastAuthMethod } from "$lib/shared/auth/services/last-auth-method.svelte";
  import LastUsedBadge from "$lib/shared/components/LastUsedBadge.svelte";
  import { recordAuthSubmission } from "$lib/shared/auth/services/auth-analytics-bridge";
  import { trackAuthProviderResult } from "$lib/shared/analytics/auth-events";
  import { page } from "$app/state";
  import { getInAppBrowserDetector } from "$lib/shared/auth/get-in-app-browser-detector";
  import {
    captureEvent,
    captureException,
    captureWhenReady,
  } from "$lib/shared/analytics/services/posthog";
  import { analyticsRoute } from "$lib/shared/analytics/analytics-context";
  import { getInstagramAuthErrorMessage } from "$lib/shared/auth/services/instagram-auth";
  import InAppEscapeControls from "./InAppEscapeControls.svelte";

  let { mode = "signin", onFacebookAuth } = $props<{
    mode?: "signin" | "signup";
    onFacebookAuth?: () => void;
  }>();

  // One error line, not three: switching providers replaces the message instead
  // of stacking a paragraph per provider.
  let providerError = $state<string | null>(null);
  let loadingProvider = $state<"google" | "instagram" | null>(null);
  const isLoading = $derived(loadingProvider !== null);

  // Facebook still runs signInWithPopup, which dead-ends in the native
  // WebView (Google/Meta block WebView sign-in). Hide it there until it's
  // wired through the native plugin. browser-guard: Capacitor is client-only.
  const showFacebook = FACEBOOK_LOGIN_ENABLED && !(browser && isNative());
  const showInstagram = INSTAGRAM_LOGIN_ENABLED && !(browser && isNative());

  // A third-party in-app webview (Instagram, Messenger, TikTok) is NOT the
  // native shell above: the detector returns false under Capacitor precisely so
  // this branch can't touch the native plugin path. Here social providers are
  // dead ends — Google answers embedded webviews with a server-side 403
  // disallowed_useragent, and Meta's policy is no looser. Detected here rather
  // than passed down as a prop because AuthSheet and AuthPrompt render this
  // component too, and the providers fail the same way from all three hosts.
  const detector = getInAppBrowserDetector();
  const inAppBrowser = $derived(
    detector.isInAppBrowserOrForced(page.url.searchParams)
  );

  // Android escapes to Chrome, iOS to Safari. Everything else gets no browser
  // name at all: the pattern list matches apps that also ship desktop clients
  // with an embedded browser (WeChat, Telegram, Discord, Slack, Line), whose UA
  // carries neither an Android nor an iPhone token. Telling a WeChat-on-Windows
  // visitor to open the page in Safari names a browser their OS does not have.
  // Plain const, not $derived: getPlatform() reads navigator, which cannot
  // change for the life of the page.
  const escapeTarget = (() => {
    const platform = detector.getPlatform();
    if (platform === "android") return "Chrome";
    if (platform === "ios") return "Safari";
    return "your browser";
  })();
  // Names the Email code tab rather than pointing a direction: AuthModal's
  // webview layout puts email above these buttons, but AuthSheet and
  // AuthPrompt both render this component first, so "above" would be wrong
  // from two of the three hosts.
  function blockedProviderMessage(provider: string): string {
    return `${provider} blocks sign-in inside this browser. Use Email code, or open this page in ${escapeTarget}.`;
  }

  // The escape action (button label + fired URL) for this environment. Revealed
  // only after a provider tap, so a guest who never reaches for social sign-in
  // never sees escape chrome. Named escapeAction to avoid the escapeTarget
  // string const above.
  let showEscapeNote = $state(false);
  const escapeAction = $derived(
    detector.getEscapeTarget(page.url.searchParams)
  );
  // Immutable attempt context passed into the escape controls so every escape
  // event segments by platform/version/launch state, not just method.
  const escapeContext = $derived({
    platform: detector.getEffectivePlatform(page.url.searchParams),
    ios_major: detector.getIosMajorVersion(),
    app_launched: escapeAction.isAppTarget,
  });

  function revealEscapeNote() {
    if (showEscapeNote) return; // a second provider tap must not re-fire intent
    showEscapeNote = true;
    // captureWhenReady, not captureEvent: a tap the instant the page loads would
    // otherwise be dropped before PostHog finishes initializing.
    captureWhenReady("inapp_browser_signin_intent", {
      method: escapeAction.method,
      route: analyticsRoute(),
    });
  }

  // Which button this device signed in with last. Removes the "wait, was it
  // Google or email?" guess that otherwise ends in the wrong provider and an
  // "account exists with a different credential" dead end.
  const lastMethod = $derived(getLastAuthMethod());

  async function handleGoogleClick() {
    if (isLoading) return;

    // Stop before any Firebase call. Attempting the popup first doesn't
    // degrade gracefully — Google renders its own 403 disallowed_useragent
    // page inside this same webview, which is a worse dead end than one
    // sentence in our own UI that names the way out.
    if (inAppBrowser) {
      providerError = blockedProviderMessage("Google");
      captureEvent("inapp_auth_social_intercepted", { provider: "google" });
      revealEscapeNote();
      return;
    }

    loadingProvider = "google";
    providerError = null;
    recordAuthSubmission("google", mode);

    // Cancel any pending One Tap prompt to prevent race conditions
    window.google?.accounts?.id?.cancel();

    try {
      // Resolve the Auth instance lazily. The static `auth` export is bound
      // to the Firebase app created at module-eval time, but the HMR manager
      // rotates the app on each dev cycle - leaving the static reference
      // bound to a terminated app. Firebase rejects such references with
      // auth/argument-error deep inside signInWithPopup. getAuthInstance()
      // always returns an Auth wired to the current app.
      const auth = await getAuthInstance();

      await configureAuthPersistence(auth);

      // Don't navigate on success: the AuthDrawer/AuthSheet that wraps this
      // button unmounts via `{#if !isAuthenticated}` in MainApplication, so
      // the user stays on whatever app page they opened the sheet from.
      // Navigating to "/" used to send them back to the marketing landing.
      // signInWithGoogle() routes per platform (native SDK / desktop OAuth /
      // web popup) — never call signInWithPopup directly here.
      if (auth.currentUser?.isAnonymous) {
        const result = await upgradeAnonymousWithGoogle();
        if (result.status === "collision-signed-in") {
          promptAnonymousImport(result.importable ?? [], result.destinationUid);
        }
      } else {
        await signInWithGoogle();
      }
      trackAuthProviderResult("google", "completed");
    } catch (error: unknown) {
      const errorCode = getAuthErrorCode(error);

      // Recovery for a webview arrival detection missed (e.g. the Google iOS
      // app, or an app whose token changed): OAuth itself rejected the
      // environment. Surface the escape path instead of a raw dead end, and
      // record it so the detection gap is visible rather than silent.
      const message = error instanceof Error ? error.message : String(error);
      if (
        errorCode === "auth/operation-not-supported-in-this-environment" ||
        /disallowed_useragent/i.test(message)
      ) {
        providerError = blockedProviderMessage("Google");
        captureWhenReady("inapp_browser_oauth_rejected", {
          provider: "google",
          route: analyticsRoute(),
        });
        revealEscapeNote();
      } else if (isExpectedAuthInterruption(error)) {
        trackAuthProviderResult(
          "google",
          "interrupted",
          errorCode ?? "unknown"
        );
        providerError = mapAuthError(error);
        captureEvent("auth_provider_interrupted", {
          provider: "google",
          reason: errorCode ?? "unknown",
        });
      } else {
        trackAuthProviderResult("google", "failed", errorCode ?? "unknown");
        console.warn(
          "[SocialAuthCompact] Unexpected Google sign-in failure",
          error
        );
        captureException(error, {
          auth_error_code: errorCode,
          provider: "google",
          surface: "social_auth_compact",
        });
        providerError = mapAuthError(error);
      }
    } finally {
      loadingProvider = null;
    }
  }

  function handleFacebookClick() {
    if (isLoading) return;
    // Meta's webview policy was never independently confirmed to be looser
    // than Google's, and the cost of being wrong is asymmetric: a defensive
    // sentence costs a tap, an unhandled dead end costs the visitor.
    if (inAppBrowser) {
      providerError = blockedProviderMessage("Facebook");
      captureEvent("inapp_auth_social_intercepted", { provider: "facebook" });
      revealEscapeNote();
      return;
    }
    onFacebookAuth?.();
  }

  async function handleInstagramClick() {
    if (isLoading) return;
    if (inAppBrowser) {
      providerError = blockedProviderMessage("Instagram");
      captureEvent("inapp_auth_social_intercepted", { provider: "instagram" });
      revealEscapeNote();
      return;
    }

    loadingProvider = "instagram";
    providerError = null;
    recordAuthSubmission("instagram", mode);
    try {
      await signInWithInstagram();
      trackAuthProviderResult("instagram", "completed");
    } catch (error: unknown) {
      trackAuthProviderResult(
        "instagram",
        "failed",
        (error as { code?: string })?.code ?? "unknown"
      );
      console.error("[SocialAuthCompact] Instagram sign-in failed", {
        code: (error as { code?: string })?.code,
        message: error instanceof Error ? error.message : String(error),
      });
      providerError = getInstagramAuthErrorMessage(error);
    } finally {
      loadingProvider = null;
    }
  }
</script>

<div class="social-auth-compact">
  <div
    class="social-compact-buttons"
    class:one-provider={!showFacebook && !showInstagram}
    class:three-providers={showFacebook && showInstagram}
  >
    <button
      class="social-compact-button social-compact-button--google"
      onclick={handleGoogleClick}
      disabled={isLoading}
      aria-expanded={showEscapeNote}
      aria-controls="inapp-escape-note"
      aria-label={`Continue with Google${
        lastMethod === "google" ? ", last used on this device" : ""
      }`}
    >
      {#if lastMethod === "google"}
        <LastUsedBadge />
      {/if}
      {#if loadingProvider === "google"}
        <ProgressRing percent={-1} size={24} strokeWidth={2} />
        Signing in...
      {:else}
        <GoogleIcon />
        Continue with Google
      {/if}
    </button>
    {#if showFacebook}
      <button
        class="social-compact-button social-compact-button--facebook"
        onclick={handleFacebookClick}
        disabled={isLoading}
        aria-label={`Continue with Facebook${
          lastMethod === "facebook" ? ", last used on this device" : ""
        }`}
      >
        {#if lastMethod === "facebook"}
          <LastUsedBadge />
        {/if}
        <FacebookIcon />
        Continue with Facebook
      </button>
    {/if}
    {#if showInstagram}
      <button
        class="social-compact-button social-compact-button--instagram"
        onclick={handleInstagramClick}
        disabled={isLoading}
        aria-describedby="instagram-account-requirement"
        aria-label={`Continue with Instagram, creator or business account required${
          lastMethod === "instagram" ? ", last used on this device" : ""
        }`}
      >
        {#if lastMethod === "instagram"}
          <LastUsedBadge />
        {/if}
        {#if loadingProvider === "instagram"}
          <ProgressRing percent={-1} size={24} strokeWidth={2} />
          Opening...
        {:else}
          <i class="fab fa-instagram" aria-hidden="true"></i>
          Continue with Instagram
        {/if}
      </button>
    {/if}
  </div>
  {#if showInstagram}
    <p id="instagram-account-requirement" class="provider-note">
      Instagram requires a creator or business account.
    </p>
  {/if}
  {#if providerError}
    <p class="error-message" role="alert">{providerError}</p>
  {/if}
  {#if showEscapeNote}
    <div
      class="escape-note"
      id="inapp-escape-note"
      role="region"
      aria-label="Open this page in your browser"
    >
      <p class="escape-note-lead">Or open this page in your browser:</p>
      <InAppEscapeControls
        target={escapeAction}
        route={analyticsRoute()}
        context={escapeContext}
      />
    </div>
  {/if}
</div>

<style>
  .social-auth-compact {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .social-compact-buttons {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(6px, 1vw, 10px);
    width: 100%;
    max-width: none;
    /* Room for the "Last used" badge, which straddles a button's top edge by
       half its height. Reserved unconditionally so the row's geometry is
       identical whether or not a badge renders — the badge can never move
       these buttons. Sized to clear the badge at the 12px type floor. */
    padding-top: 0.75rem;
  }

  .social-compact-buttons.one-provider {
    grid-template-columns: minmax(0, 1fr);
  }

  .social-compact-buttons.three-providers {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .social-compact-button {
    /* Anchor for the absolutely-positioned LastUsedBadge. */
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(4px, 1vw, 8px);
    min-height: var(--min-touch-target, 44px);
    padding: 0.75rem 1rem;
    border-radius: var(--radius-md, 0.625rem);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-normal, 200ms) ease,
      box-shadow var(--duration-normal, 200ms) ease,
      transform var(--duration-normal, 200ms) ease;
    border: 1px solid #747775;
    box-shadow: 0 2px 6px var(--theme-shadow, rgba(0, 0, 0, 0.24));
  }

  .social-compact-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .social-compact-button :global(svg) {
    flex-shrink: 0;
  }

  .social-compact-button--google {
    background: #ffffff;
    color: #111827;
  }

  .social-compact-button--google:hover:not(:disabled) {
    background: #f3f4f6;
    transform: translateY(-1px);
  }

  .social-compact-button--facebook {
    background: #1877f2;
    color: #ffffff;
    border-color: #1877f2;
  }

  .social-compact-button--facebook:hover:not(:disabled) {
    background: #166fe5;
    transform: translateY(-1px);
  }

  .social-compact-button--instagram {
    background: #e4405f;
    color: #ffffff;
    border-color: #e4405f;
  }

  .social-compact-button--instagram:hover:not(:disabled) {
    background: #cf3654;
    transform: translateY(-1px);
  }

  .provider-note {
    margin: -4px 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    line-height: 1.35;
    text-align: center;
  }

  .error-message {
    margin: 0;
    font-size: var(--font-size-compact);
    color: var(--semantic-error, var(--semantic-error));
  }

  .social-compact-button:focus-visible {
    outline: 3px solid
      color-mix(in srgb, var(--theme-accent, #7c6af7) 72%, white);
    outline-offset: 3px;
  }

  .escape-note {
    width: 100%;
    margin-top: 0.75rem;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
  }

  .escape-note-lead {
    margin: 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .social-compact-button {
      transition: none;
    }
  }
</style>
