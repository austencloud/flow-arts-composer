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

import SignInContent from "./SignInContent.svelte";

describe("SignInContent", () => {
  it("opens on the emailed code with Google leading, never on a password", async () => {
    render(SignInContent, { mode: "signup" });

    await expect
      .element(
        page.getByRole("heading", { name: "Sign in or create an account" })
      )
      .toBeInTheDocument();
    await expect
      .element(
        page.getByText("Save your sequences and open them on any device.")
      )
      .toBeInTheDocument();
    await expect.element(page.getByText("Auth method")).toBeInTheDocument();
    await expect.element(page.getByTestId("code-form")).toBeInTheDocument();
    await expect.element(page.getByTestId("email-form")).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Use a password" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByText("New here? The same steps make your account."))
      .toBeInTheDocument();
  });

  it("puts a gate's reason in the sentence's place", async () => {
    render(SignInContent, {
      content: { key: "share", title: "Share this", body: "Sign in to share." },
    });
    await expect.element(page.getByText("Sign in to share.")).toBeInTheDocument();
    await expect
      .element(
        page.getByText("Save your sequences and open them on any device.")
      )
      .not.toBeInTheDocument();
  });

  it("swaps to the password view and back to the code, keeping the address", async () => {
    render(SignInContent, { mode: "signup" });
    await page.getByLabelText("Stub email").fill("dancer@example.com");

    await page.getByRole("button", { name: "Use a password" }).click();
    await expect.element(page.getByTestId("email-form")).toBeInTheDocument();
    // The password view signs in; making an account with one is one pill.
    await expect
      .element(page.getByTestId("email-form"))
      .toHaveAttribute("data-mode", "signin");
    await expect
      .element(page.getByRole("button", { name: "Need an account? Sign up" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Stub email"))
      .toHaveValue("dancer@example.com");

    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect.element(page.getByTestId("code-form")).toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Stub email"))
      .toHaveValue("dancer@example.com");
  });

  it("hands a wrong password's 'code instead' to the code view, ready to send", async () => {
    render(SignInContent, { initialView: "password" });
    await page.getByRole("button", { name: "Use code" }).click();
    await expect
      .element(page.getByTestId("code-form"))
      .toHaveAttribute("data-send-on-open", "true");
  });

  it("with the keyboard up and a field focused, shows only the field and its action", async () => {
    render(SignInContent, {
      layout: "screen",
      keyboardHeight: 300,
      isTouchDevice: true,
    });
    await expect
      .element(page.getByRole("button", { name: "Use a password" }))
      .toBeInTheDocument();

    (document.querySelector("input[aria-label='Stub email']") as HTMLInputElement).focus();

    await expect
      .element(page.getByRole("button", { name: "Use a password" }))
      .not.toBeInTheDocument();
    await expect.element(page.getByText("Auth method")).not.toBeInTheDocument();
    await expect
      .element(page.getByText("New here? The same steps make your account."))
      .not.toBeInTheDocument();
    await expect.element(page.getByTestId("code-form")).toBeInTheDocument();
    // The names stay for screen readers.
    expect(document.querySelector("h2.visually-hidden")?.textContent).toContain(
      "Sign in or create an account"
    );

    (document.activeElement as HTMLElement).blur();
    await expect
      .element(page.getByRole("button", { name: "Use a password" }))
      .toBeInTheDocument();
  });

  it("keeps everything in the centred box, where there is no keyboard frame", async () => {
    render(SignInContent, {
      layout: "box",
      keyboardHeight: 300,
      isTouchDevice: true,
    });
    (document.querySelector("input[aria-label='Stub email']") as HTMLInputElement).focus();
    await expect
      .element(page.getByRole("button", { name: "Use a password" }))
      .toBeInTheDocument();
  });
});
