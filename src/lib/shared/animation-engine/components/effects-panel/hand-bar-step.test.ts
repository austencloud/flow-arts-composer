import { describe, expect, it } from "vitest";
import { chooseHandBarStep } from "./hand-bar-step";

const base = { wordChip: 80, iconChip: 44, rowMin: 200, gap: 8 };

describe("chooseHandBarStep", () => {
  it("keeps the word chip when chip, gap and word-sized row fit", () => {
    expect(chooseHandBarStep({ ...base, bar: 400 })).toBe("words");
  });
  it("is still words when the sum equals the bar exactly", () => {
    expect(chooseHandBarStep({ ...base, bar: 288 })).toBe("words");
  });
  it("goes icon-only one pixel below that", () => {
    expect(chooseHandBarStep({ ...base, bar: 287 })).toBe("icon");
  });
  it("stays icon-only when the icon sum equals the bar exactly", () => {
    expect(chooseHandBarStep({ ...base, bar: 252 })).toBe("icon");
  });
  it("hides the three words together, never the row, below that", () => {
    expect(chooseHandBarStep({ ...base, bar: 251 })).toBe("pictures");
    expect(chooseHandBarStep({ ...base, bar: 100 })).toBe("pictures");
  });
});
