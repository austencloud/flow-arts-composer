import {
  createFeedbackEmail,
  createMessageEmail,
  createNotificationMailId,
  createPlatformUpdateEmail,
  getEmailPreferenceForNotificationType,
  queueUserNotificationEmail,
  readEntryMedia,
  wantsNotificationEmail,
  type NotificationEmailDependencies,
} from "./notificationEmailQueue";
import { readUnsubscribeToken } from "./unsubscribeToken";

function dependencies(
  overrides: Partial<NotificationEmailDependencies> = {}
): NotificationEmailDependencies {
  return {
    getPreferences: jest.fn(async () => ({
      emailEnabled: true,
      emailMessages: true,
    })),
    getAuthUser: jest.fn(async () => ({
      email: "reader@example.com",
      emailVerified: true,
      disabled: false,
    })),
    createMailIfAbsent: jest.fn(async () => true),
    ...overrides,
  };
}

describe("notification email policy", () => {
  it("requires both the email master switch and requested category", () => {
    expect(
      wantsNotificationEmail(
        { emailEnabled: true, emailMessages: true },
        "emailMessages"
      )
    ).toBe(true);
    expect(
      wantsNotificationEmail(
        { emailEnabled: false, emailMessages: true },
        "emailMessages"
      )
    ).toBe(false);
    expect(
      wantsNotificationEmail(
        { emailEnabled: true, emailMessages: false },
        "emailMessages"
      )
    ).toBe(false);
  });

  it("routes only feedback outcomes through the feedback email category", () => {
    expect(getEmailPreferenceForNotificationType("feedback-resolved")).toBe(
      "emailFeedback"
    );
    expect(getEmailPreferenceForNotificationType("feedback-response")).toBe(
      "emailFeedback"
    );
    expect(getEmailPreferenceForNotificationType("sequence-liked")).toBeNull();
  });

  it("uses a stable per-event, per-recipient queue ID", () => {
    const first = createNotificationMailId("message", "message-1", "user-1");
    expect(createNotificationMailId("message", "message-1", "user-1")).toBe(
      first
    );
    expect(createNotificationMailId("message", "message-1", "user-2")).not.toBe(
      first
    );
  });
});

describe("queueUserNotificationEmail", () => {
  it("queues once for an opted-in user with a verified email", async () => {
    const deps = dependencies();

    const result = await queueUserNotificationEmail(
      {
        userId: "user-1",
        preferenceKey: "emailMessages",
        sourceType: "message",
        sourceId: "message-1",
        email: createMessageEmail("Austen", "conversation-1"),
      },
      deps
    );

    expect(result.state).toBe("queued");
    expect(deps.createMailIfAbsent).toHaveBeenCalledTimes(1);
    expect(deps.createMailIfAbsent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        to: ["reader@example.com"],
        metadata: expect.objectContaining({ sourceId: "message-1" }),
      })
    );
  });

  it("signs List-Unsubscribe headers for the preference being emailed", async () => {
    const deps = dependencies({
      getPreferences: jest.fn(async () => ({
        emailEnabled: true,
        emailPlatformUpdates: true,
      })),
      getUnsubscribeSecret: () => "test-secret",
    });

    await queueUserNotificationEmail(
      {
        userId: "user-1",
        preferenceKey: "emailPlatformUpdates",
        sourceType: "platform-update",
        sourceId: "version-1",
        email: createPlatformUpdateEmail({ version: "1.2.3" }),
      },
      deps
    );

    const mail = (deps.createMailIfAbsent as jest.Mock).mock.calls[0][1];
    expect(mail.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click"
    );
    const header: string = mail.headers["List-Unsubscribe"];
    const url = header.slice(1, -1);
    expect(
      readUnsubscribeToken(new URL(url).searchParams.get("t"), "test-secret")
    ).toEqual({ userId: "user-1", preferenceKey: "emailPlatformUpdates" });
  });

  it("adds no headers when no signing secret is configured", async () => {
    const deps = dependencies();

    await queueUserNotificationEmail(
      {
        userId: "user-1",
        preferenceKey: "emailMessages",
        sourceType: "message",
        sourceId: "message-2",
        email: createMessageEmail("Austen", "conversation-1"),
      },
      deps
    );

    expect(
      (deps.createMailIfAbsent as jest.Mock).mock.calls[0][1]
    ).not.toHaveProperty("headers");
  });

  it("does not queue for an unverified email address", async () => {
    const deps = dependencies({
      getAuthUser: jest.fn(async () => ({
        email: "reader@example.com",
        emailVerified: false,
        disabled: false,
      })),
    });

    const result = await queueUserNotificationEmail(
      {
        userId: "user-1",
        preferenceKey: "emailMessages",
        sourceType: "message",
        sourceId: "message-1",
        email: createMessageEmail("Austen", "conversation-1"),
      },
      deps
    );

    expect(result).toEqual({
      state: "skipped",
      reason: "email-unavailable",
    });
    expect(deps.createMailIfAbsent).not.toHaveBeenCalled();
  });

  it("treats an existing deterministic mail document as delivered work", async () => {
    const deps = dependencies({
      createMailIfAbsent: jest.fn(async () => false),
    });

    const result = await queueUserNotificationEmail(
      {
        userId: "user-1",
        preferenceKey: "emailMessages",
        sourceType: "message",
        sourceId: "message-1",
        email: createMessageEmail("Austen", "conversation-1"),
      },
      deps
    );

    expect(result).toEqual({ state: "skipped", reason: "already-queued" });
  });
});

describe("notification email content", () => {
  it("keeps private chat content out of message email", () => {
    const email = createMessageEmail("Sky <script>", "conversation-1");

    expect(email.subject).toBe("New message from Sky <script>");
    expect(email.text).not.toContain("messagePreview");
    expect(email.html).toContain("Sky &lt;script&gt;");
    expect(email.html).not.toContain("Sky <script>");
  });

  it("escapes feedback copy before placing it in HTML", () => {
    const email = createFeedbackEmail({
      type: "feedback-resolved",
      feedbackId: "feedback-1",
      feedbackTitle: "Broken <button>",
      message: "Fixed <strong>today</strong>",
    });

    expect(email.html).toContain("Broken &lt;button&gt;");
    expect(email.html).toContain("Fixed &lt;strong&gt;today&lt;/strong&gt;");
    expect(email.html).not.toContain("<strong>today</strong>");
  });

  it("shows the release hero linked to the lead, and drops a non-https one", () => {
    const highlight =
      "**New in Explore: [Zan's Diamond](https://tkaflowarts.com/c/5YMQ), 24 versions.** Each one delays a hand.";
    const withHero = createPlatformUpdateEmail({
      version: "0.48.0",
      highlights: [highlight],
      heroImage: {
        url: "https://assets.tkaflowarts.com/email/releases/0.48.0/hero.gif",
      },
    });

    expect(withHero.html).toContain(
      '<a href="https://tkaflowarts.com/c/5YMQ" target="_blank" style="text-decoration:none"><img src="https://assets.tkaflowarts.com/email/releases/0.48.0/hero.gif"'
    );
    expect(withHero.html).toContain('alt="Zan&#39;s Diamond, 24 versions"');

    const insecure = createPlatformUpdateEmail({
      version: "0.48.0",
      highlights: [highlight],
      heroImage: { url: "http://example.com/hero.gif" },
    });
    expect(insecure.html).not.toContain("example.com");
  });

  it("renders release Markdown instead of leaking its markers", () => {
    const highlight =
      "**New in Explore: [Zan's Diamond](https://tkaflowarts.com/browse/explore/collections/abc), 24 versions of one pattern.** Each one delays a hand.";
    const email = createPlatformUpdateEmail({
      version: "0.47.0",
      highlights: [highlight],
      changelogEntries: [
        { category: "added", text: highlight },
        {
          category: "improved",
          text: "Saving now happens in [Create](/create/construct).",
        },
        {
          category: "fixed",
          text: "A [bad link](javascript:alert(1)) stays text.",
        },
      ],
    });

    for (const part of [email.html, email.text]) {
      expect(part).not.toContain("**");
      expect(part).not.toContain("](");
    }
    expect(email.html).toContain(
      "Zan&#39;s Diamond, 24 versions of one pattern</h1>"
    );
    expect(email.html).toContain(
      'href="https://tkaflowarts.com/browse/explore/collections/abc"'
    );
    expect(email.html).toContain("Open Zan&#39;s Diamond");
    expect(email.html).toContain(
      'href="https://tkaflowarts.com/create/construct"'
    );
    expect(email.html).not.toContain("javascript:");
    // The lead highlight is the headline, so it is not repeated in the list.
    expect(email.html.split("24 versions of one pattern").length).toBe(2);
    expect(email.text).toContain(
      "Create (https://tkaflowarts.com/create/construct)"
    );
  });

  it("shows a change's example under its line, ahead of changes without one", () => {
    const gif =
      "https://assets.tkaflowarts.com/email/releases/0.49.0/effects.gif";
    const email = createPlatformUpdateEmail({
      version: "0.49.0",
      highlights: ["**Browse has a home screen.** Tiles play."],
      changelogEntries: [
        { category: "improved", text: "One." },
        { category: "improved", text: "Two." },
        { category: "improved", text: "Three." },
        {
          category: "improved",
          text: "Four effects were rebuilt.",
          media: { image: gif, alt: "Four effects", width: 1040, height: 1040 },
        },
      ],
    });

    // Only three changes fit a section; the one with a picture is kept.
    expect(email.html).toContain("Four effects were rebuilt.");
    expect(email.html).not.toContain("Three.");
    // Drawn at the list column's width, not the file's.
    expect(email.html).toContain(
      `<img src="${gif}" width="500" height="500" alt="Four effects"`
    );
    expect(email.html.indexOf("Four effects were rebuilt.")).toBeLessThan(
      email.html.indexOf(gif)
    );
  });

  it("keeps a clip ahead of still pictures when a section is full", () => {
    const releases = "https://assets.tkaflowarts.com/email/releases/0.49.0";
    const still = (name: string) => ({
      category: "improved" as const,
      text: `${name} page.`,
      media: {
        image: `${releases}/${name}.jpg`,
        alt: name,
        width: 1280,
        height: 800,
      },
    });
    const email = createPlatformUpdateEmail({
      version: "0.49.0",
      highlights: ["**Browse has a home screen.** Tiles play."],
      changelogEntries: [
        still("props"),
        still("codex"),
        still("zans"),
        {
          category: "improved",
          text: "Four effects were rebuilt.",
          media: {
            image: `${releases}/effects.gif`,
            video: `${releases}/effects.mp4`,
            alt: "Four effects",
            width: 500,
            height: 500,
          },
        },
      ],
    });

    // Three pictures came first in the notes, but the clip is what stays.
    expect(email.html).toContain(`${releases}/effects.gif`);
    expect(email.html).not.toContain(`${releases}/zans.jpg`);
  });

  it("uses the lead change's example as the hero when none was made", () => {
    const lead = "**Browse has a home screen.** Tiles play.";
    const gif =
      "https://assets.tkaflowarts.com/email/releases/0.49.0/browse.gif";
    const email = createPlatformUpdateEmail({
      version: "0.49.0",
      highlights: [lead],
      changelogEntries: [
        {
          category: "added",
          text: lead,
          media: { image: gif, alt: "Browse home", width: 520, height: 520 },
        },
      ],
    });
    expect(email.html.split(gif).length).toBe(2);
    expect(email.html.indexOf(gif)).toBeLessThan(
      email.html.indexOf("Browse has a home screen</h1>")
    );
  });

  it("reads only complete https entry media from a version record", () => {
    const media = {
      image: "https://assets.tkaflowarts.com/a.gif",
      video: "https://assets.tkaflowarts.com/a.mp4",
      alt: "A",
      width: 520,
      height: 520,
    };
    expect(readEntryMedia(media)).toEqual(media);
    expect(readEntryMedia({ ...media, video: "http://x/a.mp4" })).toEqual({
      image: media.image,
      alt: "A",
      width: 520,
      height: 520,
    });
    expect(
      readEntryMedia({ ...media, image: "http://x/a.gif" })
    ).toBeUndefined();
    expect(readEntryMedia({ ...media, width: 0 })).toBeUndefined();
    expect(readEntryMedia("a.gif")).toBeUndefined();
  });

  it("links each notification to its canonical app route", () => {
    const message = createMessageEmail("Austen", "conversation-1");
    const feedback = createFeedbackEmail({
      type: "feedback-resolved",
      feedbackId: "feedback-1",
      message: "Fixed",
    });
    const release = createPlatformUpdateEmail({ version: "1.2.3" });

    expect(message.text).toContain(
      "https://tkaflowarts.com/create?sheet=inbox&conversation=conversation-1"
    );
    expect(message.text).toContain(
      "https://tkaflowarts.com/settings/notifications"
    );
    expect(feedback.text).toContain(
      "https://tkaflowarts.com/feedback/my-feedback?feedback=feedback-1"
    );
    expect(release.text).toContain(
      "https://tkaflowarts.com/settings/release-notes"
    );
  });
});
