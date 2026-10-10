import { beforeEach, describe, expect, it, vi } from "vitest";
import { error, type RequestEvent } from "@sveltejs/kit";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireFirebaseUser: vi.fn(),
  withRateLimit: vi.fn(),
  plan: vi.fn(),
  review: vi.fn(),
}));
vi.mock("$app/env", () => ({ dev: false }));
vi.mock("$app/env/private", async () => {
  const { envModule } = await import("#test-helpers/env-module.js");
  return envModule({ ANTHROPIC_API_KEY: "test-only" });
});
vi.mock("#lib/server/auth/requireAdmin.js", () => ({
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("#lib/server/auth/requireFirebaseUser.js", () => ({
  requireFirebaseUser: mocks.requireFirebaseUser,
}));
vi.mock("#lib/server/security/withRateLimit.js", () => ({
  withRateLimit: mocks.withRateLimit,
}));
vi.mock("#lib/features/stage/services/server/tika-director-planner.js", () => ({
  planStageDirection: mocks.plan,
}));
vi.mock(
  "#lib/features/stage/services/server/tika-director-reviewer.js",
  () => ({
    reviewStageDirection: mocks.review,
  })
);
import { POST } from "../../../src/routes/api/tika/direct/+server";

const body = {
  prompt: "Move to a circle over 4 beats",
  conversation: [],
  scene: {
    id: "test",
    name: "Test",
    bpm: 120,
    currentBeat: 8,
    performers: [{ id: "a", label: "A", characterId: "x-bot", prop: "staff" }],
    formations: [],
  },
};
function event(payload = JSON.stringify(body)) {
  return {
    request: new Request("http://localhost/api/tika/direct", {
      method: "POST",
      body: payload,
    }),
  } as RequestEvent;
}

describe("TIKA Director API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ uid: "admin" });
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.plan.mockResolvedValue({
      response: { kind: "clarify", question: "Which formation?" },
    });
    mocks.review.mockImplementation(async (_model, _request, response) => ({
      response,
    }));
  });

  it("enforces admin access before calling the paid planner in production", async () => {
    mocks.requireAdmin.mockImplementation(async () =>
      error(403, "Admin access required")
    );
    const response = await POST(event());
    expect(response.status).toBe(403);
    expect(mocks.plan).not.toHaveBeenCalled();
    expect(mocks.requireFirebaseUser).not.toHaveBeenCalled();
  });

  it("preserves an expired-session 401", async () => {
    mocks.requireAdmin.mockRejectedValue(
      Object.assign(new Error("ID token expired"), { status: 401 })
    );
    expect((await POST(event())).status).toBe(401);
    expect(mocks.plan).not.toHaveBeenCalled();
  });

  it.each(["{broken", "{}"])(
    "rejects malformed/invalid input before inference: %s",
    async (payload) => {
      expect((await POST(event(payload))).status).toBe(400);
      expect(mocks.plan).not.toHaveBeenCalled();
    }
  );

  it("forwards the library size to the planner", async () => {
    const payload = {
      ...body,
      scene: { ...body.scene, librarySequenceCount: 7 },
    };
    const response = await POST(event(JSON.stringify(payload)));
    expect(response.status).toBe(200);
    expect(mocks.plan.mock.calls[0]?.[1]?.scene?.librarySequenceCount).toBe(7);
  });

  it("returns the validated plan without the provider envelope", async () => {
    const response = await POST(event());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "clarify",
      question: "Which formation?",
    });
    expect(mocks.plan).toHaveBeenCalledTimes(1);
  });

  it("honors throttling without calling the model", async () => {
    mocks.withRateLimit.mockResolvedValue(
      new Response("Slow down", { status: 429 })
    );
    expect((await POST(event())).status).toBe(429);
    expect(mocks.plan).not.toHaveBeenCalled();
  });

  it("never returns an apply proposal when independent review fails", async () => {
    mocks.plan.mockResolvedValue({
      response: {
        kind: "apply",
        summary: "Props",
        actions: [{ type: "assign-distinct-props" }],
      },
    });
    mocks.review.mockRejectedValue(new Error("Provider unavailable"));
    const response = await POST(event());
    expect(response.status).toBe(502);
    expect(await response.json()).not.toHaveProperty("actions");
  });

  it("returns a review veto instead of the planner's actions", async () => {
    mocks.plan.mockResolvedValue({
      response: {
        kind: "apply",
        summary: "Props",
        actions: [{ type: "assign-distinct-props" }],
      },
    });
    mocks.review.mockResolvedValue({
      response: { kind: "clarify", question: "May I include fans?" },
    });
    const response = await POST(event());
    expect(await response.json()).toEqual({
      kind: "clarify",
      question: "May I include fans?",
    });
  });
});
