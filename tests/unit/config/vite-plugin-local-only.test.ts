import { describe, expect, it } from "vitest";
import { isLocalDevRequest } from "../../../src/config/vite-plugin-local-only";

describe("isLocalDevRequest", () => {
  it("passes local hosts with and without a port", () => {
    expect(isLocalDevRequest({ host: "localhost:5173" })).toBe(true);
    expect(isLocalDevRequest({ host: "[::1]:5173" })).toBe(true);
    expect(isLocalDevRequest({ host: "127.0.0.1" })).toBe(true);
    expect(isLocalDevRequest({ host: "app.localhost:5173" })).toBe(true);
  });

  it("reads HTTP/2 :authority", () => {
    expect(isLocalDevRequest({ ":authority": "localhost:5173" })).toBe(true);
    expect(isLocalDevRequest({ ":authority": "dev.tkaflowarts.com" })).toBe(false);
  });

  it("refuses tunnel and public hostnames", () => {
    expect(isLocalDevRequest({ host: "dev.tkaflowarts.com" })).toBe(false);
    expect(isLocalDevRequest({ host: "x.trycloudflare.com" })).toBe(false);
    expect(isLocalDevRequest({ host: "localhost.evil.com" })).toBe(false);
  });

  it("refuses a local Host that carries a forwarding header", () => {
    expect(
      isLocalDevRequest({ host: "localhost:5173", "cf-connecting-ip": "1.2.3.4" }),
    ).toBe(false);
    expect(
      isLocalDevRequest({ host: "localhost:5173", "x-forwarded-for": "1.2.3.4" }),
    ).toBe(false);
  });

  it("refuses a request with no Host", () => {
    expect(isLocalDevRequest({})).toBe(false);
  });
});
