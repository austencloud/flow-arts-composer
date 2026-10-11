<!--
  The phone's screen after it approved a sign-in by itself: what happened, a
  two-step "That wasn't me", and the control to stop approving automatically.
  "That wasn't me" signs out every session, this phone included, so once a
  report has signed everyone out nothing here makes another signed-in call
  except the stop control, which only needs the token this phone already
  holds. A report that did not finish signing out stays open to another try.
  Spec: docs/superpowers/specs/2026-10-10-shared-phone-sign-in-design.md
-->
<script lang="ts">
  import {
    CONFIRM_GRACE_MS,
    autoApprovedText,
    notMeNotice,
    type NotMeNotice,
  } from "@austencloud/phone-sign-in";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import PanelSpinner from "#lib/shared/components/panel/PanelSpinner.svelte";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import {
    forgetTrustedKey,
    reportNotMe,
    type ApprovalRequest,
    type NotMeAnswer,
  } from "#lib/shared/auth/phone-sign-in/client.js";
  import { APP_NAME } from "#lib/shared/auth/phone-sign-in/values.js";
  import PhoneNotice from "#lib/shared/auth/phone-sign-in/PhoneNotice.svelte";
  import TrustThisPhone from "./TrustThisPhone.svelte";

  interface Props {
    request: ApprovalRequest;
    requestId: string;
    /** The signed-in account, for the stop control. */
    uid: string;
  }

  let { request, requestId, uid }: Props = $props();

  const ASKING = `This signs out every ${APP_NAME} session, this phone included, and turns off automatic approval. A computer that already signed in can keep working for up to an hour.`;
  const SENDING =
    "Signing out everywhere. This can take a minute or two, so keep this page open.";
  // The server signs everyone out first, this phone included, and then holds the
  // request open while a collected sign-in runs out. A drop in that wait lands
  // here, and the phone cannot tell how far the server got.
  const CUT_OFF = `The report was cut off. ${APP_NAME} may already have signed every session out, this phone included. To be sure, turn phone sign-in off in Cloudflare and sign out in the Firebase console.`;

  // 'sending' lasts as long as the server takes. The server waits for a sign-in
  // the computer already collected to expire, so there is no timeout here.
  type Step = "idle" | "asking" | "sending";

  let step = $state<Step>("idle");
  // When "Sign out everywhere" starts to count; a tap before that is a double tap.
  let readyAt = 0;
  // Why the last report failed. The button is back, ready to try again.
  let error = $state<string | null>(null);
  let result = $state<NotMeNotice | null>(null);
  // The last result signed everyone out, so there is nothing left to report. A
  // result without it leaves "That wasn't me" in place for another try.
  let signedOut = $state(false);
  // Hidden once the server's record is gone, because there is nothing left to stop.
  let trustShown = $state(true);

  // What the notice slot shows, if anything. One slot, so the notices trade places.
  const noticeKind = $derived<"asking" | "sending" | "error" | "result" | null>(
    result
      ? "result"
      : step === "sending"
        ? "sending"
        : step === "asking"
          ? "asking"
          : error
            ? "error"
            : null
  );

  // Read aloud as the notice changes. The page announces the first line itself.
  const liveText = $derived(
    noticeKind === "result"
      ? (result?.text ?? "")
      : noticeKind === "sending"
        ? SENDING
        : noticeKind === "asking"
          ? ASKING
          : (error ?? "")
  );

  function ask() {
    if (step !== "idle") return;
    error = null;
    result = null;
    signedOut = false;
    readyAt = Date.now() + CONFIRM_GRACE_MS;
    step = "asking";
  }

  function cancel() {
    if (step === "asking") step = "idle";
  }

  // Keeps the screen on while the report runs. The server's wait can last a
  // minute or two, and a phone that locks its screen may drop the connection. A
  // browser without the API, or one that refuses the lock, just goes without.
  $effect(() => {
    if (step !== "sending") return;
    let lock: { release(): Promise<void> } | null = null;
    let released = false;
    const release = () => {
      if (lock) void Promise.resolve(lock.release()).catch(() => {});
    };
    void (async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // Refused (low battery, hidden page): nothing to hold.
      }
      if (released) release();
    })();
    return () => {
      released = true;
      release();
    };
  });

  async function signOutEverywhere() {
    if (step !== "asking" || Date.now() < readyAt) return;
    step = "sending";
    // The tap counts, so this phone stops approving by itself now, whatever the
    // report does. Waiting for the answer would leave the key in place if the
    // connection drops after the server revoked this phone's session.
    try {
      await forgetTrustedKey();
    } catch {
      // A key that cannot be deleted must not stop the report.
    }
    let answer: NotMeAnswer;
    try {
      answer = await reportNotMe(requestId);
    } catch {
      error = CUT_OFF;
      step = "idle";
      return;
    }
    result = notMeNotice(answer, APP_NAME);
    signedOut = answer.signedOut;
    // The server's record is gone, so there is nothing left to stop.
    if (answer.autoOff) trustShown = false;
    step = "idle";
  }
</script>

<div class="done">
  <p class="sr-only" aria-live="polite">{liveText}</p>

  <div class="row">
    <PhoneNotice tone="good" icon="fa-check">
      <p>{autoApprovedText(request.device.label)}</p>
    </PhoneNotice>
  </div>

  {#if noticeKind}
    <div class="slot" transition:growFade>
      <Crossfade key={noticeKind} animateHeight>
        {#if noticeKind === "asking" || noticeKind === "sending"}
          <div class="row">
            <PhoneNotice tone="error" icon="fa-triangle-exclamation">
              <p>{noticeKind === "asking" ? ASKING : SENDING}</p>
            </PhoneNotice>
          </div>
        {:else if noticeKind === "error"}
          <div class="row">
            <PhoneNotice tone="error" icon="fa-circle-exclamation">
              <p>{error}</p>
            </PhoneNotice>
          </div>
        {:else if result}
          <div class="row">
            <PhoneNotice
              tone={result.tone === "good" ? "good" : "warn"}
              icon={result.tone === "good"
                ? "fa-check"
                : "fa-circle-exclamation"}
            >
              <p>{result.text}</p>
            </PhoneNotice>
          </div>
        {/if}
      </Crossfade>
    </div>
  {/if}

  {#if !(result && signedOut)}
    <div class="slot" transition:growFade>
      <Crossfade key={step === "idle" ? "idle" : "pair"} animateHeight>
        {#if step === "idle"}
          <div class="action">
            <PanelButton accentColor="var(--semantic-error)" onclick={ask}>
              <span class="lead-icon">
                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"
                ></i>
              </span>
              That wasn't me
            </PanelButton>
          </div>
        {:else}
          <div class="pair">
            <PanelButton
              variant="primary"
              accentColor="var(--semantic-error)"
              fullWidth
              disabled={step === "sending"}
              ariaBusy={step === "sending"}
              onclick={signOutEverywhere}
            >
              <span class="lead-icon">
                {#if step === "sending"}
                  <PanelSpinner size={5} color="currentColor" />
                {:else}
                  <i class="fa-solid fa-right-from-bracket" aria-hidden="true"
                  ></i>
                {/if}
              </span>
              Sign out everywhere
            </PanelButton>
            <PanelButton
              fullWidth
              disabled={step === "sending"}
              onclick={cancel}
            >
              <span class="lead-icon">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
              </span>
              Cancel
            </PanelButton>
          </div>
        {/if}
      </Crossfade>
    </div>
  {/if}

  {#if trustShown}
    <div class="slot" transition:growFade>
      <TrustThisPhone {uid} />
    </div>
  {/if}
</div>

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

  /* Flow roots keep child margins inside the boxes that Crossfade measures and
     growFade collapses, so spacing doesn't jump when a notice or button arrives. */
  .done,
  .slot,
  .row {
    display: flow-root;
  }

  .row {
    margin-top: 14px;
  }

  .action {
    display: flex;
    margin-top: 16px;
  }

  /* Two buttons side by side where both labels fit on one line, stacked on a phone. */
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 16px;
  }

  @container (max-width: 399px) {
    .pair {
      grid-template-columns: 1fr;
    }
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
