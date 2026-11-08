import { describe, expect, it } from "vitest";
import {
  cleanPushName,
  cleanPushText,
  PUSH_NAME_MAX,
} from "../../../firebase-functions/src/push/pushText";

describe("push text from what people wrote", () => {
  it("keeps a forged second line on the first", () => {
    expect(cleanPushName("Ann\nYour account is locked\r\tTap here")).toBe(
      "Ann Your account is locked Tap here"
    );
    const c = String.fromCharCode;
    expect(cleanPushName(`Ann${c(0x2028)}Bob${c(0)}${c(0x9b)}`)).toBe("Ann Bob");
  });

  it("cuts a long name to 40 characters with an ellipsis", () => {
    const name = cleanPushName("x".repeat(500));
    expect(Array.from(name)).toHaveLength(PUSH_NAME_MAX);
    expect(name.endsWith("…")).toBe(true);
  });

  it("never splits an emoji", () => {
    const name = cleanPushName("🔥".repeat(60));
    expect(name).toBe(`${"🔥".repeat(PUSH_NAME_MAX - 1)}…`);
  });

  it("falls back when nothing printable is left, or it is not text", () => {
    expect(cleanPushName("\n\t  ")).toBe("Someone");
    expect(cleanPushName(undefined)).toBe("Someone");
    expect(cleanPushName({ evil: true })).toBe("Someone");
    expect(cleanPushText(42, 10)).toBe("");
  });

  it("leaves an ordinary name alone", () => {
    expect(cleanPushName("Renée Müller")).toBe("Renée Müller");
  });
});
