import { afterEach, describe, expect, it, vi } from "vitest";

describe("VideoExporter encoder loading", () => {
  afterEach(() => {
    vi.doUnmock(
      "$lib/shared/animation-engine/services/web-codecs-video-encoder"
    );
    vi.doUnmock("$lib/shared/animation-engine/services/wasm-video-encoder");
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("loads encoder implementations only after export intent", async () => {
    let webCodecsModuleLoads = 0;
    let wasmModuleLoads = 0;

    vi.doMock(
      "$lib/shared/animation-engine/services/web-codecs-video-encoder",
      () => {
        webCodecsModuleLoads += 1;
        return {
          WebCodecsVideoEncoder: class {
            async initialize(): Promise<void> {}
          },
        };
      }
    );
    vi.doMock(
      "$lib/shared/animation-engine/services/wasm-video-encoder",
      () => {
        wasmModuleLoads += 1;
        return {
          WasmVideoEncoder: class {
            async initialize(): Promise<void> {}
          },
        };
      }
    );

    vi.stubGlobal("VideoEncoder", class {});
    vi.stubGlobal("VideoFrame", class {});

    const { VideoExporter } = await import(
      "$lib/shared/animation-engine/services/video-exporter"
    );

    expect(webCodecsModuleLoads).toBe(0);
    expect(wasmModuleLoads).toBe(0);

    await new VideoExporter().createManualExporter(640, 480);

    expect(webCodecsModuleLoads).toBe(1);
    expect(wasmModuleLoads).toBe(0);
  });

  it("allows another attempt when an encoder module fails to load", async () => {
    vi.doMock(
      "$lib/shared/animation-engine/services/web-codecs-video-encoder",
      () => {
        throw new Error("encoder chunk unavailable");
      }
    );
    vi.stubGlobal("VideoEncoder", class {});
    vi.stubGlobal("VideoFrame", class {});

    const { VideoExporter } = await import(
      "$lib/shared/animation-engine/services/video-exporter"
    );
    const exporter = new VideoExporter();

    await expect(exporter.createManualExporter(640, 480)).rejects.toThrow();
    await expect(exporter.createManualExporter(640, 480)).rejects.not.toThrow(
      "Export already in progress"
    );
  });
});
