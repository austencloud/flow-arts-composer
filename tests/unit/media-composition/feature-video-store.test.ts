import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FeatureVideoError,
  createFeatureVideoStore,
  type FeatureVideoStore,
} from "$lib/server/feature-video-store";
import { featureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video";
import { takeFileKey } from "$lib/shared/media-composition/domain/post-plan";
import { tempFeatureRoot } from "./feature-video-test-helpers";

const NOW = 1_780_000_000_000;
const SEQUENCE = "DCK\u03a8-";
const promo = { slug: "promo", title: "Promo 1.0", sequenceId: SEQUENCE };
/** A take picked on this device: it plays only in the browser that picked it. */
const phoneRef = {
  kind: "local" as const,
  name: "phone.mp4",
  size: 100,
  lastModified: 5,
};
const phoneTake = {
  id: "take-phone",
  label: "phone",
  ref: phoneRef,
  takeKey: takeFileKey(phoneRef),
  durationSeconds: 5,
};

let root: string;
let store: FeatureVideoStore;

beforeEach(async () => {
  root = await tempFeatureRoot();
  store = createFeatureVideoStore(root);
});

afterEach(async () => {
  // Windows can hold a file a test just wrote for a moment after it is
  // deleted, and then its folder will not go yet.
  await fs.rm(root, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

async function refusal(
  run: () => Promise<unknown>
): Promise<FeatureVideoError> {
  try {
    await run();
  } catch (cause) {
    if (cause instanceof FeatureVideoError) return cause;
    throw cause;
  }
  throw new Error("Expected the store to refuse.");
}

describe("creating", () => {
  it("lays out the folder and writes revision 1", async () => {
    const { file, folder } = await store.create(
      { ...promo, canvas: "16:9" },
      NOW
    );
    expect(folder).toBe(path.join(root, "promo"));
    expect(file).toMatchObject({
      format: "feature-video-v1",
      slug: "promo",
      title: "Promo 1.0",
      revision: 1,
      savedAt: NOW,
    });
    expect(file.project).toMatchObject({
      sequenceId: SEQUENCE,
      canvas: "16:9",
      takes: [],
    });
    for (const sub of [
      "history",
      "captures",
      "exports",
      "media/footage",
      "media/captures",
      "media/music",
      "media/images",
    ])
      expect((await fs.stat(path.join(folder, sub))).isDirectory()).toBe(true);
    const written = JSON.parse(
      await fs.readFile(path.join(folder, "project.json"), "utf8")
    ) as unknown;
    expect(written).toEqual(file);
  });

  it("leaves the default 9:16 canvas unset", async () => {
    const { file } = await store.create({ ...promo, canvas: "9:16" }, NOW);
    expect(file.project.canvas).toBeUndefined();
  });

  it("refuses a name in use, a bad name, a bad canvas and a blank title", async () => {
    await store.create(promo, NOW);
    expect((await refusal(() => store.create(promo, NOW))).status).toBe(409);
    expect(
      (await refusal(() => store.create({ ...promo, slug: "Promo" }, NOW)))
        .status
    ).toBe(400);
    expect(
      (
        await refusal(() =>
          store.create({ ...promo, slug: "other", canvas: "2:7" }, NOW)
        )
      ).status
    ).toBe(400);
    expect(
      (
        await refusal(() =>
          store.create({ ...promo, slug: "other", title: "   " }, NOW)
        )
      ).status
    ).toBe(400);
  });
});

describe("reading", () => {
  it("returns the file and its fingerprint", async () => {
    const { file } = await store.create(promo, NOW);
    const read = await store.read("promo");
    expect(read.file).toEqual(file);
    expect(read.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(read.folder).toBe(path.join(root, "promo"));
  });

  it("answers 404 for a missing project", async () => {
    expect((await refusal(() => store.read("missing"))).status).toBe(404);
  });

  it("answers 422 for a broken file and points at history", async () => {
    await store.create(promo, NOW);
    await fs.writeFile(path.join(root, "promo", "project.json"), "{ broken");
    const refused = await refusal(() => store.read("promo"));
    expect(refused.status).toBe(422);
    expect(refused.message).toContain("history/");
  });
});

describe("saving", () => {
  it("writes the next revision and keeps the old file in history", async () => {
    const { file } = await store.create(promo, NOW);
    const before = await fs.readFile(
      path.join(root, "promo", "project.json"),
      "utf8"
    );
    const saved = await store.write(
      "promo",
      { baseRevision: 1, project: { ...file.project, audio: "silent" } },
      NOW + 5
    );
    expect(saved).toMatchObject({ revision: 2, savedAt: NOW + 5 });
    expect((await store.read("promo")).file).toMatchObject({
      revision: 2,
      project: { audio: "silent" },
    });
    expect(
      await fs.readFile(
        path.join(root, "promo", "history", "r000001.json"),
        "utf8"
      )
    ).toBe(before);
  });

  it("refuses a save from an older revision and names the newer one", async () => {
    const { file } = await store.create(promo, NOW);
    await store.write(
      "promo",
      { baseRevision: 1, project: { ...file.project, audio: "silent" } },
      NOW + 1
    );
    const refused = await refusal(() =>
      store.write("promo", { baseRevision: 1, project: file.project }, NOW + 2)
    );
    expect(refused).toMatchObject({ status: 409, revision: 2 });
    expect((await store.read("promo")).file.project.audio).toBe("silent");
  });

  it("refuses an invalid post and a change of sequence", async () => {
    const { file } = await store.create(promo, NOW);
    expect(
      (
        await refusal(() =>
          store.write(
            "promo",
            { baseRevision: 1, project: { ...file.project, tracks: [] } },
            NOW
          )
        )
      ).status
    ).toBe(422);
    expect(
      (
        await refusal(() =>
          store.write(
            "promo",
            {
              baseRevision: 1,
              project: { ...file.project, sequenceId: "other" },
            },
            NOW
          )
        )
      ).status
    ).toBe(422);
  });

  it("keeps only the newest saves in history", async () => {
    const small = createFeatureVideoStore(root, { historyLimit: 3 });
    const { file } = await small.create(promo, NOW);
    for (let revision = 1; revision <= 5; revision += 1)
      await small.write(
        "promo",
        {
          baseRevision: revision,
          project: { ...file.project, updatedAt: NOW + revision },
        },
        NOW + revision
      );
    expect(
      (await fs.readdir(path.join(root, "promo", "history"))).sort()
    ).toEqual(["r000003.json", "r000004.json", "r000005.json"]);
  });

  it("takes one of two saves from the same revision and refuses the other", async () => {
    const { file } = await store.create(promo, NOW);
    const results = await Promise.allSettled([
      store.write(
        "promo",
        { baseRevision: 1, project: { ...file.project, audio: "silent" } },
        NOW + 1
      ),
      store.write(
        "promo",
        { baseRevision: 1, project: { ...file.project, mirrored: true } },
        NOW + 2
      ),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const rejected = results.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      status: 409,
    });
  });

  it("takes one of two saves from two dev servers on one root", async () => {
    // Two stores on one root stand in for two dev servers, such as the
    // primary checkout's and a worktree's; each orders only its own saves.
    for (let round = 0; round < 20; round += 1) {
      const slug = `race-${round}`;
      const first = createFeatureVideoStore(root);
      const second = createFeatureVideoStore(root);
      const { file } = await first.create({ ...promo, slug }, NOW);
      const results = await Promise.allSettled([
        first.write(
          slug,
          { baseRevision: 1, project: { ...file.project, audio: "silent" } },
          NOW + 1
        ),
        second.write(
          slug,
          { baseRevision: 1, project: { ...file.project, mirrored: true } },
          NOW + 2
        ),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([
        "fulfilled",
        "rejected",
      ]);
      const rejected = results.find((result) => result.status === "rejected");
      expect((rejected as PromiseRejectedResult).reason).toMatchObject({
        status: 409,
      });
      expect(await fs.readdir(path.join(root, slug))).not.toContain(".lock");
    }
  });

  it("clears a lock a stopped save left behind", async () => {
    const { file } = await store.create(promo, NOW);
    const lock = path.join(root, "promo", ".lock");
    await fs.writeFile(lock, "");
    const old = new Date(Date.now() - 60_000);
    await fs.utimes(lock, old, old);
    expect(
      await store.write(
        "promo",
        { baseRevision: 1, project: { ...file.project, audio: "silent" } },
        NOW + 1
      )
    ).toMatchObject({ revision: 2 });
    expect(await fs.readdir(path.join(root, "promo"))).not.toContain(".lock");
  });

  it("refuses a post that plays a video picked on this device", async () => {
    const { file } = await store.create(promo, NOW);
    const refused = await refusal(() =>
      store.write(
        "promo",
        { baseRevision: 1, project: { ...file.project, takes: [phoneTake] } },
        NOW + 1
      )
    );
    expect(refused.status).toBe(422);
    expect(refused.message).toContain(
      "node scripts/post-project.mjs add-take <file> --feature promo"
    );
    expect(await store.revision("promo")).toBe(1);
  });
});

describe("revision", () => {
  it("follows saves and hand edits, and is null once the file is gone", async () => {
    const { file } = await store.create(promo, NOW);
    expect(await store.revision("promo")).toBe(1);
    await store.write(
      "promo",
      { baseRevision: 1, project: file.project },
      NOW + 1
    );
    expect(await store.revision("promo")).toBe(2);
    await fs.writeFile(
      path.join(root, "promo", "project.json"),
      JSON.stringify({ ...file, revision: 17 })
    );
    expect(await store.revision("promo")).toBe(17);
    await fs.rm(path.join(root, "promo", "project.json"));
    expect(await store.revision("promo")).toBeNull();
    expect(await store.revision("missing")).toBeNull();
  });
});

describe("listing", () => {
  it("is empty before the root folder exists", async () => {
    expect(
      await createFeatureVideoStore(path.join(root, "not-yet")).list()
    ).toEqual({ projects: [], unreadable: [] });
  });

  it("lists projects newest first, skips stray folders and names unreadable ones", async () => {
    await store.create(promo, NOW);
    await store.create({ ...promo, slug: "later", title: "Later" }, NOW + 10);
    await fs.mkdir(path.join(root, "Not A Name"));
    await fs.mkdir(path.join(root, "empty"));
    await store.create({ ...promo, slug: "broken" }, NOW);
    await fs.writeFile(path.join(root, "broken", "project.json"), "nope");
    expect(await store.list()).toEqual({
      projects: [
        {
          slug: "later",
          title: "Later",
          revision: 1,
          savedAt: NOW + 10,
          sequenceId: SEQUENCE,
        },
        {
          slug: "promo",
          title: "Promo 1.0",
          revision: 1,
          savedAt: NOW,
          sequenceId: SEQUENCE,
        },
      ],
      unreadable: ["broken"],
    });
  });
});

describe("named edits", () => {
  it("applies them as the next revision, and writes nothing when they change nothing", async () => {
    await store.create(promo, NOW);
    expect(
      await store.applyOps(
        "promo",
        [{ op: "background", background: "blur" }],
        NOW + 1
      )
    ).toMatchObject({ status: "applied", revision: 2, savedAt: NOW + 1 });
    expect((await store.read("promo")).file.project.background).toBe("blur");
    expect(
      await store.applyOps(
        "promo",
        [{ op: "background", background: "blur" }],
        NOW + 2
      )
    ).toMatchObject({ status: "unchanged", revision: 2 });
    expect(await fs.readdir(path.join(root, "promo", "history"))).toEqual([
      "r000001.json",
    ]);
  });

  it("refuses an edit that fails and leaves the file alone", async () => {
    await store.create(promo, NOW);
    const refused = await refusal(() =>
      store.applyOps("promo", [{ op: "remove-take", take: "nope" }], NOW + 1)
    );
    expect(refused.status).toBe(400);
    expect(refused.message).toContain('No take "nope"');
    expect(await store.revision("promo")).toBe(1);
  });

  it("refuses edits that keep a video picked on this device, and lets one remove it", async () => {
    const { file } = await store.create(promo, NOW);
    // A hand edit put the take on disk.
    await fs.writeFile(
      path.join(root, "promo", "project.json"),
      `${JSON.stringify(
        { ...file, project: { ...file.project, takes: [phoneTake] } },
        null,
        2
      )}\n`
    );
    const refused = await refusal(() =>
      store.applyOps(
        "promo",
        [{ op: "background", background: "blur" }],
        NOW + 1
      )
    );
    expect(refused.status).toBe(422);
    expect(await store.revision("promo")).toBe(1);
    expect(
      await store.applyOps(
        "promo",
        [{ op: "remove-take", take: "take-phone" }],
        NOW + 2
      )
    ).toMatchObject({ status: "applied", revision: 2 });
  });
});

describe("duplicating", () => {
  async function promoWithTake() {
    await store.create(promo, NOW);
    await fs.writeFile(
      path.join(root, "promo", "media", "footage", "a.mp4"),
      "video"
    );
    const url = featureVideoMediaUrl("promo", "footage/a.mp4");
    await store.applyOps(
      "promo",
      [{ op: "add-take", url, durationSeconds: 4, append: true }],
      NOW + 1
    );
    return url;
  }

  it("copies the media and points the copy at its own files", async () => {
    const original = await promoWithTake();
    const { file, folder } = await store.duplicate(
      "promo",
      { slug: "promo-30s" },
      NOW + 5
    );
    const moved = featureVideoMediaUrl("promo-30s", "footage/a.mp4");
    expect(file).toMatchObject({
      slug: "promo-30s",
      title: "Promo 1.0 (copy)",
      revision: 1,
      savedAt: NOW + 5,
    });
    expect(file.project.takes[0]).toMatchObject({
      ref: { kind: "linked", url: moved },
      takeKey: `linked:${moved}`,
    });
    expect(
      await fs.readFile(path.join(folder, "media", "footage", "a.mp4"), "utf8")
    ).toBe("video");
    expect(await fs.readdir(path.join(folder, "history"))).toEqual([]);
    expect((await store.read("promo")).file.project.takes[0]?.ref).toEqual({
      kind: "linked",
      url: original,
    });
  });

  it("can play the original's media instead of copying it", async () => {
    const original = await promoWithTake();
    const { file, folder } = await store.duplicate(
      "promo",
      { slug: "promo-cut", title: "Cut", shareMedia: true },
      NOW + 5
    );
    expect(file.title).toBe("Cut");
    expect(file.project.takes[0]?.ref).toEqual({
      kind: "linked",
      url: original,
    });
    expect(await fs.readdir(path.join(folder, "media", "footage"))).toEqual([]);
  });

  it("brings the capture scripts but not their frames, even when sharing media", async () => {
    await store.create(promo, NOW);
    const captures = path.join(root, "promo", "captures");
    await fs.writeFile(
      path.join(captures, "builder.capture.mjs"),
      "export default {};"
    );
    await fs.mkdir(path.join(captures, "frames", "builder"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(captures, "frames", "builder", "00000.jpg"),
      "frame"
    );
    const { folder } = await store.duplicate(
      "promo",
      { slug: "promo-cut", shareMedia: true },
      NOW + 5
    );
    expect(await fs.readdir(path.join(folder, "captures"))).toEqual([
      "builder.capture.mjs",
    ]);
    expect(
      await fs.readFile(
        path.join(folder, "captures", "builder.capture.mjs"),
        "utf8"
      )
    ).toBe("export default {};");
  });

  it("refuses a name in use and a missing original", async () => {
    await store.create(promo, NOW);
    await store.create({ ...promo, slug: "taken" }, NOW);
    expect(
      (await refusal(() => store.duplicate("promo", { slug: "taken" }))).status
    ).toBe(409);
    expect(
      (await refusal(() => store.duplicate("missing", { slug: "new" }))).status
    ).toBe(404);
  });
});
