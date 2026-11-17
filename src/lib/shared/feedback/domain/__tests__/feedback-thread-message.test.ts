import { describe, expect, it } from "vitest";
import {
  buildFeedbackAttachment,
  buildFeedbackMessageText,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  feedbackIdFromMessageId,
  feedbackMessageId,
  isFeedbackMessageId,
} from "../feedback-thread-message";

describe("buildFeedbackMessageText", () => {
  it("carries the person's own words in full", () => {
    const description =
      "The tempo slider jumps back to 1x every time I switch tabs. " +
      "It would help if it remembered where I left it.";
    expect(
      buildFeedbackMessageText({ title: "The tempo slider", description })
    ).toBe(description);
  });

  it("keeps a long message whole up to the inbox limit", () => {
    const description = "a".repeat(FEEDBACK_MESSAGE_MAX_LENGTH);
    expect(buildFeedbackMessageText({ title: "t", description })).toBe(
      description
    );
  });

  it("cuts with an ellipsis past the inbox limit", () => {
    const description = "word ".repeat(1000);
    const text = buildFeedbackMessageText({ title: "t", description });
    expect(text.length).toBeLessThanOrEqual(FEEDBACK_MESSAGE_MAX_LENGTH);
    expect(text.endsWith("…")).toBe(true);
    expect(description.startsWith(text.slice(0, -1))).toBe(true);
  });

  it("turns an automatic error report into one plain line", () => {
    const text = buildFeedbackMessageText({
      title: "[Auto] Failed to load the sequence",
      description:
        "## Auto-generated Bug Report\n\n**Error Message:** Failed to load\n\n### Context\n- **Module:** create",
    });
    expect(text).toBe("Automatic error report: Failed to load the sequence");
    expect(text).not.toContain("\n");
    expect(text).not.toContain("##");
  });

  it("never sends the old placeholder", () => {
    expect(
      buildFeedbackMessageText({ title: "x", description: "Real words here" })
    ).not.toBe("[Feedback submitted]");
  });
});

describe("feedback message ids", () => {
  it("maps one feedback item to one stable id and back", () => {
    const id = feedbackMessageId("abc123");
    expect(id).toBe(feedbackMessageId("abc123"));
    expect(isFeedbackMessageId(id)).toBe(true);
    expect(feedbackIdFromMessageId(id)).toBe("abc123");
    expect(isFeedbackMessageId("3f1c-random-uuid")).toBe(false);
  });

  it("only uses characters the delivery callable accepts", () => {
    expect(feedbackMessageId("Ab9_xYz-01")).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
  });
});

describe("buildFeedbackAttachment", () => {
  it("keeps the card within the callable's field limits", () => {
    const attachment = buildFeedbackAttachment({
      feedbackId: "f1",
      title: "t".repeat(400),
      type: "bug",
      description: "d".repeat(400),
    });
    expect(attachment.type).toBe("feedback");
    expect(attachment.url).toBe("/feedback/f1");
    expect(
      String(attachment.metadata?.feedbackTitle).length
    ).toBeLessThanOrEqual(240);
    expect(String(attachment.metadata?.feedbackDescription)).toHaveLength(200);
  });
});
