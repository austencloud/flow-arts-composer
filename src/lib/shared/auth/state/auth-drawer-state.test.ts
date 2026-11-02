import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/analytics/auth-events.js", () => ({
  trackAuthSurfaceOpened: vi.fn(),
}));

import {
  clearToasts,
  toastQueue,
} from "#lib/shared/toast/state/toast-state.svelte.js";
import { AUTH_NUDGE_TEXTS } from "../domain/auth-nudge-trigger";
import {
  AUTH_GATE_COOLDOWN_MS,
  AUTH_SHEET_FEEDBACK_GRACE_MS,
  authDrawerState,
} from "./auth-drawer-state.svelte";

const SAVE_LIMIT_TEXT = AUTH_NUDGE_TEXTS["save-limit"];

function askToSaveMore() {
  authDrawerState.show("signup", "save-limit");
}

function messages() {
  return toastQueue.map((toast) => toast.message);
}

/**
 * The sheet is a lazily imported chunk. An ask (first seen as a guest's
 * refused ninth step, before the guest step cap was removed) used to
 * flip the drawer open and then wait for that chunk in silence: nothing on
 * screen, and every further tap swallowed as a repeat of an open sheet
 * (reproduced 2026-10-22 at 412x915, where the first open also triggered a
 * Vite re-optimization reload). These pin the feedback that replaces that.
 */
describe("authDrawerState while the sheet's code is still loading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    authDrawerState.reset();
    authDrawerState.clearGateCooldown();
    clearToasts();
    vi.useRealTimers();
  });

  it("names the refusal in a toast once the grace passes without the sheet", () => {
    askToSaveMore();
    authDrawerState.reportHostStatus("loading");
    expect(messages()).toEqual([]);

    vi.advanceTimersByTime(AUTH_SHEET_FEEDBACK_GRACE_MS);

    expect(authDrawerState.open).toBe(true);
    expect(messages()).toEqual([SAVE_LIMIT_TEXT]);
  });

  it("answers a repeated ask at once instead of swallowing it", () => {
    askToSaveMore();
    authDrawerState.reportHostStatus("loading");

    askToSaveMore();

    expect(messages()).toEqual([SAVE_LIMIT_TEXT]);
    expect(authDrawerState.open).toBe(true);
  });

  it("replaces, never stacks, the toast on further repeats", () => {
    askToSaveMore();
    authDrawerState.reportHostStatus("loading");

    askToSaveMore();
    askToSaveMore();

    expect(messages()).toEqual([SAVE_LIMIT_TEXT]);
  });

  it("withdraws the toast when the sheet's code lands", () => {
    askToSaveMore();
    authDrawerState.reportHostStatus("loading");
    vi.advanceTimersByTime(AUTH_SHEET_FEEDBACK_GRACE_MS);
    expect(messages()).toEqual([SAVE_LIMIT_TEXT]);

    authDrawerState.reportHostStatus("loaded");

    expect(messages()).toEqual([]);
    expect(authDrawerState.open).toBe(true);
  });

  it("stays quiet when the sheet loads within the grace", () => {
    askToSaveMore();
    authDrawerState.reportHostStatus("loading");
    authDrawerState.reportHostStatus("loaded");

    vi.advanceTimersByTime(AUTH_SHEET_FEEDBACK_GRACE_MS);

    expect(messages()).toEqual([]);
  });

  it("closes a failed load so the next ask retries, and still names the refusal", () => {
    askToSaveMore();
    authDrawerState.reportHostStatus("loading");

    authDrawerState.reportHostStatus("error");

    expect(authDrawerState.open).toBe(false);
    expect(messages()).toEqual([SAVE_LIMIT_TEXT]);

    askToSaveMore();
    expect(authDrawerState.open).toBe(true);
  });

  it("leaves a page that mounts its own sheet alone", () => {
    askToSaveMore();

    vi.advanceTimersByTime(AUTH_SHEET_FEEDBACK_GRACE_MS);

    expect(authDrawerState.hostStatus).toBe("idle");
    expect(messages()).toEqual([]);
  });

  it("does not raise a toast for an ask that was withdrawn in time", () => {
    askToSaveMore();
    authDrawerState.reportHostStatus("loading");
    authDrawerState.hide();

    vi.advanceTimersByTime(AUTH_SHEET_FEEDBACK_GRACE_MS);

    expect(messages()).toEqual([]);
  });
});

/**
 * One ask, then quiet. A guest on a phone was shown the sheet four times in
 * 19 minutes and left. After a "not now" on a gate's sheet, gates answer with
 * a toast for a day; a tap on an account button still opens the sheet.
 */
describe("authDrawerState after a guest says not now", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
  });

  afterEach(() => {
    authDrawerState.reset();
    authDrawerState.clearGateCooldown();
    clearToasts();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function dismissGateSheet() {
    askToSaveMore();
    expect(authDrawerState.open).toBe(true);
    authDrawerState.hide();
  }

  it("remembers the dismissal of a gate's sheet", () => {
    dismissGateSheet();

    expect(localStorage.getItem("tka-auth-gate-dismissed-at")).toBe(
      String(Date.now())
    );
  });

  it("does not count closing a sheet the guest asked for", () => {
    authDrawerState.showOnRequest("signup", "save-limit");
    authDrawerState.hide();
    authDrawerState.show("signin");
    authDrawerState.hide();

    askToSaveMore();
    expect(authDrawerState.open).toBe(true);
  });

  it("answers the next gate with a toast and keeps the sheet closed", () => {
    dismissGateSheet();

    askToSaveMore();

    expect(authDrawerState.open).toBe(false);
    expect(messages()).toEqual([SAVE_LIMIT_TEXT]);
    expect(toastQueue[0]?.action?.label).toBe("Create account");
  });

  it("opens the sheet from the toast's Create account action", () => {
    dismissGateSheet();
    askToSaveMore();

    toastQueue[0]?.action?.onClick();

    expect(authDrawerState.open).toBe(true);
    expect(authDrawerState.reason).toBe("save-limit");
    expect(messages()).toEqual([]);
  });

  it("still opens the sheet for a tap on an account button", () => {
    dismissGateSheet();

    authDrawerState.showOnRequest("signup", "sync-library");
    expect(authDrawerState.open).toBe(true);
    authDrawerState.close();

    authDrawerState.show("signin");
    expect(authDrawerState.open).toBe(true);
    expect(messages()).toEqual([]);
  });

  it("lets gates open the sheet again after a day", () => {
    dismissGateSheet();

    vi.advanceTimersByTime(AUTH_GATE_COOLDOWN_MS - 1);
    askToSaveMore();
    expect(authDrawerState.open).toBe(false);

    clearToasts();
    vi.advanceTimersByTime(1);
    askToSaveMore();
    expect(authDrawerState.open).toBe(true);
  });

  it("starts the quiet day when the first-save invitation is dismissed", async () => {
    // The invitation is offered once per page, so use a fresh copy of both
    // modules that has not offered it yet.
    vi.resetModules();
    const toasts =
      await import("#lib/shared/toast/state/toast-state.svelte.js");
    const { authDrawerState: fresh } =
      await import("./auth-drawer-state.svelte");
    let hostDismissed = false;
    expect(
      fresh.offerGuestSaveNudge({
        message: "Saved on this device.",
        onDismiss: () => {
          hostDismissed = true;
        },
      })
    ).toBe(true);
    const invitation = toasts.toastQueue[0];

    toasts.removeToast(invitation!.id, "dismissed");

    expect(hostDismissed).toBe(true);
    fresh.show("signup", "save-limit");
    expect(fresh.open).toBe(false);
    expect(toasts.toastQueue.map((toast) => toast.message)).toEqual([
      SAVE_LIMIT_TEXT,
    ]);
    fresh.clearGateCooldown();
    toasts.clearToasts();
  });

  it("clears the quiet day on sign-in", () => {
    dismissGateSheet();

    authDrawerState.clearGateCooldown();

    expect(localStorage.getItem("tka-auth-gate-dismissed-at")).toBeNull();
    askToSaveMore();
    expect(authDrawerState.open).toBe(true);
  });
});
