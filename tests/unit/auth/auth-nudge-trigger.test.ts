// Regression guard for the nudge-copy consolidation
// (docs/superpowers/specs/active/2026-07-18-onboarding-nudge-copy-export-gate.md).
// AUTH_NUDGE_TEXTS is the single source of the guest→account "ask" copy;
// this locks the collapsed phrasing so a future edit can't silently
// reintroduce a competing "Sign up free" / "Create Account - free" variant.

import { describe, expect, it } from "vitest";
import {
  AUTH_NUDGE_TEXTS,
  getAuthPromptContent,
  type AuthNudgeTrigger,
} from "$lib/shared/auth/domain/auth-nudge-trigger";
import { GUEST_SAVE_CAP } from "$lib/shared/auth/domain/guest-access-config";

const BANNED_PHRASES = [
  "Sign up free",
  "sign up free",
  "Create Account - free",
  "unlock",
  "Unlock",
];

const entries = Object.entries(AUTH_NUDGE_TEXTS) as [
  AuthNudgeTrigger,
  string,
][];

describe("AUTH_NUDGE_TEXTS — one phrasing for the account ask", () => {
  it("includes the live triggers, including the save limit", () => {
    expect(Object.keys(AUTH_NUDGE_TEXTS).sort()).toEqual(
      [
        "step-cap-guest",
        "community-setups",
        "edit-community",
        "export",
        "guest-first-save",
        "loop-locked-guest",
        "module:learn",
        "module:library",
        "module:settings",
        "patterns-guest",
        "prop-collection",
        "save",
        "save-limit",
        "saved-setups",
        "share-collection",
        "share-image-signin",
        "share-sequence",
        "share-setup",
        "viewer-signin-account",
        "viewer-signin-download",
        "viewer-signin-publish",
      ].sort()
    );
  });

  it("every entry avoids the competing phrasings the audit flagged", () => {
    for (const [trigger, text] of entries) {
      for (const banned of BANNED_PHRASES) {
        expect(
          text,
          `${trigger} contains banned phrase "${banned}"`
        ).not.toContain(banned);
      }
    }
  });

  it("every entry uses the canonical 'create a free account' ask (case-insensitive)", () => {
    for (const [trigger, text] of entries) {
      expect(
        text.toLowerCase(),
        `${trigger} missing canonical ask phrase`
      ).toContain("create a free account");
    }
  });

  it("no entry contains an em dash (writing-guide rule)", () => {
    for (const [trigger, text] of entries) {
      expect(text, `${trigger} contains an em dash`).not.toMatch(/—/);
    }
  });

  it("the save cap nudge interpolates GUEST_SAVE_CAP, not a hardcoded number", () => {
    expect(AUTH_NUDGE_TEXTS.save).toContain(`${GUEST_SAVE_CAP}`);
  });

  it("the loop-locked-guest nudge leads with the ask, not a rotated-LOOP lesson", () => {
    const text = AUTH_NUDGE_TEXTS["loop-locked-guest"];
    // 2026-08-10 decision: a guest hits this after tapping a locked type
    // (Mirrored, Inverted, ...), so opening with a definition of rotated
    // LOOPs reads as a non sequitur. The nudge opens with the account ask;
    // what "rotated" means belongs to the guide, not this modal.
    expect(text.startsWith("Create a free account")).toBe(true);
    expect(text).not.toContain("sequences that");
    // Rotated LOOPs may appear only as the what-stays-free note, degree-free.
    expect(text).not.toContain("180°");
    expect(text).not.toContain("90°");
    // Domain rule: "turn" is reserved for prop/body turns, never a LOOP's
    // rotation slice (tka-domain.md).
    expect(text.toLowerCase()).not.toMatch(/\bturns?\b/);
  });
});

describe("contextual auth prompt copy", () => {
  it("covers every live trigger with stable content", () => {
    for (const [trigger] of entries) {
      const content = getAuthPromptContent(trigger, "signup");
      expect(content.key).toBe(trigger);
      expect(content.title.trim()).not.toBe("");
      expect(content.body.trim()).not.toBe("");
      expect(`${content.title} ${content.body}`).not.toMatch(/—/);
    }
  });

  it("keeps the approved share, library, and sequence-limit prompts", () => {
    expect(getAuthPromptContent("share-sequence", "signup")).toMatchObject({
      title: "Share this sequence",
      body: "Sign in or create an account to send it, make a link, or download a Choreo Card.",
    });
    expect(getAuthPromptContent("guest-first-save", "signup")).toMatchObject({
      title: "Save this sequence",
      body: "A free account keeps it in your library and opens it on any device.",
    });
    expect(getAuthPromptContent("step-cap-guest", "signup")).toMatchObject({
      title: "Eight is the guest limit.",
      body: "A free account gets you up to 64 steps.",
    });
  });

  it("uses mode-specific copy when an account button opened the modal directly", () => {
    expect(getAuthPromptContent(null, "signup").title).toBe(
      "Create your account"
    );
    expect(getAuthPromptContent(null, "signin").title).toBe("Welcome back");
  });
});
