// HTTP/2 + brotli front door for a local `wrangler pages dev`, closer to the
// Cloudflare edge: files under the build's static root are served straight
// from disk (brotli cached in memory, immutable cache headers like the live
// _headers), and only dynamic routes go through wrangler.
//   node h2-static-proxy.mjs <listenPort> <wranglerPort> <staticRoot> <certDir>
import http2 from "node:http2";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const [listenPortS, targetPortS, staticRoot, certDir] = process.argv.slice(2);
const listenPort = Number(listenPortS),
  targetPort = Number(targetPortS);
const server = http2.createSecureServer({
  cert: fs.readFileSync(`${certDir}/dev-cert.pem`),
  key: fs.readFileSync(`${certDir}/dev-key.pem`),
  allowHTTP1: true,
});
const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });
const HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-connection",
  "http2-settings",
  "host",
]);
const TYPES = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".wasm": "application/wasm",
};
const brCache = new Map();

function staticFile(urlPath) {
  if (
    !urlPath.startsWith("/_app/immutable/") &&
    !/^\/(images|fonts)\//.test(urlPath)
  )
    return null;
  const rel = decodeURIComponent(urlPath.split("?")[0]);
  const file = path.join(staticRoot, rel);
  if (!file.startsWith(path.resolve(staticRoot))) return null;
  try {
    if (fs.statSync(file).isFile()) return file;
  } catch {}
  return null;
}

server.on("request", (req, res) => {
  const file = req.method === "GET" ? staticFile(req.url) : null;
  if (file) {
    const ext = path.extname(file);
    const type = TYPES[ext] ?? "application/octet-stream";
    const headers = {
      "content-type": type,
      "cache-control": req.url.startsWith("/_app/immutable/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=14400",
    };
    const compressible = /javascript|css|svg|json|csv|text/.test(type);
    if (
      compressible &&
      /\bbr\b/.test(String(req.headers["accept-encoding"] ?? ""))
    ) {
      let body = brCache.get(file);
      if (!body) {
        body = zlib.brotliCompressSync(fs.readFileSync(file), {
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 },
        });
        brCache.set(file, body);
      }
      res.writeHead(200, {
        ...headers,
        "content-encoding": "br",
        "content-length": body.length,
      });
      res.end(body);
      return;
    }
    const body = fs.readFileSync(file);
    res.writeHead(200, { ...headers, "content-length": body.length });
    res.end(body);
    return;
  }
  const headers = {};
  for (const [k, v] of Object.entries(req.headers))
    if (!k.startsWith(":") && !HOP.has(k)) headers[k] = v;
  headers.host = `127.0.0.1:${listenPort}`;
  headers["x-forwarded-proto"] = "https";
  const up = http.request(
    {
      host: "127.0.0.1",
      port: targetPort,
      method: req.method,
      path: req.url,
      headers,
      agent,
    },
    (upRes) => {
      const out = {};
      for (const [k, v] of Object.entries(upRes.headers))
        if (!HOP.has(k)) out[k] = v;
      const type = String(upRes.headers["content-type"] ?? "");
      if (
        /javascript|css|html|json|svg|text|csv/.test(type) &&
        !upRes.headers["content-encoding"] &&
        /\bbr\b/.test(String(req.headers["accept-encoding"] ?? ""))
      ) {
        delete out["content-length"];
        out["content-encoding"] = "br";
        res.writeHead(upRes.statusCode ?? 502, out);
        upRes
          .pipe(
            zlib.createBrotliCompress({
              params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 },
            })
          )
          .pipe(res);
        return;
      }
      res.writeHead(upRes.statusCode ?? 502, out);
      upRes.pipe(res);
    }
  );
  up.on("error", (e) => {
    if (!res.headersSent) res.writeHead(502);
    res.end(String(e));
  });
  req.pipe(up);
});
server.listen(listenPort, "127.0.0.1", () =>
  console.log(`h2 ${listenPort} -> ${targetPort} static ${staticRoot}`)
);
