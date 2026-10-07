import { describe, expect, it } from "vitest";
import {
  outputSize,
  parseCaptureArgs,
  validateCaptureScript,
} from "../../../scripts/feature-video/capture.mjs";

describe("parseCaptureArgs", () => {
  it("defaults the origin and the port", () => {
    expect(
      parseCaptureArgs(["--feature", "promo", "--capture", "builder"])
    ).toEqual({
      feature: "promo",
      capture: "builder",
      origin: "https://localhost:5173",
      port: 9223,
      cliUrl: undefined,
    });
  });
  it("takes an origin and a port, and hands the origin to the CLI", () => {
    expect(
      parseCaptureArgs([
        "--feature",
        "p",
        "--capture",
        "b",
        "--origin",
        "http://localhost:4000",
        "--port",
        "9300",
      ])
    ).toMatchObject({
      origin: "http://localhost:4000",
      port: 9300,
      cliUrl: "http://localhost:4000",
    });
  });
  it("refuses an origin that is not this computer", () => {
    expect(() =>
      parseCaptureArgs([
        "--feature",
        "p",
        "--capture",
        "b",
        "--origin",
        "https://example.com",
      ])
    ).toThrow(/loopback/);
  });
  it("needs a feature and a capture", () => {
    expect(() => parseCaptureArgs(["--capture", "b"])).toThrow(/--feature/);
    expect(() => parseCaptureArgs(["--feature", "p"])).toThrow(/--capture/);
  });
  it("refuses the 9222 browser", () => {
    expect(() =>
      parseCaptureArgs(["--feature", "p", "--capture", "b", "--port", "9222"])
    ).toThrow(/9222/);
  });
});

describe("outputSize", () => {
  it("is the viewport times the scale", () => {
    expect(
      outputSize({ width: 720, height: 1280, deviceScaleFactor: 1.5 })
    ).toEqual({
      width: 1080,
      height: 1920,
    });
  });
});

describe("validateCaptureScript", () => {
  const good = () => ({
    id: "builder",
    url: "/create/construct",
    viewport: {
      width: 720,
      height: 1280,
      deviceScaleFactor: 1.5,
      mobile: true,
    },
    run: async () => {},
  });
  it("accepts a complete script", () => {
    expect(validateCaptureScript(good(), "builder")).toBeTruthy();
  });
  it("needs the id to match the file it came from", () => {
    expect(() =>
      validateCaptureScript({ ...good(), id: "other" }, "builder")
    ).toThrow(/id/);
  });
  it("needs a path, a viewport and a run function", () => {
    expect(() =>
      validateCaptureScript({ ...good(), url: "create" }, "builder")
    ).toThrow(/url/);
    expect(() =>
      validateCaptureScript({ ...good(), viewport: undefined }, "builder")
    ).toThrow(/viewport/);
    expect(() =>
      validateCaptureScript({ ...good(), run: undefined }, "builder")
    ).toThrow(/run/);
    expect(() => validateCaptureScript(undefined, "builder")).toThrow(
      /default export/
    );
  });
  it("explains why a device scale above 1.5 cannot work", () => {
    const script = good();
    script.viewport.deviceScaleFactor = 2.5;
    expect(() => validateCaptureScript(script, "builder")).toThrow(/1\.5/);
  });
  it("needs even output dimensions", () => {
    const script = good();
    script.viewport.width = 721;
    expect(() => validateCaptureScript(script, "builder")).toThrow(/even/);
  });
});
