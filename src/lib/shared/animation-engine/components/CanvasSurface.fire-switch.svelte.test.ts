import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getRenderContextRegistry } from "../get-render-context-registry";
import CanvasSurfaceFireSwitchHarness from "./CanvasSurfaceFireSwitchHarness.svelte";

const CONTEXT_ID = "mounted-fire-switch-review";

function getFireState() {
  const context = getRenderContextRegistry().get(CONTEXT_ID);
  const renderer = context?.effectManager.fireRenderer;
  if (!renderer) return null;

  const diagnostics = renderer.getDiagnostics() as {
    activeTips: number;
    residualHeat: number;
  };
  return {
    renderer,
    activeTips: diagnostics.activeTips,
    residualHeat: diagnostics.residualHeat,
  };
}

function readVisiblePixels() {
  const state = getFireState();
  const canvas = state?.renderer.getCanvas();
  const gl = state?.renderer.getGl();
  if (!canvas || !gl) return null;

  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(
    0,
    0,
    canvas.width,
    canvas.height,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixels
  );

  let totalAlpha = 0;
  let maxRgb = 0;
  let checksum = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index]!;
    const green = pixels[index + 1]!;
    const blue = pixels[index + 2]!;
    const alpha = pixels[index + 3]!;
    totalAlpha += alpha;
    maxRgb = Math.max(maxRgb, red, green, blue);
    checksum = (checksum + red * 3 + green * 5 + blue * 7 + alpha * 11) >>> 0;
  }
  return { totalAlpha, maxRgb, checksum };
}

afterEach(() => {
  getRenderContextRegistry().get(CONTEXT_ID)?.dispose();
});

describe("mounted CanvasSurface fire lifecycle", () => {
  it("fades live staff fire through hands and re-lights when staffs return", async () => {
    const screen = render(CanvasSurfaceFireSwitchHarness);
    await expect
      .element(page.getByTestId("initialized"), { timeout: 15_000 })
      .toHaveTextContent("ready");

    await vi.waitFor(
      () => {
        const state = getFireState();
        const pixels = readVisiblePixels();
        expect(state?.activeTips).toBe(4);
        expect(state?.residualHeat).toBeGreaterThan(0);
        expect(pixels?.maxRgb).toBeGreaterThan(0);
      },
      { timeout: 15_000, interval: 50 }
    );
    const burningState = getFireState()!;
    const burning = readVisiblePixels()!;

    await page.getByRole("button", { name: "Hands" }).click();
    await expect
      .element(page.getByTestId("prop-type"))
      .toHaveTextContent("hand");
    await vi.waitFor(
      () => {
        const state = getFireState();
        const pixels = readVisiblePixels();
        expect(state?.activeTips).toBe(0);
        expect(state?.residualHeat).toBeGreaterThan(0);
        expect(pixels?.maxRgb).toBeGreaterThan(0);
      },
      { timeout: 5_000, interval: 16 }
    );
    const earlyFadeState = getFireState()!;
    const earlyFade = readVisiblePixels()!;

    await new Promise((resolve) => setTimeout(resolve, 250));
    const laterFadeState = getFireState()!;
    const laterFade = readVisiblePixels()!;
    expect(laterFadeState.residualHeat).toBeLessThan(
      earlyFadeState.residualHeat
    );
    expect(laterFade.checksum).not.toBe(earlyFade.checksum);
    expect(laterFade.totalAlpha).toBeGreaterThan(0);

    await vi.waitFor(
      () => {
        expect(getFireState()?.residualHeat).toBe(0);
        expect(readVisiblePixels()?.totalAlpha).toBe(0);
      },
      { timeout: 10_000, interval: 50 }
    );
    const settledState = getFireState()!;
    const settled = readVisiblePixels()!;

    await page.getByRole("button", { name: "Staffs" }).click();
    await expect
      .element(page.getByTestId("prop-type"))
      .toHaveTextContent("staff");
    await vi.waitFor(
      () => {
        const state = getFireState();
        const pixels = readVisiblePixels();
        expect(state?.activeTips).toBe(4);
        expect(state?.residualHeat).toBeGreaterThan(0);
        expect(pixels?.maxRgb).toBeGreaterThan(0);
      },
      { timeout: 15_000, interval: 50 }
    );
    const relitState = getFireState()!;
    const relit = readVisiblePixels()!;

    console.info(
      "[mounted-fire-switch-proof]",
      JSON.stringify({
        burning: {
          activeTips: burningState.activeTips,
          residualHeat: burningState.residualHeat,
          ...burning,
        },
        earlyFade: {
          activeTips: earlyFadeState.activeTips,
          residualHeat: earlyFadeState.residualHeat,
          ...earlyFade,
        },
        laterFade: {
          activeTips: laterFadeState.activeTips,
          residualHeat: laterFadeState.residualHeat,
          ...laterFade,
        },
        settled: {
          activeTips: settledState.activeTips,
          residualHeat: settledState.residualHeat,
          ...settled,
        },
        relit: {
          activeTips: relitState.activeTips,
          residualHeat: relitState.residualHeat,
          ...relit,
        },
      })
    );

    screen.unmount();
  });
});
