/**
 * Registration-ordering contract for the video export orchestrator.
 *
 * The factory registers as a side effect of
 * composition-root/deferred-registrations, which the root layout schedules on
 * an idle callback (2s timeout). Hosts that can reach a video export before
 * that idle slot — the Browse animation sheet, the sequence viewer shell's
 * export panel and the Create export drawer used to resolve
 * the orchestrator eagerly and threw
 * "VideoExportOrchestrator factory not registered".
 *
 * The fix is a single seam, ensureVideoExportOrchestrator(), which loads the
 * deferred registrations on demand. This test locks both halves: the seam
 * works, and no host resolves eagerly again.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  ensureVideoExportOrchestrator,
  getVideoExportOrchestrator,
} from "#lib/shared/animation-engine/get-video-export-orchestrator.js";

// Stand in for the real deferred-registrations module (which pulls mediabunny,
// WebCodecs and Firestore). It registers a stub factory the same way the real
// module does, so the ordering behaviour under test is unchanged.
vi.mock("#lib/shared/composition-root/deferred-registrations.js", async () => {
  const { registerVideoExportOrchestratorFactory } =
    await import("#lib/shared/animation-engine/get-video-export-orchestrator.js");
  registerVideoExportOrchestratorFactory(
    () => ({ __stub: true }) as unknown as never
  );
  return {};
});

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

const HOSTS = [
  "src/lib/shared/coordinators/AnimationSheetCoordinator.svelte",
  "src/lib/features/create/shared/components/coordinators/SequenceDrawerHost.svelte",
  "src/lib/shared/sequence-viewer/services/sequence-modal-exporter.svelte.ts",
];

describe("video export orchestrator registration", () => {
  // Order matters: this must observe the unregistered state before the ensure
  // test below loads the (mocked) deferred registrations.
  it("throws when nothing has registered the factory yet", () => {
    expect(() => getVideoExportOrchestrator()).toThrow(
      /factory not registered/
    );
  });

  it("resolves after loading the deferred registrations on demand", async () => {
    await expect(ensureVideoExportOrchestrator()).resolves.toBeTruthy();
    expect(getVideoExportOrchestrator()).toBeTruthy();
  });
});

describe("export hosts do not resolve the orchestrator eagerly", () => {
  it.each(HOSTS)("%s routes through the ensure seam", (rel) => {
    const source = readFileSync(path.join(repoRoot, rel), "utf8");
    expect(source).toContain("ensureVideoExportOrchestrator");
    // The throwing getter must not appear in a host: calling it is what races
    // the idle-scheduled registration.
    expect(source).not.toContain("getVideoExportOrchestrator");
  });
});
