import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import SheetHeaderEditor from "./SheetHeaderEditor.svelte";

describe("SheetHeaderEditor missing annotations", () => {
  it("renders a later-page running header before metadata exists", async () => {
    render(SheetHeaderEditor, {
      readonly: true,
      sheetName: "Practice",
      pageIndex: 1,
      startTimestamp: "00:30",
    });
    await expect
      .element(page.getByText("Practice", { exact: true }))
      .toBeVisible();
    await expect.element(page.getByText("page starts 00:30")).toBeVisible();
  });
});
