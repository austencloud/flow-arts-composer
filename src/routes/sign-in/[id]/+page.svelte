<!--
  /sign-in/[id]: the phone's side of "Sign in with your phone". Shows which
  computer asked and waits for Austen's own tap on Approve or Deny. Nothing is
  sent before a tap, except by a trusted phone on the same internet connection
  as the computer, which approves by itself. Every other case, and every
  failure of the automatic path, shows Approve and Deny. A signed-out phone
  gets the usual sign-in sheet and then the request.
  Spec: docs/superpowers/specs/2026-10-10-shared-phone-sign-in-design.md
-->
<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import { page } from "$app/state";
  import {
    afterAutoAnswer,
    ageLabel,
    askedAgoMs,
    autoApprovedText,
    hasExpired,
    needsConfirmation,
    newGate,
    serverAskedToConfirm,
    serverFoundOtherNetwork,
    shouldTryAuto,
    tapApprove,
    tapDeny,
    type GateState,
    type Tap,
  } from "@austencloud/phone-sign-in";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import PanelSpinner from "#lib/shared/components/panel/PanelSpinner.svelte";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import AuthModalHost from "#lib/shared/auth/components/AuthModalHost.svelte";
  import { authDrawerState } from "#lib/shared/auth/state/auth-drawer-state.svelte.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import {
    autoApproveRequest,
    decideApprovalRequest,
    forgetTrustedKey,
    formatCode,
    loadApprovalRequest,
    loadTrustedKey,
    signAutoApproval,
    type ApprovalRequest,
    type AutoAnswer,
  } from "#lib/shared/auth/phone-sign-in/client.js";
  import PhoneNotice from "#lib/shared/auth/phone-sign-in/PhoneNotice.svelte";
  import { finishBootScreen } from "#lib/shared/auth/phone-sign-in/boot-screen.js";
  import AutoApproved from "./AutoApproved.svelte";
  import TrustThisPhone from "./TrustThisPhone.svelte";

  type View =
    | { kind: "loading" }
    | { kind: "missing" }
    | { kind: "error"; message: string }
    // This phone is approving by itself. The code shows while it happens.
    | { kind: "auto"; request: ApprovalRequest }
    | { kind: "request"; request: ApprovalRequest };

  type PlainOutcome =
    | "approved"
    | "denied"
    | "expired"
    | "already-decided"
    | "was-approved"
    | "was-denied";
  // 'auto-approved' has its own screen (AutoApproved.svelte), so it has no entry below.
  type Outcome = PlainOutcome | "auto-approved";

  const OUTCOMES: Record<
    PlainOutcome,
    { icon: string; good: boolean; text: string }
  > = {
    approved: {
      icon: "fa-check",
      good: true,
      text: "Approved. If your computer is still showing the code, it signs in within a few seconds.",
    },
    denied: {
      icon: "fa-xmark",
      good: false,
      text: "Denied. Nothing was signed in.",
    },
    expired: {
      icon: "fa-clock",
      good: false,
      text: "This code expired. Ask for a new one on your computer.",
    },
    "already-decided": {
      icon: "fa-circle-exclamation",
      good: false,
      text: "Someone already answered this request.",
    },
    "was-approved": {
      icon: "fa-check",
      good: false,
      text: "This request was already approved.",
    },
    "was-denied": {
      icon: "fa-xmark",
      good: false,
      text: "This request was already denied.",
    },
  };

  // Reading this phone's key must never hold the page up. Past this, the page
  // shows Approve and Deny as it always did.
  const KEY_READ_LIMIT_MS = 3000;

  let view = $state<View>({ kind: "loading" });
  let now = $state(Date.now());
  // When the request arrived, on this phone's clock. The server measured the
  // request's age and time left when it answered, so the page counts only the
  // time since then and never compares this clock with the server's.
  let loadedAt = $state(Date.now());
  // What the owner's own tap, or the automatic approval, led to. Loaded statuses are handled in `outcome`.
  let answered = $state<Outcome | null>(null);
  let sending = $state<"approve" | "deny" | null>(null);
  let decisionError = $state<string | null>(null);
  // The two-tap rules for a different network, from the approve gate in @austencloud/phone-sign-in.
  let gate = $state<GateState>(newGate(true));
  // True while the page can be seen. A page opened in the background tries to
  // approve by itself only once it is brought to the front.
  let visible = $state(document.visibilityState === "visible");
  // Bumped on every load and on destroy, so a late answer can never change the view.
  let generation = 0;
  // The request this page loaded. The done screen sends it with "That wasn't me".
  let loadedId = $state<string | undefined>();
  // This phone's key for the signed-in account. It is set before the request
  // shows, and plain variables stay out of the effect's dependencies on purpose:
  // the effect below runs again for other reasons, never for these two.
  let keyPair: CryptoKeyPair | null = null;
  // The page tries the automatic path at most once for each request.
  let autoTried = false;
  // The sign-in sheet opens by itself once; after that it's the button.
  let sheetOffered = false;

  // A guest session cannot approve anything, so it counts as signed out.
  const uid = $derived(
    authState.user && !authState.user.isAnonymous ? authState.user.uid : null
  );
  // Once a request has loaded the page keeps it, even if this phone is then
  // signed out ("That wasn't me" signs out every session, this one included).
  const needsSignIn = $derived(
    authState.initialized && uid === null && loadedId === undefined
  );

  const request = $derived(view.kind === "request" ? view.request : null);

  const outcome = $derived.by<Outcome | null>(() => {
    if (!request) return null;
    if (answered) return answered;
    if (request.status === "approved" || request.status === "used") {
      return "was-approved";
    }
    if (request.status === "denied") return "was-denied";
    if (request.status === "expired") return "expired";
    return hasExpired(request, loadedAt, now) ? "expired" : null;
  });

  // Shows the warning. True when the request came from another network or the
  // server asked for the confirmation.
  const differentNetwork = $derived(!!request && needsConfirmation(gate));
  // True while the Approve button reads "Approve anyway".
  const confirming = $derived(gate.confirming);

  // What the panel shows. The request view is one view: the heading, code and
  // computer box stay put while only the part under them changes (tailKey).
  const viewKey = $derived(needsSignIn ? "sign-in" : view.kind);
  const tailKey = $derived(
    outcome === "auto-approved" ? "done" : outcome ? "outcome" : "buttons"
  );

  const announcement = $derived.by(() => {
    if (needsSignIn) return "Sign in on this phone to see the request.";
    if (view.kind === "missing") return "This sign-in request doesn't exist.";
    if (view.kind === "error") return view.message;
    if (view.kind === "auto") return "Signing in automatically.";
    if (outcome === "auto-approved") {
      return request ? autoApprovedText(request.device.label) : "";
    }
    if (outcome) return OUTCOMES[outcome].text;
    if (decisionError) return decisionError;
    if (confirming) {
      return "Different connection. Tap Approve anyway to sign it in, or tap Deny.";
    }
    return "";
  });

  const spokenCode = (code: string) => `Code ${code.split("").join(" ")}`;

  function isPrerendering(): boolean {
    return (
      "prerendering" in document &&
      (document as Document & { prerendering: boolean }).prerendering === true
    );
  }

  function onVisibilityChange() {
    visible = document.visibilityState === "visible";
    // Timers slow down in the background, so the page's clock may be behind.
    if (visible) now = Date.now();
  }

  function signIn() {
    authDrawerState.show("signin");
  }

  /** This phone's key, or null when it has none or reading it takes too long. */
  function readKey(userId: string): Promise<CryptoKeyPair | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), KEY_READ_LIMIT_MS);
      void loadTrustedKey(userId).then((pair) => {
        clearTimeout(timer);
        resolve(pair);
      });
    });
  }

  async function load(id: string, userId: string) {
    const mine = ++generation;
    view = { kind: "loading" };
    answered = null;
    sending = null;
    decisionError = null;
    gate = newGate(true);
    keyPair = null;
    autoTried = false;
    try {
      const loaded = await loadApprovalRequest(id);
      if (mine !== generation) return;
      const arrivedAt = Date.now();
      // Read before the request shows, so Approve and Deny never flash up
      // ahead of an automatic sign-in.
      const pair = loaded ? await readKey(userId) : null;
      if (mine !== generation) return;
      keyPair = pair;
      now = Date.now();
      loadedAt = arrivedAt;
      if (loaded) gate = newGate(loaded.sameNetwork);
      view = loaded
        ? { kind: "request", request: loaded }
        : { kind: "missing" };
    } catch (e) {
      if (mine !== generation) return;
      view = {
        kind: "error",
        message:
          e instanceof Error
            ? e.message
            : "Could not load this sign-in request.",
      };
    }
  }

  // A signed-out phone gets the sign-in sheet straight away, once.
  $effect(() => {
    if (!needsSignIn || sheetOffered) return;
    sheetOffered = true;
    untrack(signIn);
  });

  // Load once per id, after sign-in has settled.
  $effect(() => {
    if (!uid) return;
    const id = page.params.id;
    if (!id || id === untrack(() => loadedId)) return;
    loadedId = id;
    const userId = uid;
    untrack(() => void load(id, userId));
  });

  // The "asked N seconds ago" line and the expiry check both run off this clock.
  $effect(() => {
    if (view.kind !== "request") return;
    const timer = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(timer);
  });

  // Decides whether this phone approves by itself. shouldTryAuto holds the
  // rules. `visible` is one of its inputs, so a page opened in the background
  // runs this again when it is brought to the front, and `autoTried` keeps it
  // to one try.
  $effect(() => {
    if (view.kind !== "request" || outcome !== null) return;
    const current = view.request;
    const pair = keyPair;
    const id = loadedId;
    const go = shouldTryAuto({
      request: current,
      expired: hasExpired(current, loadedAt, now),
      hasKey: pair !== null,
      visible,
      prerendering: isPrerendering(),
      tried: autoTried,
    });
    if (!go || !pair || !id) return;
    autoTried = true;
    untrack(() => void tryAuto(id, current, pair));
  });

  onMount(finishBootScreen);

  onDestroy(() => {
    generation++;
  });

  // The automatic path: sign the request id with this phone's key and let the
  // server check everything else. Any answer but 'approved' leaves the request
  // as it was, so the page falls back to Approve and Deny.
  async function tryAuto(
    id: string,
    current: ApprovalRequest,
    pair: CryptoKeyPair
  ) {
    const mine = generation;
    view = { kind: "auto", request: current };
    let signature: string | null = null;
    try {
      signature = await signAutoApproval(pair, id);
    } catch {
      // The stored key cannot sign (corrupt, or from an older format).
    }
    if (mine !== generation) return;
    let answer: AutoAnswer | "error";
    if (signature === null) {
      // A key that cannot sign never will, so it goes like a key the server refuses.
      answer = "not-trusted";
    } else {
      try {
        answer = await autoApproveRequest(id, signature);
      } catch {
        // Network or server trouble says nothing about the key, so it stays.
        answer = "error";
      }
      if (mine !== generation) return;
    }

    const next = afterAutoAnswer(answer);
    now = Date.now();
    view = { kind: "request", request: current };
    if (next.show === "done") {
      answered = "auto-approved";
    } else if (next.show === "outcome") {
      answered = next.outcome;
    } else {
      if (next.warnNetwork) gate = serverFoundOtherNetwork(gate);
      if (next.forgetKey) {
        // The server no longer knows this key. Nothing below needs the page,
        // so there is no generation check after this await.
        keyPair = null;
        await forgetTrustedKey();
      }
    }
  }

  // The only two places a decision leaves this page, both from a button tap.
  // The approve gate decides what a tap does; this carries it out.
  function context() {
    return {
      now: Date.now(),
      sending: sending !== null,
      finished: !request || outcome !== null,
    };
  }

  function carryOut(tap: Tap) {
    if (tap.kind === "arm") {
      gate = tap.gate;
      decisionError = null;
    } else if (tap.kind === "send") {
      void send(tap.decision, tap.confirm);
    }
  }

  function approve() {
    carryOut(tapApprove(gate, context()));
  }

  function deny() {
    carryOut(tapDeny(context()));
  }

  async function send(decision: "approve" | "deny", confirm: boolean) {
    const id = loadedId;
    if (!id) return;
    const mine = generation;
    sending = decision;
    decisionError = null;
    try {
      const result = await decideApprovalRequest(id, decision, confirm);
      if (mine !== generation) return;
      if (result === "confirm-network") {
        gate = serverAskedToConfirm(gate, Date.now());
      } else {
        answered = result;
      }
    } catch (e) {
      if (mine !== generation) return;
      decisionError =
        e instanceof Error ? e.message : "Could not save your answer.";
    } finally {
      if (mine === generation) sending = null;
    }
  }
</script>

<svelte:head>
  <title>Approve sign-in - Flow Arts Composer</title>
</svelte:head>

<svelte:document onvisibilitychange={onVisibilityChange} />

<AuthModalHost />

<main class="page">
  <p class="sr-only" aria-live="polite">{announcement}</p>

  <section class="panel" aria-label="Sign-in request">
    <Crossfade key={viewKey} animateHeight>
      {#if needsSignIn}
        <div class="group">
          <h1>Sign in a computer?</h1>
          <p class="lead">
            Sign in on this phone with Google to see which computer is asking.
          </p>
          <div class="actions">
            <PanelButton variant="primary" onclick={signIn}>Sign in</PanelButton
            >
          </div>
        </div>
      {:else if view.kind === "loading"}
        <div class="group">
          <div class="waiting">
            <PanelSpinner />
            <p>Loading the request...</p>
          </div>
        </div>
      {:else if view.kind === "missing" || view.kind === "error"}
        <div class="group">
          <h1>Sign-in request</h1>
          <div class="row">
            <PhoneNotice tone="plain" icon="fa-circle-exclamation">
              <p>
                {view.kind === "missing"
                  ? "This sign-in request doesn't exist."
                  : view.message}
              </p>
            </PhoneNotice>
          </div>
        </div>
      {:else if view.kind === "auto"}
        {@const r = view.request}
        <div class="group">
          <h1>Sign in a computer?</h1>
          <p class="code" role="img" aria-label={spokenCode(r.code)}>
            {formatCode(r.code)}
          </p>
          <div class="waiting">
            <PanelSpinner />
            <p>Signing in {r.device.label}...</p>
          </div>
        </div>
      {:else}
        {@const r = view.request}
        <div class="group">
          <h1>Sign in a computer?</h1>
          <p class="code" role="img" aria-label={spokenCode(r.code)}>
            {formatCode(r.code)}
          </p>

          <div class="who">
            <p class="who-label">{r.device.label}</p>
            {#if r.device.place}
              <p class="who-line">near {r.device.place}</p>
            {/if}
            {#if r.device.site}
              <p class="who-line">on {r.device.site}</p>
            {/if}
            <p class="who-line">
              asked <span class="age"
                >{ageLabel(askedAgoMs(r, loadedAt, now))}</span
              > ago
            </p>
          </div>

          <!-- Only this part swaps when the answer comes in. -->
          <Crossfade key={tailKey} animateHeight>
            {#if outcome === "auto-approved"}
              {#if uid && loadedId}
                <AutoApproved request={r} requestId={loadedId} {uid} />
              {/if}
            {:else if outcome}
              <div class="tail">
                <div class="row">
                  <PhoneNotice
                    tone={OUTCOMES[outcome].good ? "good" : "plain"}
                    icon={OUTCOMES[outcome].icon}
                  >
                    <p>{OUTCOMES[outcome].text}</p>
                  </PhoneNotice>
                </div>

                {#if outcome === "approved" && uid}
                  <TrustThisPhone {uid} />
                {/if}
              </div>
            {:else}
              <div class="tail">
                {#if differentNetwork}
                  <div class="row" transition:growFade>
                    <PhoneNotice
                      tone="warn"
                      icon="fa-triangle-exclamation"
                      strong
                    >
                      <p class="title">Different internet connection</p>
                      <p>
                        If this phone and your computer are on the same Wi-Fi
                        right now, this request did not come from your computer.
                        Tap Deny. Approve anyway only if your phone is on
                        cellular data or your computer is somewhere else.
                      </p>
                    </PhoneNotice>
                  </div>
                {/if}

                <div class="row">
                  <PhoneNotice tone="warn" icon="fa-circle-exclamation">
                    <p>
                      Approve only if you just asked to sign in on your computer
                      and its screen shows this number.
                    </p>
                  </PhoneNotice>
                </div>

                {#if decisionError}
                  <div class="row" transition:growFade>
                    <PhoneNotice tone="error" icon="fa-circle-exclamation">
                      <p>{decisionError}</p>
                    </PhoneNotice>
                  </div>
                {/if}

                <div class="pair">
                  <PanelButton
                    variant="primary"
                    accentColor={confirming
                      ? "var(--semantic-warning)"
                      : undefined}
                    fullWidth
                    disabled={sending !== null}
                    ariaBusy={sending === "approve"}
                    onclick={approve}
                  >
                    <span class="lead-icon">
                      {#if sending === "approve"}
                        <PanelSpinner size={5} color="currentColor" />
                      {:else}
                        <i class="fa-solid fa-check" aria-hidden="true"></i>
                      {/if}
                    </span>
                    {confirming ? "Approve anyway" : "Approve"}
                  </PanelButton>
                  <PanelButton
                    fullWidth
                    disabled={sending !== null}
                    ariaBusy={sending === "deny"}
                    onclick={deny}
                  >
                    <span class="lead-icon">
                      {#if sending === "deny"}
                        <PanelSpinner size={5} color="currentColor" />
                      {:else}
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                      {/if}
                    </span>
                    Deny
                  </PanelButton>
                </div>
              </div>
            {/if}
          </Crossfade>
        </div>
      {/if}
    </Crossfade>
  </section>
</main>

<style>
  .page {
    min-height: 100dvh;
    display: flex;
    align-items: flex-start;
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

  /* A phone page: one reading band, sized for a phone held in one hand. */
  .panel {
    container-type: inline-size;
    width: 100%;
    max-width: 440px;
    padding: 24px 20px;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    box-sizing: border-box;
  }

  @media (min-height: 720px) and (min-width: 600px) {
    .page {
      align-items: center;
    }
  }

  /* Flow roots keep child margins inside the boxes Crossfade measures, so
     spacing doesn't jump when a view swaps. */
  .group,
  .tail {
    display: flow-root;
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
    font-size: var(--font-size-base);
    line-height: 1.5;
    color: var(--theme-text-dim);
  }

  .actions {
    display: flex;
    margin-top: 20px;
  }

  .waiting {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
    min-height: var(--min-touch-target);
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  .waiting p {
    margin: 0;
  }

  .code {
    margin: 12px 0 0;
    font-family:
      ui-monospace, "Cascadia Mono", "Fira Code", Consolas, monospace;
    font-size: 2.5rem;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text);
  }

  .who {
    margin-top: 16px;
    padding: 12px 14px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
  }

  .who p {
    margin: 0;
  }

  .who-label {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--theme-text);
  }

  .who-line {
    margin-top: 2px;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  /* Tabular figures, so the line holds still as the seconds count up. */
  .age {
    font-variant-numeric: tabular-nums;
  }

  /* Margins, not a flex gap, so growFade can animate the spacing with the box. */
  .row {
    display: flow-root;
    margin-top: 14px;
  }

  /* Approve and Deny side by side where there is room, stacked on a narrow phone. */
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 20px;
  }

  /* Stacked until both buttons fit their labels on one line, "Approve anyway"
     included, so the pair keeps one layout while the label changes. */
  @container (max-width: 350px) {
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
