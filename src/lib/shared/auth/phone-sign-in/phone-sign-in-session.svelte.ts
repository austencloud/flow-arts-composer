/**
 * One computer-side phone sign-in: get a code, wait for the phone to approve
 * it, and sign this browser in with the pass the server hands back. The sign-in
 * sheet and the bookmarked /phone-sign-in page both run one of these.
 * Spec: docs/superpowers/specs/2026-10-10-shared-phone-sign-in-design.md
 */

import {
  collectPhoneSignIn,
  startPhoneSignIn,
  type CollectAnswer,
  type StartedRequest,
} from "./client";

// Once a second, so a phone that approves by itself signs this computer in right away.
const POLL_MS = 1000;
export const DENIED_MESSAGE = "Your phone said no. Nothing was signed in.";
export const EXPIRED_MESSAGE = "That code expired.";
const SIGN_IN_FAILED = "This computer couldn't finish signing in. Try again.";

export type PhoneSignInView =
  | { kind: "idle" }
  | { kind: "starting" }
  // `deadline` is this computer's clock at arrival plus the server's own
  // "time left", so a wrong clock here cannot shorten or stretch the code.
  | { kind: "waiting"; request: StartedRequest; deadline: number }
  | { kind: "signing-in" }
  | { kind: "signed-in" }
  | { kind: "denied" }
  | { kind: "expired" }
  | { kind: "error"; message: string };

export function createPhoneSignInSession(
  options: { onSignedIn?: () => void | Promise<void> } = {}
) {
  let view = $state<PhoneSignInView>({ kind: "idle" });
  let now = $state(Date.now());
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let clockTimer: ReturnType<typeof setInterval> | undefined;
  // Bumped on every start, cancel and dispose so a late answer from an older
  // request can never change the view.
  let generation = 0;

  const remainingMs = $derived(
    view.kind === "waiting" ? Math.max(0, view.deadline - now) : 0
  );
  const countdown = $derived.by(() => {
    const total = Math.ceil(remainingMs / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  });

  // For one persistent live region, so screen readers hear each outcome
  // without hearing the countdown tick.
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
      view.kind === "signing-in" ||
      view.kind === "signed-in"
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
        // Firebase loads only now, so the sign-in sheet stays light.
        const [{ auth, configureAuthPersistence }, { signInWithCustomToken }] =
          await Promise.all([import("../firebase"), import("firebase/auth")]);
        await configureAuthPersistence(auth);
        await signInWithCustomToken(auth, answer.token);
      } catch {
        if (mine === generation)
          view = { kind: "error", message: SIGN_IN_FAILED };
        return;
      }
      if (mine !== generation) return;
      view = { kind: "signed-in" };
      await options.onSignedIn?.();
    }
  }

  /** Drops the code on screen. The next start gets a fresh one. */
  function cancel() {
    if (view.kind !== "waiting" && view.kind !== "starting") return;
    stopTimers();
    generation++;
    view = { kind: "idle" };
  }

  function dispose() {
    stopTimers();
    generation++;
  }

  return {
    get view() {
      return view;
    },
    get countdown() {
      return countdown;
    },
    get announcement() {
      return announcement;
    },
    start,
    cancel,
    dispose,
  };
}

export type PhoneSignInSession = ReturnType<typeof createPhoneSignInSession>;
