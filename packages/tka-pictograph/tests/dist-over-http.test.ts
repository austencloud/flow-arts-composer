import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The built bundle, as a consumer gets it; `npm test` builds it first.
import { pictographsForLetter, renderPictographSvg, urlArtSource } from "../dist/index.js";
import { baselineSvg, cases } from "./cases.js";

const assets = fileURLToPath(new URL("../assets/", import.meta.url));

let server: Server;
let base: string;
const requested: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    requested.push(path);
    const file = normalize(join(assets, path));
    if (!file.startsWith(normalize(assets)) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200);
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterAll(() => new Promise<void>((done) => server.close(() => done())));

describe("the built bundle drawing with art fetched over HTTP", () => {
  it.each(cases)("$name", async ({ name, input, prop }) => {
    const svg = await renderPictographSvg(input, {
      art: urlArtSource(base),
      darkMode: true,
      showTKA: true,
      leftPropType: prop,
      rightPropType: prop,
    });
    expect(svg).toBe(baselineSvg(name));
  });

  it("fetched art rather than reading the disk", () => {
    expect(requested.some((p) => p.startsWith("/images/"))).toBe(true);
  });

  it("draws from its own packaged art when no source is given", async () => {
    const [first] = cases;
    const svg = await renderPictographSvg(first.input, {
      darkMode: true,
      showTKA: true,
      leftPropType: first.prop,
      rightPropType: first.prop,
    });
    expect(svg).toBe(baselineSvg(first.name));
  });

  it("finds every letter of a placement group", () => {
    expect(pictographsForLetter("A", { start: "alpha" }).length).toBeGreaterThan(1);
  });
});
