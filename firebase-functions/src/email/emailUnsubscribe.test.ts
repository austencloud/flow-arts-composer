import { handleUnsubscribe } from "./emailUnsubscribe";
import {
  createUnsubscribeToken,
  listUnsubscribeHeaders,
  readUnsubscribeToken,
} from "./unsubscribeToken";

const SECRET = "test-secret";
const claim = {
  userId: "user-1",
  preferenceKey: "emailPlatformUpdates",
} as const;

function deps() {
  return { turnOffPreference: jest.fn(async () => undefined) };
}

describe("unsubscribe token", () => {
  it("round-trips a claim and rejects a wrong secret, tampering and bare uids", () => {
    const token = createUnsubscribeToken(claim, SECRET);
    expect(readUnsubscribeToken(token, SECRET)).toEqual(claim);
    expect(readUnsubscribeToken(token, "other-secret")).toBeNull();
    expect(readUnsubscribeToken("user-1", SECRET)).toBeNull();
    expect(readUnsubscribeToken(undefined, SECRET)).toBeNull();

    const [payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ v: 1, u: "user-2", k: "emailPlatformUpdates" })
    ).toString("base64url");
    expect(readUnsubscribeToken(`${forged}.${signature}`, SECRET)).toBeNull();
    expect(readUnsubscribeToken(`${payload}.`, SECRET)).toBeNull();
  });

  it("rejects a signed token naming a preference it may not switch off", () => {
    const payload = Buffer.from(
      JSON.stringify({ v: 1, u: "user-1", k: "emailEnabled" })
    ).toString("base64url");
    const { createHmac } = jest.requireActual("crypto");
    const signature = createHmac("sha256", SECRET)
      .update(payload)
      .digest("base64url");
    expect(readUnsubscribeToken(`${payload}.${signature}`, SECRET)).toBeNull();
  });

  it("builds both headers for one-click unsubscribe", () => {
    const headers = listUnsubscribeHeaders(claim, SECRET);
    expect(headers["List-Unsubscribe"]).toMatch(/^<https:\/\/.+\?t=.+>$/);
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

describe("handleUnsubscribe", () => {
  const token = createUnsubscribeToken(claim, SECRET);

  it("turns the preference off on a valid POST", async () => {
    const d = deps();
    const result = await handleUnsubscribe(
      { method: "POST", token },
      SECRET,
      d
    );
    expect(result.status).toBe(200);
    expect(d.turnOffPreference).toHaveBeenCalledWith(claim);
  });

  it("changes nothing on GET, so mail scanners can't unsubscribe anyone", async () => {
    const d = deps();
    const result = await handleUnsubscribe({ method: "GET", token }, SECRET, d);
    expect(result.status).toBe(200);
    expect(result.html).toContain("<form");
    expect(d.turnOffPreference).not.toHaveBeenCalled();
  });

  it("rejects a bad token and other methods without writing", async () => {
    const d = deps();
    const bad = await handleUnsubscribe(
      { method: "POST", token: "x.y" },
      SECRET,
      d
    );
    const put = await handleUnsubscribe({ method: "PUT", token }, SECRET, d);
    expect(bad.status).toBe(400);
    expect(put.status).toBe(405);
    expect(d.turnOffPreference).not.toHaveBeenCalled();
  });
});
