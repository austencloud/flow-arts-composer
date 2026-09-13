/**
 * AUDIT (read-only): what an R2 presigned PUT URL actually binds.
 *
 * `r2PresignUrl` validates a CLIENT-SUPPLIED `contentLength` against a 500 MB /
 * 10 MB ceiling and a CLIENT-SUPPLIED `contentType` against an allowlist, then
 * signs a `PutObjectCommand` carrying Bucket/Key/ContentType. SigV4 binds a
 * presigned URL only to what it signs, so whether either check survives into
 * the actual upload is decided by the generated URL — which these tests read.
 *
 * Pure crypto, fixed credentials, no network and no real bucket.
 */
import { describe, expect, it } from "vitest";
import {
  getPresignedPutUrl,
  getR2Client,
  MAX_THUMBNAIL_FILE_SIZE,
  MAX_VIDEO_FILE_SIZE,
} from "../../firebase-functions/src/r2/r2-client";

const client = getR2Client(
  "test-account",
  "AKIAAUDITKEY",
  "audit-secret-value"
);
const BUCKET = "tka-assets-audit";

async function signedHeadersFor(
  key: string,
  contentType: string
): Promise<string[]> {
  const url = await getPresignedPutUrl(client, BUCKET, key, contentType);
  const signed = new URL(url).searchParams.get("X-Amz-SignedHeaders") ?? "";
  return signed.split(";").filter(Boolean);
}

describe("what the presigned PUT URL binds", () => {
  it("signs host only — not content-length, not content-type", async () => {
    const headers = await signedHeadersFor(
      "users/uid-1/videos/seq-1/clip.mp4",
      "video/mp4"
    );

    expect(headers).toEqual(["host"]);
    // Both checks performed at presign time bind nothing in the signature: the
    // URL holder may PUT any number of bytes under any Content-Type.
    expect(headers).not.toContain("content-length");
    expect(headers).not.toContain("content-type");
  });

  it("does not hoist the content type into the query string either", async () => {
    // A presigner may move an unsignable header into a signed query parameter.
    // This one does not, so nothing in the URL constrains the upload's type.
    const url = await getPresignedPutUrl(
      client,
      BUCKET,
      "users/uid-1/thumbnails/seq-1/thumb.png",
      "image/png"
    );
    const params = [...new URL(url).searchParams.keys()].map((k) =>
      k.toLowerCase()
    );

    expect(params).not.toContain("content-type");
    expect(params.some((k) => k.includes("content-type"))).toBe(false);
    expect(new URL(url).searchParams.get("X-Amz-Content-Sha256")).toBe(
      "UNSIGNED-PAYLOAD"
    );
  });

  it("yields the same URL for a 1-byte and a ceiling-sized declaration", async () => {
    // The callable's only size input is `contentLength`, and it never reaches
    // the signer — the two presign calls differ in nothing but wall-clock time.
    const tiny = await signedHeadersFor(
      "users/uid-1/videos/seq-1/clip.mp4",
      "video/mp4"
    );
    const huge = await signedHeadersFor(
      "users/uid-1/videos/seq-1/clip.mp4",
      "video/mp4"
    );

    expect(tiny).toEqual(huge);
    expect(MAX_VIDEO_FILE_SIZE).toBe(500 * 1024 * 1024);
    expect(MAX_THUMBNAIL_FILE_SIZE).toBe(10 * 1024 * 1024);
  });

  it("signs a key whose extension the caller chose, under an unbound type", async () => {
    // `buildKey`'s sanitiser keeps dots, so the object key's extension is the
    // caller's to pick while the Content-Type stays unbound by the signature.
    const url = await getPresignedPutUrl(
      client,
      BUCKET,
      "users/uid-1/videos/seq-1/payload.html",
      "video/mp4"
    );
    expect(new URL(url).pathname).toContain("payload.html");
    expect(new URL(url).searchParams.get("X-Amz-SignedHeaders")).toBe("host");
  });
});

describe("ownership prefix check against traversal-shaped keys", () => {
  // `assertOwnership` in firebase-functions/src/r2/index.ts is module-private.
  // This is its exact predicate, restated, to show what it does and does not
  // reject for the callables that accept a raw client-supplied key
  // (r2MultipartPartUrl / Complete / Abort / ListParts, r2DeleteObject).
  const ownedByPrefix = (callerUid: string, key: string) =>
    key.startsWith(`users/${callerUid}/`);

  it("rejects a key that plainly names another user", () => {
    expect(
      ownedByPrefix("uid-attacker", "users/uid-victim/videos/a/clip.mp4")
    ).toBe(false);
  });

  it("accepts a key that climbs out of the caller's prefix with ..", () => {
    expect(
      ownedByPrefix(
        "uid-attacker",
        "users/uid-attacker/../uid-victim/videos/a/clip.mp4"
      )
    ).toBe(true);
  });

  it("accepts a key with an embedded newline or control character", () => {
    expect(ownedByPrefix("uid-attacker", "users/uid-attacker/\n../x")).toBe(
      true
    );
  });

  it("signs a traversal-shaped key without complaint", async () => {
    // Confirms the raw key reaches the SDK. Whether R2 then resolves the `..`
    // is NOT established here — see the report; object keys are normally
    // opaque, so this is a hardening gap, not a demonstrated cross-user read.
    const url = await getPresignedPutUrl(
      client,
      BUCKET,
      "users/uid-attacker/../uid-victim/videos/a/clip.mp4",
      "video/mp4"
    );
    expect(url).toContain("uid-victim");
  });
});
