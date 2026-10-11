<!--
  /phone-sign-in: the computer's side of "Sign in with your phone". Shows a QR
  code and its number, then waits for Austen to tap Approve on his signed-in
  phone, and signs this browser in with the pass the server hands back.
  Unlisted: the sign-in sheet links here only on his own copies of the app.
  Spec: docs/superpowers/specs/2026-10-10-shared-phone-sign-in-design.md
-->
<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { signInWithCustomToken } from "firebase/auth";
  import { QrCode } from "@austencloud/phone-sign-in/svelte";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import PanelSpinner from "#lib/shared/components/panel/PanelSpinner.svelte";
  import { auth, configureAuthPersistence } from "#lib/shared/auth/firebase.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import {
    collectPhoneSignIn,
    formatCode,
    startPhoneSignIn,
    type CollectAnswer,
    type StartedRequest,
  } from "#lib/shared/auth/phone-sign-in/client.js";
  import { pathAfterPhoneSignIn } from "#lib/shared/auth/phone-sign-in/where.js";
  import PhoneNotice from "#lib/shared/auth/phone-sign-in/PhoneNotice.svelte";
  import { finishBootScreen } from "#lib/shared/auth/phone-sign-in/boot-screen.js";

  // Once a second, so a phone that approves by itself signs this page in right away.
  const POLL_MS = 1000;
  const QR_SIZE = 224;
  const DENIED_MESSAGE = "Your phone said no. Nothing was signed in.";
  const EXPIRED_MESSAGE = "That code expired.";
  const SIGN_IN_FAILED = "This computer couldn't finish signing in. Try again.";

  type View =
    | { kind: "loading" }
    // Signed in before this page opened. Nothing to scan.
    | { kind: "signed-in"; who: string }
    | { kind: "idle" }
    | { kind: "starting" }
    // `deadline` is this computer's clock at arrival plus the server's own
    // "time left", so a wrong clock here cannot shorten or stretch the code.
    | { kind: "waiting"; request: StartedRequest; deadline: number }
    | { kind: "signing-in" }
    | { kind: "denied" }
    | { kind: "expired" }
    | { kind: "error"; message: string };

  let view = $state<View>({ kind: "loading" });
  let now = $state(Date.now());
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let clockTimer: ReturnType<typeof setInterval> | undefined;
  // Bumped on every start, cancel and destroy so a late poll answer from an
  // older request can never change the view.
  let generation = 0;

  const next = $derived(pathAfterPhoneSignIn(page.url.searchParams));

  const remainingMs = $derived(
    view.kind === "waiting" ? Math.max(0, view.deadline - now) : 0
  );
  const countdown = $derived.by(() => {
    const total = Math.ceil(remainingMs / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  });

  // The QR side swaps between the code and a tile with the state's mark, and
  // the side under the title between the matching words and buttons.
  const tileKey = $derived(
    view.kind === "waiting"
      ? `qr-${view.request.id}`
      : view.kind === "starting" || view.kind === "signing-in"
        ? "busy"
        : view.kind
  );
  const statusKey = $derived(view.kind);

  // One persistent live region, so screen readers hear each outcome without
  // hearing the countdown tick.
  const announcement = $derived.by(() => {
    switch (view.kind) {
      case "starting":
        return "Getting a code.";
      case "waiting":
        return "Code ready. Scan the QR code with your phone, then tap Approve.";
      case "signing-in":
        return "Signing in.";
      case "denied":
        return DENIED_MESSAGE;
      case "expired":
        return EXPIRED_MESSAGE;
      case "error":
        return view.message;
      default:
        return "";
    }
  });

  const spokenCode = (code: string) => `Code ${code.split("").join(" ")}`;

  // A computer that is already signed in has nothing to scan. Anyone else gets
  // a code as soon as the page knows, once.
  $effect(() => {
    if (view.kind !== "loading" || !authState.initialized) return;
    const user = authState.user;
    if (user && !user.isAnonymous) {
      view = { kind: "signed-in", who: user.email ?? "your account" };
    } else {
      view = { kind: "idle" };
      untrack(() => void start());
    }
  });

  function stopTimers() {
    clearTimeout(pollTimer);
    clearInterval(clockTimer);
    pollTimer = undefined;
    clockTimer = undefined;
  }

  async function start() {
    // A second press while a code is on its way, or while one is showing, does nothing.
    if (
      view.kind === "starting" ||
      view.kind === "waiting" ||
      view.kind === "signing-in"
    ) {
      return;
    }
    stopTimers();
    const mine = ++generation;
    view = { kind: "starting" };

    let request: StartedRequest;
    try {
      request = await startPhoneSignIn();
    } catch (e) {
      if (mine !== generation) return;
      view = {
        kind: "error",
        message:
          e instanceof Error ? e.message : "Could not start a phone sign-in.",
      };
      return;
    }
    if (mine !== generation) return;

    now = Date.now();
    view = { kind: "waiting", request, deadline: now + request.expiresInMs };
    clockTimer = setInterval(() => {
      now = Date.now();
      if (view.kind === "waiting" && now >= view.deadline) {
        stopTimers();
        view = { kind: "expired" };
      }
    }, 1000);
    schedulePoll(mine, request);
  }

  function schedulePoll(mine: number, request: StartedRequest) {
    pollTimer = setTimeout(() => poll(mine, request), POLL_MS);
  }

  async function poll(mine: number, request: StartedRequest) {
    let answer: CollectAnswer;
    try {
      answer = await collectPhoneSignIn(request.id, request.secret);
    } catch {
      if (mine === generation && view.kind === "waiting") {
        schedulePoll(mine, request);
      }
      return;
    }
    if (mine !== generation || view.kind !== "waiting") return;

    if (answer.status === "pending") {
      schedulePoll(mine, request);
      return;
    }
    stopTimers();
    if (answer.status === "denied") {
      view = { kind: "denied" };
    } else if (answer.status === "expired") {
      view = { kind: "expired" };
    } else {
      view = { kind: "signing-in" };
      try {
        await configureAuthPersistence(auth);
        await signInWithCustomToken(auth, answer.token);
      } catch {
        if (mine === generation)
          view = { kind: "error", message: SIGN_IN_FAILED };
        return;
      }
      if (mine !== generation) return;
      await goto(next, { replaceState: true });
    }
  }

  function cancel() {
    if (view.kind !== "waiting") return;
    stopTimers();
    generation++;
    view = { kind: "idle" };
  }

  onMount(finishBootScreen);

  onDestroy(() => {
    stopTimers();
    generation++;
  });
</script>

<svelte:head>
  <title>Sign in with your phone - Flow Arts Composer</title>
</svelte:head>

<main class="page">
  <p class="sr-only" aria-live="polite">{announcement}</p>

  <section class="panel" aria-labelledby="phone-sign-in-title">
    <div class="intro">
      <h1 id="phone-sign-in-title">Sign in with your phone</h1>
      <p class="lead">
        Scan the code with your phone while it's signed in to Flow Arts
        Composer, then tap Approve. Your phone shows the same number.
      </p>

      <div class="status">
        <Crossfade key={statusKey} animateHeight>
          {#if view.kind === "waiting"}
            <div class="row">
              <p class="countdown" role="timer">
                Expires in <span class="time">{countdown}</span>
              </p>
              <PanelButton onclick={cancel}>Cancel</PanelButton>
            </div>
          {:else if view.kind === "starting"}
            <p class="quiet">Getting a code...</p>
          {:else if view.kind === "signing-in"}
            <p class="quiet">Signing in...</p>
          {:else if view.kind === "signed-in"}
            <div class="stack">
              <PhoneNotice tone="good" icon="fa-check">
                <p>This computer is already signed in as {view.who}.</p>
              </PhoneNotice>
              <div class="actions">
                <PanelButton variant="primary" href={next}>Continue</PanelButton
                >
              </div>
            </div>
          {:else if view.kind === "denied" || view.kind === "expired" || view.kind === "error"}
            <div class="stack">
              <PhoneNotice
                tone={view.kind === "expired" ? "plain" : "error"}
                icon={view.kind === "denied"
                  ? "fa-xmark"
                  : view.kind === "expired"
                    ? "fa-clock"
                    : "fa-circle-exclamation"}
              >
                <p>
                  {view.kind === "denied"
                    ? DENIED_MESSAGE
                    : view.kind === "expired"
                      ? EXPIRED_MESSAGE
                      : view.message}
                </p>
              </PhoneNotice>
              <div class="actions">
                <PanelButton variant="primary" onclick={start}>
                  {view.kind === "error" ? "Try again" : "New code"}
                </PanelButton>
              </div>
            </div>
          {:else if view.kind === "idle"}
            <div class="actions">
              <PanelButton variant="primary" onclick={start}>
                <i class="fa-solid fa-qrcode" aria-hidden="true"></i>
                Show a code
              </PanelButton>
            </div>
          {/if}
        </Crossfade>
      </div>
    </div>

    <div class="stage">
      <div class="tile">
        <Crossfade key={tileKey} fill>
          {#if view.kind === "waiting"}
            <QrCode
              value={view.request.approveUrl}
              label="QR code to approve this sign-in on your phone"
              size={QR_SIZE}
            />
          {:else if view.kind === "loading" || view.kind === "starting" || view.kind === "signing-in"}
            <div class="mark"><PanelSpinner /></div>
          {:else}
            <div class="mark" aria-hidden="true">
              <i
                class="fa-solid {view.kind === 'signed-in'
                  ? 'fa-check'
                  : view.kind === 'denied'
                    ? 'fa-xmark'
                    : view.kind === 'expired'
                      ? 'fa-clock'
                      : view.kind === 'error'
                        ? 'fa-circle-exclamation'
                        : 'fa-qrcode'}"
              ></i>
            </div>
          {/if}
        </Crossfade>
      </div>
      <!-- The number's line is always there, so the panel holds still when a code arrives. -->
      <Crossfade key={view.kind === "waiting" ? view.request.code : ""}>
        {#if view.kind === "waiting"}
          <p class="code" role="img" aria-label={spokenCode(view.request.code)}>
            {formatCode(view.request.code)}
          </p>
        {:else}
          <p class="code" aria-hidden="true">&nbsp;</p>
        {/if}
      </Crossfade>
    </div>
  </section>
</main>

<style>
  .page {
    container-type: inline-size;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    box-sizing: border-box;
  }

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

  /* Stacked on a phone; the words and the code side by side once there is room. */
  .panel {
    width: 100%;
    max-width: 720px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 28px;
    padding: 28px 24px;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    box-sizing: border-box;
  }

  /* Top-aligned, so the title holds still while the lines under it change. */
  @container (min-width: 680px) {
    .panel {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: 40px;
      padding: 36px;
    }
  }

  .intro {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  h1 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: 600;
    line-height: 1.25;
    color: var(--theme-text);
  }

  .lead {
    margin: 10px 0 0;
    max-width: 42ch;
    font-size: var(--font-size-base);
    line-height: 1.5;
    color: var(--theme-text-dim);
  }

  .status {
    margin-top: 24px;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .actions {
    display: flex;
  }

  .quiet {
    margin: 0;
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  /* Digits are tabular, so the width holds still as the seconds change. */
  .countdown {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
    font-variant-numeric: tabular-nums;
  }

  .time {
    display: inline-block;
    min-width: 4ch;
    color: var(--theme-text);
  }

  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  /* The QR's own size, reserved in every state so nothing moves when it arrives. */
  .tile {
    position: relative;
    /* The QR's 224px plus the 1px stroke on each side. */
    width: 226px;
    height: 226px;
    border-radius: 12px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    overflow: hidden;
  }

  .tile :global(.qr) {
    border-radius: 0;
  }

  .mark {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40px;
    /* A quiet stand-in for the code. The notice beside it carries the color. */
    color: color-mix(in srgb, var(--theme-text) 32%, transparent);
  }

  .code {
    margin: 0;
    font-family:
      ui-monospace, "Cascadia Mono", "Fira Code", Consolas, monospace;
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text);
    text-align: center;
  }
</style>
