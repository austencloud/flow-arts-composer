/**
 * Focus-containment regression test for CardInspectModal.
 *
 * The modal declared `role="dialog" aria-modal="true"` but trapped nothing:
 * Tab walked out of the card inspector into the gallery behind it, and
 * closing it dropped focus on `<body>`. The fix wires the shared FocusTrap
 * (`foundation/ui/drawer/focus-trap.ts`) around the overlay, the same owner
 * Drawer, ErrorModal and the onboarding wizard use. This proves the
 * mechanism rather than the markup: focus enters the dialog, background
 * siblings go `inert`, Tab wraps between the modal's own controls, and focus
 * returns to the opener when the modal unmounts.
 *
 * The card-rendering children are swapped for a stub (see
 * __test-stubs__/CardSurfaceStub.svelte); they are heavy and have nothing to
 * do with the chrome under test.
 */
import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";
import { describe, it, expect, vi, afterEach } from "vitest";
import CardInspectModal from "./CardInspectModal.svelte";
import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";

vi.mock("./designer/CardPreviewStack.svelte", async () => {
  const mod = await import("./__test-stubs__/CardSurfaceStub.svelte");
  return { default: mod.default };
});
vi.mock(
  "#lib/shared/sequence-viewer/components/ChoreoCard.svelte",
  async () => {
    const mod = await import("./__test-stubs__/CardSurfaceStub.svelte");
    return { default: mod.default };
  }
);
vi.mock("./CardArrowFixGrid.svelte", async () => {
  const mod = await import("./__test-stubs__/CardSurfaceStub.svelte");
  return { default: mod.default };
});
vi.mock(
  "#lib/features/create/shared/components/sequence-actions/PictographInspectModal.svelte",
  async () => {
    const mod = await import("./__test-stubs__/CardSurfaceStub.svelte");
    return { default: mod.default };
  }
);

function appendOpener(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = "open card";
  document.body.appendChild(btn);
  btn.focus();
  return btn;
}

// A real key press through the browser, not a synthetic keydown: the trap
// must beat native sequential focus navigation, so that is what is tested.
async function pressTab(shift = false): Promise<void> {
  await userEvent.tab({ shift });
}

describe("CardInspectModal (focus containment)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is a labeled modal dialog that takes focus on open", async () => {
    appendOpener();
    render(CardInspectModal, { sequence: null, onClose: vi.fn() });

    const dialog = page.getByRole("dialog", { name: "Card inspector" });
    await expect.element(dialog).toHaveAttribute("aria-modal", "true");
    await expect.element(dialog).toHaveFocus();
  });

  it("makes the page behind it inert while open and clears it on close", async () => {
    const opener = appendOpener();
    const screen = render(CardInspectModal, {
      sequence: null,
      onClose: vi.fn(),
    });

    await expect.element(page.getByRole("dialog")).toHaveFocus();
    expect(opener.inert).toBe(true);

    screen.unmount();

    await expect.poll(() => opener.inert).toBe(false);
  });

  it("returns focus to the element that opened it", async () => {
    const opener = appendOpener();
    const screen = render(CardInspectModal, {
      sequence: null,
      onClose: vi.fn(),
    });
    await expect.element(page.getByRole("dialog")).toHaveFocus();

    screen.unmount();

    await expect.poll(() => document.activeElement).toBe(opener);
  });

  it("wraps Tab between the modal's own controls, Close included", async () => {
    appendOpener();
    render(CardInspectModal, { sequence: null, onClose: vi.fn() });
    await expect.element(page.getByRole("dialog")).toHaveFocus();

    // Close sits outside the dialog box but inside the overlay the trap owns.
    const close = page.getByRole("button", { name: "Close" }).element();
    const copy = page.getByRole("button", { name: "Copy image" }).element();

    (close as HTMLElement).focus();
    await pressTab();
    expect(document.activeElement).toBe(copy);

    await pressTab(true);
    expect(document.activeElement).toBe(close);
  });

  // The inspector only mounts inside signed-in Create flows, so the axe pass
  // the spec asks for runs here at both viewport tiers instead of on a route.
  for (const [width, height] of [
    [375, 667],
    [1440, 900],
  ] as const) {
    it(`has no AAA a11y violations at ${width}x${height}`, async () => {
      await page.viewport(width, height);
      render(CardInspectModal, { sequence: null, onClose: vi.fn() });
      await expect.element(page.getByRole("dialog")).toHaveFocus();
      await expectNoA11yViolations();
    });
  }
});
