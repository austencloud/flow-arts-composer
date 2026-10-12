import { render } from "vitest-browser-svelte";
import { describe, expect, it } from "vitest";
import SingleSvelteProbe from "./SingleSvelteProbe.svelte";

describe("one Svelte runtime across tka and the package", () => {
  it("reads, in a tka component, the strings a tka parent set through the package", async () => {
    const screen = render(SingleSvelteProbe);
    await expect
      .element(screen.getByTestId("probe"))
      .toHaveTextContent("tka:editor_default_take");
  });
});
