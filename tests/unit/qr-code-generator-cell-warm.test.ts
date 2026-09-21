import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getRawData = vi
  .fn()
  .mockResolvedValue(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"));
vi.mock("qr-code-styling", () => ({
  default: class QRCodeStylingMock {
    getRawData = getRawData;
  },
}));

vi.mock("$lib/shared/render/services/warm-sequence-cells", () => ({
  warmSequenceCells: vi.fn(),
}));

import { QRCodeGenerator } from "$lib/shared/qr/services/qr-code-generator";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  SIGNUP_CARD_ART_REVISION,
  SIGNUP_CARD_RELAY_CLOSING,
  SIGNUP_CARD_RELAY_STEPS,
  SIGNUP_CARD_URL,
} from "$lib/features/choreo-card/services/signup-card-canvas-renderer";

const sequence = {
  id: "sequence-1",
  word: "AB",
  steps: [{ letter: "A", motions: {} }],
} as unknown as SequenceData;

const imageCache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
};
const preparedCache = {
  keyFor: vi.fn().mockResolvedValue("ready-key"),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
};

describe("QRCodeGenerator canonical cell readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    imageCache.get.mockResolvedValue(null);
    preparedCache.get.mockResolvedValue(null);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("verifies both themes with the printed prop pair before creating a code", async () => {
    const events: string[] = [];
    const createShortCode = vi.fn(async () => {
      events.push("shortcode");
      return { code: "ABCD", url: "https://tka.run/ABCD", isNew: true };
    });
    const warm = vi.fn(async (_sequence, options) => {
      events.push(options.isDark ? "warm-dark" : "warm-light");
      return { total: 2, ready: 2, hashes: [], failures: [] };
    });
    const generator = new QRCodeGenerator(
      { createShortCode } as never,
      imageCache as never,
      warm,
      preparedCache
    );

    await generator.generateForSequence(sequence, {
      leftPropType: PropType.POI,
      rightPropType: PropType.FAN,
    });

    expect(warm).toHaveBeenCalledTimes(2);
    expect(warm).toHaveBeenNthCalledWith(
      1,
      sequence,
      expect.objectContaining({
        isDark: true,
        leftPropType: PropType.POI,
        rightPropType: PropType.FAN,
        catDogMode: true,
        requireComplete: true,
      })
    );
    expect(warm).toHaveBeenNthCalledWith(
      2,
      sequence,
      expect.objectContaining({ isDark: false, requireComplete: true })
    );
    expect(createShortCode).toHaveBeenCalledWith(
      sequence,
      expect.objectContaining({
        leftPropType: PropType.POI,
        rightPropType: PropType.FAN,
        catDogMode: true,
      })
    );
    expect(events).toEqual(["warm-dark", "warm-light", "shortcode"]);
  });

  it("does not create or render a QR when canonical assets are incomplete", async () => {
    const createShortCode = vi.fn();
    const warm = vi.fn().mockRejectedValue(new Error("assets incomplete"));
    const generator = new QRCodeGenerator(
      { createShortCode } as never,
      imageCache as never,
      warm,
      preparedCache
    );

    await expect(generator.generateForSequence(sequence)).rejects.toThrow(
      "assets incomplete"
    );
    expect(createShortCode).not.toHaveBeenCalled();
    expect(getRawData).not.toHaveBeenCalled();
  });

  it("finishes one theme before starting the next and stops after cancellation", async () => {
    let finishDark!: () => void;
    const darkWarm = new Promise<void>((resolve) => {
      finishDark = resolve;
    });
    const warm = vi.fn(async (_sequence, options) => {
      if (options.isDark) await darkWarm;
      return { total: 2, ready: 2, hashes: [], failures: [] };
    });
    const createShortCode = vi.fn();
    const generator = new QRCodeGenerator(
      { createShortCode } as never,
      imageCache as never,
      warm,
      preparedCache
    );
    const controller = new AbortController();
    const generating = generator.generateForSequence(sequence, {
      signal: controller.signal,
    });

    await vi.waitFor(() => expect(warm).toHaveBeenCalledOnce());
    controller.abort();
    finishDark();

    await expect(generating).rejects.toMatchObject({ name: "AbortError" });
    expect(warm).toHaveBeenCalledOnce();
    expect(createShortCode).not.toHaveBeenCalled();
  });

  it("returns a prepared QR without warming, allocating or rasterizing", async () => {
    const ready = {
      svg: "<svg/>",
      dataUrl: "data:ready",
      encodedUrl: "https://tka.run/ABCD",
      shortCode: "ABCD",
    };
    preparedCache.get.mockResolvedValue(ready);
    const warm = vi.fn(),
      createShortCode = vi.fn();
    const generator = new QRCodeGenerator(
      { createShortCode } as never,
      imageCache as never,
      warm,
      preparedCache
    );
    expect(await generator.generateForSequence(sequence)).toEqual(ready);
    expect(warm).not.toHaveBeenCalled();
    expect(createShortCode).not.toHaveBeenCalled();
    expect(getRawData).not.toHaveBeenCalled();
  });

  it("finds gallery artwork at the canonical bake size without generating", async () => {
    const ready = {
      svg: "<svg/>",
      dataUrl: "data:ready",
      encodedUrl: "https://tka.run/ABCD",
      shortCode: "ABCD",
    };
    preparedCache.get.mockResolvedValue(ready);
    const warm = vi.fn();
    const createShortCode = vi.fn();
    const generator = new QRCodeGenerator(
      { createShortCode } as never,
      imageCache as never,
      warm,
      preparedCache
    );

    await expect(
      generator.findPreparedForSequence(sequence, {
        size: 256,
        leftPropType: PropType.POI,
        rightPropType: PropType.FAN,
      })
    ).resolves.toEqual(ready);

    expect(preparedCache.keyFor).toHaveBeenCalledWith(
      sequence,
      expect.objectContaining({
        leftPropType: PropType.POI,
        rightPropType: PropType.FAN,
        catDogMode: true,
      }),
      expect.objectContaining({ size: 200 })
    );
    expect(warm).not.toHaveBeenCalled();
    expect(createShortCode).not.toHaveBeenCalled();
    expect(getRawData).not.toHaveBeenCalled();
  });

  it("draws a canonical prepared SVG at the card's requested size", async () => {
    const ready = {
      svg: "<svg/>",
      dataUrl: "data:ready",
      encodedUrl: "https://tka.run/ABCD",
      shortCode: "ABCD",
    };
    class ReadyImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", ReadyImage);
    preparedCache.get.mockResolvedValue(ready);
    const warm = vi.fn();
    const createShortCode = vi.fn();
    const generator = new QRCodeGenerator(
      { createShortCode } as never,
      imageCache as never,
      warm,
      preparedCache
    );

    await expect(
      generator.generateAsImage(sequence, 214)
    ).resolves.toBeInstanceOf(ReadyImage);

    expect(preparedCache.keyFor).toHaveBeenCalledWith(
      sequence,
      expect.anything(),
      expect.objectContaining({ size: 200 })
    );
    expect(warm).not.toHaveBeenCalled();
    expect(createShortCode).not.toHaveBeenCalled();
    expect(getRawData).not.toHaveBeenCalled();
  });

  it("shares one signal-less canonical preparation between matching cards", async () => {
    const warm = vi
      .fn()
      .mockResolvedValue({ total: 2, ready: 2, hashes: [], failures: [] });
    const createShortCode = vi.fn().mockResolvedValue({
      code: "ABCD",
      url: "https://tka.run/ABCD",
      isNew: true,
    });
    const generator = new QRCodeGenerator(
      { createShortCode } as never,
      imageCache as never,
      warm,
      preparedCache
    );

    const [first, second] = await Promise.all([
      generator.generateForSequence(sequence, { size: 200 }),
      generator.generateForSequence(sequence, { size: 214 }),
    ]);

    expect(second).toEqual(first);
    expect(warm).toHaveBeenCalledTimes(2);
    expect(createShortCode).toHaveBeenCalledOnce();
    expect(getRawData).toHaveBeenCalledOnce();
  });

  it("publishes reusable artwork only after both themes and the QR succeed", async () => {
    const warm = vi
      .fn()
      .mockResolvedValue({ total: 2, ready: 2, hashes: [], failures: [] });
    const createShortCode = vi.fn().mockResolvedValue({
      code: "ABCD",
      url: "https://tka.run/ABCD",
      isNew: false,
    });
    const generator = new QRCodeGenerator(
      { createShortCode } as never,
      imageCache as never,
      warm,
      preparedCache
    );
    const result = await generator.generateForSequence(sequence);
    expect(preparedCache.set).toHaveBeenCalledWith("ready-key", result);
    expect(warm).toHaveBeenCalledTimes(2);
    preparedCache.set.mockClear();
    warm.mockRejectedValue(new Error("missing cells"));
    await expect(generator.generateForSequence(sequence)).rejects.toThrow(
      "missing cells"
    );
    expect(preparedCache.set).not.toHaveBeenCalled();
  });
});

describe("festival signup card relay", () => {
  it("prints the complete learn, teach, pass cycle", () => {
    expect(SIGNUP_CARD_RELAY_STEPS).toEqual([
      {
        label: "SCAN + LEARN",
        body: "Scan the QR on a choreo card. Learn its sequence.",
      },
      {
        label: "TEACH",
        body: "Teach the sequence to another person.",
      },
      {
        label: "PASS IT ON",
        body: "Give them the card. They start again at step one.",
      },
    ]);
    expect(SIGNUP_CARD_RELAY_CLOSING).toBe(
      "Keep the loop going until the world speaks this language."
    );
  });

  it("keeps the live signup destination on the card", () => {
    expect(SIGNUP_CARD_URL).toBe("https://tkaflowarts.com/start");
    expect(SIGNUP_CARD_ART_REVISION).toBe("2026-08-14-relay-v1");
  });
});
