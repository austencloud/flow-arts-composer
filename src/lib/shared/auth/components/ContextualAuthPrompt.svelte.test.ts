import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lastMethod: null as null | "google" | "password" | "magic-link",
}));

vi.mock("./EmailAuthTabs.svelte", async () => ({
  default: (await import("./__test-stubs__/EmailAuthFormStub.svelte")).default,
}));

vi.mock("./SocialAuthCompact.svelte", async () => ({
  default: (await import("./__test-stubs__/EmailAuthMethodStub.svelte"))
    .default,
}));

vi.mock("$lib/shared/components/LastUsedBadge.svelte", async () => ({
  default: (await import("./__test-stubs__/EmailAuthMethodStub.svelte"))
    .default,
}));

vi.mock("$lib/shared/i18n/i18n.svelte", async () => {
  const english: Record<string, string> = (
    await import("../../../../../messages/en.json")
  ).default;
  return { t: (key: string) => english[key] ?? key };
});

vi.mock("$lib/shared/auth/services/last-auth-method.svelte", () => ({
  getLastAuthMethod: () => mocks.lastMethod,
}));

import ContextualAuthPrompt from "./ContextualAuthPrompt.svelte";

const signIn = { key: "generic", title: "Welcome back", body: "Sign in." };
const signUp = { key: "generic", title: "Create your account", body: "Join." };

describe("ContextualAuthPrompt", () => {
  beforeEach(() => {
    mocks.lastMethod = null;
  });

  it("keeps the email form open when the mode switch rebuilds the copy", async () => {
    const { rerender } = render(ContextualAuthPrompt, {
      content: signIn,
      mode: "signin",
    });

    await page.getByRole("button", { name: "Continue with email" }).click();
    await expect.element(page.getByTestId("email-form")).toBeInTheDocument();

    // The host hands over a fresh copy object for the other mode, same key.
    await rerender({ content: { ...signUp }, mode: "signup" });

    await expect.element(page.getByTestId("email-form")).toBeInTheDocument();
  });

  it("starts a new encounter on the method choice", async () => {
    const { rerender } = render(ContextualAuthPrompt, {
      content: signIn,
      mode: "signin",
    });

    await page.getByRole("button", { name: "Continue with email" }).click();
    await rerender({
      content: { key: "share", title: "Share this", body: "Sign in first." },
    });

    await expect
      .element(page.getByRole("button", { name: "Continue with email" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByTestId("email-form"))
      .not.toBeInTheDocument();
  });

  it("opens straight onto the email form for someone who signed in by email here", async () => {
    mocks.lastMethod = "password";
    const { component } = render(ContextualAuthPrompt, {
      content: signIn,
      mode: "signin",
    });

    await expect.element(page.getByTestId("email-form")).toBeInTheDocument();
    component.focusFirstField();
    await expect.element(page.getByLabelText("Stub email")).toHaveFocus();
  });

  it("hands focus into and out of the email choice through rapid reversals", async () => {
    render(ContextualAuthPrompt, { content: signIn, mode: "signin" });

    const emailChoice = page.getByRole("button", {
      name: "Continue with email",
    });
    await emailChoice.click();
    await expect.element(page.getByLabelText("Stub email")).toHaveFocus();

    await page.getByRole("button", { name: "Other sign-in options" }).click();
    await expect.element(emailChoice).toHaveFocus();
    expect(document.activeElement?.closest("[inert]")).toBeNull();

    await emailChoice.click();
    await expect.element(page.getByLabelText("Stub email")).toHaveFocus();
    await expect.element(page.getByTestId("email-form")).toBeVisible();
  });

  it("retains the typed address through sign-in and sign-up copy changes", async () => {
    render(ContextualAuthPrompt, { content: signIn, mode: "signin" });
    await page.getByRole("button", { name: "Continue with email" }).click();
    const email = page.getByLabelText("Stub email");
    await email.fill("dancer@example.com");

    await page.getByRole("button", { name: /New here/ }).click();
    await expect.element(email).toHaveValue("dancer@example.com");
    await expect
      .element(page.getByTestId("email-form"))
      .toHaveAttribute("data-mode", "signup");

    await page.getByRole("button", { name: /Already have an account/ }).click();
    await expect.element(email).toHaveValue("dancer@example.com");
    await expect
      .element(page.getByTestId("email-form"))
      .toHaveAttribute("data-mode", "signin");
  });
});
