import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BackgroundType } from "@austencloud/backgrounds";
import type { WebGLRenderer } from "three";
import { requireRegisteredEnvironment } from "../../environments/registry/environment-registry";
import { createRegistryGltfLoader } from "./registry-gltf-loader";

// KTX2Loader.detectSupport reads the renderer's extensions; nothing here draws.
const renderer = {
  extensions: { has: () => false },
  capabilities: {},
} as unknown as WebGLRenderer;

beforeAll(() => {
  vi.stubGlobal("location", { href: "https://app.test/composer" });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

describe("the worker's Ocean seabed comes from the registry", () => {
  it("loads the URL and decoders static/models/ocean/scene.json names", () => {
    const ocean = requireRegisteredEnvironment(BackgroundType.OCEAN);
    const { loader, url, dispose } = createRegistryGltfLoader(ocean, renderer);
    // The values the worker hard-coded before it read the manifest.
    expect(url).toBe("https://app.test/models/ocean/ocean-environment.glb");
    expect(loader.meshoptDecoder).not.toBeNull();
    expect(loader.ktx2Loader).not.toBeNull();
    expect(loader.dracoLoader).toBeNull();
    dispose();
  });

  it("follows the manifest when it names other codecs", () => {
    const plain = createRegistryGltfLoader(
      {
        glbUrl: "/models/x/x.glb",
        compression: { geometry: "none", texture: "none" },
      },
      renderer
    );
    expect(plain.loader.meshoptDecoder).toBeNull();
    expect(plain.loader.ktx2Loader).toBeNull();
    const draco = createRegistryGltfLoader(
      {
        glbUrl: "/models/x/x.glb",
        compression: { geometry: "draco", texture: "none" },
      },
      renderer
    );
    expect(draco.loader.dracoLoader).not.toBeNull();
    draco.dispose();
  });
});
