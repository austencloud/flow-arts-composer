import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearToasts,
  removeToast,
  showToast,
  toastQueue,
} from "#lib/shared/toast/state/toast-state.svelte.js";

describe("toast dismissal callbacks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearToasts();
  });

  afterEach(() => {
    clearToasts();
    vi.useRealTimers();
  });

  it("calls onDismiss when the close control removes a toast", () => {
    const onDismiss = vi.fn();
    const id = showToast({ message: "Setup", duration: 0, onDismiss });

    removeToast(id, "dismissed");

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not treat an action click as a dismissal", () => {
    const onDismiss = vi.fn();
    const id = showToast({ message: "Setup", duration: 0, onDismiss });

    removeToast(id, "action");

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("treats expiry as a dismissal", () => {
    const onDismiss = vi.fn();
    showToast({ message: "Setup", duration: 1_000, onDismiss });

    vi.advanceTimersByTime(1_000);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(toastQueue).toHaveLength(0);
  });
});
