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
