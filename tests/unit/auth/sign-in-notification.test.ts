import { describe, expect, it, vi } from "vitest";
import type {
  NotificationApprover,
  NotificationOutcome,
} from "@austencloud/phone-sign-in/client";
import {
  answerTap,
  isStaleRequest,
  requestNotification,
  showRequest,
  signInFromPush,
  type SignInNotificationData,
  type SignInPush,
  type TapAnswers,
} from "#lib/shared/auth/phone-sign-in/sign-in-notification.js";

// Where each tap on a sign-in notification leaves the owner. A wrong turn here
// is quiet: a computer signed in with no word on the phone, a Deny that ends on a
// page that approves by itself, or a second request taking the place of the one
// being read.
const ID = "AbCdEfGhIjKlMnOpQr12";
const OTHER = "ZyXwVuTsRqPoNmLkJi98";
const NOW = 1_800_000_000_000;
const signIn: SignInPush = {
  id: ID,
  label: "Chrome on Windows",
  expiresInMs: 180_000,
};
const review = `/sign-in/${ID}?review=1`;
const done = `/sign-in/${ID}?done=auto`;

function answering(
  outcome: NotificationOutcome
): TapAnswers & { approver: NotificationApprover } {
  return {
    approver: {
      approve: vi.fn(async () => outcome),
      deny: vi.fn(async () => outcome),
    },
    reportNotMe: vi.fn(async () => ({
      signedOut: true,
      autoOff: true,
      blocked: false,
    })),
  };
}

const fcm = (data: Record<string, string>) => ({
  from: "1",
  fcmMessageId: "m",
  data: { type: "phone-sign-in", ...data },
});

describe("signInFromPush", () => {
  it("reads the request from FCM's data strings", () => {
    expect(
      signInFromPush(
        fcm({ id: ID, label: "Chrome on Windows", expiresInMs: "180000" })
      )
    ).toEqual(signIn);
  });

  it("assumes the usual lifetime when the push does not say, and caps a long one", () => {
    expect(signInFromPush(fcm({ id: ID }))?.expiresInMs).toBe(180_000);
    expect(
      signInFromPush(fcm({ id: ID, expiresInMs: "86400000" }))?.expiresInMs
    ).toBe(600_000);
  });

  it("names an unnamed computer", () => {
    expect(signInFromPush(fcm({ id: ID }))?.label).toBe("A computer");
  });

  it.each([
    ["another kind of push", { data: { type: "generic", id: ID } }],
    ["a malformed id", fcm({ id: "../api/phone-sign-in" })],
    ["no data", { from: "1" }],
    ["nothing at all", null],
  ])("ignores %s", (_label, message) => {
    expect(signInFromPush(message)).toBeNull();
  });
});

describe("requestNotification", () => {
  it("stays up with one Deny button, has its own tag, and marks the body tap as the approval", () => {
    const { options } = requestNotification(signIn, "t", "b", NOW);
    expect(options.requireInteraction).toBe(true);
    expect(options.renotify).toBe(true);
    expect(options.tag).toBe(`phone-sign-in-${ID}`);
    expect(options.actions).toEqual([{ action: "deny", title: "Deny" }]);
    expect(options.data).toMatchObject({
      url: review,
      signIn,
      pendingUntil: NOW + 180_000,
      tapApproves: true,
    });
  });
});

describe("showRequest", () => {
  const waiting = (id: string, pendingUntil: number) => ({
    title: "Sign in Chrome on Linux?",
    data: {
      url: `/sign-in/${id}?review=1`,
      signIn: { id, label: "Chrome on Linux", expiresInMs: 180_000 },
      pendingUntil,
      body: "Earlier body",
    },
  });

  it("takes the approval off every request when two are waiting at once", () => {
    const shown = showRequest(
      signIn,
      "t",
      "body",
      [waiting(OTHER, NOW + 60_000)],
      NOW
    );
    expect(shown.map((n) => n.options.tag)).toEqual([
      `phone-sign-in-${ID}`,
      `phone-sign-in-${OTHER}`,
    ]);
    for (const notification of shown) {
      expect(notification.options.actions).toBeUndefined();
      expect(
        (notification.options.data as SignInNotificationData).tapApproves
      ).toBeUndefined();
      expect(notification.options.body).toContain(
        "More than one sign-in is waiting"
      );
    }
    expect(shown[1]?.options.data).toMatchObject({
      url: `/sign-in/${OTHER}?review=1`,
      pendingUntil: NOW + 60_000,
    });
  });

  it("ignores requests that expired or were already answered", () => {
    const answered = {
      title: "Signed in Chrome on Linux",
      data: {
        url: `/sign-in/${OTHER}?done=auto`,
        signIn: waiting(OTHER, 0).data.signIn,
      },
    };
    const shown = showRequest(
      signIn,
      "t",
      "b",
      [waiting(OTHER, NOW - 1), answered],
      NOW
    );
    expect(shown).toHaveLength(1);
    expect(shown[0]?.options.actions).toEqual([
      { action: "deny", title: "Deny" },
    ]);
    expect(isStaleRequest(waiting(OTHER, NOW - 1), NOW)).toBe(true);
    expect(isStaleRequest(answered, NOW)).toBe(false);
  });
});

describe("answerTap", () => {
  const waiting = (): SignInNotificationData => ({
    url: review,
    signIn,
    pendingUntil: NOW + 180_000,
    tapApproves: true,
    body: "b",
  });
  const crowded = (): SignInNotificationData => ({
    url: review,
    signIn,
    pendingUntil: NOW + 180_000,
    body: "b",
  });
  const answered = (): SignInNotificationData => ({ url: done, signIn });

  it("approves on any network from a tap on the body and offers That wasn't me, opening nothing", async () => {
    const answers = answering("approved");
    const result = await answerTap("", waiting(), answers, NOW);
    expect(answers.approver.approve).toHaveBeenCalledWith(ID, {
      confirmDifferentNetwork: true,
    });
    expect(result.open).toBeNull();
    expect(result.notification?.title).toBe("Signed in Chrome on Windows");
    expect(result.notification?.options.actions).toEqual([
      { action: "not-me", title: "That wasn't me" },
    ]);
  });

  it("denies from the button", async () => {
    const answers = answering("denied");
    const result = await answerTap("deny", waiting(), answers, NOW);
    expect(answers.approver.deny).toHaveBeenCalledWith(ID);
    expect(answers.approver.approve).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      open: null,
      notification: { title: "Sign-in denied" },
    });
  });

  it.each(["expired", "already-decided"] as const)(
    "says %s in the notification without opening a page",
    async (outcome) => {
      const result = await answerTap("", waiting(), answering(outcome), NOW);
      expect(result.open).toBeNull();
      expect(result.notification?.options.actions).toBeUndefined();
    }
  );

  it.each(["not-trusted", "no-key", "signed-out", "error"] as const)(
    "opens only the review page when a tap ends %s, in words that don't say signed in",
    async (outcome) => {
      const result = await answerTap("", waiting(), answering(outcome), NOW);
      expect(result.open).toBe(review);
      expect(result.notification?.title).not.toMatch(/^Signed in/);
      expect(result.notification?.options.data).toMatchObject({ url: review });
    }
  );

  it.each(["signed-out", "error"] as const)(
    "never turns a Deny that ended %s into an approval",
    async (outcome) => {
      const answers = answering(outcome);
      const result = await answerTap("deny", waiting(), answers, NOW);
      expect(answers.approver.approve).not.toHaveBeenCalled();
      expect(result.open).toBe(review);
    }
  );

  it("only opens the page when a crowded request is tapped", async () => {
    const answers = answering("approved");
    expect(await answerTap("", crowded(), answers, NOW)).toEqual({
      notification: null,
      open: review,
    });
    expect(answers.approver.approve).not.toHaveBeenCalled();
  });

  it("only opens the page when a request that expired on this phone is tapped", async () => {
    const answers = answering("approved");
    expect(await answerTap("", waiting(), answers, NOW + 180_001)).toEqual({
      notification: null,
      open: review,
    });
    expect(answers.approver.approve).not.toHaveBeenCalled();
  });

  it("reports That wasn't me right from the notification", async () => {
    const answers = answering("approved");
    const result = await answerTap("not-me", answered(), answers, NOW);
    expect(answers.reportNotMe).toHaveBeenCalledWith(ID);
    expect(answers.approver.approve).not.toHaveBeenCalled();
    expect(result.open).toBeNull();
    expect(result.notification?.options.body).toContain("signing out");
  });

  it("opens the done page when the report fails, so it can be tried there", async () => {
    const answers = answering("approved");
    vi.mocked(answers.reportNotMe).mockRejectedValue(new Error("offline"));
    const result = await answerTap("not-me", answered(), answers, NOW);
    expect(result.open).toBe(done);
    expect(result.notification?.title).toBe("That didn't go through");
  });

  it("opens the done page from the signed-in notification's body, answering nothing", async () => {
    const answers = answering("approved");
    expect(await answerTap("", answered(), answers, NOW)).toEqual({
      notification: null,
      open: done,
    });
    expect(answers.approver.approve).not.toHaveBeenCalled();
    expect(answers.reportNotMe).not.toHaveBeenCalled();
  });

  it("never opens a page outside /sign-in/", async () => {
    expect(
      await answerTap(
        "",
        { url: "https://elsewhere.example/", signIn },
        answering("approved"),
        NOW
      )
    ).toEqual({ notification: null, open: review });
  });
});
