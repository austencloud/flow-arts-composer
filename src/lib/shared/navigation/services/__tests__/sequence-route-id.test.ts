/**
 * Route-parameter contract for `/sequence/[id]`.
 *
 * Every case here starts from a real URL and decodes it the way SvelteKit's
 * router does, because that is where the defects lived: the parser assumed it
 * still had to unescape the parameter, and re-decoded ids that were already
 * plain text.
 */
import { describe, expect, it } from "vitest";

import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  decodeSequenceFromQR,
  decodeSequenceWithCompression,
  generateSequenceRoutePath,
  parseSequenceRouteId,
} from "../sequence-encoder";
import { buildScanSequenceDestination } from "$lib/shared/qr/services/scan-sequence-handoff";

/**
 * Captured from shortcode records in production (see
 * `sequence-encoder.legacy-qr.test.ts`). The numeric-float payload is the one
 * that matters: its base45 body contains `%4A`, `%2E` and `%*J`.
 */
const PRODUCTION_FLAT_QR =
  "s~q1:9O5/166CQPYL*25*4NKYPGQG:RDJMKRIPXMFQ56W257R5YNI*O4AYS/*COVM1VC9S3:T9J*4HQ13H0";

const PRODUCTION_RECIPE_QR =
  "s~r1:sr:c2039feb:q1:9O5/166CQPYL*2512NXY9:Z9K56LPHVVPOP6PQI0J11NKO.CQILLI9XZ9HKD+ICP6A+J9B A5KD3:FP0G/B8336";

const PRODUCTION_NUMERIC_FLOAT_QR =
  "s~q1:A 9396V$GYO1%4AOAOC.V4DR6N0:UU.OQIU23K0WDW.J0MJLU/JEMNG1NE.4TKF7UJ.7797LIPD02SC6IS7GKBM::2SB82BKA+H4Q2FF9HG4/NM0+44*P940ERE/ISIIGY13BTKJ9A4ZU%*J$S755V$%2E/B8.BVMM+4AWYT2Z8Z84%FBY8L.Q8/.T70";

/**
 * What the router hands `+page.server.ts` and `page.params.id`: SvelteKit runs
 * `decode_pathname` (a `%25`-safe `decodeURI`) over the path and then
 * `decodeURIComponent` over each matched parameter.
 * See `@sveltejs/kit/src/utils/url.js`.
 */
function routeParamFrom(path: string): string {
  const segment = new URL(path, "https://tkaflowarts.com").pathname
    .split("/")
    .filter(Boolean)[1]!;
  return decodeURIComponent(segment.split("%25").map(decodeURI).join("%25"));
}

function sequenceRouteParam(code: string): string {
  return routeParamFrom(`/sequence/${encodeURIComponent(code)}`);
}

describe("parseSequenceRouteId", () => {
  it.each([
    ["flat", PRODUCTION_FLAT_QR],
    ["recipe", PRODUCTION_RECIPE_QR],
    ["numeric float", PRODUCTION_NUMERIC_FLOAT_QR],
  ])(
    "routes a production %s QR payload to the QR decoder, unchanged",
    (_label, payload) => {
      const param = sequenceRouteParam(payload);
      expect(param).toBe(payload);

      expect(parseSequenceRouteId(param)).toEqual({
        encoded: null,
        inlineQr: payload,
        legacyId: null,
      });
    }
  );

  it("survives a payload whose base45 body carries a stray percent", async () => {
    // `%*J` is not a valid escape: the parser used to throw URIError here, and
    // the throw escaped route bootstrap entirely.
    const param = sequenceRouteParam(PRODUCTION_NUMERIC_FLOAT_QR);
    expect(param).toContain("%*J");

    const parsed = parseSequenceRouteId(param);
    expect(parsed.inlineQr).toBe(PRODUCTION_NUMERIC_FLOAT_QR);
    await expect(decodeSequenceFromQR(parsed.inlineQr!)).resolves.toHaveProperty(
      "steps"
    );
  });

  it("does not rewrite a valid-looking escape inside a payload", () => {
    // `%2E` would silently become `.` under a second decode, and the payload
    // would then fail its own base45/inflate check instead of opening.
    const param = sequenceRouteParam(PRODUCTION_NUMERIC_FLOAT_QR);
    expect(parseSequenceRouteId(param).inlineQr).toContain("%2E");
  });

  it("keeps a `raw:` QR envelope away from the URL decoder", async () => {
    const seed = await decodeSequenceFromQR(PRODUCTION_FLAT_QR);
    const rawPayload = "s~raw:iiSS|noeac0:soweu0|noeac1:soweu1";
    const parsed = parseSequenceRouteId(sequenceRouteParam(rawPayload));

    expect(parsed).toEqual({
      encoded: null,
      inlineQr: rawPayload,
      legacyId: null,
    });

    // Why it matters: the URL decoder accepts the same bytes without
    // complaining. `s~raw:iiSS` is read as a sequence header, the start
    // position is consumed as an ordinary step, and the viewer opens a
    // different sequence rather than failing loudly.
    const misdecoded = decodeSequenceWithCompression(rawPayload);
    const correct = await decodeSequenceFromQR(rawPayload);

    expect(correct.steps).toHaveLength(1);
    expect(misdecoded.steps).toHaveLength(2);
    expect(correct.startPosition?.motions.right?.startLocation).toBe("s");
    expect(misdecoded.startPosition?.motions.right?.startLocation).toBe("n");
    expect(correct.startPosition?.motions.left?.propType).toBe(PropType.STAFF);
    expect(correct.startPosition?.motions.left?.startOrientation).toBe(
      Orientation.IN
    );
    expect(seed.steps.length).toBeGreaterThan(0);
  });

  it("still classifies compressed and uncompressed inline share links", () => {
    const compressed = "d1:SGVsbG8";
    const uncompressed = "raw:iiSS|noeac0:soweu0";

    expect(parseSequenceRouteId(sequenceRouteParam(compressed)).encoded).toBe(
      compressed
    );
    expect(parseSequenceRouteId(sequenceRouteParam(uncompressed)).encoded).toBe(
      uncompressed
    );
  });

  it("round-trips a share path built by the encoder", async () => {
    const source = await decodeSequenceFromQR(PRODUCTION_FLAT_QR);
    const parsed = parseSequenceRouteId(
      routeParamFrom(generateSequenceRoutePath(source))
    );

    expect(parsed.encoded).not.toBeNull();
    expect(decodeSequenceWithCompression(parsed.encoded!).steps).toHaveLength(
      source.steps.length
    );
  });

  it.each([
    ["short code", "AB3D"],
    ["legacy lowercase-theta document id", "X-BΦ-θ-"],
    ["word", "ΘΛ"],
  ])("returns a %s verbatim as a legacy id", (_label, id) => {
    expect(parseSequenceRouteId(sequenceRouteParam(id))).toEqual({
      encoded: null,
      inlineQr: null,
      legacyId: id,
    });
  });

  it("does not throw on an id that merely contains a percent sign", () => {
    const param = sequenceRouteParam("100%Fire");
    expect(param).toBe("100%Fire");
    expect(parseSequenceRouteId(param).legacyId).toBe("100%Fire");
  });

  it("still resolves a historically double-encoded inline link", () => {
    // `/sequence/d1%253AAbC` — one extra encodeURIComponent somewhere upstream.
    const param = routeParamFrom(
      `/sequence/${encodeURIComponent(encodeURIComponent("d1:AbC"))}`
    );
    expect(param).toBe("d1%3AAbC");
    expect(parseSequenceRouteId(param).encoded).toBe("d1:AbC");
  });

  it("treats an empty id as nothing to resolve", () => {
    expect(parseSequenceRouteId("")).toEqual({
      encoded: null,
      inlineQr: null,
      legacyId: null,
    });
  });
});

describe("scan handoff destination", () => {
  it.each([
    ["short code", "AB3D"],
    ["legacy inline payload", PRODUCTION_NUMERIC_FLOAT_QR],
  ])("survives the /q -> /sequence handoff for a %s", (_label, code) => {
    const destination = buildScanSequenceDestination(
      code,
      new URLSearchParams("bp=S&rp=F&v=AB3D")
    );
    const url = new URL(destination, "https://tkaflowarts.com");

    expect(url.searchParams.get("code")).toBe(code);
    expect(url.searchParams.has("v")).toBe(false);

    const param = routeParamFrom(destination);
    expect(param).toBe(code);
    const parsed = parseSequenceRouteId(param);
    expect(parsed.inlineQr ?? parsed.legacyId).toBe(code);
  });
});
