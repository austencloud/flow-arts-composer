import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TunnelViewController } from "../../tunnel/tunnel-view-controller.svelte";
import TunnelLookSettings from "./TunnelLookSettings.svelte";

// The phone dock's Formation tray. Its colors used to sit inline above the
// presets, which on the Fold pushed the preset cards below the fold of a
// 250px tray; now they are drill rows. The silent failure this guards is a
// drill that opens but cannot come back, or one that leaves the presets
// mounted underneath it.
describe("TunnelLookSettings dense color drills", () => {
  let destroyRoot: (() => void) | undefined;
  let controller: TunnelViewController;

  beforeEach(async () => {
    await page.viewport(707, 772);
    destroyRoot = $effect.root(() => {
      controller = new TunnelViewController({
        getSequence: () => null,
        persistViewState: false,
      });
    });
  });

  afterEach(() => {
    destroyRoot?.();
  });

  it("opens Colors as its own screen and comes back to the presets", async () => {
    render(TunnelLookSettings, { controller, dense: true });

    const presets = page.getByRole("radiogroup", { name: "Tunnel preset" });
    await expect.element(presets).toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: /Hand colors/ }))
      .not.toBeInTheDocument();

    await page.getByRole("button", { name: /^Colors/ }).click();

    await expect
      .element(page.getByRole("button", { name: "Hand colors" }))
      .toBeInTheDocument();
    await expect.element(presets).not.toBeInTheDocument();

    await page.getByRole("button", { name: "Presets" }).click();

    await expect.element(presets).toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Hand colors" }))
      .not.toBeInTheDocument();
  });

  it("keeps the sidebar's inline colors when not dense", async () => {
    render(TunnelLookSettings, { controller, dense: false });

    await expect
      .element(page.getByRole("button", { name: "Hand colors" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: /^Colors/ }))
      .not.toBeInTheDocument();
  });
});
