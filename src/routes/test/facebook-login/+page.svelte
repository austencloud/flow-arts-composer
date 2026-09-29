<!--
  /test/facebook-login is the invited-tester entry point for the real Facebook
  auth flow. It calls signInWithFacebook() directly so Facebook can remain
  hidden everywhere else behind FACEBOOK_LOGIN_ENABLED.

  The first screen is intentionally participant-facing. Engineering controls
  and diagnostics remain available under the disclosure for Austen and anyone
  helping reproduce an account-collision path.
-->
<script lang="ts">
  import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";
  import FacebookIcon from "$lib/shared/auth/components/icons/FacebookIcon.svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import {
    signInWithFacebook,
    linkFacebookAccount,
    signOut,
  } from "$lib/shared/auth/services/authenticator";
  import {
    hasPendingLink,
    getPendingLinkEmail,
    getPendingLinkProviderId,
  } from "$lib/shared/auth/services/pending-credential-link";
  import { FACEBOOK_LOGIN_ENABLED } from "$lib/shared/auth/services/auth-providers.config";
  import { app } from "$lib/shared/auth/firebase";

  type LogEntry = {
    time: string;
    action: string;
    ok: boolean;
    code?: string;
    message?: string;
    hint?: string;
  };

  let log = $state<LogEntry[]>([]);
  let busy = $state<string | null>(null);

  const HINTS: Record<string, string> = {
    "auth/operation-not-allowed":
      "Facebook is not enabled in Firebase Authentication.",
    "auth/popup-blocked":
      "The browser blocked the Facebook window. Allow pop-ups for this site and try again.",
    "auth/popup-closed-by-user":
      "The Facebook window closed before the test finished.",
    "auth/cancelled-popup-request":
      "Another sign-in window was already open. Close it and try again.",
    "auth/account-exists-with-different-credential":
      "That email already has a TKA account. Sign in with the original method, then link Facebook from the tester tools.",
    "auth/credential-already-in-use":
      "That Facebook account is already linked to a different TKA account.",
    "auth/unauthorized-domain":
      "This domain is not authorized in Firebase Authentication.",
    "auth/argument-error":
      "The sign-in session went stale. Refresh this page and try again.",
  };

  function note(action: string, ok: boolean, err?: unknown) {
    const code = (err as { code?: string })?.code;
    const message =
      err instanceof Error ? err.message : err ? String(err) : undefined;

    log = [
      {
        time: new Date().toLocaleTimeString(),
        action,
        ok,
        code,
        message,
        hint: code ? HINTS[code] : undefined,
      },
      ...log,
    ].slice(0, 50);
  }

  async function run(action: string, fn: () => Promise<void>) {
    if (busy) return;
    busy = action;
    try {
      await fn();
      note(action, true);
    } catch (err) {
      console.error(`[fb-test] ${action} failed`, err);
      note(action, false, err);
    } finally {
      busy = null;
    }
  }

  const u = $derived(authState.user);
  const providers = $derived(
    u?.providerData.map((provider) => provider.providerId) ?? []
  );
  const facebookLinked = $derived(providers.includes("facebook.com"));
  const currentIdentity = $derived(
    u?.displayName ?? u?.email ?? "this TKA account"
  );
  const latestFacebookAttempt = $derived.by(
    () => log.find((entry) => entry.action === "signInWithFacebook") ?? null
  );

  function testerErrorMessage(entry: LogEntry): string {
    return (
      entry.hint ??
      "Facebook could not finish the test. Open the technical details below, copy the diagnostics, and send them to Austen."
    );
  }

  async function copyDiagnostics() {
    const snapshot = {
      config: {
        FACEBOOK_LOGIN_ENABLED,
        authDomain: app.options.authDomain,
        projectId: app.options.projectId,
        origin: location.origin,
      },
      user: u
        ? {
            uid: u.uid,
            isAnonymous: u.isAnonymous,
            displayName: u.displayName,
            email: u.email,
            emailVerified: u.emailVerified,
            photoURL: u.photoURL,
            providers,
          }
        : null,
      pending: {
        has: hasPendingLink(),
        email: getPendingLinkEmail(),
        provider: getPendingLinkProviderId(),
      },
      log,
    };

    await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    note("copy diagnostics", true);
  }
</script>

<svelte:head>
  <title>Test Facebook Login | Flow Arts Composer</title>
  <meta
    name="description"
    content="Invited tester page for the Flow Arts Composer Facebook login flow."
  />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="portal-page">
  <main class="portal-shell">
    <header class="brand-header">
      <div class="brand-lockup">
        <div class="brand-mark">
          <img src="/branding/logo.jpg" alt="" width="48" height="48" />
        </div>
        <div class="brand-names">
          <span class="brand-name">The Kinetic Alphabet</span>
          <span class="product-name">Flow Arts Composer</span>
        </div>
      </div>
      <span class="tester-badge">TKA tester invite</span>
    </header>

    <section class="invitation-card" aria-labelledby="tester-invitation-title">
      <div class="invitation-copy">
        <p class="eyebrow">Facebook login test</p>
        <h1 id="tester-invitation-title">
          Would you be interested in testing Facebook login?
        </h1>
        <p class="lede">
          You are invited to try the real sign-in flow for Flow Arts Composer.
          It should take about a minute.
        </p>
      </div>

      <ul class="trust-list" aria-label="What to expect">
        <li>
          <span class="trust-check" aria-hidden="true">✓</span>
          <span>
            <strong>Official TKA page</strong>
            <small>tkaflowarts.com</small>
          </span>
        </li>
        <li>
          <span class="trust-check" aria-hidden="true">✓</span>
          <span>
            <strong>Facebook handles sign-in</strong>
            <small>Your password stays in Facebook's window.</small>
          </span>
        </li>
        <li>
          <span class="trust-check" aria-hidden="true">✓</span>
          <span>
            <strong>Limited account access</strong>
            <small>Basic profile and email only.</small>
          </span>
        </li>
      </ul>

      <p class="permission-note">
        This test does not request permission to post or manage your Facebook
        account.
      </p>

      <div class="primary-action">
        <button
          class="facebook-button"
          type="button"
          disabled={!!busy}
          aria-busy={busy === "signInWithFacebook"}
          aria-describedby="facebook-window-note"
          onclick={() => run("signInWithFacebook", signInWithFacebook)}
        >
          {#if busy === "signInWithFacebook"}
            <ProgressRing percent={-1} size={24} strokeWidth={2} />
            <span>Opening Facebook...</span>
          {:else}
            <FacebookIcon />
            <span>Test Facebook login</span>
          {/if}
        </button>
        <p id="facebook-window-note">
          A Facebook window will open. You can cancel without changing your TKA
          account.
        </p>
      </div>

      <div class="session-summary">
        {#if authState.loading}
          <div class="session-avatar session-avatar--empty" aria-hidden="true">
            <ProgressRing percent={-1} size={20} strokeWidth={2} />
          </div>
          <p>Checking your current TKA session...</p>
        {:else if u}
          {#if u.photoURL}
            <img
              class="session-avatar"
              src={u.photoURL}
              alt=""
              width="44"
              height="44"
              referrerpolicy="no-referrer"
            />
          {:else}
            <div
              class="session-avatar session-avatar--empty"
              aria-hidden="true"
            >
              <span>{currentIdentity.slice(0, 1).toUpperCase()}</span>
            </div>
          {/if}
          <div>
            <p>Currently signed in as <strong>{currentIdentity}</strong>.</p>
            <span class:connected={facebookLinked}>
              {facebookLinked
                ? "Facebook is connected to this account."
                : "Facebook is not connected to this account yet."}
            </span>
          </div>
        {:else}
          <div class="session-avatar session-avatar--empty" aria-hidden="true">
            <i class="fas fa-user" aria-hidden="true"></i>
          </div>
          <div>
            <p>You are currently signed out.</p>
            <span>That is the cleanest starting point for this test.</span>
          </div>
        {/if}
      </div>

      <div class="result-region" aria-live="polite" aria-atomic="true">
        {#if latestFacebookAttempt?.ok}
          <div class="test-result test-result--success">
            <span class="result-icon" aria-hidden="true">✓</span>
            <div>
              <h2>Facebook login worked</h2>
              <p>
                The sign-in flow returned to Flow Arts Composer. Thank you, that
                is the result Austen needs.
              </p>
            </div>
          </div>
        {:else if latestFacebookAttempt}
          <div class="test-result test-result--error">
            <span class="result-icon" aria-hidden="true">!</span>
            <div>
              <h2>The test hit a snag</h2>
              <p>{testerErrorMessage(latestFacebookAttempt)}</p>
            </div>
          </div>
        {/if}
      </div>
    </section>

    <details class="tester-details">
      <summary>
        <span>
          <strong>Tester tools and technical details</strong>
          <small>Session details, account linking, and the event log</small>
        </span>
        <i class="fas fa-chevron-down details-chevron" aria-hidden="true"></i>
      </summary>

      <div class="details-body">
        <section class="details-panel">
          <div class="details-heading">
            <div>
              <h2>Current test session</h2>
              <p>Use these controls only if Austen asks for another test.</p>
            </div>
            <div class="secondary-actions">
              <button
                class="secondary-action secondary-action--facebook"
                type="button"
                disabled={!!busy || !u || facebookLinked}
                onclick={() => run("linkFacebookAccount", linkFacebookAccount)}
              >
                <FacebookIcon />
                {facebookLinked ? "Facebook linked" : "Link Facebook"}
              </button>
              <button
                class="secondary-action"
                type="button"
                disabled={!!busy || !u}
                onclick={() => run("signOut", signOut)}
              >
                Sign out
              </button>
              <button
                class="secondary-action"
                type="button"
                disabled={!!busy}
                onclick={() =>
                  run("refreshUser", () => authState.refreshUser())}
              >
                Refresh
              </button>
              <button
                class="secondary-action"
                type="button"
                onclick={copyDiagnostics}
              >
                Copy diagnostics
              </button>
            </div>
          </div>

          <dl>
            <dt>Session</dt>
            <dd>{u ? currentIdentity : "Signed out"}</dd>
            <dt>Email</dt>
            <dd>{u?.email ?? "None"}</dd>
            <dt>Providers</dt>
            <dd>{providers.length ? providers.join(", ") : "None"}</dd>
            <dt>Auth domain</dt>
            <dd>{app.options.authDomain}</dd>
            <dt>Facebook UI gate</dt>
            <dd>{String(FACEBOOK_LOGIN_ENABLED)}</dd>
          </dl>
        </section>

        <section class="details-panel">
          <div class="log-header">
            <div>
              <h2>Event log</h2>
              <p>Share the diagnostics with Austen if the test fails.</p>
            </div>
            {#if log.length}
              <button
                class="secondary-action"
                type="button"
                onclick={() => (log = [])}
              >
                Clear log
              </button>
            {/if}
          </div>

          {#if log.length === 0}
            <p class="empty-log">No events yet.</p>
          {:else}
            <ul class="event-log">
              {#each log as entry}
                <li class:failed={!entry.ok}>
                  <div class="event-line">
                    <span>{entry.time}</span>
                    <strong>{entry.action}</strong>
                    <b class:passed={entry.ok}>
                      {entry.ok ? "Passed" : "Failed"}
                    </b>
                  </div>
                  {#if entry.code}<code>{entry.code}</code>{/if}
                  {#if entry.message}<p>{entry.message}</p>{/if}
                  {#if entry.hint}<p class="event-hint">{entry.hint}</p>{/if}
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>
    </details>

    <footer class="portal-footer">
      <span>Flow Arts Composer tester page</span>
      <span aria-hidden="true">·</span>
      <LinkChip size="inline" href="/privacy">Privacy</LinkChip>
      <span aria-hidden="true">·</span>
      <LinkChip size="inline" href="/create">Return to the app</LinkChip>
    </footer>
  </main>
</div>

<style>
  .portal-page {
    --portal-text: #f8faff;
    --portal-muted: #bdc5da;
    --portal-subtle: #919bb6;
    --portal-stroke: rgba(255, 255, 255, 0.14);
    --facebook: #1465d8;
    --facebook-hover: #1259c3;
    --success: #59d69b;
    --error: #ff8f9d;
    min-height: var(--viewport-height, 100dvh);
    overflow-x: clip;
    color: var(--portal-text);
    background:
      radial-gradient(
        circle at 10% 5%,
        rgba(20, 101, 216, 0.25),
        transparent 32rem
      ),
      radial-gradient(
        circle at 90% 80%,
        color-mix(in srgb, var(--theme-accent, #8b5cf6) 22%, transparent),
        transparent 30rem
      ),
      linear-gradient(150deg, #080b18, #111631 52%, #080b18);
  }

  .portal-shell {
    container-type: inline-size;
    width: min(100%, 54rem);
    margin: 0 auto;
    padding: calc(clamp(1rem, 4vw, 2.5rem) + env(safe-area-inset-top))
      clamp(1rem, 4vw, 2.5rem)
      calc(clamp(1.5rem, 5vw, 3.5rem) + env(safe-area-inset-bottom));
  }

  .brand-header,
  .brand-lockup,
  .session-summary,
  .test-result,
  .details-heading,
  .log-header,
  .event-line,
  .portal-footer {
    display: flex;
    align-items: center;
  }

  .brand-header {
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: clamp(1rem, 3vw, 1.75rem);
  }

  .brand-lockup {
    min-width: 0;
    gap: 0.8rem;
  }

  .brand-mark {
    display: grid;
    width: 3.25rem;
    height: 3.25rem;
    flex: 0 0 auto;
    place-items: center;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 2rem rgba(20, 101, 216, 0.24);
  }

  .brand-mark img {
    width: 2.65rem;
    height: 2.65rem;
    object-fit: contain;
  }

  .brand-names,
  .trust-list li > span:last-child {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .brand-name {
    overflow: hidden;
    font-size: 0.95rem;
    font-weight: 750;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .product-name {
    overflow: hidden;
    color: var(--portal-muted);
    font-size: 0.8rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tester-badge {
    flex: 0 0 auto;
    padding: 0.48rem 0.72rem;
    border: 1px solid rgba(111, 167, 255, 0.36);
    border-radius: 999px;
    color: #dbe9ff;
    background: rgba(20, 101, 216, 0.17);
    font-size: 0.75rem;
    font-weight: 700;
  }

  .invitation-card {
    padding: clamp(1.35rem, 5cqi, 3rem);
    border: 1px solid var(--portal-stroke);
    border-radius: clamp(1.25rem, 4cqi, 2rem);
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.07), transparent 42%),
      rgba(16, 21, 47, 0.84);
    box-shadow:
      0 1.5rem 5rem rgba(0, 0, 0, 0.34),
      inset 0 1px rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(22px);
  }

  .eyebrow {
    margin: 0 0 0.75rem;
    color: #9fc2ff;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    max-width: 13ch;
    margin: 0;
    font-size: clamp(2rem, 7cqi, 3.8rem);
    font-weight: 780;
    letter-spacing: -0.045em;
    line-height: 1.02;
    text-wrap: balance;
  }

  .lede {
    max-width: 38rem;
    margin: 1.1rem 0 0;
    color: var(--portal-muted);
    font-size: clamp(1rem, 2.6cqi, 1.16rem);
    line-height: 1.62;
    text-wrap: pretty;
  }

  .trust-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
    margin: clamp(1.5rem, 4cqi, 2rem) 0 0;
    padding: 0;
    list-style: none;
  }

  .trust-list li {
    display: flex;
    gap: 0.65rem;
    align-items: flex-start;
    padding: 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.9rem;
    background: rgba(255, 255, 255, 0.045);
  }

  .trust-list li > span:last-child {
    gap: 0.25rem;
  }

  .trust-check {
    display: grid;
    width: 1.35rem;
    height: 1.35rem;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 50%;
    color: #081a13;
    background: var(--success);
    font-size: 0.78rem;
    font-weight: 900;
  }

  .trust-list strong {
    font-size: 0.875rem;
    line-height: 1.3;
  }

  .trust-list small {
    color: var(--portal-muted);
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .permission-note {
    margin: 0.85rem 0 0;
    color: var(--portal-subtle);
    font-size: 0.8rem;
    line-height: 1.5;
    text-align: center;
  }

  .primary-action {
    display: flex;
    align-items: center;
    flex-direction: column;
    gap: 0.65rem;
    margin-top: clamp(1.5rem, 5cqi, 2.5rem);
  }

  .facebook-button {
    display: inline-flex;
    width: min(100%, 24rem);
    min-height: 3.5rem;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 0.9rem 1.4rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.95rem;
    color: #fff;
    background: var(--facebook);
    box-shadow: 0 0.8rem 2rem rgba(20, 101, 216, 0.32);
    font: inherit;
    font-size: 1rem;
    font-weight: 750;
    cursor: pointer;
    transition:
      transform 160ms ease,
      background-color 160ms ease;
  }

  .facebook-button :global(svg) {
    width: 1.45rem;
    height: 1.45rem;
    flex: 0 0 auto;
  }

  .facebook-button:disabled {
    cursor: wait;
    opacity: 0.72;
  }

  .facebook-button:focus-visible,
  .secondary-action:focus-visible,
  .tester-details summary:focus-visible {
    outline: 3px solid #a9c8ff;
    outline-offset: 3px;
  }

  .primary-action > p {
    max-width: 32rem;
    margin: 0;
    color: var(--portal-subtle);
    font-size: 0.78rem;
    line-height: 1.5;
    text-align: center;
  }

  .session-summary {
    gap: 0.8rem;
    margin-top: 1.5rem;
    padding: 0.9rem 1rem;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 1rem;
    background: rgba(5, 8, 21, 0.34);
  }

  .session-avatar {
    width: 2.75rem;
    height: 2.75rem;
    flex: 0 0 auto;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 50%;
    object-fit: cover;
  }

  .session-avatar--empty {
    display: grid;
    place-items: center;
    color: #d9e5ff;
    background: rgba(20, 101, 216, 0.2);
    font-weight: 800;
  }

  .session-summary p {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.45;
  }

  .session-summary div > span {
    display: block;
    margin-top: 0.16rem;
    color: var(--portal-subtle);
    font-size: 0.75rem;
  }

  .session-summary div > span.connected {
    color: var(--success);
  }

  .result-region:not(:empty) {
    margin-top: 1rem;
  }

  .test-result {
    gap: 0.8rem;
    align-items: flex-start;
    padding: 1rem;
    border: 1px solid;
    border-radius: 1rem;
  }

  .test-result--success {
    border-color: rgba(89, 214, 155, 0.3);
    background: rgba(89, 214, 155, 0.1);
  }

  .test-result--error {
    border-color: rgba(255, 143, 157, 0.34);
    background: rgba(255, 143, 157, 0.1);
  }

  .result-icon {
    display: grid;
    width: 1.65rem;
    height: 1.65rem;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 50%;
    color: #07130e;
    background: var(--success);
    font-weight: 900;
  }

  .test-result--error .result-icon {
    color: #1c070a;
    background: var(--error);
  }

  .test-result h2,
  .details-panel h2 {
    margin: 0;
    color: var(--portal-text);
    font-size: 0.95rem;
  }

  .test-result p,
  .details-heading p,
  .log-header p {
    margin: 0.25rem 0 0;
    color: var(--portal-muted);
    font-size: 0.78rem;
    line-height: 1.5;
  }

  .tester-details {
    margin-top: 1rem;
    border: 1px solid var(--portal-stroke);
    border-radius: 1.15rem;
    background: rgba(12, 16, 37, 0.94);
  }

  .tester-details summary {
    display: flex;
    min-height: 4.25rem;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.9rem 1.1rem;
    cursor: pointer;
    list-style: none;
  }

  .tester-details summary::-webkit-details-marker {
    display: none;
  }

  .tester-details summary > span {
    display: flex;
    flex-direction: column;
  }

  .tester-details summary strong {
    font-size: 0.875rem;
  }

  .tester-details summary small,
  .empty-log {
    color: var(--portal-subtle);
    font-size: 0.75rem;
  }

  .details-chevron {
    transition: transform 160ms ease;
  }

  .tester-details[open] .details-chevron {
    transform: rotate(180deg);
  }

  .details-body {
    display: grid;
    gap: 0.8rem;
    padding: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .details-panel {
    min-width: 0;
    padding: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 0.9rem;
    background: rgba(255, 255, 255, 0.035);
  }

  .details-heading,
  .log-header {
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  .secondary-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.45rem;
  }

  .secondary-action {
    display: inline-flex;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--portal-stroke);
    border-radius: 0.65rem;
    color: var(--portal-text);
    background: rgba(255, 255, 255, 0.07);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
  }

  .secondary-action :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .secondary-action--facebook {
    border-color: rgba(111, 167, 255, 0.32);
    background: rgba(20, 101, 216, 0.16);
  }

  .secondary-action:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  dl {
    display: grid;
    grid-template-columns: minmax(7rem, auto) minmax(0, 1fr);
    gap: 0.35rem 0.75rem;
    margin: 1rem 0 0;
    font-size: 0.78rem;
  }

  dt {
    color: var(--portal-subtle);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .empty-log {
    margin: 0.8rem 0 0;
  }

  .event-log {
    display: grid;
    gap: 0.5rem;
    margin: 0.8rem 0 0;
    padding: 0;
    list-style: none;
  }

  .event-log li {
    padding: 0.7rem;
    border: 1px solid rgba(89, 214, 155, 0.14);
    border-radius: 0.65rem;
    background: rgba(2, 5, 13, 0.36);
  }

  .event-log li.failed {
    border-color: rgba(255, 143, 157, 0.22);
  }

  .event-line {
    flex-wrap: wrap;
    gap: 0.4rem 0.7rem;
    font-size: 0.75rem;
  }

  .event-line span {
    color: var(--portal-subtle);
  }

  .event-line b {
    color: var(--error);
  }

  .event-line b.passed {
    color: var(--success);
  }

  .event-log code,
  .event-log p {
    display: block;
    margin: 0.35rem 0 0;
    color: var(--portal-muted);
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }

  .event-log .event-hint {
    color: #adcaff;
  }

  .portal-footer {
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.35rem 0.55rem;
    margin-top: 1.1rem;
    color: var(--portal-subtle);
    font-size: 0.75rem;
    text-align: center;
  }

  @container (max-width: 42rem) {
    .trust-list {
      grid-template-columns: 1fr;
    }

    .trust-list li {
      align-items: center;
    }
  }

  @container (max-width: 34rem) {
    h1 {
      max-width: 15ch;
      font-size: clamp(2rem, 10cqi, 2.85rem);
    }

    .details-heading,
    .log-header {
      flex-direction: column;
    }

    .secondary-actions {
      justify-content: flex-start;
    }
  }

  @container (max-width: 25rem) {
    .brand-name {
      font-size: 0.85rem;
    }

    .product-name,
    .tester-badge {
      font-size: 0.7rem;
    }

    .session-summary {
      align-items: flex-start;
    }

    dl {
      grid-template-columns: 1fr;
    }

    dd + dt {
      margin-top: 0.35rem;
    }
  }

  @media (hover: hover) {
    .facebook-button:hover:not(:disabled) {
      background: var(--facebook-hover);
      transform: translateY(-2px);
    }

    .secondary-action:hover:not(:disabled),
    .tester-details summary:hover {
      background: rgba(255, 255, 255, 0.11);
    }
  }

  .facebook-button:active:not(:disabled) {
    transform: scale(0.985);
  }

  @media (prefers-reduced-motion: reduce) {
    .facebook-button,
    .details-chevron {
      transition: none;
    }

    .facebook-button:hover:not(:disabled),
    .facebook-button:active:not(:disabled) {
      transform: none;
    }
  }
</style>
