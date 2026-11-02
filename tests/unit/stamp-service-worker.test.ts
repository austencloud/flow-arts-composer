import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BUILD_ID_PLACEHOLDER,
  resolveBuildId,
  stampServiceWorker,
} from "../../scripts/stamp-service-worker.js";

// The markers scripts/verify-offline-deploy.mjs requires in the served sw.js.
const VERIFY_MARKERS = [
  'CACHE_NAME = "tka-v3"',
  "svg-precache-manifest.json",
  "precacheBootChunks",
  "networkFirstNavigation",
  "staleWhileRevalidate",
];

const source = readFileSync(resolve("static/sw.js"), "utf8");

describe("stampServiceWorker", () => {
  it("writes the build id into the real sw.js and keeps every verify marker", () => {
    expect(source).toContain(BUILD_ID_PLACEHOLDER);

    const stamped = stampServiceWorker(source, "abc1234-1793000000000");

    expect(stamped).not.toContain(BUILD_ID_PLACEHOLDER);
    expect(stamped).toContain('const BUILD_ID = "abc1234-1793000000000";');
    for (const marker of VERIFY_MARKERS) expect(stamped).toContain(marker);
    // Two deploys must produce two different files, or browsers keep the old worker.
    expect(stampServiceWorker(source, "def5678-1793000000001")).not.toBe(
      stamped
    );
  });

  it("refuses a worker that was not copied or was already stamped", () => {
    const once = stampServiceWorker(source, "abc1234");
    expect(() => stampServiceWorker(once, "def5678")).toThrow(
      BUILD_ID_PLACEHOLDER
    );
    expect(() => stampServiceWorker("", "abc1234")).toThrow(
      BUILD_ID_PLACEHOLDER
    );
  });

  it("refuses an id that could break out of the string literal", () => {
    expect(() => stampServiceWorker(source, 'x";alert(1)//')).toThrow();
    expect(() => stampServiceWorker(source, "")).toThrow();
  });
});

describe("resolveBuildId", () => {
  it("uses the Cloudflare Pages commit when it is set", () => {
    expect(resolveBuildId({ CF_PAGES_COMMIT_SHA: "0123abcd" }, 5)).toBe(
      "0123abcd"
    );
  });

  it("otherwise differs between two builds of the same commit", () => {
    const head = () => "abc1234";
    const first = resolveBuildId({}, 1_000, head);
    expect(first).toBe("abc1234-1000");
    expect(resolveBuildId({}, 2_000, head)).not.toBe(first);
    // Without git the timestamp alone still keeps builds apart.
    expect(resolveBuildId({}, 3_000, () => "")).toBe("3000");
  });
});
