/**
 * LocalPoseLabelRepository
 *
 * Phase 1 persistence for pose labels:
 *   - localStorage is the working copy (write-through, cheap, survives reloads)
 *   - A canonical JSON file committed to the repo is the long-term source of truth
 *   - loadAll() merges both, letting whichever has the newer labeledAt win
 *   - exportJson() downloads the current labels map as a JSON file that the
 *     reviewer manually commits
 *
 * A test seam (__setCanonicalLoader) lets unit tests supply a fake canonical
 * loader without touching the filesystem or Vite's import resolution.
 */

import type {
  PoseLabel,
  PoseLabelsFile,
} from "../domain/types";

const STORAGE_KEY = "tka:collision-lab:diamond-in-out-labels";

type CanonicalLoader = () => Promise<PoseLabelsFile | null>;

/**
 * Default loader imports the committed JSON via Vite's JSON import.
 * Tests override this via __setCanonicalLoader.
 */
const defaultCanonicalLoader: CanonicalLoader = async () => {
  try {
    const mod = await import(
      "#lib/shared/3d/data/pose-catalog/diamond-in-out-labels.json"
    );
    return (mod.default ?? mod) as PoseLabelsFile;
  } catch {
    return null;
  }
};

export class LocalPoseLabelRepository {
  private canonicalLoader: CanonicalLoader = defaultCanonicalLoader;

  /** Test seam - replaces the canonical loader. */
  __setCanonicalLoader(loader: CanonicalLoader): void {
    this.canonicalLoader = loader;
  }

  async loadAll(): Promise<Record<string, PoseLabel>> {
    const canonical = await this.canonicalLoader();
    const local = this.readLocal();

    const merged: Record<string, PoseLabel> = {};

    // Start from canonical
    if (canonical?.labels) {
      for (const [id, label] of Object.entries(canonical.labels)) {
        merged[id] = label;
      }
    }

    // Overlay local where newer (or where canonical had no entry)
    for (const [id, localLabel] of Object.entries(local)) {
      const existing = merged[id];
      if (!existing) {
        merged[id] = localLabel;
        continue;
      }
      const localTs = localLabel.labeledAt ?? 0;
      const existingTs = existing.labeledAt ?? 0;
      if (localTs >= existingTs) {
        merged[id] = localLabel;
      }
    }

    return merged;
  }

  save(labels: Record<string, PoseLabel>): void {
    const file: PoseLabelsFile = {
      version: 1,
      mode: "diamond-in-out",
      generatedAt: Date.now(),
      labels,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
    } catch (e) {
      console.warn("LocalPoseLabelRepository: save failed", e);
    }
  }

  /**
   * Serializes the current labels to the on-disk file format.
   * Exposed for testability; exportJson() wraps this with the download flow.
   */
  serialize(labels: Record<string, PoseLabel>): string {
    const file: PoseLabelsFile = {
      version: 1,
      mode: "diamond-in-out",
      generatedAt: Date.now(),
      labels,
    };
    return JSON.stringify(file, null, 2) + "\n";
  }

  exportJson(labels: Record<string, PoseLabel>): void {
    const json = this.serialize(labels);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "diamond-in-out-labels.json";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  private readLocal(): Record<string, PoseLabel> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as PoseLabelsFile;
      if (parsed?.version !== 1) return {};
      return parsed.labels ?? {};
    } catch {
      return {};
    }
  }
}
