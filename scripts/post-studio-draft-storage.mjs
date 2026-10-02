import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";

export const POST_STUDIO_DRAFT_PATH = "/_local/post-studio-drafts";
const MAX_BYTES = 12 * 1024 * 1024;
const PREFIXES = [
  "tka:post-studio:project:v2:",
  "tka:post-studio:take-timing:v1:",
];
const BACKUP_FORMAT = "post-studio-draft-v1";

function parsedJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function inScope(key, sequenceId) {
  return (
    sequenceId === null ||
    key === `${PREFIXES[0]}${sequenceId}` ||
    key.startsWith(`${PREFIXES[1]}${sequenceId}:`)
  );
}

// Mirrors `hasMapping` in post-project-backup.ts.
function hasMapping(timing) {
  return (
    Boolean(timing.confirmedAt) ||
    timing.sections.some(
      (section) =>
        section.taps.length > 0 ||
        section.overrides.length > 0 ||
        section.beatOneSeconds !== undefined ||
        section.lastPosition !== undefined ||
        section.tempo === "locked" ||
        section.offsetSeconds !== 0
    )
  );
}

/** The parts of `validTiming` in post-project-backup.ts that decide which saves can matter. */
function timingFact(timing, sequenceId, take) {
  if (
    !timing ||
    typeof timing !== "object" ||
    timing.sequenceId !== sequenceId ||
    typeof timing.takeKey !== "string" ||
    (take && timing.takeKey !== take.takeKey) ||
    !Number.isFinite(timing.updatedAt) ||
    !Array.isArray(timing.sections) ||
    timing.sections.length === 0 ||
    timing.sections.some(
      (section) =>
        !section ||
        !Array.isArray(section.taps) ||
        !Array.isArray(section.overrides) ||
        typeof section.offsetSeconds !== "number"
    )
  )
    return null;
  const last = timing.sections.at(-1);
  if (
    timing.sections[0].startSeconds !== 0 ||
    typeof last.endSeconds !== "number" ||
    (take && !(Math.abs(last.endSeconds - take.durationSeconds) < 0.001))
  )
    return null;
  return {
    updatedAt: timing.updatedAt,
    mapped: hasMapping(timing),
    hash: createHash("sha1").update(JSON.stringify(timing)).digest("hex"),
  };
}

/** What one saved record can contribute when a post is rebuilt. */
function recordFacts(record) {
  const facts = { key: record.key, updatedAt: undefined, timings: [] };
  const value = parsedJson(record.value);
  if (record.key.startsWith(PREFIXES[0])) {
    const sequenceId = record.key.slice(PREFIXES[0].length);
    const project =
      value && value.format === BACKUP_FORMAT && "project" in value
        ? value.project
        : value;
    if (
      !project ||
      typeof project !== "object" ||
      project.sequenceId !== sequenceId ||
      !Number.isFinite(project.updatedAt)
    )
      return facts;
    facts.updatedAt = project.updatedAt;
    for (const take of Array.isArray(project.takes) ? project.takes : []) {
      if (!take || typeof take !== "object") continue;
      const fact = timingFact(project.timings?.[take.id], sequenceId, take);
      if (fact)
        facts.timings.push({
          ...fact,
          group: [
            sequenceId,
            take.takeKey,
            JSON.stringify(take.ref),
            take.durationSeconds,
          ].join("\n"),
        });
    }
    return facts;
  }
  const fact = timingFact(value, value?.sequenceId);
  const key = fact && `${PREFIXES[1]}${value.sequenceId}:${value.takeKey}`;
  if (fact && (record.key === key || record.key === `${key}:previous`))
    facts.timings.push({
      ...fact,
      group: [
        value.sequenceId,
        value.takeKey,
        "standalone",
        value.sections.at(-1).endSeconds,
      ].join("\n"),
    });
  return facts;
}

/**
 * The saves that can change how `resolvePostStudioDraft` rebuilds a post: the
 * newest save of each key, the first project save with the highest
 * `updatedAt`, and for every take recording the first save holding its newest
 * timing, plus one save that mapped it so a later clear still counts as
 * deliberate. A stale tab that saves old timings under a newer project cannot
 * hide newer timings, because the saves holding them stay in the set. Takes
 * `{ facts }` entries in archive order and returns the kept ones in that order.
 */
export function selectDraftRecords(entries) {
  const keep = new Set();
  const newest = new Map();
  const projects = new Map();
  const groups = new Map();
  entries.forEach((entry, index) => {
    const { key, updatedAt, timings } = entry.facts;
    newest.set(key, index);
    const project = projects.get(key);
    if (updatedAt !== undefined && (!project || updatedAt > project.updatedAt))
      projects.set(key, { index, updatedAt });
    for (const timing of timings) {
      const group = groups.get(timing.group) ?? { latest: [], mapped: [] };
      groups.set(timing.group, group);
      const top = group.latest[0]?.updatedAt;
      if (top === undefined || timing.updatedAt > top)
        group.latest = [{ index, ...timing }];
      else if (timing.updatedAt === top)
        group.latest.push({ index, ...timing });
      if (timing.mapped) group.mapped.push(index);
    }
  });
  for (const index of newest.values()) keep.add(index);
  for (const { index } of projects.values()) keep.add(index);
  for (const { latest, mapped } of groups.values()) {
    // The resolver takes the first save on a tie. A kept save holding the
    // same timing gives the same result without sending another copy.
    const [first] = latest;
    if (
      !latest.some(
        (candidate) =>
          candidate.hash === first.hash && keep.has(candidate.index)
      )
    )
      keep.add(first.index);
    if (
      !first.mapped &&
      mapped.length > 0 &&
      !mapped.some((index) => keep.has(index))
    )
      keep.add(mapped.at(-1));
  }
  return entries.filter((_entry, index) => keep.has(index));
}

/** Local previews keep drafts outside the checkout so rebuilding or changing origins cannot erase them. */
export function createPostStudioDraftStorage(
  directory = path.join(os.homedir(), ".tka", "post-studio-drafts")
) {
  let pending = Promise.resolve();
  // Every autosave adds a file, and sending them all reached 80 MB per read,
  // enough to stall every tab sharing the dev server's HTTP/2 connection.
  // Files are never edited after they are written, so each one is parsed
  // once into the facts `selectDraftRecords` needs.
  const index = new Map();
  let indexing = Promise.resolve([]);

  async function refreshIndex() {
    await fs.mkdir(directory, { recursive: true });
    const names = (await fs.readdir(directory))
      .filter((name) => name.endsWith(".json"))
      .sort();
    const present = new Set(names);
    for (const name of index.keys()) if (!present.has(name)) index.delete(name);
    await Promise.all(
      names.map(async (name) => {
        const file = path.join(directory, name);
        const stat = await fs.stat(file).catch(() => null);
        const stamp = stat && `${stat.mtimeMs}:${stat.size}`;
        if (!stamp || index.get(name)?.stamp === stamp) return;
        const saved = parsedJson(
          await fs.readFile(file, "utf8").catch(() => "")
        );
        if (!saved || !Array.isArray(saved.records)) {
          index.delete(name);
          return;
        }
        index.set(name, {
          stamp,
          records: saved.records.flatMap((record, position) =>
            record &&
            typeof record.key === "string" &&
            typeof record.value === "string"
              ? [{ position, facts: recordFacts(record) }]
              : []
          ),
        });
      })
    );
    return names.filter((name) => index.has(name));
  }

  async function readRecords(sequenceId) {
    // Queued so a read that follows a save always indexes that save's file.
    const refreshed = indexing.catch(() => []).then(refreshIndex);
    indexing = refreshed;
    const entries = (await refreshed).flatMap((name) =>
      index
        .get(name)
        .records.filter(({ facts }) => inScope(facts.key, sequenceId))
        .map((record) => ({ name, ...record }))
    );
    const records = [];
    let file;
    for (const entry of selectDraftRecords(entries)) {
      if (file?.name !== entry.name)
        file = {
          name: entry.name,
          saved: parsedJson(
            await fs.readFile(path.join(directory, entry.name), "utf8")
          ),
        };
      const record = file.saved?.records?.[entry.position];
      if (record?.key === entry.facts.key) records.push(record);
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
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== POST_STUDIO_DRAFT_PATH) return false;
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
        respond(res, 200, {
          records: await readRecords(url.searchParams.get("sequenceId")),
        });
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
