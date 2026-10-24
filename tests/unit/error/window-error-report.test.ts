import { describe, expect, it } from "vitest";
import { buildWindowErrorReport } from "#lib/shared/error/domain/window-error-report.js";

describe("buildWindowErrorReport", () => {
  it("keeps the script location, full stack and route for a minified TypeError", () => {
    const error = new TypeError("e is not a function");
    error.stack =
      "TypeError: e is not a function\n    at Xy (https://tkaflowarts.com/_app/immutable/chunks/Abc123.js:1:4567)";

    const report = buildWindowErrorReport(
      {
        message: "Uncaught TypeError: e is not a function",
        filename: "https://tkaflowarts.com/_app/immutable/chunks/Abc123.js",
        lineno: 1,
        colno: 4567,
        error,
      },
      "/create/generate"
    );

    expect(report?.message).toBe("Uncaught error: e is not a function");
    expect(report?.error).toBe(error);
    expect(report?.context?.action).toBe("window-error");
    expect(report?.context?.additionalData).toEqual({
      url: "/create/generate",
      location: "https://tkaflowarts.com/_app/immutable/chunks/Abc123.js:1:4567",
      errorName: "TypeError",
      stack: error.stack,
    });
  });

  it("still records the location when the thrown value is not an Error", () => {
    const report = buildWindowErrorReport(
      {
        message: "Uncaught boom",
        filename: "https://tkaflowarts.com/_app/immutable/nodes/4.js",
        lineno: 2,
        colno: 9,
        error: "boom",
      },
      "/create/generate"
    );

    expect(report?.message).toBe("Uncaught error: Uncaught boom");
    expect(report?.error).toBeUndefined();
    expect(report?.context?.additionalData).toMatchObject({
      location: "https://tkaflowarts.com/_app/immutable/nodes/4.js:2:9",
      stack: null,
    });
  });

  it("skips opaque cross-origin errors and the ResizeObserver loop warning", () => {
    expect(buildWindowErrorReport({ message: "Script error." }, "/")).toBeNull();
    expect(
      buildWindowErrorReport(
        { message: "ResizeObserver loop completed with undelivered notifications." },
        "/"
      )
    ).toBeNull();
  });
});
