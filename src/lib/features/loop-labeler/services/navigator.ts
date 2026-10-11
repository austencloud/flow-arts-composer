import type { LabeledSequence } from "./types";
import {
  mutateCurrentUrl,
  writeUrl,
} from "#lib/shared/navigation/services/url-state.js";

/**
 * Navigation and utility functions for the LOOP labeler
 */

export function getNextIndex(
  currentIndex: number,
  totalSequences: number
): number {
  if (currentIndex < totalSequences - 1) {
    return currentIndex + 1;
  }
  return currentIndex;
}

export function getPreviousIndex(currentIndex: number): number {
  if (currentIndex > 0) {
    return currentIndex - 1;
  }
  return currentIndex;
}

export function updateUrlWithSequence(
  sequenceId: string | null,
  filterMode?: string,
  addToHistory: boolean = true
): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  if (sequenceId) {
    url.searchParams.set("seq", sequenceId);
  } else {
    url.searchParams.delete("seq");
  }

  if (filterMode) {
    url.searchParams.set("filter", filterMode);
  }

  // Store sequence ID in history state for popstate handling
  writeUrl(url, {
    mode: addToHistory ? "push" : "replace",
    state: {
      sequenceId,
      ...(filterMode ? { filterMode } : {}),
    },
    removeState: ["sequenceId", "filterMode"],
  });
}

export function getSequenceFromUrl(): string | null {
  if (typeof window === "undefined") return null;

  const url = new URL(window.location.href);
  return url.searchParams.get("seq");
}

export function getFilterFromUrl(): string | null {
  if (typeof window === "undefined") return null;

  const url = new URL(window.location.href);
  return url.searchParams.get("filter");
}

export function updateUrlWithFilter(filterMode: string): void {
  if (typeof window === "undefined") return;

  mutateCurrentUrl(
    (url) => {
      url.searchParams.set("filter", filterMode);
    },
    { state: { filterMode } }
  );
}

export function exportLabelsAsJson(labels: Map<string, LabeledSequence>): void {
  const data = Object.fromEntries(labels);
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `loop-labels-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importLabelsFromJson(
  file: File
): Promise<Map<string, LabeledSequence>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as Record<
          string,
          LabeledSequence
        >;
        const labels = new Map(Object.entries(data));
        resolve(labels);
      } catch (error) {
        console.error("Failed to import labels:", error);
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    reader.readAsText(file);
  });
}
