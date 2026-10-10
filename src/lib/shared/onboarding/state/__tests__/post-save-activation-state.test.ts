import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	authState: {
		isFullAccount: false,
		effectiveUserId: "guest-1" as string | null,
	},
	authDrawerShow: vi.fn(),
	canAccess: vi.fn(() => true),
	captureEvent: vi.fn(),
	hasSeen: vi.fn(() => false),
	markSeen: vi.fn(),
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
	authState: mocks.authState,
}));

vi.mock("#lib/shared/auth/state/auth-drawer-state.svelte.js", () => ({
	authDrawerState: {
		show: mocks.authDrawerShow,
		hide: vi.fn(),
	},
}));

vi.mock("#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js", () => ({
	postHogFeatureFlagService: {
		canAccess: mocks.canAccess,
	},
}));

vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
	captureEvent: mocks.captureEvent,
}));

vi.mock("#lib/shared/onboarding/state/guest-first-save-guard.js", () => ({
	hasSeen: mocks.hasSeen,
	markSeen: mocks.markSeen,
}));

import { postSaveActivation } from "../post-save-activation-state.svelte";

describe("postSaveActivation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.authState.isFullAccount = false;
		mocks.authState.effectiveUserId = "guest-1";
		mocks.canAccess.mockReturnValue(true);
		mocks.hasSeen.mockReturnValue(false);
		postSaveActivation.reset();
	});

	describe("onGuestSaveSucceeded (phase 1: queue)", () => {
		it("queues a prompt when guest, flag on, and guard unseen", () => {
			postSaveActivation.onGuestSaveSucceeded("seq-1");

			expect(postSaveActivation.visible).toBe(true);
			expect(postSaveActivation.sequenceId).toBe("seq-1");
		});

		it("does not consume the guard or emit analytics at queue time", () => {
			postSaveActivation.onGuestSaveSucceeded("seq-1");

			expect(mocks.markSeen).not.toHaveBeenCalled();
			expect(mocks.captureEvent).not.toHaveBeenCalled();
		});

		it("does not queue when the account is a full account", () => {
			mocks.authState.isFullAccount = true;

			postSaveActivation.onGuestSaveSucceeded("seq-1");

			expect(postSaveActivation.visible).toBe(false);
		});

		it("does not queue when there is no effective uid", () => {
			mocks.authState.effectiveUserId = null;

			postSaveActivation.onGuestSaveSucceeded("seq-1");

			expect(postSaveActivation.visible).toBe(false);
		});

		it("does not queue when the rollout flag is off", () => {
			mocks.canAccess.mockReturnValue(false);

			postSaveActivation.onGuestSaveSucceeded("seq-1");

			expect(postSaveActivation.visible).toBe(false);
		});

		it("does not queue when the guard says this uid has already seen it", () => {
			mocks.hasSeen.mockReturnValue(true);

			postSaveActivation.onGuestSaveSucceeded("seq-1");

			expect(postSaveActivation.visible).toBe(false);
		});

		it("does not re-evaluate (or clobber the sequenceId) if already pending", () => {
			postSaveActivation.onGuestSaveSucceeded("seq-1");
			postSaveActivation.onGuestSaveSucceeded("seq-2");

			expect(postSaveActivation.sequenceId).toBe("seq-1");
		});
	});

	describe("markPresented (phase 2: consume guard + emit shown)", () => {
		it("consumes the guard and emits the shown event once mounted", () => {
			postSaveActivation.onGuestSaveSucceeded("seq-1");
			postSaveActivation.markPresented();

			expect(mocks.markSeen).toHaveBeenCalledWith("guest-1");
			expect(mocks.captureEvent).toHaveBeenCalledWith(
				"onboarding_guest_first_save_prompt_shown",
				{ sequenceId: "seq-1" }
			);
		});

		it("does nothing if nothing is queued", () => {
			postSaveActivation.markPresented();

			expect(mocks.markSeen).not.toHaveBeenCalled();
			expect(mocks.captureEvent).not.toHaveBeenCalled();
		});

		it("is idempotent — a second call (e.g. host effect re-run on uid change) does not re-emit shown or re-mark the guard", () => {
			postSaveActivation.onGuestSaveSucceeded("seq-1");
			postSaveActivation.markPresented();
			postSaveActivation.markPresented();

			expect(mocks.markSeen).toHaveBeenCalledTimes(1);
			expect(
				mocks.captureEvent.mock.calls.filter(
					([name]) => name === "onboarding_guest_first_save_prompt_shown"
				)
			).toHaveLength(1);
		});

		it("a queued-but-never-presented prompt never consumes the guard", () => {
			postSaveActivation.onGuestSaveSucceeded("seq-1");
			postSaveActivation.reset();

			expect(mocks.markSeen).not.toHaveBeenCalled();
		});
	});

	describe("accept / login / dismissPrompt", () => {
		beforeEach(() => {
			postSaveActivation.onGuestSaveSucceeded("seq-1");
			postSaveActivation.markPresented();
			mocks.captureEvent.mockClear();
		});

		it("accept opens the signup drawer with the guest-first-save reason and hides", () => {
			postSaveActivation.accept();

			expect(mocks.authDrawerShow).toHaveBeenCalledWith("signup", "guest-first-save");
			expect(mocks.captureEvent).toHaveBeenCalledWith(
				"onboarding_guest_first_save_prompt_accepted",
				{ sequenceId: "seq-1" }
			);
			expect(postSaveActivation.visible).toBe(false);
		});

		it("login opens the signin drawer and hides", () => {
			postSaveActivation.login();

			expect(mocks.authDrawerShow).toHaveBeenCalledWith("signin", "guest-first-save");
			expect(mocks.captureEvent).toHaveBeenCalledWith(
				"onboarding_guest_first_save_prompt_login",
				{ sequenceId: "seq-1" }
			);
			expect(postSaveActivation.visible).toBe(false);
		});

		it("dismissPrompt logs declined and hides without opening the drawer", () => {
			postSaveActivation.dismissPrompt();

			expect(mocks.authDrawerShow).not.toHaveBeenCalled();
			expect(mocks.captureEvent).toHaveBeenCalledWith(
				"onboarding_guest_first_save_prompt_declined",
				{ sequenceId: "seq-1" }
			);
			expect(postSaveActivation.visible).toBe(false);
		});
	});

	describe("reset", () => {
		it("clears pending state without logging anything", () => {
			postSaveActivation.onGuestSaveSucceeded("seq-1");
			postSaveActivation.reset();

			expect(postSaveActivation.visible).toBe(false);
			expect(postSaveActivation.sequenceId).toBe(null);
			expect(mocks.captureEvent).not.toHaveBeenCalled();
		});

		it("allows a fresh queue after reset", () => {
			postSaveActivation.onGuestSaveSucceeded("seq-1");
			postSaveActivation.markPresented();
			postSaveActivation.reset();

			mocks.hasSeen.mockReturnValue(false);
			postSaveActivation.onGuestSaveSucceeded("seq-2");

			expect(postSaveActivation.visible).toBe(true);
			expect(postSaveActivation.sequenceId).toBe("seq-2");
		});
	});
});
