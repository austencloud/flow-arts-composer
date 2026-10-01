/**
 * The public-page Firebase check reads the build's chunk graph. Each case here
 * is a way it could pass while a page still downloads Firebase to start.
 */
import { describe, expect, it } from "vitest";
import {
  FIREBASE_CHUNK_NAME,
  inspectRoutes,
} from "../../../scripts/verify-public-firebase.mjs";

const node = (index: number) =>
  `.svelte-kit/generated/client-optimized/nodes/${index}.js`;

// A small build: a root layout (0), a group layout (3), a clean page (5), a
// page whose loader imports Firebase (6), and a page under a layout that
// imports Firebase (8, below layout 7).
const clientManifest = {
  "kit/entry.js": { file: "entry/start.js", name: "entry/start" },
  ".svelte-kit/generated/client-optimized/app.js": {
    file: "entry/app.js",
    name: "entry/app",
    imports: ["_shared.js"],
  },
  [node(0)]: { file: "nodes/0.js", name: "nodes/0", imports: ["_shared.js"] },
  [node(3)]: { file: "nodes/3.js", name: "nodes/3" },
  [node(5)]: { file: "nodes/5.js", name: "nodes/5", imports: ["_shared.js"] },
  [node(6)]: { file: "nodes/6.js", name: "nodes/6", imports: ["_loader.js"] },
  [node(7)]: { file: "nodes/7.js", name: "nodes/7", imports: ["_flags.js"] },
  [node(8)]: { file: "nodes/8.js", name: "nodes/8" },
  "_shared.js": { file: "chunks/shared.js", name: "shared" },
  "_loader.js": {
    file: "chunks/loader.js",
    name: "public-sequences-loader",
    imports: ["_shared.js", "_firebase.js"],
  },
  "_flags.js": {
    file: "chunks/flags.js",
    name: "feature-flags",
    imports: ["_firebase.js"],
  },
  "_firebase.js": { file: "chunks/firebase.js", name: FIREBASE_CHUNK_NAME },
};
const client = { start: "entry/start.js", app: "entry/app.js" };
const routes = [
  { id: "/(public)/clean", page: { layouts: [0, 3], leaf: 5 } },
  { id: "/(public)/loader", page: { layouts: [0, 3], leaf: 6 } },
  // SvelteKit leaves a hole where a directory has no layout of its own.
  { id: "/flagged/page", page: { layouts: [0, undefined, 7], leaf: 8 } },
  { id: "/api/thing", page: null },
];

const inspect = (routeIds: string[], manifest = clientManifest) =>
  inspectRoutes({ clientManifest: manifest, client, routes, routeIds });

describe("verify-public-firebase", () => {
  it("passes a page whose startup chunks never reach Firebase", () => {
    expect(inspect(["/(public)/clean"])).toEqual([
      { id: "/(public)/clean", firebase: false, importers: [] },
    ]);
  });

  it("follows shared chunks to Firebase and names the chunk that imports it", () => {
    expect(inspect(["/(public)/loader"])).toEqual([
      {
        id: "/(public)/loader",
        firebase: true,
        importers: ["public-sequences-loader"],
      },
    ]);
  });

  it("counts Firebase reached through a layout, not only the page", () => {
    expect(inspect(["/flagged/page"])).toEqual([
      { id: "/flagged/page", firebase: true, importers: ["feature-flags"] },
    ]);
  });

  it("reports a listed route the build does not have instead of passing it", () => {
    const [missing, endpoint] = inspect(["/(public)/renamed", "/api/thing"]);
    expect(missing?.error).toBeTruthy();
    expect(endpoint?.error).toBeTruthy();
  });

  it("skips a node with no browser code but reports one whose file is missing", () => {
    // Node 9 stands for a +page.server.ts that only redirects: the client
    // manifest has no entry for it. Skipping every missing node would let a
    // changed output format pass pages unchecked.
    const redirect = { id: "/redirect", page: { layouts: [0], leaf: 9 } };
    const check = (serverOnlyNodes?: Set<number>) =>
      inspectRoutes({
        clientManifest,
        client,
        routes: [redirect],
        routeIds: ["/redirect"],
        serverOnlyNodes,
      });
    expect(check(new Set([9]))).toEqual([
      { id: "/redirect", firebase: false, importers: [] },
    ]);
    expect(check()[0]?.error).toContain("node 9");
  });

  it("refuses to run when the Firebase chunk cannot be found", () => {
    // A renamed chunk would otherwise make every page look clean.
    const renamed = {
      ...clientManifest,
      "_firebase.js": { file: "chunks/firebase.js", name: "vendor-auth" },
    };
    expect(() => inspect(["/(public)/loader"], renamed)).toThrow(
      FIREBASE_CHUNK_NAME
    );
  });
});
