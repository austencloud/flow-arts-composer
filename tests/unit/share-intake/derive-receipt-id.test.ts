import { describe, it, expect } from "vitest";
import { deriveReceiptId } from "#lib/shared/share-intake/domain/derive-receipt-id.js";

// The delimiters an earlier revision of deriveReceiptId used. Named rather
// than inlined: raw control bytes are invisible in an editor and easy to
// mangle in a diff.
const NUL = String.fromCharCode(0);
const STX = String.fromCharCode(2);

describe("deriveReceiptId", () => {
  const shared = {
    files: [{ uri: "/cache/shared_files/a.png", name: "a.png", mimeType: "image/png", size: 1024 }],
    texts: ["hello"],
  };

  it("returns the same id for a duplicated intent", () => {
    expect(deriveReceiptId(shared)).toBe(deriveReceiptId({ ...shared }));
  });

  it("differs when the file name differs", () => {
    const other = { ...shared, files: [{ ...shared.files[0], name: "b.png" }] };
    expect(deriveReceiptId(other)).not.toBe(deriveReceiptId(shared));
  });

  it("differs when the text differs", () => {
    expect(deriveReceiptId({ ...shared, texts: ["goodbye"] })).not.toBe(deriveReceiptId(shared));
  });

  it("handles a text-only share with no files", () => {
    expect(deriveReceiptId({ files: [], texts: ["tka.run/ABC"] })).toMatch(/^si_[0-9A-Za-z]{22}$/);
  });

  it("is order-independent across files", () => {
    const a = { files: [{ uri: "/x", name: "x", mimeType: "image/png", size: 1 }, { uri: "/y", name: "y", mimeType: "image/png", size: 2 }], texts: [] };
    const b = { files: [a.files[1], a.files[0]], texts: [] };
    expect(deriveReceiptId(a)).toBe(deriveReceiptId(b));
  });

  // The headline invariant: the two cold-launch deliveries of ONE share can
  // carry different cache paths. If a future edit folds uri into the material,
  // dedup silently breaks and every cold-launch share doubles. Guard it.
  it("ignores the uri entirely", () => {
    const a = { files: [{ uri: "/cache/first/a.png", name: "a.png", mimeType: "image/png", size: 1024 }], texts: [] };
    const b = { files: [{ ...a.files[0], uri: "/cache/second/a.png" }], texts: [] };
    expect(deriveReceiptId(a)).toBe(deriveReceiptId(b));
  });

  it("differs when only the size differs", () => {
    const other = { ...shared, files: [{ ...shared.files[0], size: 2048 }] };
    expect(deriveReceiptId(other)).not.toBe(deriveReceiptId(shared));
  });

  it("distinguishes an absent size from a zero size", () => {
    const absent = { files: [{ uri: "/a", name: "a.png", mimeType: "image/png" }], texts: [] };
    const zero = { files: [{ ...absent.files[0], size: 0 }], texts: [] };
    expect(deriveReceiptId(absent)).not.toBe(deriveReceiptId(zero));
  });

  it("differs when only the mime type differs", () => {
    const other = { ...shared, files: [{ ...shared.files[0], mimeType: "image/jpeg" }] };
    expect(deriveReceiptId(other)).not.toBe(deriveReceiptId(shared));
  });

  // mimeType and text come from whichever app invoked the share, so they are
  // untrusted input. Length-prefixing is what stops a crafted value from
  // shifting a field boundary and forging a collision with a pending intake.
  it("resists delimiter injection in untrusted fields", () => {
    const split = { files: [], texts: ["a", "b"] };
    const joined = { files: [], texts: ["ab"] };
    expect(deriveReceiptId(split)).not.toBe(deriveReceiptId(joined));

    // The bytes below are the delimiters an earlier revision of this function
    // used. Under ANY delimiter scheme, embedding them in untrusted content
    // shifts a field boundary and forges a collision. Length-prefixing makes no
    // byte special, so these pairs must stay distinct. Both assertions below
    // FAIL against the delimiter-based implementation - that is the point.
    const injectedText = { files: [], texts: [`a${STX}b`] };
    const twoTexts = { files: [], texts: ["a", "b"] };
    expect(deriveReceiptId(injectedText)).not.toBe(deriveReceiptId(twoTexts));

    const nameCarries = { files: [{ uri: "/a", name: `a${NUL}b`, mimeType: "c", size: 1 }], texts: [] };
    const mimeCarries = { files: [{ uri: "/a", name: "a", mimeType: `b${NUL}c`, size: 1 }], texts: [] };
    expect(deriveReceiptId(nameCarries)).not.toBe(deriveReceiptId(mimeCarries));
  });
});
