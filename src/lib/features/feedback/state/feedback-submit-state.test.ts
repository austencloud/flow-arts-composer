import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The database takes feedback only from a full account, so a guest's send
 * used to end in "Failed to submit feedback" every time with their words
 * stranded. Now a guest's send opens the sign-in prompt and never reaches the
 * submission service; a signed-in person's send is unchanged.
 */

const auth = vi.hoisted(() => ({
  user: null as { uid: string; isAnonymous: boolean } | null,
}));

const submitFeedback = vi.hoisted(() => vi.fn(async () => "feedback-id"));
const showOnRequest = vi.hoisted(() => vi.fn());

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: {
    get user() {
      return auth.user;
    },
    get isFullAccount() {
      return auth.user !== null && !auth.user.isAnonymous;
    },
  },
}));

vi.mock("#lib/shared/auth/state/auth-drawer-state.svelte.js", () => ({
  authDrawerState: { showOnRequest },
}));

vi.mock("#lib/shared/feedback/services/feedback-repository.js", () => ({
  feedbackService: { submitFeedback },
}));

vi.mock("../services/image-stager", () => ({
  stageImage: vi.fn(),
  deleteStaged: vi.fn(),
}));

vi.mock("./feedback-context-tracker.svelte", () => ({
  getCapturedModule: () => "create",
  getCapturedTab: () => "construct",
}));

const { createFeedbackSubmitState } = await import(
  "./feedback-submit-state.svelte"
);

const WORDS = "The play button does nothing on my phone.";

describe("feedback send", () => {
  beforeEach(() => {
    submitFeedback.mockClear();
    showOnRequest.mockClear();
  });

  it("a guest's send opens the sign-in prompt and keeps their words", async () => {
    auth.user = { uid: "guest-uid", isAnonymous: true };
    const state = createFeedbackSubmitState();
    state.updateField("description", WORDS);

    expect(state.needsAccount).toBe(true);
    const sent = await state.submit();

    expect(sent).toBe(false);
    expect(submitFeedback).not.toHaveBeenCalled();
    expect(showOnRequest).toHaveBeenCalledWith("signup", "feedback");
    expect(state.submitStatus).toBe("idle");
    expect(state.formData.description).toBe(WORDS);
  });

  it("a visitor with no user yet is asked to sign in too", async () => {
    auth.user = null;
    const state = createFeedbackSubmitState();
    state.updateField("description", WORDS);

    await state.submit();

    expect(submitFeedback).not.toHaveBeenCalled();
    expect(showOnRequest).toHaveBeenCalledWith("signup", "feedback");
  });

  it("the same words send once the guest has signed in", async () => {
    auth.user = { uid: "guest-uid", isAnonymous: true };
    const state = createFeedbackSubmitState();
    state.updateField("description", WORDS);
    await state.submit();

    auth.user = { uid: "account-uid", isAnonymous: false };
    expect(state.needsAccount).toBe(false);
    const sent = await state.submit();

    expect(sent).toBe(true);
    expect(submitFeedback).toHaveBeenCalledTimes(1);
    expect((submitFeedback.mock.calls[0] as unknown[])?.[0]).toMatchObject({
      description: WORDS,
    });
  });

  it("a signed-in person's send goes straight to the submission service", async () => {
    auth.user = { uid: "account-uid", isAnonymous: false };
    const state = createFeedbackSubmitState();
    state.updateField("description", WORDS);

    const sent = await state.submit();

    expect(sent).toBe(true);
    expect(showOnRequest).not.toHaveBeenCalled();
    expect(submitFeedback).toHaveBeenCalledTimes(1);
    expect(state.submitStatus).toBe("success");
  });
});
