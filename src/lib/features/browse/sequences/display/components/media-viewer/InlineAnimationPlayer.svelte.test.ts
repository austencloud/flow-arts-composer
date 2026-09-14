import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it } from "vitest";
import InlineAnimationPlayerSeekLifecycleHarness from "./InlineAnimationPlayerSeekLifecycleHarness.svelte";

describe("InlineAnimationPlayer seek registration", () => {
  it("does not republish a stable seek callback when LazyMount rebuilds its props", async () => {
    render(InlineAnimationPlayerSeekLifecycleHarness);

    const registrations = page.getByRole("status", {
      name: "Seek registrations",
    });
    await expect.element(registrations).toHaveTextContent("1");

    await page.getByRole("button", { name: "Advance host frame" }).click();
    await expect.element(registrations).toHaveTextContent("1");
  });
});
