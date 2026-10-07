import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authState } from "./__test-stubs__/NavigationAuthState.svelte";

const mocks = vi.hoisted(() => ({
  globalAuthShow: vi.fn(),
}));

vi.mock("../../auth/state/auth-state.svelte", async () => ({
  authState: (await import("./__test-stubs__/NavigationAuthState.svelte"))
    .authState,
}));

vi.mock("../../auth/state/auth-drawer-state.svelte", () => ({
  authDrawerState: { show: mocks.globalAuthShow },
}));

vi.mock("../../auth/components/AuthModal.svelte", async () => ({
  default: (await import("./__test-stubs__/InlineAuthStub.svelte")).default,
}));

vi.mock("$lib/shared/application/get-haptic-feedback", () => ({
  getHapticFeedback: () => ({ trigger: () => undefined }),
}));

vi.mock("$lib/shared/device/get-device-detector", () => ({
  getDeviceDetector: () => ({
    getResponsiveSettings: () => ({ isLandscapeMobile: false }),
    onCapabilitiesChanged: () => () => undefined,
  }),
}));

vi.mock(
  "$lib/shared/navigation-coordinator/navigation-coordinator.svelte",
  () => ({
    getAccessibleSectionsForModule: () => [],
  })
);

vi.mock("$lib/shared/onboarding/context/account-setup-context", () => ({
  tryGetAccountSetupContext: () => null,
}));

vi.mock("$lib/shared/i18n/i18n.svelte.js", async (importOriginal) => {
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

describe("ModuleSwitcher inline sign-in lifecycle", () => {
  beforeEach(() => {
    authState.isFullAccount = false;
    authState.user = null;
    mocks.globalAuthShow.mockClear();
  });

  it("keeps sign-in in the same dialog and returns with Back", async () => {
    render(ModuleSwitcher, {
      currentModule: "create",
      currentModuleName: "Create",
      modules: [],
    });
    openNavigation();
    const dialog = page.getByRole("dialog", { name: "Module navigation menu" });
    await expect.element(dialog).toBeInTheDocument();
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect.element(page.getByTestId("inline-auth")).toBeInTheDocument();
    expect(document.querySelectorAll("dialog[open]")).toHaveLength(1);
    expect(mocks.globalAuthShow).not.toHaveBeenCalled();

    await page.getByRole("button", { name: "Back to modules" }).click();
    await expect
      .element(page.getByTestId("inline-auth"))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Sign in" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Sign in" }))
      .toHaveFocus();

    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("button", { name: "Close menu" }).click();
    openNavigation();
    await expect
      .element(page.getByTestId("inline-auth"))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Sign in" }))
      .toBeInTheDocument();
  });

  it("returns to account navigation on auth success and starts fresh after reopen", async () => {
    render(ModuleSwitcher, {
      currentModule: "create",
      currentModuleName: "Create",
      modules: [],
    });
    openNavigation();
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect.element(page.getByTestId("inline-auth")).toBeInTheDocument();

    authState.user = { displayName: "Member" };
    authState.isFullAccount = true;
    await expect
      .element(page.getByTestId("inline-auth"))
      .not.toBeInTheDocument();
    await expect.element(page.getByText("Member")).toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Edit profile" }))
      .toHaveFocus();

    await page.getByRole("button", { name: "Close menu" }).click();
    authState.user = null;
    authState.isFullAccount = false;
    openNavigation();
    await expect
      .element(page.getByRole("button", { name: "Sign in" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByTestId("inline-auth"))
      .not.toBeInTheDocument();
  });
});
