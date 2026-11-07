import { describe, expect, it } from "vitest";
import { mayRingPhone } from "#lib/server/auth/phone-sign-in-local.js";

// One tap on the notification approves from any network, so a request that
// reaches the phone from anywhere but this machine would let a stranger ring
// the owner's phone and hope for a tap. Nothing on screen shows this going wrong.
function incoming(
  url: string,
  headers: Record<string, string> = {},
  dev = true
) {
  return { dev, url: new URL(url), headers: new Headers(headers) };
}

describe("mayRingPhone", () => {
  it.each([
    "https://localhost:5173/api/phone-sign-in",
    "https://LOCALHOST:5173/api/phone-sign-in",
    "http://127.0.0.1:5173/api/phone-sign-in",
    "https://127.9.9.9/api/phone-sign-in",
    "https://[::1]:5173/api/phone-sign-in",
    "https://copy-two.localhost:5180/api/phone-sign-in",
    "http://10.0.0.5:5173/api/phone-sign-in",
    "http://172.16.0.1:5173/api/phone-sign-in",
    "http://172.31.255.255:5173/api/phone-sign-in",
    "http://192.168.1.20:5173/api/phone-sign-in",
  ])("rings for a dev server at %s", (url) => {
    expect(mayRingPhone(incoming(url))).toBe(true);
  });

  it("never rings on the live site", () => {
    expect(
      mayRingPhone(
        incoming("https://tkaflowarts.com/api/phone-sign-in", {}, false)
      )
    ).toBe(false);
  });

  it("never rings from a production build, even on localhost", () => {
    expect(
      mayRingPhone(incoming("https://localhost:4173/x", {}, false))
    ).toBe(false);
  });

  it("never rings through the tunnel's host", () => {
    expect(
      mayRingPhone(incoming("https://dev.tkaflowarts.com/api/phone-sign-in"))
    ).toBe(false);
  });

  it.each([
    "cf-connecting-ip",
    "cf-ray",
    "cdn-loop",
    "x-forwarded-for",
    "x-forwarded-host",
    "forwarded",
  ])("never rings when a tunnel rewrote the host but left %s", (header) => {
    expect(
      mayRingPhone(
        incoming("https://localhost:5173/api/phone-sign-in", {
          [header]: "anything",
        })
      )
    ).toBe(false);
  });

  it.each([
    "http://8.8.8.8/x",
    "http://172.15.0.1/x",
    "http://172.32.0.1/x",
    "http://192.169.0.1/x",
    "http://11.0.0.1/x",
    // Names dressed up as local or private addresses.
    "http://localhost.evil.example/x",
    "http://10.0.0.1.evil.example/x",
    "http://192.168.1.1.nip.io/x",
    "http://evillocalhost/x",
  ])("never rings for %s", (url) => {
    expect(mayRingPhone(incoming(url))).toBe(false);
  });
});
