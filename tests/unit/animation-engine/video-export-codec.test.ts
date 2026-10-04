// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  selectCodec,
  selectSupportedEncoderConfig,
} from "$lib/shared/animation-engine/workers/video-export.worker";

describe("video-export worker selectCodec", () => {
  it("uses Constrained Baseline (0x42e0) on mobile", () => {
    expect(selectCodec(1080, 1080, true)).toMatch(/^avc1\.42e0/);
  });
  it("uses High profile (0x6400) on desktop", () => {
    expect(selectCodec(1080, 1080, false)).toMatch(/^avc1\.6400/);
  });
  it("tracks resolution in the level byte", () => {
    expect(selectCodec(640, 480, false)).toBe("avc1.64001f"); // <=921600
    expect(selectCodec(1920, 1080, false)).toBe("avc1.640028"); // <=2073600
  });
});

describe("video-export worker encoder preference", () => {
  const base = {
    codec: "av01.1.08M.10",
    width: 1920,
    height: 1080,
    bitrate: 8_000_000,
    framerate: 30,
    latencyMode: "quality",
    bitrateMode: "constant",
  } satisfies VideoEncoderConfig;

  it("prefers 10-bit software AV1 over 8-bit hardware AV1", async () => {
    const config = await selectSupportedEncoderConfig(
      base,
      true,
      async (candidate) =>
        candidate.hardwareAcceleration === "no-preference" ||
        candidate.codec.endsWith(".08")
    );
    expect(config.codec).toBe("av01.1.08M.10");
    expect(config.hardwareAcceleration).toBe("no-preference");
    expect(config.latencyMode).toBe("quality");
  });

  it("prefers hardware H.264 when supported and falls back when unavailable", async () => {
    const h264 = { ...base, codec: "avc1.640028" };
    const hardware = await selectSupportedEncoderConfig(
      h264,
      false,
      async () => true
    );
    expect(hardware.hardwareAcceleration).toBe("prefer-hardware");
    const fallback = await selectSupportedEncoderConfig(
      h264,
      false,
      async (candidate) => candidate.hardwareAcceleration === "no-preference"
    );
    expect(fallback.hardwareAcceleration).toBe("no-preference");
  });
});
