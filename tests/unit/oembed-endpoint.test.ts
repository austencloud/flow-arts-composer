import { describe, expect, it, vi } from "vitest";
import type { HttpError } from "@sveltejs/kit";

const loadPublishedMeta = vi.hoisted(() =>
  vi.fn(async (id: string, fallback: Record<string, unknown>) =>
    id === "tnd-quarter-opp-mpmp" ? { ...fallback, word: "MPMP" } : fallback
  )
);

vi.mock("../../src/routes/sequence/[id]/published-meta", () => ({
  emptySequenceMeta: () => ({ word: null }),
  loadPublishedMeta,
}));

import { GET } from "../../src/routes/oembed/+server";

function requestEvent(searchParams: Record<string, string>) {
  const url = new URL("https://tkaflowarts.com/oembed");
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return { url } as never;
}

async function expectHttpError(run: () => unknown): Promise<number> {
  try {
    await run();
  } catch (err) {
    return (err as HttpError).status;
  }
  throw new Error("Expected GET to throw an HTTP error");
}

describe("/oembed", () => {
  it("400s when 'url' is missing", async () => {
    const status = await expectHttpError(() => GET(requestEvent({})));
    expect(status).toBe(400);
  });

  it("404s for a non-tkaflowarts.com host", async () => {
    const status = await expectHttpError(() =>
      GET(requestEvent({ url: "https://example.com/sequence/P3WN" }))
    );
    expect(status).toBe(404);
  });

  it("404s for a tkaflowarts.com URL that isn't a sequence page", async () => {
    const status = await expectHttpError(() =>
      GET(requestEvent({ url: "https://tkaflowarts.com/browse" }))
    );
    expect(status).toBe(404);
  });

  it("404s for http (non-https) even on the right host", async () => {
    const status = await expectHttpError(() =>
      GET(requestEvent({ url: "http://tkaflowarts.com/sequence/P3WN" }))
    );
    expect(status).toBe(404);
  });

  it("returns a rich oEmbed document for a valid sequence URL", async () => {
    const response = (await GET(
      requestEvent({ url: "https://tkaflowarts.com/sequence/P3WN" })
    )) as Response;
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.type).toBe("rich");
    expect(body.version).toBe("1.0");
    expect(body.provider_name).toBe("Flow Arts Composer");
    expect(body.provider_url).toBe("https://tkaflowarts.com");
    expect(body.width).toBe(560);
    expect(body.height).toBe(560);
    expect(body.html).toContain(
      "https://tkaflowarts.com/embed/sequence/P3WN"
    );
    expect(body.html).toContain(
      '<a href="https://tkaflowarts.com/sequence/P3WN">'
    );
  });

  it("titles a published sequence with its word", async () => {
    const response = (await GET(
      requestEvent({
        url: "https://tkaflowarts.com/sequence/tnd-quarter-opp-mpmp",
      })
    )) as Response;
    const body = await response.json();
    expect(body.title).toBe("MP — Flow Arts Composer sequence player");
  });

  it("falls back to a generic title when the sequence has no published word", async () => {
    const response = (await GET(
      requestEvent({ url: "https://tkaflowarts.com/sequence/P3WN" })
    )) as Response;
    const body = await response.json();
    expect(body.title).toBe("Sequence — Flow Arts Composer sequence player");
  });

  it("clamps width/height to maxwidth while keeping the square aspect", async () => {
    const response = (await GET(
      requestEvent({
        url: "https://tkaflowarts.com/sequence/P3WN",
        maxwidth: "300",
      })
    )) as Response;
    const body = await response.json();
    expect(body.width).toBe(300);
    expect(body.height).toBe(300);
    expect(body.html).toContain('width="300"');
    expect(body.html).toContain('height="300"');
  });

  it("clamps to the tighter of maxwidth/maxheight", async () => {
    const response = (await GET(
      requestEvent({
        url: "https://tkaflowarts.com/sequence/P3WN",
        maxwidth: "400",
        maxheight: "200",
      })
    )) as Response;
    const body = await response.json();
    expect(body.width).toBe(200);
    expect(body.height).toBe(200);
  });

  it("never clamps below the minimum usable size", async () => {
    const response = (await GET(
      requestEvent({
        url: "https://tkaflowarts.com/sequence/P3WN",
        maxwidth: "10",
      })
    )) as Response;
    const body = await response.json();
    expect(body.width).toBe(120);
    expect(body.height).toBe(120);
  });

  it("ignores a non-numeric maxwidth instead of erroring", async () => {
    const response = (await GET(
      requestEvent({
        url: "https://tkaflowarts.com/sequence/P3WN",
        maxwidth: "not-a-number",
      })
    )) as Response;
    expect(response.status).toBe(200);
  });

  it("501s for a non-JSON format request", async () => {
    const status = await expectHttpError(() =>
      GET(
        requestEvent({
          url: "https://tkaflowarts.com/sequence/P3WN",
          format: "xml",
        })
      )
    );
    expect(status).toBe(501);
  });

  it("decodes and round-trips an inline-encoded sequence id", async () => {
    const code = "s~q1:abc|def";
    const response = (await GET(
      requestEvent({
        url: `https://tkaflowarts.com/sequence/${encodeURIComponent(code)}`,
      })
    )) as Response;
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.html).toContain(
      `https://tkaflowarts.com/embed/sequence/${encodeURIComponent(code)}`
    );
  });
});
