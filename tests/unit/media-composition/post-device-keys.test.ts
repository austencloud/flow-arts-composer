import { describe, expect, it } from "vitest";
import { TKA_DEVICE_KEYS } from "#lib/shared/media-composition/services/post-project-store.js";

const P = "tka:post-studio:project:v2:";
const account = { ownerId: "account:u1", subjectId: "seq" };
const guest = { ownerId: "guest", subjectId: "seq" };
const device = { ownerId: "device", subjectId: "seq" };

describe("tka device keys (seam design B table)", () => {
  it("keeps the project keys", () => {
    expect(TKA_DEVICE_KEYS.project(account)).toBe(`${P}account:u1:seq`);
    expect(TKA_DEVICE_KEYS.project(guest)).toBe(`${P}guest:seq`);
    expect(TKA_DEVICE_KEYS.project(device)).toBe(`${P}seq`);
  });

  it("keeps the spare copy keys", () => {
    expect(TKA_DEVICE_KEYS.previous(account)).toBe(
      `${P}account:u1:seq:previous`
    );
    expect(TKA_DEVICE_KEYS.previous(guest)).toBe(`${P}guest:seq:previous`);
    expect(TKA_DEVICE_KEYS.previous(device)).toBe(`${P}previous:seq`);
  });

  it("keeps the before-import keys", () => {
    expect(TKA_DEVICE_KEYS.beforeImport(account)).toBe(
      `${P}account:u1:seq:before-import`
    );
    expect(TKA_DEVICE_KEYS.beforeImport(guest)).toBe(`${P}before-import:seq`);
    expect(TKA_DEVICE_KEYS.beforeImport(device)).toBe(`${P}before-import:seq`);
  });

  it("keeps the history key", () => {
    expect(TKA_DEVICE_KEYS.history(account)).toBe(
      "tka:post-studio:history:v1:seq"
    );
    expect(TKA_DEVICE_KEYS.history(device)).toBe(
      "tka:post-studio:history:v1:seq"
    );
  });

  it("knows the spare copies", () => {
    expect(TKA_DEVICE_KEYS.isSpareCopy(`${P}account:u1:seq:previous`)).toBe(
      true
    );
    expect(TKA_DEVICE_KEYS.isSpareCopy(`${P}previous:seq`)).toBe(true);
    expect(TKA_DEVICE_KEYS.isSpareCopy(`${P}seq`)).toBe(false);
    expect(TKA_DEVICE_KEYS.isSpareCopy("other:previous")).toBe(false);
  });
});
