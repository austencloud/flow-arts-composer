import { describe, expect, it } from "vitest";
import { parseSoftwareSubmission } from "#lib/server/software-submissions/software-submission-input.js";

describe("parseSoftwareSubmission", () => {
  it("trims a valid submission", () => {
    expect(
      parseSoftwareSubmission({
        name: "  SpiroAnim  ",
        url: "  https://example.com/spiroanim  ",
        notes: "  Early desktop tool  ",
        website: "",
      })
    ).toEqual({
      ok: true,
      spam: false,
      value: {
        name: "SpiroAnim",
        url: "https://example.com/spiroanim",
        notes: "Early desktop tool",
      },
    });
  });

  it("accepts blank optional fields", () => {
    expect(
      parseSoftwareSubmission({ name: "Tool", url: "", notes: "" })
    ).toMatchObject({ ok: true, spam: false });
  });

  it("silently catches a filled honeypot", () => {
    expect(
      parseSoftwareSubmission({ name: 3, url: null, website: "bot.example" })
    ).toEqual({ ok: true, spam: true });
  });

  it.each([null, [], "submission", 4])(
    "rejects a non-object body: %j",
    (body) => {
      expect(parseSoftwareSubmission(body)).toMatchObject({ ok: false });
    }
  );

  it("rejects unexpected fields", () => {
    expect(
      parseSoftwareSubmission({
        name: "Tool",
        url: "",
        notes: "",
        role: "admin",
      })
    ).toEqual({
      ok: false,
      error: "That submission contains unexpected fields.",
    });
  });

  it.each(["", "x", "x".repeat(121)])(
    "rejects an invalid name length",
    (name) => {
      expect(
        parseSoftwareSubmission({ name, url: "", notes: "" })
      ).toMatchObject({ ok: false });
    }
  );

  it.each([
    "example.com/tool",
    "mailto:builder@example.com",
    "javascript:alert(1)",
  ])("rejects an unsafe or incomplete URL: %s", (url) => {
    expect(
      parseSoftwareSubmission({ name: "Tool", url, notes: "" })
    ).toMatchObject({ ok: false });
  });

  it("enforces the URL and notes limits", () => {
    expect(
      parseSoftwareSubmission({ name: "Tool", url: "x".repeat(501), notes: "" })
    ).toMatchObject({ ok: false });
    expect(
      parseSoftwareSubmission({
        name: "Tool",
        url: "",
        notes: "x".repeat(2001),
      })
    ).toMatchObject({ ok: false });
  });
});
