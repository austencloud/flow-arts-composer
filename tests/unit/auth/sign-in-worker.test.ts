import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSignInWorker,
  type SignInWorkerScope,
} from "#lib/shared/auth/phone-sign-in/sign-in-worker.js";
import type {
  SignInNotificationData,
  TapAnswers,
} from "#lib/shared/auth/phone-sign-in/sign-in-notification.js";

// The pieces of ServiceWorkerGlobalScope the worker touches. What matters here
// is the order a person sees: the tap is acknowledged at once, and any failure
// ends on the review page, never on something that reads as success.
const ID = "AbCdEfGhIjKlMnOpQr12";
const NOW = 1_800_000_000_000;
const review = `/sign-in/${ID}?review=1`;
const signIn = { id: ID, label: "Chrome on Windows", expiresInMs: 180_000 };
const waiting: SignInNotificationData = {
  url: review,
  signIn,
  pendingUntil: NOW + 180_000,
  tapApproves: true,
};
const PUSH = {
  data: {
    type: "phone-sign-in",
    id: ID,
    label: "Chrome on Windows",
    title: "Sign in Chrome on Windows?",
    body: "Tap to sign it in. Code 123 456",
    expiresInMs: "180000",
  },
};

let delivered: { title: string; data: unknown; close: () => void }[];
let showNotification: ReturnType<typeof vi.fn>;
let openWindow: ReturnType<typeof vi.fn>;
let answers: TapAnswers;

function worker() {
  const scope = {
    registration: {
      showNotification,
      getNotifications: async () => delivered,
    },
    clients: { openWindow },
  } as unknown as SignInWorkerScope;
  return createSignInWorker(scope, answers, () => NOW);
}

const titles = () => showNotification.mock.calls.map(([title]) => title);

beforeEach(() => {
  delivered = [];
  showNotification = vi.fn(async () => {});
  openWindow = vi.fn(async () => null);
  answers = {
    approver: {
      approve: vi.fn(async () => "approved" as const),
      deny: vi.fn(async () => "denied" as const),
    },
    reportNotMe: vi.fn(async () => ({
      signedOut: true,
      autoOff: true,
      blocked: false,
    })),
  };
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("showPush", () => {
  it("shows the request with the words the server sent", async () => {
    expect(await worker().showPush(PUSH)).toBe(true);
    const [title, options] = showNotification.mock.calls[0]!;
    expect(title).toBe("Sign in Chrome on Windows?");
    expect(options.body).toBe("Tap to sign it in. Code 123 456");
    expect(options.requireInteraction).toBe(true);
  });

  it("clears a request that expired unanswered", async () => {
    const stale = {
      title: "old",
      data: {
        signIn: { ...signIn, id: "ZyXwVuTsRqPoNmLkJi98" },
        pendingUntil: NOW - 1,
      },
      close: vi.fn(),
    };
    delivered = [stale];
    await worker().showPush(PUSH);
    expect(stale.close).toHaveBeenCalled();
    expect(showNotification).toHaveBeenCalledOnce();
  });

  it("turns down a message that is not a valid sign-in, showing nothing", async () => {
    expect(await worker().showPush({ data: { type: "generic" } })).toBe(false);
    expect(showNotification).not.toHaveBeenCalled();
  });
});

describe("ownsClick", () => {
  it("claims sign-in notifications only", () => {
    const w = worker();
    expect(w.ownsClick({ data: waiting })).toBe(true);
    expect(w.ownsClick({ data: { url: "/app" } })).toBe(false);
    expect(w.ownsClick({ data: null })).toBe(false);
    expect(w.ownsClick({})).toBe(false);
  });
});

describe("answerClick", () => {
  it("acknowledges the tap, then settles on the result, opening nothing", async () => {
    await worker().answerClick("", waiting);
    expect(titles()).toEqual([
      "Signing in Chrome on Windows...",
      "Signed in Chrome on Windows",
    ]);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("opens the review page when the tap cannot finish", async () => {
    vi.mocked(answers.approver.approve).mockResolvedValue("signed-out");
    await worker().answerClick("", waiting);
    expect(titles().at(-1)).toBe("Sign in on your phone first");
    expect(openWindow).toHaveBeenCalledWith(review);
  });

  it("ends on the review page when something throws", async () => {
    vi.mocked(answers.approver.approve).mockRejectedValue(new Error("boom"));
    await worker().answerClick("", waiting);
    expect(titles().at(-1)).toBe("Could not answer from the notification");
    expect(openWindow).toHaveBeenCalledWith(review);
  });

  it("never sits on Signing in when the answer hangs", async () => {
    vi.useFakeTimers({ now: NOW });
    vi.mocked(answers.approver.approve).mockReturnValue(
      new Promise(() => {}) as never
    );
    const finished = worker().answerClick("", waiting);
    await vi.advanceTimersByTimeAsync(20_001);
    await finished;
    expect(titles().at(-1)).toBe("Could not answer from the notification");
    expect(openWindow).toHaveBeenCalledWith(review);
  });

  it("survives Android refusing to open a page", async () => {
    vi.mocked(answers.approver.approve).mockResolvedValue("error");
    openWindow.mockRejectedValue(new Error("no user activation"));
    await expect(worker().answerClick("", waiting)).resolves.toBeUndefined();
    expect(titles().at(-1)).toBe("Could not answer from the notification");
  });

  it("does not put up a working notice for a tap that only opens a page", async () => {
    await worker().answerClick("", { url: review, signIn });
    expect(showNotification).not.toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledWith(review);
  });
});
