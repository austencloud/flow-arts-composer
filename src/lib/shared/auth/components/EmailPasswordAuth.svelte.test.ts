import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  configurePersistence: vi.fn(),
  recordSubmission: vi.fn(),
  trackResult: vi.fn(),
  recordLastMethod: vi.fn(),
  auth: { currentUser: null },
}));

vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: mocks.signIn,
  createUserWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("../firebase", () => ({
  auth: mocks.auth,
  configureAuthPersistence: mocks.configurePersistence,
}));

vi.mock("#lib/shared/auth/services/anonymous-upgrade.js", () => ({
  captureAnonymousDrafts: vi.fn(),
  upgradeAnonymousWithEmail: vi.fn(),
}));

vi.mock("#lib/shared/auth/state/anonymous-import-prompt.svelte.js", () => ({
  promptAnonymousImport: vi.fn(),
}));

vi.mock("#lib/shared/auth/services/auth-analytics-bridge.js", () => ({
  recordAuthSubmission: mocks.recordSubmission,
}));

vi.mock("#lib/shared/auth/services/last-auth-method.svelte.js", () => ({
  recordLastAuthMethod: mocks.recordLastMethod,
}));

vi.mock("#lib/shared/analytics/auth-events.js", () => ({
  trackAuthProviderResult: mocks.trackResult,
}));

vi.mock("#lib/shared/i18n/i18n.svelte.js", async () => {
  const english: Record<string, string> = (
    await import("../../../../../messages/en.json")
  ).default;
  return { t: (key: string) => english[key] ?? key };
});

import EmailPasswordAuth from "./EmailPasswordAuth.svelte";

describe("EmailPasswordAuth transitions", () => {
  beforeEach(() => {
    mocks.signIn.mockReset();
    mocks.configurePersistence.mockReset();
    mocks.recordSubmission.mockReset();
    mocks.trackResult.mockReset();
    mocks.recordLastMethod.mockReset();
  });

  it("preserves credentials through mode, visibility and pending sign-in changes", async () => {
    let finishSignIn: ((result: { user: { uid: string } }) => void) | undefined;
    mocks.signIn.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSignIn = resolve;
        })
    );

    render(EmailPasswordAuth, { mode: "signin" });
    const email = page.getByRole("textbox", { name: "Email" });
    const password = page.getByLabelText("Password", { exact: true });
    await email.fill("dancer@example.com");
    await password.fill("secret-password");

    await page.getByRole("button", { name: /Need an account/ }).click();
    await expect.element(page.getByLabelText("Name")).toBeVisible();
    await expect.element(email).toHaveValue("dancer@example.com");
    await expect.element(password).toHaveValue("secret-password");

    await page.getByRole("button", { name: /Already have an account/ }).click();
    await page.getByRole("button", { name: "Show password" }).click();
    await expect.element(password).toHaveAttribute("type", "text");
    await expect.element(password).toHaveValue("secret-password");

    await page.getByRole("button", { name: "Sign In" }).click();
    await expect
      .element(page.getByRole("button", { name: "Signing in..." }))
      .toBeDisabled();
    await expect.element(email).toHaveValue("dancer@example.com");
    await expect.element(password).toHaveValue("secret-password");
    expect(mocks.signIn).toHaveBeenCalledWith(
      mocks.auth,
      "dancer@example.com",
      "secret-password"
    );

    finishSignIn?.({ user: { uid: "user-1" } });
    await expect
      .element(page.getByRole("button", { name: "Sign In" }))
      .toBeEnabled();
    await expect.element(password).toHaveValue("secret-password");
  });
});
