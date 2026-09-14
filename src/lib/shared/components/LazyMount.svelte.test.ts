import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";
import LazyMountLifecycleTestHarness from "./LazyMountLifecycleTestHarness.svelte";
import LazyMountInactiveTestHarness from "./LazyMountInactiveTestHarness.svelte";
import LazyMountRetryKeyTestHarness from "./LazyMountRetryKeyTestHarness.svelte";
import LazyMountTestHarness from "./LazyMountTestHarness.svelte";

describe("LazyMount recovery", () => {
  it("retries a recoverable loader rejection from a visible error state", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    render(LazyMountTestHarness);

    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("Test component did not load.");
    await expect
      .element(page.getByRole("status", { name: "Lazy mount status" }))
      .toHaveTextContent("error");

    await page.getByRole("button", { name: "Try again" }).click();

    await expect.element(page.getByText("Loaded after retry")).toBeVisible();
    await expect
      .element(page.getByRole("status", { name: "Lazy mount status" }))
      .toHaveTextContent("loaded");
    expect(errorLog).toHaveBeenCalledWith(
      "[LazyMount] failed to load test component",
      expect.any(Error)
    );
    errorLog.mockRestore();
  });

  it("settles a late rejection without reporting it after teardown", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    render(LazyMountLifecycleTestHarness);

    await expect
      .element(page.getByRole("status", { name: "Lazy mount teardown status" }))
      .toHaveTextContent("loading");

    await page.getByRole("button", { name: "Close loader" }).click();
    await new Promise((resolve) => setTimeout(resolve, 50));

    await expect
      .element(page.getByRole("status", { name: "Lazy mount teardown status" }))
      .toHaveTextContent("loading");
    expect(errorLog).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it("can unmount an inactive instance while keeping its module ready", async () => {
    render(LazyMountInactiveTestHarness);

    await expect.element(page.getByText("Inactive preview")).toBeVisible();
    await page.getByRole("button", { name: "Activate preview" }).click();
    await expect.element(page.getByText("Loaded after retry")).toBeVisible();

    await page.getByRole("button", { name: "Deactivate preview" }).click();
    await expect.element(page.getByText("Inactive preview")).toBeVisible();
    await expect
      .element(page.getByText("Loaded after retry"))
      .not.toBeInTheDocument();

    await page.getByRole("button", { name: "Activate preview" }).click();
    await expect.element(page.getByText("Loaded after retry")).toBeVisible();
  });

  it("retries a failed import when a new owner run starts", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    render(LazyMountRetryKeyTestHarness);

    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("Test component did not load.");
    await page.getByRole("button", { name: "Start fresh playback" }).click();
    await expect.element(page.getByText("Loaded after retry")).toBeVisible();
    errorLog.mockRestore();
  });
});
