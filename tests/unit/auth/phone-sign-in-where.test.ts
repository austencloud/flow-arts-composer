import { describe, expect, it } from "vitest";
import {
  offersPhoneSignIn,
  pathAfterPhoneSignIn,
} from "#lib/shared/auth/phone-sign-in/where.js";

const at = (hostname: string, pathname = "/create") => ({ hostname, pathname });

describe("offersPhoneSignIn", () => {
  it.each([
    "localhost",
    "LOCALHOST",
    "127.0.0.1",
    "[::1]",
    "wall-plane.localhost",
    "dev.tkaflowarts.com",
    "192.168.1.20",
    "10.0.0.5",
    "172.20.3.4",
  ])("shows on %s, a copy Austen runs himself", (host) => {
    expect(offersPhoneSignIn(at(host), false)).toBe(true);
  });

  it.each([
    "tkaflowarts.com",
    "www.tkaflowarts.com",
    "the-kinetic-alphabet.pages.dev",
    "localhost.example.com",
    "172.32.0.1",
    "8.8.8.8",
  ])("stays hidden on %s", (host) => {
    expect(offersPhoneSignIn(at(host), false)).toBe(false);
  });

  it("stays hidden in the native app, even on a local host", () => {
    expect(offersPhoneSignIn(at("localhost"), true)).toBe(false);
  });

  it("stays hidden on the phone sign-in pages themselves", () => {
    expect(offersPhoneSignIn(at("localhost", "/phone-sign-in"), false)).toBe(
      false
    );
    expect(
      offersPhoneSignIn(at("localhost", "/sign-in/AbCdEfGhIjKlMnOpQr12"), false)
    ).toBe(false);
  });
});

describe("pathAfterPhoneSignIn", () => {
  const after = (next: string | null) =>
    pathAfterPhoneSignIn(new URLSearchParams(next === null ? "" : { next }));

  it("goes to a path on this site, keeping its query and hash", () => {
    expect(after("/create?tab=gen#top")).toBe("/create?tab=gen#top");
  });

  it.each([
    null,
    "",
    "create",
    "https://evil.example/x",
    "//evil.example/x",
    "/\\evil.example/x",
    "/\t/evil.example/x",
    "javascript:alert(1)",
    "/phone-sign-in",
  ])("falls back to home for %j", (next) => {
    expect(after(next)).toBe("/");
  });
});
