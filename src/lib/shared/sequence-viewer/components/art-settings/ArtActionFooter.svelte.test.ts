import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import ArtActionFooter from "./ArtActionFooter.svelte";

describe("ArtActionFooter", () => {
  // The owner's export takes an optional stage. A click event passed straight
  // through would arrive there as the stage and be sent to analytics as one.
  it("calls the export handler with no arguments", async () => {
    const onExport = vi.fn();
    render(ArtActionFooter, { onExport, exportLabel: "Export MP4" });

    await page.getByTestId("art-export-button").click();

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport.mock.calls[0]).toEqual([]);
  });
});
