<!--
  The one control for letting this phone approve sign-ins by itself, or for
  taking that back. With no key on this phone it offers to trust it; with a key
  it offers to stop. Renders nothing where the browser cannot hold a key.
  Spec: docs/superpowers/specs/2026-10-10-shared-phone-sign-in-design.md
-->
<script lang="ts">
  import type { PublicKeyJwk } from "@austencloud/phone-sign-in";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import PanelSpinner from "#lib/shared/components/panel/PanelSpinner.svelte";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import {
    createTrustedKey,
    forgetTrustedKey,
    loadTrustedKey,
    stopTrustingPhone,
    trustedPhoneSupported,
    trustThisPhone,
  } from "#lib/shared/auth/phone-sign-in/client.js";
  import { APP_NAME } from "#lib/shared/auth/phone-sign-in/values.js";
  import PhoneNotice from "#lib/shared/auth/phone-sign-in/PhoneNotice.svelte";
  import {
    askToNotify,
    refreshSignInNotifications,
    turnOffSignInNotifications,
    turnOnSignInNotifications,
    type SignInNotifications,
  } from "#lib/shared/auth/phone-sign-in/phone-sign-in-push.js";

  interface Props {
    /** The signed-in account. The key on this phone only counts for the account it was made for. */
    uid: string;
  }

  let { uid }: Props = $props();

  // 'hidden' covers both "still looking" and "this browser cannot hold a key".
  type Phase =
    | "hidden"
    | "offer"
    | "stop"
    | "trusted"
    | "stopped"
    | "stopped-partial";

  const TRUSTED =
    "This phone now approves by itself when it's on the same internet connection as your computer.";
  const STOPPED = "This phone no longer approves by itself.";
  const STOPPED_PARTIAL = `This phone no longer approves by itself. ${APP_NAME} couldn't remove its record, which does nothing without this phone.`;
  // The browser's own words ("The operation failed for an unknown transient reason") mean nothing to Austen.
  const KEY_NOT_SAVED = "This phone couldn't save its key. Try again.";
  const NOTIFY_TEXT: Record<SignInNotifications, string> = {
    on: "Sign-ins now pop up here as a notification. One tap signs the computer in.",
    blocked: `Notifications are blocked for ${APP_NAME} in this browser, so sign-ins use the QR code.`,
    unavailable:
      "Sign-in notifications aren't available here, so sign-ins use the QR code.",
    failed: "Sign-in notifications didn't turn on, so sign-ins use the QR code.",
  };

  let phase = $state<Phase>("hidden");
  // A tap is on its way; both taps wait for it.
  let busy = $state(false);
  // Why trusting failed. The offer stays on screen with its button.
  let error = $state<string | null>(null);
  // Whether sign-ins reach this phone as notifications, once known.
  let notify = $state<SignInNotifications | null>(null);
  // The stop control offers to turn notifications on unless they are on or blocked.
  const offerNotify = $derived(notify === "unavailable" || notify === "failed");
  // Set by the button, so the answer is shown and read aloud only after a tap.
  let notifyTapped = $state(false);

  // Only the key on this phone decides which control shows. The server is not asked.
  $effect(() => {
    const forUid = uid;
    let current = true;
    void (async () => {
      if (!trustedPhoneSupported()) return;
      const keyPair = await loadTrustedKey(forUid);
      if (!current) return;
      phase = keyPair ? "stop" : "offer";
      // A trusted phone keeps sign-ins pointed at itself, asking nothing.
      if (keyPair) {
        const state = await refreshSignInNotifications(forUid);
        if (current) notify = state;
      }
    })();
    return () => {
      current = false;
    };
  });

  // Read aloud when a tap changes what the control says.
  const liveText = $derived(
    phase === "trusted"
      ? `${TRUSTED} ${notify ? NOTIFY_TEXT[notify] : ""}`
      : phase === "stopped"
        ? STOPPED
        : phase === "stopped-partial"
          ? STOPPED_PARTIAL
          : phase === "stop" && notifyTapped && notify
            ? NOTIFY_TEXT[notify]
            : (error ?? "")
  );

  async function trust() {
    if (busy) return;
    busy = true;
    error = null;
    try {
      // First, while Android still connects the prompt to this tap.
      await askToNotify();
      let publicKey: PublicKeyJwk;
      try {
        publicKey = await createTrustedKey(uid);
      } catch {
        // Storage or Web Crypto failed, and the key is saved last, so there is nothing to forget.
        error = KEY_NOT_SAVED;
        return;
      }
      try {
        await trustThisPhone(publicKey);
      } catch (e) {
        // A key the server never heard of would only fail later, so it goes too.
        await forgetTrustedKey();
        error = e instanceof Error ? e.message : "Could not trust this phone.";
        return;
      }
      // Trusted now, whatever happens to notifications: a failure here only means the QR code.
      notify = await turnOnSignInNotifications(uid);
      phase = "trusted";
    } finally {
      busy = false;
    }
  }

  async function stop() {
    if (busy) return;
    busy = true;
    const [stopped] = await Promise.allSettled([
      stopTrustingPhone(),
      turnOffSignInNotifications(),
    ]);
    // The key goes whatever the server said. Without it this phone cannot
    // approve, and the server stops ringing a phone it no longer trusts.
    await forgetTrustedKey();
    phase = stopped.status === "fulfilled" ? "stopped" : "stopped-partial";
    notify = null;
    busy = false;
  }

  async function turnOnNotifications() {
    if (busy) return;
    busy = true;
    notifyTapped = true;
    await askToNotify();
    notify = await turnOnSignInNotifications(uid);
    busy = false;
  }
</script>

<p class="sr-only" aria-live="polite">{liveText}</p>

<Crossfade key={phase} animateHeight>
  {#if phase === "offer"}
    <div class="block">
      <p class="hint">
        Next time, the sign-in can pop up here as a notification you tap, and
        scanning the code can sign in by itself while this phone is on the same
        internet connection as your computer.
      </p>

      {#if error}
        <div class="row" transition:growFade>
          <PhoneNotice tone="error" icon="fa-circle-exclamation">
            <p>{error}</p>
          </PhoneNotice>
        </div>
      {/if}

      <div class="action">
        <PanelButton disabled={busy} ariaBusy={busy} onclick={trust}>
          <span class="lead-icon">
            {#if busy}
              <PanelSpinner size={5} color="currentColor" />
            {:else}
              <i class="fa-solid fa-mobile-screen" aria-hidden="true"></i>
            {/if}
          </span>
          Approve automatically on this phone
        </PanelButton>
      </div>
    </div>
  {:else if phase === "stop"}
    <div class="block">
      {#if notifyTapped && notify}
        <div class="row" transition:growFade>
          <PhoneNotice
            tone={notify === "on" ? "good" : "plain"}
            icon={notify === "on" ? "fa-bell" : "fa-bell-slash"}
          >
            <p>{NOTIFY_TEXT[notify]}</p>
          </PhoneNotice>
        </div>
      {/if}
      {#if offerNotify}
        <div class="action" transition:growFade>
          <PanelButton
            disabled={busy}
            ariaBusy={busy}
            onclick={turnOnNotifications}
          >
            <span class="lead-icon">
              <i class="fa-solid fa-bell" aria-hidden="true"></i>
            </span>
            Send sign-ins here as notifications
          </PanelButton>
        </div>
      {/if}
      <div class="action">
        <PanelButton disabled={busy} ariaBusy={busy} onclick={stop}>
          <span class="lead-icon">
            {#if busy}
              <PanelSpinner size={5} color="currentColor" />
            {:else}
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            {/if}
          </span>
          Stop approving automatically
        </PanelButton>
      </div>
    </div>
  {:else if phase === "trusted"}
    <div class="block">
      <div class="row">
        <PhoneNotice tone="good" icon="fa-check"><p>{TRUSTED}</p></PhoneNotice>
      </div>
      {#if notify}
        <div class="row">
          <PhoneNotice
            tone={notify === "on" ? "good" : "plain"}
            icon={notify === "on" ? "fa-bell" : "fa-bell-slash"}
          >
            <p>{NOTIFY_TEXT[notify]}</p>
          </PhoneNotice>
        </div>
      {/if}
    </div>
  {:else if phase === "stopped" || phase === "stopped-partial"}
    <div class="block">
      <div class="row">
        <PhoneNotice tone="plain" icon="fa-check">
          <p>{phase === "stopped" ? STOPPED : STOPPED_PARTIAL}</p>
        </PhoneNotice>
      </div>
    </div>
  {/if}
</Crossfade>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  /* Flow roots, so the margins below stay inside the boxes Crossfade measures
     and growFade collapses. */
  .block,
  .row {
    display: flow-root;
  }

  .row {
    margin-top: 14px;
  }

  .hint {
    margin: 16px 0 0;
    font-size: var(--font-size-sm);
    line-height: 1.45;
    color: var(--theme-text-dim);
  }

  .action {
    display: flex;
    margin-top: 16px;
  }

  /* The icon and the spinner share one slot, so the label never shifts. */
  .lead-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    flex-shrink: 0;
  }
</style>
