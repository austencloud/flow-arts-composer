import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ConnectedAccounts from "./ConnectedAccounts.svelte";

// Provider state matrix for Account > Sign-in methods. Each provider shows a
// provider-named action whose visible text and accessible name agree when it
// can be connected, and a Disconnect action named for that provider when it
// can be removed. A bare "Connect" button looked plausible and shipped once.

const mocks = vi.hoisted(() => ({
  user: null as null | {
    email: string | null;
    emailVerified: boolean;
    providerData: { providerId: string; email: string | null }[];
  },
  instagramLinked: false,
}));

vi.mock("../../../auth/state/auth-state.svelte", () => ({
  authState: {
    get user() {
      return mocks.user;
    },
    refreshUser: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("#lib/shared/auth/services/authenticator.js", () => ({
  linkFacebookAccount: vi.fn(),
  linkGoogleAccount: vi.fn(),
  linkInstagramAccount: vi.fn(),
  unlinkInstagramAccount: vi.fn(),
  unlinkProvider: vi.fn(),
  // The email-linking drawer's state module imports these at load.
  linkEmailPassword: vi.fn(),
  reloadUser: vi.fn(),
  resendVerificationEmail: vi.fn(),
}));

vi.mock("#lib/shared/auth/services/instagram-auth.js", () => ({
  getInstagramAuthErrorMessage: () => null,
  hasInstagramAccount: () => Promise.resolve(mocks.instagramLinked),
}));

vi.mock("#lib/shared/auth/services/auth-providers.config.js", () => ({
  FACEBOOK_LOGIN_ENABLED: true,
  INSTAGRAM_LOGIN_ENABLED: true,
}));

vi.mock("#lib/shared/application/get-haptic-feedback.js", () => ({
  getHapticFeedback: () => ({ trigger: vi.fn() }),
}));

const SOCIAL = [
  { id: "google.com", name: "Google" },
  { id: "facebook.com", name: "Facebook" },
  { id: "instagram.com", name: "Instagram" },
] as const;

function signInWith(providerIds: string[]): void {
  mocks.user = {
    email: "flow@example.com",
    emailVerified: true,
    providerData: providerIds
      .filter((id) => id !== "instagram.com")
      .map((providerId) => ({ providerId, email: "flow@example.com" })),
  };
  mocks.instagramLinked = providerIds.includes("instagram.com");
}

beforeEach(() => {
  mocks.user = null;
  mocks.instagramLinked = false;
});

describe("ConnectedAccounts provider state matrix", () => {
  for (const provider of SOCIAL) {
    it(`shows a visible "Connect ${provider.name}" action when ${provider.name} is not connected`, async () => {
      // Email keeps the account signed in, so every social provider is available.
      signInWith(["password"]);
      render(ConnectedAccounts, { props: { managing: true } });

      const action = page.getByRole("button", {
        name: `Connect ${provider.name}`,
        exact: true,
      });
      await expect.element(action).toBeVisible();
      await expect
        .element(action)
        .toHaveTextContent(`Connect ${provider.name}`);
      await expect
        .element(action)
        .toHaveAccessibleName(`Connect ${provider.name}`);
    });

    it(`offers "Disconnect ${provider.name}" and no connect action when ${provider.name} is connected`, async () => {
      signInWith(["password", provider.id]);
      render(ConnectedAccounts, { props: { managing: true } });

      const disconnect = page.getByRole("button", {
        name: `Disconnect ${provider.name}`,
        exact: true,
      });
      await expect.element(disconnect).toBeVisible();
      await expect.element(disconnect).toHaveTextContent("Disconnect");
      await expect
        .element(
          page.getByRole("button", {
            name: `Connect ${provider.name}`,
            exact: true,
          })
        )
        .not.toBeInTheDocument();
    });
  }

  it("keeps the only sign-in method protected instead of offering Disconnect", async () => {
    signInWith(["google.com"]);
    render(ConnectedAccounts, { props: { managing: true } });

    await expect
      .element(page.getByRole("button", { name: "Connect Facebook" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: /^Disconnect/ }))
      .not.toBeInTheDocument();
    await expect.element(page.getByText("Required")).toBeVisible();
  });

  // The provider-named labels are longer than the old bare "Connect". At the
  // stacked width and at the row width each action must keep its whole label
  // inside its own box and the row, and stay a 44px target.
  for (const width of [343, 640]) {
    it(`keeps every connect action whole and at least 44px in a ${width}px account column`, async () => {
      signInWith(["password"]);
      const host = document.createElement("div");
      host.style.cssText = `width:${width}px;container:profile-tab / inline-size;font-size:16px`;
      document.body.append(host);
      render(ConnectedAccounts, { target: host, props: { managing: true } });

      await expect
        .element(page.getByRole("button", { name: "Connect Instagram" }))
        .toBeVisible();
      const hostBox = host.getBoundingClientRect();
      const buttons = [
        ...host.querySelectorAll<HTMLElement>("button.panel-btn"),
      ];
      expect(buttons.map((b) => b.textContent?.trim())).toEqual([
        "Connect Google",
        "Connect Facebook",
        "Connect Instagram",
      ]);
      for (const button of buttons) {
        const box = button.getBoundingClientRect();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth);
        expect(box.right).toBeLessThanOrEqual(hostBox.right + 0.5);
      }
      host.remove();
    });
  }

  it("shows status text and no actions until Manage is chosen", async () => {
    signInWith(["password", "google.com"]);
    render(ConnectedAccounts, { props: { managing: false } });

    await expect.element(page.getByText("Google")).toBeVisible();
    expect(document.querySelectorAll("button.panel-btn")).toHaveLength(0);
  });
});
