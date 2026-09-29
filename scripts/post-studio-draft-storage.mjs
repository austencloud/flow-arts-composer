import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

export const POST_STUDIO_DRAFT_PATH = "/_local/post-studio-drafts";
const MAX_BYTES = 12 * 1024 * 1024;
const PREFIXES = [
  "tka:post-studio:project:v2:",
  "tka:post-studio:take-timing:v1:",
];

/** Local previews keep drafts outside the checkout so rebuilding or changing origins cannot erase them. */
export function createPostStudioDraftStorage(
  directory = path.join(os.homedir(), ".tka", "post-studio-drafts")
) {
  let pending = Promise.resolve();

  async function readRecords() {
    await fs.mkdir(directory, { recursive: true });
    const files = (await fs.readdir(directory))
      .filter((name) => name.endsWith(".json"))
      .sort();
    const records = [];
    for (const name of files) {
      const saved = JSON.parse(
        await fs.readFile(path.join(directory, name), "utf8")
      );
      if (Array.isArray(saved.records)) records.push(...saved.records);
    }
    return records;
  }

  function respond(res, code, value) {
    res.writeHead(code, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  }

  return async function handle(req, res) {
    if (
      new URL(req.url ?? "/", "http://localhost").pathname !==
      POST_STUDIO_DRAFT_PATH
    )
      return false;
    try {
      const origin = req.headers.origin;
      // HTTP/2 uses :authority instead of Host on the main HTTPS dev server.
      const authority = req.headers[":authority"] ?? req.headers.host;
      if (origin && new URL(origin).host !== authority) {
        respond(res, 403, {
          error: "Draft backups must come from this editor.",
        });
        return true;
      }
      if (req.method === "GET") {
        await pending.catch(() => {});
        respond(res, 200, { records: await readRecords() });
        return true;
      }
      if (req.method !== "POST") {
        respond(res, 405, { error: "Method not allowed." });
        return true;
      }
      let body = "";
      req.setEncoding("utf8");
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > MAX_BYTES) {
          respond(res, 413, { error: "The draft backup is too large." });
          return true;
        }
      }
      const input = JSON.parse(body);
      if (
        !Array.isArray(input.records) ||
        input.records.length > 1000 ||
        input.records.some(
          (record) =>
            typeof record.key !== "string" ||
            !PREFIXES.some((prefix) => record.key.startsWith(prefix)) ||
            typeof record.value !== "string"
        )
      ) {
        respond(res, 400, { error: "Invalid Post Studio backup." });
        return true;
      }
      // Each write gets a new file. A stale tab or accidental clear leaves every earlier mapping recoverable.
      const saved = { savedAt: Date.now(), records: input.records };
      const write = pending
        .catch(() => {})
        .then(async () => {
          await fs.mkdir(directory, { recursive: true });
          const name = `${saved.savedAt}-${randomUUID()}.json`;
          const temporary = path.join(directory, `${name}.tmp`);
          await fs.writeFile(temporary, JSON.stringify(saved), { flag: "wx" });
          await fs.rename(temporary, path.join(directory, name));
          const check = JSON.parse(
            await fs.readFile(path.join(directory, name), "utf8")
          );
          if (JSON.stringify(check) !== JSON.stringify(saved))
            throw new Error("Could not verify the draft backup.");
        });
      pending = write;
      await write;
      respond(res, 200, { savedAt: saved.savedAt });
    } catch {
      respond(res, 500, {
        error:
          "Could not save the draft backup. Keep this editor open and download a backup.",
      });
    }
    return true;
  };
}

export function postStudioDraftStoragePlugin() {
  return {
    name: "post-studio-local-drafts",
    configureServer(server) {
      const handle = createPostStudioDraftStorage();
      server.middlewares.use((req, res, next) => {
        handle(req, res)
          .then((handled) => {
            if (!handled) next();
          })
          .catch(next);
      });
    },
  };
}
