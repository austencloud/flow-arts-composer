/**
 * HTTP/2 + gzip front end for a locally served production build. Companion to
 * `2026-10-22-boot-screen-probe.mjs`; ledger: `2026-10-22-boot-measurements.md`.
 *
 * Wrangler serves the build uncompressed over HTTP/1.1, where Chrome opens six
 * connections per origin. The app's startup fetches hundreds of small chunks,
 * so that limit, not the code, sets the pace. Production's Cloudflare edge
 * speaks HTTP/2 and compresses, so this front end does the same.
 *
 *   openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem \
 *     -days 2 -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1"
 *   KEY=key.pem CERT=cert.pem UPSTREAM=http://127.0.0.1:4186 PORT=4188 \
 *     node docs/performance/2026-10-22-h2-gzip-proxy.mjs
 *
 * Gzip level 6 stands in for the edge's compression; Brotli would be a little
 * smaller. The certificate is self-signed, so the probe ignores HTTPS errors.
 */
import fs from "node:fs";
import http from "node:http";
import http2 from "node:http2";
import process from "node:process";
import zlib from "node:zlib";

const UPSTREAM = new URL(process.env.UPSTREAM ?? "http://127.0.0.1:4186");
const PORT = Number(process.env.PORT ?? 4188);
const COMPRESSIBLE = /javascript|json|css|html|svg|text|xml/;
const HOP_BY_HOP = [
  "connection",
  "transfer-encoding",
  "keep-alive",
  "content-length",
  "content-encoding",
];

const server = http2.createSecureServer({
  key: fs.readFileSync(process.env.KEY ?? "key.pem"),
  cert: fs.readFileSync(process.env.CERT ?? "cert.pem"),
  allowHTTP1: true,
});

server.on("request", (req, res) => {
  const headers = { host: UPSTREAM.host };
  for (const [name, value] of Object.entries(req.headers)) {
    if (name.startsWith(":")) continue;
    if (["connection", "host", "accept-encoding"].includes(name)) continue;
    headers[name] = value;
  }
  const upstream = http.request(
    {
      hostname: UPSTREAM.hostname,
      port: UPSTREAM.port,
      path: req.url,
      method: req.method,
      headers,
    },
    (upRes) => {
      const out = {};
      for (const [name, value] of Object.entries(upRes.headers)) {
        if (!HOP_BY_HOP.includes(name)) out[name] = value;
      }
      const encoded = upRes.headers["content-encoding"];
      const gzip =
        !encoded &&
        COMPRESSIBLE.test(String(upRes.headers["content-type"] ?? "")) &&
        /gzip/.test(String(req.headers["accept-encoding"] ?? ""));
      if (encoded) out["content-encoding"] = encoded;
      if (gzip) out["content-encoding"] = "gzip";
      res.writeHead(upRes.statusCode ?? 502, out);
      if (gzip) upRes.pipe(zlib.createGzip({ level: 6 })).pipe(res);
      else upRes.pipe(res);
    }
  );
  upstream.on("error", () => {
    // The upstream closing mid-response ends this stream; nothing to report.
    try {
      res.writeHead(502);
      res.end();
    } catch {
      res.destroy();
    }
  });
  req.pipe(upstream);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`HTTP/2 + gzip on https://127.0.0.1:${PORT} -> ${UPSTREAM.href}`);
});
