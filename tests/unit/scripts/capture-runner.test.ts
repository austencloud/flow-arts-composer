import { describe, expect, it } from "vitest";
import {
  cliFailure,
  outputSize,
  parseCaptureArgs,
  validateCaptureScript,
} from "../../../scripts/feature-video/capture.mjs";

describe("parseCaptureArgs", () => {
  it("defaults the origin", () => {
    expect(
      parseCaptureArgs(["--feature", "promo", "--capture", "builder"])
    ).toEqual({
      feature: "promo",
      capture: "builder",
      origin: "https://localhost:5173",
      cliUrl: undefined,
    });
  });
  it("takes an origin and hands it to the CLI", () => {
    expect(
      parseCaptureArgs([
        "--feature",
        "p",
        "--capture",
        "b",
        "--origin",
        "http://localhost:4000",
      ])
    ).toMatchObject({
      origin: "http://localhost:4000",
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
});

describe("outputSize", () => {
  it("is the viewport times the scale", () => {
    expect(
      outputSize({ width: 432, height: 768, deviceScaleFactor: 2.5 })
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
      width: 432,
      height: 768,
      deviceScaleFactor: 2.5,
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
  it("refuses a device scale no phone has, such as a mistyped 25", () => {
    const script = good();
    script.viewport.deviceScaleFactor = 25;
    expect(() => validateCaptureScript(script, "builder")).toThrow(/2\.5/);
  });
  it("needs even output dimensions", () => {
    const script = good();
    script.viewport.width = 433;
    expect(() => validateCaptureScript(script, "builder")).toThrow(/even/);
  });
});

describe("cliFailure", () => {
  const printed = (edit: object) =>
    JSON.stringify({ media: "captures/a.2.mp4", take: "take-1", edit });
  it("gives the error the CLI printed", () => {
    expect(
      cliFailure({
        code: 1,
        stdout: "",
        stderr: "Editor session is not active.\n",
      })
    ).toBe("Editor session is not active.");
  });
  it("gives the editor's reason when it refused the edit", () => {
    expect(
      cliFailure({
        code: 1,
        stdout: printed({
          status: "failed",
          message: "The editor changed before the edit arrived.",
        }),
        stderr: "",
      })
    ).toBe("The editor changed before the edit arrived.");
  });
  it("gives the editor's reason even when Node printed a warning", () => {
    expect(
      cliFailure({
        code: 1,
        stdout: printed({
          status: "failed",
          message: "Finish the current edit first.",
        }),
        stderr: "(node:4120) Warning: something else\n",
      })
    ).toBe("Finish the current edit first.");
  });
  it("says how to check an edit the editor has not applied yet", () => {
    expect(
      cliFailure({
        code: 1,
        stdout: printed({
          status: "pending",
          note: "The editor has not applied it yet. Check with: x",
        }),
        stderr: "",
      })
    ).toMatch(/not applied it yet/);
  });
  it("names the exit code when nothing was printed", () => {
    expect(cliFailure({ code: 3, stdout: "", stderr: "" })).toBe(
      "post-project.mjs exited with code 3."
    );
  });
});
