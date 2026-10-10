import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import ScanCellWarmControls from "./ScanCellWarmControls.svelte";
import type { ScanCellWarmState } from "#lib/features/choreo-card/state/scan-cell-warm-state.svelte.js";
import type { CellWarmProgress } from "#lib/features/library/services/warm-all-scan-cells.js";

function fakeState(
  options: {
    running?: boolean;
    cancellationRequested?: boolean;
    progress?: CellWarmProgress | null;
    error?: string | null;
  } = {}
) {
  const startAll = vi.fn();
  const startCode = vi.fn();
  const retryFailed = vi.fn();
  const cancel = vi.fn();
  const state: ScanCellWarmState = {
    progress: options.progress ?? null,
    running: options.running ?? false,
    cancellationRequested: options.cancellationRequested ?? false,
    error: options.error ?? null,
    scope: options.progress ? { kind: "all" } : null,
    startAll,
    startCode,
    retryFailed,
    cancel,
  };
  return { state, startAll, startCode, retryFailed, cancel };
}

describe("ScanCellWarmControls", () => {
  it("can warm the selected shortcode or every legacy card", async () => {
    const fake = fakeState();
    render(ScanCellWarmControls, { state: fake.state, selectedCode: "0017" });

    await page.getByRole("button", { name: "Warm 0017" }).click();
    expect(fake.startCode).toHaveBeenCalledWith("0017");

    await page.getByRole("button", { name: "Warm all legacy cards" }).click();
    expect(fake.startAll).toHaveBeenCalledOnce();
  });

  it("shows deterministic progress and keeps stop available", async () => {
    const fake = fakeState({
      running: true,
      progress: {
        done: 25,
        total: 100,
        failed: 1,
        failedCodes: ["BAD1"],
        current: "VΛY",
        finished: false,
        cancelled: false,
      },
    });
    render(ScanCellWarmControls, { state: fake.state, selectedCode: null });

    const bar = page.getByRole("progressbar").element() as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
    expect(document.body.textContent).toContain("25 of 100 cards · 1 failed");
    expect(document.body.textContent).toContain("Current: VΛY");

    await page.getByRole("button", { name: "Stop" }).click();
    expect(fake.cancel).toHaveBeenCalledOnce();
  });

  it("offers a retry containing only failed cards", async () => {
    const fake = fakeState({
      progress: {
        done: 12,
        total: 12,
        failed: 2,
        failedCodes: ["BAD1", "BAD2"],
        finished: true,
        cancelled: false,
      },
    });
    render(ScanCellWarmControls, { state: fake.state, selectedCode: null });

    await page.getByRole("button", { name: "Retry failed" }).click();
    expect(fake.retryFailed).toHaveBeenCalledOnce();
  });
});
