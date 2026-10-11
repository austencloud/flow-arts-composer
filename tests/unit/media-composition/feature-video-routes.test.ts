import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { heartbeatPostProject } from "#lib/server/post-project-dev-bridge.js";
import {
  GET as listRoute,
  POST as createRoute,
} from "../../../src/routes/api/dev/feature-videos/+server";
import {
  GET as readRoute,
  PUT as saveRoute,
} from "../../../src/routes/api/dev/feature-videos/[slug]/+server";
import { GET as mediaRoute } from "../../../src/routes/api/dev/feature-videos/[slug]/media/[...path]/+server";
import { POST as opsRoute } from "../../../src/routes/api/dev/feature-videos/[slug]/ops/+server";
import { POST as duplicateRoute } from "../../../src/routes/api/dev/feature-videos/[slug]/duplicate/+server";
import {
  routeEvent,
  tempFeatureRoot,
  thrownStatus,
} from "./feature-video-test-helpers";

const SEQUENCE = "DCK\u03a8-";
const promo = { slug: "promo", title: "Promo 1.0", sequenceId: SEQUENCE };

let root: string;
let savedRoot: string | undefined;

beforeEach(async () => {
  savedRoot = process.env.TKA_FEATURE_VIDEO_ROOT;
  root = await tempFeatureRoot();
  process.env.TKA_FEATURE_VIDEO_ROOT = root;
});

afterEach(async () => {
  if (savedRoot === undefined) delete process.env.TKA_FEATURE_VIDEO_ROOT;
  else process.env.TKA_FEATURE_VIDEO_ROOT = savedRoot;
  await fs.rm(root, { recursive: true, force: true });
});

const create = (body: Record<string, unknown>) =>
  createRoute(
    routeEvent("/api/dev/feature-videos", {
      method: "POST",
      body: JSON.stringify(body),
    }) as never
  );
const read = (slug: string) =>
  readRoute(
    routeEvent(`/api/dev/feature-videos/${slug}`, { params: { slug } }) as never
  );
const save = (slug: string, body: Record<string, unknown>) =>
  saveRoute(
    routeEvent(`/api/dev/feature-videos/${slug}`, {
      method: "PUT",
      params: { slug },
      body: JSON.stringify(body),
    }) as never
  );

describe("feature video routes", () => {
  it("creates, lists, reads and saves", async () => {
    expect((await create({ ...promo, canvas: "9:16" })).status).toBe(201);
    const listed = await (
      await listRoute(routeEvent("/api/dev/feature-videos") as never)
    ).json();
    expect(
      listed.projects.map((entry: { slug: string }) => entry.slug)
    ).toEqual(["promo"]);
    const { file } = await (await read("promo")).json();
    expect(file.revision).toBe(1);
    const saved = await save("promo", {
      baseRevision: 1,
      project: { ...file.project, audio: "silent" },
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ revision: 2 });
  });

  it("answers a stale save with 409 and the newer revision", async () => {
    await create(promo);
    const { file } = await (await read("promo")).json();
    await save("promo", {
      baseRevision: 1,
      project: { ...file.project, audio: "silent" },
    });
    const stale = await save("promo", {
      baseRevision: 1,
      project: file.project,
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ revision: 2 });
    expect(
      await thrownStatus(() =>
        save("promo", { baseRevision: "1", project: file.project })
      )
    ).toBe(400);
  });

  it("turns refusals into HTTP errors", async () => {
    expect(await thrownStatus(() => create({ ...promo, slug: "Bad" }))).toBe(
      400
    );
    expect(await thrownStatus(() => create({ ...promo, title: 5 }))).toBe(400);
    await create(promo);
    expect(await thrownStatus(() => create(promo))).toBe(409);
    expect(await thrownStatus(() => read("missing"))).toBe(404);
    expect(
      await thrownStatus(() =>
        listRoute(
          routeEvent("/api/dev/feature-videos", {
            origin: "http://evil.test",
          }) as never
        )
      )
    ).toBe(403);
  });

  it("serves media whole and in byte ranges, and nothing outside it", async () => {
    await create(promo);
    await fs.writeFile(
      path.join(root, "promo", "media", "footage", "a.mp4"),
      "0123456789"
    );
    const media = (file: string, range?: string) =>
      mediaRoute(
        routeEvent(`/api/dev/feature-videos/promo/media/${file}`, {
          params: { slug: "promo", path: file },
          ...(range ? { headers: { range } } : {}),
        }) as never
      );
    const whole = await media("footage/a.mp4");
    expect(whole.status).toBe(200);
    expect(await whole.text()).toBe("0123456789");
    const part = await media("footage/a.mp4", "bytes=4-");
    expect(part.status).toBe(206);
    expect(await part.text()).toBe("456789");
    expect(await thrownStatus(() => media("../project.json"))).toBe(400);
    expect(await thrownStatus(() => media("footage/missing.mp4"))).toBe(404);
  });
});

describe("named edits and copies", () => {
  const ops = (slug: string, body: unknown) =>
    opsRoute(
      routeEvent(`/api/dev/feature-videos/${slug}/ops`, {
        method: "POST",
        params: { slug },
        body: JSON.stringify(body),
      }) as never
    );
  const duplicate = (slug: string, body: unknown) =>
    duplicateRoute(
      routeEvent(`/api/dev/feature-videos/${slug}/duplicate`, {
        method: "POST",
        params: { slug },
        body: JSON.stringify(body),
      }) as never
    );

  it("applies named edits to the file", async () => {
    await create(promo);
    const applied = await ops("promo", {
      ops: [{ op: "background", background: "blur" }],
    });
    expect(await applied.json()).toMatchObject({
      status: "applied",
      revision: 2,
    });
    expect(await thrownStatus(() => ops("promo", { ops: "background" }))).toBe(
      400
    );
    expect(
      await thrownStatus(() =>
        ops("promo", { ops: [{ op: "remove-take", take: "nope" }] })
      )
    ).toBe(400);
  });

  it("refuses while an editor holds the project", async () => {
    await create({ ...promo, slug: "held" });
    const { file } = await (await read("held")).json();
    heartbeatPostProject({
      sessionId: randomUUID(),
      revision: 0,
      snapshot: file.project,
      featureSlug: "held",
    });
    expect(
      await thrownStatus(() =>
        ops("held", { ops: [{ op: "background", background: "blur" }] })
      )
    ).toBe(409);
  });

  it("copies a project", async () => {
    await create(promo);
    const copied = await duplicate("promo", { slug: "promo-30s" });
    expect(copied.status).toBe(201);
    expect((await copied.json()).file).toMatchObject({
      slug: "promo-30s",
      title: "Promo 1.0 (copy)",
      revision: 1,
    });
    expect(await thrownStatus(() => duplicate("promo", { slug: 5 }))).toBe(400);
  });
});
