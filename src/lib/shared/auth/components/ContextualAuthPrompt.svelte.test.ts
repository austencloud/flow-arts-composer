import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";

vi.mock("./EmailLinkAuth.svelte", async () => ({
  default: (await import("./__test-stubs__/EmailCodeStub.svelte")).default,
}));

vi.mock("./EmailPasswordAuth.svelte", async () => ({
  default: (await import("./__test-stubs__/EmailAuthFormStub.svelte")).default,
}));

vi.mock("./SocialAuthCompact.svelte", async () => ({
  default: (await import("./__test-stubs__/EmailAuthMethodStub.svelte"))
    .default,
}));

vi.mock("../phone-sign-in/where.js", () => ({
  offersPhoneSignIn: () => false,
}));

vi.mock("#lib/shared/i18n/i18n.svelte.js", async () => {
  const english: Record<string, string> = (
    await import("../../../../../messages/en.json")
  ).default;
  return { t: (key: string) => english[key] ?? key };
});

import ContextualAuthPrompt from "./ContextualAuthPrompt.svelte";

/** The centred box on wider windows holds the same content as the phone screen. */
describe("ContextualAuthPrompt", () => {
  it("holds the shared sign-in content, opening on the emailed code", async () => {
    render(ContextualAuthPrompt, { showClose: true, onClose: () => {} });
    await expect
      .element(
        page.getByRole("heading", { name: "Sign in or create an account" })
      )
      .toBeInTheDocument();
    await expect.element(page.getByTestId("code-form")).toBeInTheDocument();
    await expect.element(page.getByTestId("email-form")).not.toBeInTheDocument();
  });

  it("closes from its close button", async () => {
    const onClose = vi.fn();
    render(ContextualAuthPrompt, { showClose: true, onClose });
    await page.getByRole("button", { name: "Close" }).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("puts the cursor in the email field on request", async () => {
    const { component } = render(ContextualAuthPrompt, {});
    component.focusFirstField();
    await expect.element(page.getByLabelText("Stub email")).toHaveFocus();
  });
});
