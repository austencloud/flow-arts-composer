// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  installGeneratedRouteRecovery,
  isTransientGeneratedRouteError,
} from "../../../static/svelte-kit-dev-error-recovery.js";

const generatedRouteError =
  "ENOENT: no such file or directory, stat 'E:\\tka-platform\\.svelte-kit\\types\\src\\routes\\proxy+layout.server.ts'";

describe("SvelteKit dev error recovery", () => {
  it("recognizes only the known generated-route error on development hosts", () => {
    expect(
      isTransientGeneratedRouteError("dev.tkaflowarts.com", generatedRouteError)
    ).toBe(true);
    expect(
      isTransientGeneratedRouteError("localhost", generatedRouteError)
    ).toBe(true);
    expect(
      isTransientGeneratedRouteError("tkaflowarts.com", generatedRouteError)
    ).toBe(false);
    expect(
      isTransientGeneratedRouteError(
        "dev.tkaflowarts.com",
        "TypeError: application source is broken"
      )
    ).toBe(false);
  });

  it("polls quietly and reloads only after the route serves successfully", async () => {
    const status = { textContent: "500" };
    const message = { textContent: generatedRouteError };
    const document = {
      title: generatedRouteError,
      querySelector(selector: string) {
        if (selector === "[data-error-status]") return status;
        if (selector === "[data-error-message]") return message;
        return null;
      },
    };
    const scheduled: Array<() => Promise<void>> = [];
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    const reload = vi.fn();

    expect(
      installGeneratedRouteRecovery({
        location: {
          hostname: "dev.tkaflowarts.com",
          href: "https://dev.tkaflowarts.com/atlas",
        },
        document,
        fetch,
        schedule: (callback: () => Promise<void>) => {
          scheduled.push(callback);
        },
        reload,
      })
    ).toBe(true);

    expect(status.textContent).toBe("DEV");
    expect(message.textContent).toBe("Refreshing local app…");
    expect(scheduled).toHaveLength(1);

    await scheduled.shift()?.();
    expect(reload).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    await scheduled.shift()?.();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledOnce();
    expect(scheduled).toHaveLength(0);
  });

  it("keeps the fallback template crawlable and wired to the recovery module", () => {
    const template = readFileSync(path.resolve("src/error.html"), "utf8");

    expect(template).toContain("%sveltekit.status%");
    expect(template).toContain("%sveltekit.error.message%");
    expect(template).toContain("/svelte-kit-dev-error-recovery.js");
  });
});
