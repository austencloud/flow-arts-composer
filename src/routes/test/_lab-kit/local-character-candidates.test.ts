import { describe, expect, it } from "vitest";
import {
  FIXED_LOCAL_CHARACTERS,
  INTAKE_MANIFEST_URL,
  formatMegabytes,
  loadAvailableCandidates,
  parseIntakeManifest,
  resolveCandidate,
  stagedCandidate,
} from "./local-character-candidates";

const valid = {
  id: "kate",
  label: "Kate",
  source: "Adobe Mixamo",
  file: "intake-kate.glb",
  bytes: 2_500_000,
  rig: { fingerChains: true },
};
const staged = [
  stagedCandidate(parseIntakeManifest({ candidates: [valid] })[0]!),
];
const metaPerson = FIXED_LOCAL_CHARACTERS["personal-metaperson"];
const available = [metaPerson, ...staged];

function fixtureFetch(
  responses: Record<string, Response | Error>
): typeof fetch {
  return async (input, options) => {
    const url = String(input);
    if (url !== INTAKE_MANIFEST_URL) {
      expect(options?.method).toBe("HEAD");
      expect(options?.cache).toBe("no-store");
    }
    const response = responses[url] ?? new Response(null, { status: 404 });
    if (response instanceof Error) throw response;
    return response;
  };
}
const binary = () =>
  new Response(null, { headers: { "content-type": "model/gltf-binary" } });
const manifest = () => new Response(JSON.stringify({ candidates: [valid] }));

describe("bake-off selection", () => {
  it.each([
    "avaturn",
    "avatar-sdk",
    "human-generator-trial",
    "human-generator-parity",
    "current-raw",
    "current-optimized",
    "intake-current",
    "ready-player-me-archived",
    "intake-juniper",
    "intake-marcus",
    null,
  ])("replaces obsolete link %s with an available model", (id) => {
    expect(resolveCandidate(id, available)).toBe(metaPerson);
  });
  it("retains an available selection and falls back without inventing a missing model", () => {
    expect(resolveCandidate("intake-kate", available)).toBe(staged[0]);
    expect(resolveCandidate("personal-metaperson", staged)).toBe(staged[0]);
    expect(resolveCandidate("avaturn", [])).toBeNull();
  });
  it("formats an unknown local file size", () => {
    expect(formatMegabytes(null)).toBe("local staged file");
  });
});

describe("usable intake entries", () => {
  it("invalidates the model cache when a character is repaired in place", () => {
    const model = (sha256: string) =>
      stagedCandidate(
        parseIntakeManifest({
          candidates: [{ ...valid, sha256 }],
        })[0]!
      );
    expect(model("a".repeat(64)).id).toBe(model("b".repeat(64)).id);
    expect(model("a".repeat(64)).modelUrl).not.toBe(
      model("b".repeat(64)).modelUrl
    );
    expect(model("invalid?hash").modelUrl).toBe(staged[0]!.modelUrl);
  });
  it("keeps Marcus rejected even when a staged file has complete fingers", () => {
    const entries = parseIntakeManifest({
      candidates: [
        valid,
        { ...valid, id: "marcus", file: "intake-marcus.glb" },
      ],
    });
    expect(entries.map((entry) => entry.id)).toEqual(["kate"]);
  });
  it("requires complete fingers and safe unique model paths", () => {
    const entries = parseIntakeManifest({
      candidates: [
        valid,
        { ...valid, file: "duplicate.glb" },
        { ...valid, id: "../escape" },
        { ...valid, id: "unsafe", file: "../escape.glb" },
        { ...valid, id: "html", file: "page.html" },
        { ...valid, id: "juniper", rig: { fingerChains: false } },
        { ...valid, id: "unknown", rig: undefined },
        "garbage",
      ],
    });
    expect(entries.map((entry) => entry.id)).toEqual(["kate"]);
    expect(parseIntakeManifest(null)).toEqual([]);
    expect(parseIntakeManifest({ candidates: "bad" })).toEqual([]);
  });
});

describe("model availability", () => {
  it("offers only models whose files exist, in stable order", async () => {
    const result = await loadAvailableCandidates(
      fixtureFetch({
        [INTAKE_MANIFEST_URL]: manifest(),
        [metaPerson.modelUrl]: binary(),
        [staged[0]!.modelUrl]: binary(),
      })
    );
    expect(result.map((candidate) => candidate.id)).toEqual([
      "personal-metaperson",
      "intake-kate",
    ]);
  });
  it.each([
    ["missing", () => new Response(null, { status: 404 })],
    [
      "HTML fallback",
      () => new Response("app", { headers: { "content-type": "text/html" } }),
    ],
    ["network failure", () => new Error("offline")],
  ])(
    "hides a %s model even when its manifest entry remains",
    async (_name, response) => {
      const result = await loadAvailableCandidates(
        fixtureFetch({
          [INTAKE_MANIFEST_URL]: manifest(),
          [metaPerson.modelUrl]: response(),
          [staged[0]!.modelUrl]: binary(),
        })
      );
      expect(result.map((candidate) => candidate.id)).toEqual(["intake-kate"]);
    }
  );
  it("retains the recovered model when the manifest is unavailable or malformed", async () => {
    for (const response of [
      new Response(null, { status: 404 }),
      new Response("invalid json"),
      new Error("offline"),
    ]) {
      const result = await loadAvailableCandidates(
        fixtureFetch({
          [INTAKE_MANIFEST_URL]: response,
          [metaPerson.modelUrl]: binary(),
        })
      );
      expect(result.map((candidate) => candidate.id)).toEqual([
        "personal-metaperson",
      ]);
    }
  });
  it("returns an empty comparison when no model is available", async () => {
    expect(await loadAvailableCandidates(fixtureFetch({}))).toEqual([]);
  });
});
