import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The handlers live in an inline <script> in src/app.html (they must run
// before any bundle). Extract the marked formatter block and evaluate it.
const html = readFileSync(path.resolve(process.cwd(), "src/app.html"), "utf8");
const block = html.match(
  /\/\/ BEGIN formatErrorReason[^\n]*\n([\s\S]*?)\/\/ END formatErrorReason/
);

function load() {
  expect(block, "formatter markers missing from src/app.html").not.toBeNull();
  return new Function(
    `${block![1]}; return { formatErrorReason, formatGlobalError };`
  )() as {
    formatErrorReason: (reason: unknown) => string;
    formatGlobalError: (event: Record<string, unknown>) => string;
  };
}

describe("app.html global error formatting", () => {
  it("formats a plain-object rejection readably instead of [object Object]", () => {
    const { formatErrorReason } = load();
    const out = formatErrorReason({ code: "storage/unauthorized", detail: "x" });
    expect(out).not.toContain("[object Object]");
    expect(out).toContain("storage/unauthorized");
  });

  it("uses message and stack for Error-like reasons", () => {
    const { formatErrorReason } = load();
    const out = formatErrorReason(new Error("kaboom"));
    expect(out).toContain("Error: kaboom");
    expect(out).toContain("Stack:");
  });

  it("limits the JSON summary to about 500 characters", () => {
    const { formatErrorReason } = load();
    expect(formatErrorReason({ blob: "z".repeat(2000) }).length).toBeLessThan(
      520
    );
  });

  it("falls back to String() for primitives", () => {
    const { formatErrorReason } = load();
    expect(formatErrorReason("plain")).toBe("plain");
    expect(formatErrorReason(undefined)).toBe("undefined");
  });

  it("keeps the emoji prefix and describes a window error event", () => {
    const { formatGlobalError } = load();
    const out = formatGlobalError({
      message: "Script error.",
      filename: "https://x.test/a.js",
      lineno: 3,
      colno: 9,
      error: { stack: "at foo" },
    });
    expect(out).toContain("🚨 GLOBAL ERROR: Script error.");
    expect(out).toContain("a.js:3:9");
    expect(out).toContain("Stack: at foo");
  });

  it("describes an event with no message using the error payload", () => {
    const { formatGlobalError } = load();
    const out = formatGlobalError({ message: "", error: { code: 7 } });
    expect(out).toContain('"code":7');
  });
});
