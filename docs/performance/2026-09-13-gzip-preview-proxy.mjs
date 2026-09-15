/**
 * Minimal gzip reverse proxy in front of `vite preview`, which serves
 * uncompressed. Without it a throttled measurement charges the browser raw
 * bytes for a download the deployed site sends compressed, which inflates the
 * transfer component by roughly the compression ratio.
 *
 *   npx vite preview --port 4173 --host 127.0.0.1 &
 *   node docs/performance/2026-09-13-gzip-preview-proxy.mjs &
 *   BASE=http://127.0.0.1:4174 node docs/performance/2026-09-13-boot-graph-probe.mjs after out.json
 *
 * Measurement scaffolding only — it buffers whole responses and is not a
 * server anything should depend on. Environment: UPSTREAM, PORT.
 */
import http from "node:http";
import zlib from "node:zlib";

const UPSTREAM = process.env.UPSTREAM ?? "http://127.0.0.1:4173";
const PORT = Number(process.env.PORT ?? 4174);
const COMPRESSIBLE =
  /^(text\/|application\/(javascript|json|xml|manifest)|image\/svg)/;

const server = http.createServer((req, res) => {
  const upstream = new URL(req.url, UPSTREAM);
  const headers = { ...req.headers, host: upstream.host };
  delete headers["accept-encoding"];
  const proxied = http.request(
    upstream,
    { method: req.method, headers },
    (upRes) => {
      const chunks = [];
      upRes.on("data", (c) => chunks.push(c));
      upRes.on("end", () => {
        const body = Buffer.concat(chunks);
        const type = String(upRes.headers["content-type"] ?? "");
        const wantsGzip = String(req.headers["accept-encoding"] ?? "").includes(
          "gzip"
        );
        const outHeaders = { ...upRes.headers };
        delete outHeaders["content-length"];
        delete outHeaders["content-encoding"];
        if (wantsGzip && COMPRESSIBLE.test(type) && body.length > 0) {
          const gz = zlib.gzipSync(body, { level: 6 });
          outHeaders["content-encoding"] = "gzip";
          outHeaders["content-length"] = String(gz.length);
          res.writeHead(upRes.statusCode ?? 200, outHeaders);
          res.end(gz);
          return;
        }
        outHeaders["content-length"] = String(body.length);
        res.writeHead(upRes.statusCode ?? 200, outHeaders);
        res.end(body);
      });
    }
  );
  proxied.on("error", (error) => {
    res.writeHead(502);
    res.end(String(error));
  });
  req.pipe(proxied);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`gzip proxy on http://127.0.0.1:${PORT} -> ${UPSTREAM}`);
});
