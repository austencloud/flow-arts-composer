import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../auth/state/auth-state.svelte", () => ({
  awaitAuthSettled: () => Promise.resolve(),
  getUser: () => null,
}));
vi.mock("./settings-state.svelte", () => ({
  settingsService: { onRemoteSettingsApplied: () => () => {} },
}));

import { awaitAccountSettings } from "./account-settings-ready";

type Listener = (settings: unknown, userId: string) => void;

function sources(userId: string | null, replay?: string) {
  const listeners = new Set<Listener>();
  return {
    listeners,
    apply: (forUser: string) => listeners.forEach((l) => l(null, forUser)),
    value: {
      awaitAuthSettled: () => Promise.resolve(),
      getUserId: () => userId,
      onRemoteSettingsApplied: (listener: Listener) => {
        listeners.add(listener);
        if (replay) listener(null, replay);
        return () => listeners.delete(listener);
      },
    },
  };
}

async function settled(promise: Promise<void>): Promise<boolean> {
  let done = false;
  void promise.then(() => (done = true));
  await vi.advanceTimersByTimeAsync(0);
  return done;
}

describe("awaitAccountSettings", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves at once for a signed-out visitor", async () => {
    expect(await settled(awaitAccountSettings(2500, sources(null).value))).toBe(
      true
    );
  });

  it("waits for the signed-in user's settings, not another user's", async () => {
    const s = sources("me");
    const wait = awaitAccountSettings(2500, s.value);
    expect(await settled(wait)).toBe(false);

    s.apply("someone-else");
    expect(await settled(wait)).toBe(false);

    s.apply("me");
    expect(await settled(wait)).toBe(true);
    expect(s.listeners.size).toBe(0);
  });

  it("resolves and unsubscribes when the settings already arrived", async () => {
    const s = sources("me", "me");
    expect(await settled(awaitAccountSettings(2500, s.value))).toBe(true);
    expect(s.listeners.size).toBe(0);
  });

  it("gives up at the cap when the sync never lands", async () => {
    const s = sources("me");
    const wait = awaitAccountSettings(2500, s.value);
    await vi.advanceTimersByTimeAsync(2499);
    expect(await settled(wait)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await settled(wait)).toBe(true);
    expect(s.listeners.size).toBe(0);
  });
});
