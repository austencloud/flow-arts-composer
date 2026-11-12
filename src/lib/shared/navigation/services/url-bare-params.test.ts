import { describe, expect, it } from "vitest";
import { keepBareParams } from "./url-bare-params";

const BASE = "https://example.test/browse/explore/sequences";

function rewrite(current: string, mutate: (url: URL) => void): string {
  const url = new URL(current);
  mutate(url);
  return keepBareParams(current, url).href;
}

describe("keepBareParams", () => {
  it("keeps the wall's bare flag when another parameter is deleted", () => {
    // Deleting an absent parameter still re-serialises the whole query.
    expect(rewrite(`${BASE}?mandala`, (url) => url.searchParams.delete("letter"))).toBe(
      `${BASE}?mandala`
    );
  });

  it("keeps it bare beside a parameter that is set", () => {
    expect(rewrite(`${BASE}?mandala`, (url) => url.searchParams.set("v", "abc"))).toBe(
      `${BASE}?mandala&v=abc`
    );
  });

  it("leaves a flag that now has a value", () => {
    expect(
      rewrite(`${BASE}?mandala`, (url) => url.searchParams.set("mandala", "family-1"))
    ).toBe(`${BASE}?mandala=family-1`);
  });

  it("leaves an empty value the current address wrote with an equals sign", () => {
    expect(rewrite(`${BASE}?q=&x=1`, (url) => url.searchParams.delete("x"))).toBe(
      `${BASE}?q=`
    );
  });

  it("leaves another origin alone", () => {
    const destination = new URL("https://other.test/?mandala=");
    expect(keepBareParams(`${BASE}?mandala`, destination).href).toBe(
      "https://other.test/?mandala="
    );
  });
});
