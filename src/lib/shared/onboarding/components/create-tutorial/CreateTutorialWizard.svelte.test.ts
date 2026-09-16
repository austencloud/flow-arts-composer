/**
 * Focus-trap + dialog-role regression test (component layer).
 *
 * CreateTutorialWizard used to render with zero dialog semantics and zero
 * focus containment: MainInterface stayed mounted and Tab-reachable behind
 * it, and closing it never returned focus to whatever triggered it. The fix
 * (onboarding-accessibility spec, 2026-07-18) wires the shared FocusTrap
 * utility the same way Drawer.svelte / ErrorModal.svelte already do. This
 * test proves the actual mechanism — `role="dialog"` + `aria-modal` +
 * `aria-labelledby`, focus moving in on mount, `inert` landing on background
 * siblings while open, and both clearing on close — not just that markup
 * exists.
 *
 * The 4 real step components (PickStartPlacementStep etc.) embed live
 * Create-module pickers/players (Firestore-backed state, AnimatorCanvas, 3D
 * pipelines) that are heavy and orthogonal to the wizard CHROME under test
 * here, so they're swapped for a trivial stub — same rationale as
 * GameShellTestHarness.svelte for the play arcade (see that file's header
 * comment). The stub carries the same `id="tutorial-step-title"` contract
 * the real steps use, so the aria-labelledby wiring is exercised for real.
 */
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CreateTutorialWizard from "./CreateTutorialWizard.svelte";
import { createTutorialState } from "../../state/create-tutorial-state.svelte";
import { expectNoA11yViolations } from "$test-helpers/component-a11y";

vi.mock("./steps/PickStartPlacementStep.svelte", async () => {
  const mod = await import("./__test-stubs__/TutorialStepStub.svelte");
  return { default: mod.default };
});
vi.mock("./steps/AddStepTutorialStep.svelte", async () => {
  const mod = await import("./__test-stubs__/TutorialStepStub.svelte");
  return { default: mod.default };
});
vi.mock("./steps/PlaySequenceStep.svelte", async () => {
  const mod = await import("./__test-stubs__/TutorialStepStub.svelte");
  return { default: mod.default };
});
vi.mock("./steps/ReadyStep.svelte", async () => {
  const mod = await import("./__test-stubs__/TutorialStepStub.svelte");
  return { default: mod.default };
});

// The wizard reads this module-level singleton directly (no step prop), so
// every test starts from a clean slate.
beforeEach(() => {
  createTutorialState.reset();
});

function appendOutsideTrigger(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = "outside trigger";
  document.body.appendChild(btn);
  return btn;
}

describe("CreateTutorialWizard (focus trap + dialog role)", () => {
  it("renders as a labeled, modal dialog", async () => {
    render(CreateTutorialWizard, { onComplete: vi.fn(), onSkip: vi.fn() });

    const dialog = page.getByRole("dialog");
    await expect.element(dialog).toHaveAttribute("aria-modal", "true");
    await expect.element(dialog).toHaveAccessibleName("Stub step");
  });

  it("moves focus into the dialog on mount and makes background siblings inert", async () => {
    const outside = appendOutsideTrigger();
    outside.focus();
    expect(document.activeElement).toBe(outside);

    render(CreateTutorialWizard, { onComplete: vi.fn(), onSkip: vi.fn() });

    // Focus-move is the last step of FocusTrap.activate(), so once this
    // resolves the inert pass (which runs earlier in the same call) is done.
    await expect.element(page.getByRole("dialog")).toHaveFocus();
    expect(outside.inert).toBe(true);

    outside.remove();
  });

  it("restores focus and clears inert from background siblings on unmount", async () => {
    const outside = appendOutsideTrigger();
    outside.focus();

    const screen = render(CreateTutorialWizard, {
      onComplete: vi.fn(),
      onSkip: vi.fn(),
    });
    await expect.element(page.getByRole("dialog")).toHaveFocus();
    expect(outside.inert).toBe(true);

    screen.unmount();

    await expect.poll(() => outside.inert).toBe(false);
    await expect.poll(() => document.activeElement).toBe(outside);

    outside.remove();
  });

  it("keeps Tab from reaching a background sibling while open", async () => {
    const outside = appendOutsideTrigger();
    render(CreateTutorialWizard, { onComplete: vi.fn(), onSkip: vi.fn() });

    await expect.element(page.getByRole("dialog")).toHaveFocus();

    // `inert` is what actually blocks Tab (browser-enforced): a real element
    // marked inert cannot receive focus at all, by spec.
    outside.focus();
    expect(document.activeElement).not.toBe(outside);

    outside.remove();
  });

  it("meets the touch-target floor on Back/Skip", async () => {
    createTutorialState.goToStep(1); // Back only renders past step 0
    render(CreateTutorialWizard, { onComplete: vi.fn(), onSkip: vi.fn() });

    for (const name of [/Back/, "Skip tutorial"]) {
      const el = page.getByRole("button", { name }).element();
      const minHeight = parseFloat(getComputedStyle(el).minHeight);
      expect(minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it("has no AAA a11y violations", async () => {
    render(CreateTutorialWizard, { onComplete: vi.fn(), onSkip: vi.fn() });
    await expectNoA11yViolations();
  });
});
