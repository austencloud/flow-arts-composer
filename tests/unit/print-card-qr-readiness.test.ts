import { expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as string[]);
vi.mock("#lib/shared/render/get-image-composer.js", () => ({
  getImageComposer: () => ({
    setQRCodeGenerator: () => calls.push("qr-ready"),
  }),
}));
vi.mock("#lib/shared/qr/get-qr-code-generator.js", () => ({
  getQRCodeGenerator: () => ({}),
}));
vi.mock("#lib/features/choreo-card/services/PrintCardRenderer.js", () => ({
  PrintCardRenderer: class {
    constructor() {
      calls.push("renderer-ready");
    }
  },
}));
import { getPrintCardRenderer } from "#lib/features/choreo-card/getPrintCardRenderer.js";

it("wires QR generation before the first card can render and enter the cache", () => {
  getPrintCardRenderer();
  expect(calls).toEqual(["qr-ready", "renderer-ready"]);
});
