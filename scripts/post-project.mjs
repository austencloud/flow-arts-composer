#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";

const [command, ...args] = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? undefined : args[index + 1];
};
const base = new URL(option("url") ?? "https://[::1]:5173");
if (
  !["http:", "https:"].includes(base.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
) {
  throw new Error("--url must be a loopback HTTP(S) address.");
}

async function request(method, query = {}, body) {
  const url = new URL("/api/dev/post-project", base);
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) url.searchParams.set(key, value);
  const encoded = body === undefined ? undefined : JSON.stringify(body);
  const transport = url.protocol === "https:" ? https : http;
  const response = await new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method,
        headers: {
          Origin: base.origin,
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
        res.on("end", () => {
          try {
            const value = JSON.parse(text);
            if ((res.statusCode ?? 500) >= 400)
              reject(
                new Error(
                  value.message ?? value.error ?? `HTTP ${res.statusCode}`
                )
              );
            else resolve(value);
          } catch (cause) {
            reject(cause);
          }
        });
      }
    );
    req.on("error", reject);
    req.end(encoded);
  });
  return response;
}

try {
  let result;
  if (command === "list") result = await request("GET");
  else if (command === "read") {
    if (!option("session")) throw new Error("read requires --session.");
    result = await request("GET", { sessionId: option("session") });
  } else if (command === "apply") {
    const sessionId = option("session");
    const baseRevision = Number(option("base-revision"));
    const baseFingerprint = option("base-fingerprint");
    const file = option("file");
    if (
      !sessionId ||
      !Number.isSafeInteger(baseRevision) ||
      !baseFingerprint ||
      !file
    )
      throw new Error(
        "apply requires --session, --base-revision, --base-fingerprint and --file."
      );
    result = await request(
      "POST",
      {},
      {
        kind: "apply",
        sessionId,
        baseRevision,
        baseFingerprint,
        project: JSON.parse(await fs.readFile(file, "utf8")),
      }
    );
  } else if (command === "status") {
    if (!option("session") || !option("command"))
      throw new Error("status requires --session and --command.");
    result = await request("GET", {
      sessionId: option("session"),
      commandId: option("command"),
    });
  } else
    throw new Error(
      "Usage: post-project.mjs list|read|apply|status [--url loopback-url] [--session ID] [--base-revision N] [--base-fingerprint SHA256] [--file manifest.json] [--command ID] [--out file]"
    );
  const output = JSON.stringify(result, null, 2) + "\n";
  if (option("out")) await fs.writeFile(option("out"), output);
  else process.stdout.write(output);
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
}
