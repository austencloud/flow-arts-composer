import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scheduleIntakeRun: vi.fn(),
  auth: { isFullAccount: false, loading: true },
}));

vi.mock("#lib/shared/share-intake/services/share-intake-runner.js", () => ({
  scheduleIntakeRun: mocks.scheduleIntakeRun,
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: {
    get isFullAccount() {
      return mocks.auth.isFullAccount;
    },
    get loading() {
      return mocks.auth.loading;
    },
  },
}));

import ShareIntakeHost from "./ShareIntakeHost.svelte";
import { bumpIntakeSignal } from "../state/share-intake-signal.svelte";

describe("ShareIntakeHost", () => {
  beforeEach(() => {
    mocks.scheduleIntakeRun.mockReset();
    mocks.scheduleIntakeRun.mockResolvedValue(undefined);
    mocks.auth.isFullAccount = false;
    mocks.auth.loading = true;
  });

  it("waits for auth to settle before running", async () => {
    render(ShareIntakeHost);

    // loading = true. Running now would park a signed-in user's image share as
    // needs-auth and prompt them for a sign-in they already have.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.scheduleIntakeRun).not.toHaveBeenCalled();
  });

  it("runs again when a share arrives while the app is open", async () => {
    mocks.auth.loading = false;
    render(ShareIntakeHost);

    await vi.waitFor(() => {
      expect(mocks.scheduleIntakeRun).toHaveBeenCalledTimes(1);
    });

    bumpIntakeSignal();

    await vi.waitFor(() => {
      expect(mocks.scheduleIntakeRun).toHaveBeenCalledTimes(2);
    });
  });
});
