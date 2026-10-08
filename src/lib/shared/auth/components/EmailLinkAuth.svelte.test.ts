import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EmailLinkAuth from "./EmailLinkAuth.svelte";

type MagicLinkResponse = {
  data: {
    success: boolean;
    requestId: string;
    subject: string;
    senderEmail: string;
  };
};

const mocks = vi.hoisted(() => ({
  sendMagicLink: vi.fn(),
  recordAuthSubmission: vi.fn(),
  captureWhenReady: vi.fn(),
  trackAuthProviderResult: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  signInWithCustomToken: vi.fn(),
  configureAuthPersistence: vi.fn(),
  recordLastAuthMethod: vi.fn(),
  markSkipped: vi.fn(),
  auth: { currentUser: { uid: "user-1" } },
  standalone: false,
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: () => mocks.sendMagicLink,
}));

vi.mock("firebase/auth", () => ({
  signInWithCustomToken: mocks.signInWithCustomToken,
}));

vi.mock("../firebase", () => ({
  auth: mocks.auth,
  configureAuthPersistence: mocks.configureAuthPersistence,
  getFunctionsInstance: vi.fn().mockResolvedValue({}),
}));

// The real English catalog, so the assertions below follow copy changes
// instead of a hand-kept list of strings.
vi.mock("$lib/shared/i18n/i18n.svelte", async () => {
  const english: Record<string, string> = (
    await import("../../../../../messages/en.json")
  ).default;
  return {
    t: (key: string, params: Record<string, string | number> = {}) =>
      Object.entries(params).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        english[key] ?? key
      ),
  };
});

vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock("../services/last-auth-method.svelte", () => ({
  recordLastAuthMethod: mocks.recordLastAuthMethod,
}));

vi.mock("$lib/shared/onboarding/state/first-run-state.svelte", () => ({
  firstRunState: { markSkipped: mocks.markSkipped },
}));

vi.mock("$lib/shared/auth/services/auth-analytics-bridge", () => ({
  recordAuthSubmission: mocks.recordAuthSubmission,
}));

vi.mock("$lib/shared/auth/get-in-app-browser-detector", () => ({
  getInAppBrowserDetector: () => ({
    isInAppBrowserOrForced: () => false,
    getPlatform: () => "other",
  }),
}));

vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: { isAnonymous: false },
}));

vi.mock("$lib/shared/persistence/database/tka-database", () => ({
  db: { sequences: { count: vi.fn().mockResolvedValue(0) } },
}));

vi.mock("$lib/shared/mobile/services/platform-detector", () => ({
  isRunningAsStandalone: () => mocks.standalone,
}));

vi.mock("$lib/shared/analytics/services/posthog", () => ({
  captureWhenReady: mocks.captureWhenReady,
}));

vi.mock("$lib/shared/analytics/auth-events", () => ({
  trackAuthProviderResult: mocks.trackAuthProviderResult,
}));

describe.each([false, true])(
  "EmailLinkAuth delivery feedback (compact=%s)",
  (compact) => {
    beforeEach(() => {
      mocks.sendMagicLink.mockReset();
      mocks.recordAuthSubmission.mockReset();
      mocks.captureWhenReady.mockReset();
      mocks.trackAuthProviderResult.mockReset();
      mocks.toastError.mockReset();
      mocks.toastSuccess.mockReset();
      mocks.signInWithCustomToken.mockReset();
      mocks.configureAuthPersistence.mockReset();
      mocks.recordLastAuthMethod.mockReset();
      mocks.markSkipped.mockReset();
      mocks.standalone = false;
      localStorage.clear();
    });

    it("acknowledges the send immediately, then confirms provider acceptance", async () => {
      let finishSend: ((result: MagicLinkResponse) => void) | undefined;
      mocks.sendMagicLink.mockImplementation(
        () =>
          new Promise<MagicLinkResponse>((resolve) => {
            finishSend = resolve;
          })
      );

      render(EmailLinkAuth, { compact });

      const email = page.getByRole("textbox", { name: "Email" });
      await email.fill("spinner@example.com");
      await page
        .getByRole("button", {
          name: compact ? "Send a code" : "Email me a code",
        })
        .click();

      const pendingStatus = page.getByRole("status");
      await expect
        .element(pendingStatus)
        .toHaveTextContent("Sending your code");
      await expect
        .element(pendingStatus)
        .toHaveTextContent("spinner@example.com");
      await expect.element(email).toBeDisabled();

      finishSend?.({
        data: {
          success: true,
          requestId: "47c02573-fd10-4277-92dc-50fdaaf65ce4",
          subject: "Your sign-in code",
          senderEmail: "noreply@example.com",
        },
      });

      await expect
        .element(page.getByRole("status"))
        .toHaveTextContent("Check your email");
      await expect
        .element(page.getByRole("button", { name: "Send another code" }))
        .toBeEnabled();
      expect(localStorage.getItem("emailForSignIn")).toBe(
        "spinner@example.com"
      );
      expect(mocks.recordAuthSubmission).toHaveBeenCalledWith("magic_link");
      await expect
        .element(page.getByRole("textbox", { name: "Six-digit code" }))
        .toBeVisible();
      expect(localStorage.getItem("pendingMagicLinkCode")).toContain(
        "47c02573-fd10-4277-92dc-50fdaaf65ce4"
      );
    });

    it("keeps the email and one status target across failed send and retry", async () => {
      let failSend: ((error: Error) => void) | undefined;
      mocks.sendMagicLink
        .mockImplementationOnce(
          () =>
            new Promise((_, reject) => {
              failSend = reject;
            })
        )
        .mockResolvedValueOnce({
          data: {
            success: true,
            requestId: "0867d981-cda5-4d0e-bc72-d75284111db8",
            subject: "Your sign-in code",
            senderEmail: "noreply@example.com",
          },
        });

      render(EmailLinkAuth, { compact });
      const email = page.getByRole("textbox", { name: "Email" });
      await email.fill("spinner@example.com");
      await page
        .getByRole("button", {
          name: compact ? "Send a code" : "Email me a code",
        })
        .click();
      await expect
        .element(page.getByRole("status"))
        .toHaveTextContent("Sending your code");
      failSend?.(new Error("Network unavailable"));

      await expect
        .element(page.getByRole("alert"))
        .toHaveTextContent("The email was not sent");
      await expect.element(email).toHaveValue("spinner@example.com");
      expect(document.querySelectorAll("#magic-link-status")).toHaveLength(1);

      await page
        .getByRole("button", {
          name: compact ? "Send a code" : "Email me a code",
        })
        .click();
      await expect
        .element(page.getByRole("status"))
        .toHaveTextContent("Check your email");
      await expect
        .element(page.getByRole("textbox", { name: "Six-digit code" }))
        .toHaveFocus();
      expect(document.querySelectorAll("#magic-link-status")).toHaveLength(1);
      expect(mocks.sendMagicLink).toHaveBeenCalledTimes(2);
    });

    if (compact) {
      it("returns focus to the email field after leaving code entry", async () => {
        mocks.sendMagicLink.mockResolvedValue({
          data: {
            success: true,
            requestId: "7f90ab14-86fb-472f-a4b5-6c816841423e",
            subject: "Your sign-in code",
            senderEmail: "noreply@example.com",
          },
        });

        render(EmailLinkAuth, { compact });
        await page
          .getByRole("textbox", { name: "Email" })
          .fill("one@example.com");
        await page.getByRole("button", { name: "Send a code" }).click();

        await expect
          .element(page.getByRole("textbox", { name: "Six-digit code" }))
          .toHaveFocus();
        await expect
          .element(page.getByRole("textbox", { name: "Email" }))
          .not.toBeInTheDocument();

        await page
          .getByRole("button", { name: "Use a different email" })
          .click();

        const email = page.getByRole("textbox", { name: "Email" });
        await expect.element(email).toHaveFocus();
        await expect.element(email).toBeEnabled();
        await email.fill("two@example.com");
        await expect.element(email).toHaveValue("two@example.com");
      });
    }

    it("tells an installed-app user to return and enter the code", async () => {
      mocks.standalone = true;
      mocks.sendMagicLink.mockResolvedValue({
        data: {
          success: true,
          requestId: "e4f9578d-9c32-42fd-a22d-972b76d2d79e",
          subject: "Your sign-in code",
          senderEmail: "noreply@example.com",
        },
      });

      render(EmailLinkAuth, { compact });
      await page
        .getByRole("textbox", { name: "Email" })
        .fill("spinner@example.com");
      await page
        .getByRole("button", {
          name: compact ? "Send a code" : "Email me a code",
        })
        .click();

      await expect
        .element(page.getByRole("status"))
        .toHaveTextContent(
          compact
            ? "Enter the code sent to spinner@example.com here."
            : "Check your email, then come back here and enter it below"
        );
    });

    it("restores an unexpired code request after the installed app reloads", async () => {
      localStorage.setItem(
        "pendingMagicLinkCode",
        JSON.stringify({
          requestId: "a86f0f15-462d-41da-b103-e5d2ee373910",
          email: "spinner@example.com",
          expiresAt: Date.now() + 60_000,
        })
      );

      render(EmailLinkAuth, { compact });

      await expect
        .element(page.getByRole("textbox", { name: "Six-digit code" }))
        .toBeVisible();
      if (compact) {
        await expect
          .element(page.getByRole("status"))
          .toHaveTextContent("spinner@example.com");
      } else {
        await expect
          .element(page.getByRole("textbox", { name: "Email" }))
          .toHaveValue("spinner@example.com");
      }
      expect(mocks.sendMagicLink).not.toHaveBeenCalled();
    });

    it("redeems the email code inside the current app surface", async () => {
      mocks.sendMagicLink
        .mockResolvedValueOnce({
          data: {
            success: true,
            requestId: "144599f0-7a73-4f38-8f3d-a654dc6c47c6",
            subject: "Your sign-in code",
            senderEmail: "noreply@example.com",
          },
        })
        .mockResolvedValueOnce({
          data: { success: true, customToken: "custom-token" },
        });
      mocks.signInWithCustomToken.mockResolvedValue({
        user: mocks.auth.currentUser,
      });

      render(EmailLinkAuth, { compact });
      await page
        .getByRole("textbox", { name: "Email" })
        .fill("spinner@example.com");
      await page
        .getByRole("button", {
          name: compact ? "Send a code" : "Email me a code",
        })
        .click();

      // A full code signs in without a button press.
      const code = page.getByRole("textbox", { name: "Six-digit code" });
      await code.fill("123456");

      await expect
        .element(page.getByRole("status"))
        .toHaveTextContent("Signed in");
      expect(mocks.sendMagicLink).toHaveBeenLastCalledWith({
        action: "redeem-code",
        requestId: "144599f0-7a73-4f38-8f3d-a654dc6c47c6",
        code: "123456",
      });
      expect(mocks.configureAuthPersistence).toHaveBeenCalledWith(mocks.auth);
      expect(mocks.signInWithCustomToken).toHaveBeenCalledWith(
        mocks.auth,
        "custom-token"
      );
      expect(mocks.markSkipped).toHaveBeenCalledWith("user-1");
      expect(localStorage.getItem("pendingMagicLinkCode")).toBeNull();
    });

    it("never mails a fresh code when Enter is pressed in the code box", async () => {
      mocks.sendMagicLink.mockResolvedValue({
        data: {
          success: true,
          requestId: "5d1c3a0e-2b7f-4c1e-9a55-0f3b6e2d8c41",
          subject: "Your sign-in code",
          senderEmail: "noreply@example.com",
        },
      });

      render(EmailLinkAuth, { compact });
      await page
        .getByRole("textbox", { name: "Email" })
        .fill("spinner@example.com");
      await page
        .getByRole("button", {
          name: compact ? "Send a code" : "Email me a code",
        })
        .click();

      const code = page.getByRole("textbox", { name: "Six-digit code" });
      await expect.element(code).toHaveFocus();
      await code.fill("123");
      await userEvent.keyboard("{Enter}");

      expect(mocks.sendMagicLink).toHaveBeenCalledTimes(1);
    });

    it("sends straight away when opened from the password form", async () => {
      mocks.sendMagicLink.mockResolvedValue({
        data: {
          success: true,
          requestId: "0b8e4f2a-6c3d-4e1f-8a7b-9c2d5e6f7a81",
          subject: "Your sign-in code",
          senderEmail: "noreply@example.com",
        },
      });

      render(EmailLinkAuth, {
        compact,
        email: "spinner@example.com",
        sendOnOpen: true,
      });

      await expect
        .element(page.getByRole("textbox", { name: "Six-digit code" }))
        .toHaveFocus();
      expect(mocks.sendMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({ email: "spinner@example.com" })
      );
    });
  }
);
