/* global fetch, Response, URL, console */

/**
 * Cloudflare Worker: QR Short Code Redirect + Edge OG Meta
 *
 * Deployed on: tka.run only. tka.to is not ours in practice (it serves an
 * unrelated site) — no printed card has ever encoded it, and the app only
 * ever accepts tka.run (src/lib/shared/qr/services/extract-scan-code.ts).
 * Routes: /{code} → OG meta for crawlers, 302 → tkaflowarts.com/q/{code} for humans
 *         /       → 301 → tkaflowarts.com/create
 *
 * SACRED: This worker is the only thing between a printed QR code and the
 * sequence viewer. Every Choreo Card ever printed encodes a TKA.RUN/{code}
 * URL. If this worker breaks, every card in circulation is dead.
 *
 * KV binding: SHORTCODES — populated by the snapshotShortCodes Cloud Function.
 * Each key is a short code, value is JSON: { word, creator, thumbnailUrl, deckName }
 *
 * When KV has metadata, social crawlers get a fully-rendered OG page at the edge
 * (~5ms) instead of waiting for SvelteKit SSR (~300ms). Humans always get a 302
 * redirect to the full viewer at /q/{code}.
 *
 * Fallback: if KV is unbound or the lookup misses, behavior is identical to
 * the original dumb-redirect worker. No degradation path can break a printed card.
 */

const SOCIAL_CRAWLER_UA =
  /facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot|Applebot|Googlebot/i;
const CANONICAL_ASSET_LINKS_URL =
  "https://tkaflowarts.com/.well-known/assetlinks.json";

async function proxyAssetLinks() {
  const upstream = await fetch(CANONICAL_ASSET_LINKS_URL);
  if (!upstream.ok) {
    return new Response("Digital Asset Links unavailable", { status: 503 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

function buildOGPage(code, meta) {
  const word = meta.word || "Sequence";
  const description = meta.creator
    ? `Flow sequence by ${meta.creator}`
    : "Watch this flow sequence";
  const image = meta.thumbnailUrl || "https://tkaflowarts.com/og-default.png";
  const url = `https://tkaflowarts.com/q/${code}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(word)} · TKA</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:type" content="video.other">
  <meta property="og:title" content="${escapeHtml(word)} · TKA">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(word)} · TKA">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <meta name="theme-color" content="#0f0f1a">
  <meta http-equiv="refresh" content="0;url=${escapeHtml(url)}">
</head>
<body></body>
</html>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Android requires a direct 200 from every claimed App Links host. Proxy
    // the canonical association document instead of redirecting or duplicating
    // certificate fingerprints in this independently deployed Worker.
    if (path === "/.well-known/assetlinks.json") {
      return proxyAssetLinks();
    }

    if (path === "/" || path === "") {
      return Response.redirect("https://tkaflowarts.com/create", 301);
    }

    const code = path.slice(1);
    if (code.includes("/") || code.includes(".")) {
      return new Response("Not Found", { status: 404 });
    }

    const ua = request.headers.get("user-agent") || "";
    const isCrawler = SOCIAL_CRAWLER_UA.test(ua);

    // Structured scan log — queryable in Workers Observability.
    // request.cf geo fields are populated by Cloudflare at the edge.
    const cf = request.cf || {};
    console.log("scan", {
      code,
      isCrawler,
      country: cf.country || null,
      region: cf.region || null,
      city: cf.city || null,
      timezone: cf.timezone || null,
      colo: cf.colo || null,
      asOrganization: cf.asOrganization || null,
      referer: request.headers.get("referer") || null,
      ua,
    });

    if (isCrawler && env.SHORTCODES) {
      try {
        const raw = await env.SHORTCODES.get(code);
        if (raw) {
          const meta = JSON.parse(raw);
          return new Response(buildOGPage(code, meta), {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
            },
          });
        }
      } catch {
        // KV miss or parse error — fall through to redirect
      }
    }

    const target = new URL(`https://tkaflowarts.com/q/${code}`);
    url.searchParams.forEach((value, key) => {
      target.searchParams.set(key, value);
    });

    return Response.redirect(target.toString(), 302);
  },
};
