import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authState } from "./__test-stubs__/NavigationAuthState.svelte";

const mocks = vi.hoisted(() => ({
  showOnRequest: vi.fn(),
}));

vi.mock("../../auth/state/auth-state.svelte", async () => ({
  authState: (await import("./__test-stubs__/NavigationAuthState.svelte"))
    .authState,
}));

vi.mock("../../auth/state/auth-drawer-state.svelte", () => ({
  authDrawerState: { showOnRequest: mocks.showOnRequest },
}));

vi.mock("#lib/shared/application/get-haptic-feedback.js", () => ({
  getHapticFeedback: () => ({ trigger: () => undefined }),
}));

vi.mock("#lib/shared/device/get-device-detector.js", () => ({
  getDeviceDetector: () => ({
    getResponsiveSettings: () => ({ isLandscapeMobile: false }),
    onCapabilitiesChanged: () => () => undefined,
  }),
}));

vi.mock(
  "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js",
  () => ({
    getAccessibleSectionsForModule: () => [],
  })
);

vi.mock("#lib/shared/onboarding/context/account-setup-context.js", () => ({
  tryGetAccountSetupContext: () => null,
}));

vi.mock("#lib/shared/i18n/i18n.svelte.js", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const english: Record<string, string> = (
    await import("../../../../../messages/en.json")
  ).default;
  return { ...original, t: (key: string) => english[key] ?? key };
});

import ModuleSwitcher from "./ModuleSwitcher.svelte";

function openNavigation() {
  window.dispatchEvent(new Event("module-switcher-toggle"));
}

/**
 * The menu used to hold its own sign-in pane, which a swipe closed and which
 * opened on Password. A guest's Sign in row now opens the one sign-in surface
 * (a screen of its own on a phone) over the menu, which stays put beneath.
 */
describe("ModuleSwitcher guest Sign in row", () => {
  beforeEach(() => {
    authState.isFullAccount = false;
    authState.user = null;
    mocks.showOnRequest.mockClear();
  });

  it("opens the shared sign-in surface and leaves the menu as it was", async () => {
    render(ModuleSwitcher, {
      currentModule: "create",
      currentModuleName: "Create",
      modules: [],
    });
    openNavigation();
    const dialog = page.getByRole("dialog", { name: "Module navigation menu" });
    await expect.element(dialog).toBeInTheDocument();

    await page.getByRole("button", { name: "Sign in" }).click();

    expect(mocks.showOnRequest).toHaveBeenCalledTimes(1);
    expect(mocks.showOnRequest).toHaveBeenCalledWith(
      "signin",
      undefined,
      undefined,
      { surface: "auth_sheet", origin: "module_navigation" }
    );
    await expect.element(dialog).toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Sign in" }))
      .toBeInTheDocument();
    expect(document.querySelectorAll("dialog[open]")).toHaveLength(1);
  });

  it("shows the account row and its actions once a full account signs in", async () => {
    render(ModuleSwitcher, {
      currentModule: "create",
      currentModuleName: "Create",
      modules: [],
    });
    openNavigation();
    await expect
      .element(page.getByRole("button", { name: "Sign in" }))
      .toBeInTheDocument();

    authState.user = { displayName: "Member" };
    authState.isFullAccount = true;
    await expect.element(page.getByText("Member")).toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Sign in" }))
      .not.toBeInTheDocument();
  });
});
