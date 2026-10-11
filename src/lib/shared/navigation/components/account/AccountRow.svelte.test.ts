import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  show: vi.fn(),
}));

vi.mock("../../../auth/state/auth-state.svelte", () => ({
  authState: { user: null, isFullAccount: false },
}));

vi.mock("../../../auth/state/auth-drawer-state.svelte", () => ({
  authDrawerState: { show: mocks.show },
}));

vi.mock("#lib/shared/application/get-haptic-feedback.js", () => ({
  getHapticFeedback: () => ({ trigger: () => undefined }),
}));

vi.mock("#lib/shared/onboarding/context/account-setup-context.js", () => ({
  tryGetAccountSetupContext: () => null,
}));

vi.mock("#lib/shared/i18n/i18n.svelte.js", async () => {
  const english: Record<string, string> = (
    await import("../../../../../../messages/en.json")
  ).default;
  return { t: (key: string) => english[key] ?? key };
});

import AccountRow from "./AccountRow.svelte";

describe("AccountRow guest sign-in", () => {
  beforeEach(() => mocks.show.mockClear());

  it("keeps drawer sign-in inside its owning panel", async () => {
    const onSignIn = vi.fn();
    const onClick = vi.fn();
    render(AccountRow, { variant: "drawer", onSignIn, onclick: onClick });

    await page.getByRole("button", { name: "Sign in" }).click();

    expect(onSignIn).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
    expect(mocks.show).not.toHaveBeenCalled();
  });

  it("keeps the existing standalone sign-in behavior without a panel callback", async () => {
    render(AccountRow, { variant: "expanded" });

    await page.getByRole("button", { name: "Sign in" }).click();

    expect(mocks.show).toHaveBeenCalledOnce();
    expect(mocks.show).toHaveBeenCalledWith("signin");
  });
});
