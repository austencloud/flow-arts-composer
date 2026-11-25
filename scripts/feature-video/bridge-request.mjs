import http from "node:http";
import https from "node:https";

/**
 * How long the dev server may leave a request unanswered. The bridge answers
 * from memory or one file, so a minute is far past a busy server; a server
 * that reloaded mid-request never answers at all.
 */
export const REQUEST_TIMEOUT_MS = 60000;

/**
 * One JSON request to the dev server's Post Studio routes. An error status
 * rejects with the server's message and its `status`; a request unanswered
 * after `timeoutMs` rejects with `code` "BRIDGE_TIMEOUT".
 */
export function bridgeRequest(
  url,
  { method = "GET", body, timeoutMs = REQUEST_TIMEOUT_MS } = {}
) {
  const encoded = body === undefined ? undefined : JSON.stringify(body);
  const transport = url.protocol === "https:" ? https : http;
  let timer;
  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method,
        headers: {
          Accept: "application/json",
          Origin: url.origin,
          ...(encoded
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(encoded),
              }
            : {}),
        },
        // The dev server uses a local self-signed certificate. This exception is scoped to this request.
        ...(url.protocol === "https:" ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        // An answer cut off partway ends with "error", not "end".
        res.on("error", reject);
        res.on("end", () => {
          const status = res.statusCode ?? 500;
          let value;
          try {
            value = JSON.parse(text);
          } catch {
            reject(
              Object.assign(
                new Error(
                  `${url.pathname} answered ${status} without JSON. Is this the dev server, and does it have this route?`
                ),
                { status }
              )
            );
            return;
          }
          if (status >= 400)
            reject(
              Object.assign(
                new Error(value.message ?? value.error ?? `HTTP ${status}`),
                { status }
              )
            );
          else resolve(value);
        });
      }
    );
    req.on("error", reject);
    // The whole answer, not its first byte: a server can stop partway.
    timer = setTimeout(
      () =>
        req.destroy(
          Object.assign(
            new Error(
              `${method} ${url.pathname} went unanswered for ${timeoutMs / 1000} s. Is the dev server at ${url.origin} stuck or reloading?`
            ),
            { code: "BRIDGE_TIMEOUT" }
          )
        ),
      timeoutMs
    );
    req.end(encoded);
  }).finally(() => clearTimeout(timer));
}
