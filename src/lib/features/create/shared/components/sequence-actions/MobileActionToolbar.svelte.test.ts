import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";
import MobileActionToolbar from "./MobileActionToolbar.svelte";

function renderToolbar(onClear?: () => void) {
  return render(MobileActionToolbar, {
    props: {
      hasSequence: true,
      hasSelection: false,
      isTransforming: false,
      showEditInConstructor: true,
      persistCategory: false,
      onMirror: vi.fn(),
      onFlip: vi.fn(),
      onInvert: vi.fn(),
      onRotateCW: vi.fn(),
      onRotateCCW: vi.fn(),
      onSwap: vi.fn(),
      onRewind: vi.fn(),
      onTurnPattern: vi.fn(),
      onRotationDirection: vi.fn(),
      onDuration: vi.fn(),
      onTurns: vi.fn(),
      onEditInConstructor: vi.fn(),
      onClear,
    },
  });
}

describe("MobileActionToolbar Clear", () => {
  // The phone Assemble rail drops its Clear button; this is the only way left
  // to clear there, so losing it would strand the user with Undo alone.
  it("offers Clear under Edit when the workspace hands it over", async () => {
    const onClear = vi.fn();
    renderToolbar(onClear);

    await page.getByRole("tab", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Clear", exact: true }).click();

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("leaves Clear out when the workspace rail still has it", async () => {
    renderToolbar();

    await page.getByRole("tab", { name: "Edit" }).click();

    await expect
      .element(page.getByRole("button", { name: "Edit in Construct" }))
      .toBeInTheDocument();
    expect(
      page.getByRole("button", { name: "Clear", exact: true }).query()
    ).toBeNull();
  });
});
