import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lastMethod: null as null | "google" | "password" | "magic-link",
}));

vi.mock("./EmailLinkAuth.svelte", async () => ({
  default: (await import("./__test-stubs__/EmailAuthFormStub.svelte")).default,
}));

vi.mock("./EmailPasswordAuth.svelte", async () => ({
  default: (await import("./__test-stubs__/EmailAuthFormStub.svelte")).default,
}));

vi.mock("#lib/shared/components/LastUsedBadge.svelte", async () => ({
  default: (await import("./__test-stubs__/EmailAuthMethodStub.svelte"))
    .default,
}));

vi.mock("#lib/shared/i18n/i18n.svelte.js", () => {
  const english: Record<string, string> = {
    auth_email_code: "Email code",
    auth_email_code_last_used: "Email code, last used",
    auth_password: "Password",
    auth_password_last_used: "Password, last used",
  };
  return { t: (key: string) => english[key] ?? key };
});

vi.mock("#lib/shared/auth/services/last-auth-method.svelte.js", () => ({
  getLastAuthMethod: () => mocks.lastMethod,
}));

import { persistPendingEmailCode } from "#lib/shared/auth/services/pending-email-code.js";
import EmailAuthTabs from "./EmailAuthTabs.svelte";

const codeTab = () => page.getByRole("tab", { name: /^Email code/ });
const passwordTab = () => page.getByRole("tab", { name: /^Password/ });

describe("EmailAuthTabs", () => {
  beforeEach(() => {
    mocks.lastMethod = null;
    localStorage.clear();
  });

  it("starts account creation on the email-code path", async () => {
    render(EmailAuthTabs, { mode: "signup" });

    await expect.element(codeTab()).toHaveAttribute("aria-selected", "true");
    await expect
      .element(passwordTab())
      .toHaveAttribute("aria-selected", "false");
  });

  it("starts signing in on the password box", async () => {
    render(EmailAuthTabs, { mode: "signin" });

    await expect
      .element(passwordTab())
      .toHaveAttribute("aria-selected", "true");
  });

  it("remembers a returning password user's method even on account creation", async () => {
    mocks.lastMethod = "password";
    render(EmailAuthTabs, { mode: "signup" });

    await expect
      .element(page.getByRole("tab", { name: "Password, last used" }))
      .toHaveAttribute("aria-selected", "true");
  });

  it("keeps the compact invitation on email code even after a password sign-in", async () => {
    mocks.lastMethod = "password";
    render(EmailAuthTabs, { compact: true, showMethods: true });

    await expect.element(codeTab()).toHaveAttribute("aria-selected", "true");
    await expect
      .element(passwordTab())
      .toHaveAttribute("aria-selected", "false");
  });

  it("opens on the code box while a mailed code is still waiting", async () => {
    mocks.lastMethod = "password";
    persistPendingEmailCode(
      "8f14e45f-ceea-467a-9575-8a1f0c3d2b61",
      "spinner@example.com"
    );
    render(EmailAuthTabs, { mode: "signin" });

    await expect.element(codeTab()).toHaveAttribute("aria-selected", "true");
  });

  it("hands the typed address to the code form and mails a code straight away", async () => {
    render(EmailAuthTabs, { mode: "signin" });

    await page.getByLabelText("Stub email").fill("spinner@example.com");
    await page.getByRole("button", { name: "Use code" }).click();

    await expect.element(codeTab()).toHaveAttribute("aria-selected", "true");
    await expect
      .element(page.getByTestId("email-form"))
      .toHaveAttribute("data-send-on-open", "true");
    await expect
      .element(page.getByLabelText("Stub email"))
      .toHaveValue("spinner@example.com");
  });

  it("keeps the shared address through interrupted tab changes", async () => {
    render(EmailAuthTabs, { mode: "signin" });
    await page.getByLabelText("Stub email").fill("spinner@example.com");

    await codeTab().click();
    await passwordTab().click();
    await codeTab().click();

    await expect.element(codeTab()).toHaveAttribute("aria-selected", "true");
    await expect
      .element(page.getByLabelText("Stub email"))
      .toHaveValue("spinner@example.com");
    expect(
      document.querySelectorAll(".tab-content .layer:not([inert]) input")
    ).toHaveLength(1);
  });
});
