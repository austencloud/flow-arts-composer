import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PreparedQrCache,
  preparedQrUrl,
} from "$lib/shared/qr/services/prepared-qr-cache";
import { QrImageCache } from "$lib/shared/qr/services/qr-image-cache";
import { TRANSITION_REVIEW_SEQUENCE as sequence } from "../../../src/routes/test/sequence-viewer-transitions/transition-review-fixture";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

afterEach(() => vi.unstubAllGlobals());

describe("prepared QR reuse", () => {
  it("fetches shared artwork on a fresh device, then serves it locally", async () => {
    const local = new QrImageCache();
    const cache = new PreparedQrCache(local);
    const record = {
      key: "a".repeat(64),
      svg: '<?xml version="1.0" standalone="no"?>\r\n<svg xmlns="http://www.w3.org/2000/svg"/>',
      encodedUrl: "HTTPS://TKA.RUN/ABCD?bp=S",
      shortCode: "ABCD",
    };
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(record)));
    vi.stubGlobal("fetch", fetcher);
    const first = await cache.get(record.key);
    expect(first?.encodedUrl).toBe(record.encodedUrl);
    expect(first?.dataUrl).toContain("data:image/svg+xml;base64,");
    const anotherInstance = new PreparedQrCache(local);
    expect(await anotherInstance.get(record.key)).toEqual(first);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]![0]).toBe(preparedQrUrl(record.key));
    // A local result does not prove that its upload reached other viewers.
    fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await anotherInstance.getShared(record.key)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("falls back on a missing cache, invalid target, or mismatched record", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            key: "key",
            svg: "<svg/>",
            encodedUrl: "https://evil.example/ABCD",
            shortCode: "ABCD",
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            key: "different",
            svg: "<svg/>",
            encodedUrl: "https://tka.run/ABCD",
            shortCode: "ABCD",
          })
        )
      )
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    const cache = new PreparedQrCache(new QrImageCache());
    for (let i = 0; i < 4; i++) expect(await cache.get("key")).toBeNull();
  });

  it("shares identity across local sequence IDs but invalidates content, props and QR options", async () => {
    const cache = new PreparedQrCache(new QrImageCache());
    const props = {
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
    };
    const key = await cache.keyFor(sequence, props);
    expect(
      await cache.keyFor({ ...sequence, id: "another-users-copy" }, props)
    ).toBe(key);
    const held = {
      ...sequence,
      steps: sequence.steps.map((step, i) =>
        i ? step : { ...step, duration: 2 }
      ),
    };
    expect(await cache.keyFor(held, props)).not.toBe(key);
    expect(
      await cache.keyFor(sequence, { ...props, leftPropType: PropType.FAN })
    ).not.toBe(key);
    for (const options of [
      { darkMode: true },
      { viewMode: "hsl" },
      { deckId: "deck" },
      { size: 400 },
      { centerIcon: "none" as const },
    ]) {
      expect(await cache.keyFor(sequence, props, options)).not.toBe(key);
    }
  });
});
