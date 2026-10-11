<!--
  The one control for letting this phone approve sign-ins by itself, or for
  taking that back. With no key on this phone it offers to trust it; with a key
  it offers to stop. Renders nothing where the browser cannot hold a key.
  Spec: docs/superpowers/specs/2026-10-10-shared-phone-sign-in-design.md
-->
<script lang="ts">
  import type { PublicKeyJwk } from "@austencloud/phone-sign-in";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
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

  let phase = $state<Phase>("hidden");
  // A tap is on its way; both taps wait for it.
  let busy = $state(false);
  // Why trusting failed. The offer stays on screen with its button.
  let error = $state<string | null>(null);

  // Only the key on this phone decides which control shows. The server is not asked.
  $effect(() => {
    const forUid = uid;
    let current = true;
    void (async () => {
      if (!trustedPhoneSupported()) return;
      const keyPair = await loadTrustedKey(forUid);
      if (current) phase = keyPair ? "stop" : "offer";
    })();
    return () => {
      current = false;
    };
  });

  // Read aloud when a tap changes what the control says.
  const liveText = $derived(
    phase === "trusted"
      ? TRUSTED
      : phase === "stopped"
        ? STOPPED
        : phase === "stopped-partial"
          ? STOPPED_PARTIAL
          : (error ?? "")
  );

  async function trust() {
    if (busy) return;
    busy = true;
    error = null;
    try {
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
        phase = "trusted";
      } catch (e) {
        // A key the server never heard of would only fail later, so it goes too.
        await forgetTrustedKey();
        error = e instanceof Error ? e.message : "Could not trust this phone.";
      }
    } finally {
      busy = false;
    }
  }

  async function stop() {
    if (busy) return;
    busy = true;
    let removed = true;
    try {
      await stopTrustingPhone();
    } catch {
      removed = false;
    }
    // The key goes whatever the server said. Without it this phone cannot approve.
    await forgetTrustedKey();
    phase = removed ? "stopped" : "stopped-partial";
    busy = false;
  }
</script>

<p class="sr-only" aria-live="polite">{liveText}</p>

<Crossfade key={phase} animateHeight>
  {#if phase === "offer"}
    <div class="block">
      <p class="hint">
        Next time, scanning the code can sign in by itself while this phone is
        on the same internet connection as your computer.
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
