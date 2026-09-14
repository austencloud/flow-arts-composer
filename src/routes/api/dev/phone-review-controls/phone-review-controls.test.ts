import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

const mocks = vi.hoisted(() => ({ dev: true, update: vi.fn() }));
vi.mock("$app/environment", () => ({
  get dev() {
    return mocks.dev;
  },
}));
vi.mock("$lib/server/phone-review-interaction-state", () => ({
  updatePhoneReviewInteractionState: mocks.update,
}));
import { POST } from "./+server";

function report(body: string, origin: string | null = "https://review.test") {
  return POST({
    request: new Request("https://review.test/api/dev/phone-review-controls", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(origin ? { origin } : {}),
      },
      body,
    }),
  } as RequestEvent);
}

describe("phone review reports", () => {
  beforeEach(() => {
    mocks.dev = true;
    mocks.update.mockReset();
  });

  it("rejects oversized bodies without trusting Content-Length", async () => {
    await expect(
      report(JSON.stringify({ padding: "x".repeat(20_001) }))
    ).rejects.toMatchObject({ status: 413 });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([null, "https://other.test"])(
    "rejects missing or foreign origin %s",
    async (origin) => {
      await expect(report("{}", origin)).rejects.toMatchObject({ status: 403 });
      expect(mocks.update).not.toHaveBeenCalled();
    }
  );

  it.each(["null", "[]", "{"])("rejects malformed report %s", async (body) => {
    await expect(report(body)).rejects.toMatchObject({ status: 400 });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("is unavailable in production", async () => {
    mocks.dev = false;
    await expect(report("{}")).rejects.toMatchObject({ status: 404 });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
