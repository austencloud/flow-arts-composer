import type { PostProjectChoice } from "../services/post-workspace-projects.js";
import type { FeatureVideoSummary } from "#lib/shared/media-composition/domain/feature-video.js";
import { studioProjectKindFromId } from "#lib/shared/media-composition/domain/studio-project-id.js";

export type StudioIntent = "tutorial" | "showcase" | "arrangement";

/** One name per kind, used by the start buttons, the filter and the cards. */
export const studioKindLabels: Record<StudioIntent, { one: string; many: string }> =
  {
    tutorial: { one: "Tutorial", many: "Tutorials" },
    showcase: { one: "Showcase", many: "Showcases" },
    arrangement: { one: "Arrangement", many: "Arrangements" },
  };

export interface StudioLibraryEntry {
  id: string;
  title: string;
  /** Tells apart entries of one kind that share a title. */
  subtitle?: string;
  word: string;
  updatedAt: number;
  kind: StudioIntent;
  sequenceId?: string;
  featureSlug?: string;
  /** A sync problem that belongs to this project alone. */
  problem?: string;
}

const titleKey = (entry: StudioLibraryEntry) =>
  `${entry.kind}:${entry.title.trim().toLocaleLowerCase()}`;

/** "generate-vertical" under "Generate" reads "Vertical"; otherwise the folder name. */
function folderSubtitle(slug: string, title: string): string {
  const prefix = title
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const rest =
    prefix && slug.startsWith(`${prefix}-`)
      ? slug.slice(prefix.length + 1)
      : "";
  return rest ? rest.charAt(0).toLocaleUpperCase() + rest.slice(1) : slug;
}

export function studioLibraryEntries(
  projects: PostProjectChoice[],
  features: FeatureVideoSummary[]
): StudioLibraryEntry[] {
  const entries = [
    ...projects.map((project): StudioLibraryEntry => {
      const kind = studioProjectKindFromId(project.sequenceId) ?? "tutorial";
      const fallback =
        kind === "arrangement"
          ? "Saved arrangement"
          : kind === "showcase"
            ? "Saved software showcase"
            : "Saved tutorial";
      return {
        id: project.sequenceId,
        sequenceId: project.sequenceId,
        title:
          project.title === project.sequenceId &&
          studioProjectKindFromId(project.sequenceId)
            ? fallback
            : project.title,
        word: project.word,
        updatedAt: project.updatedAt,
        kind,
        ...(project.problem ? { problem: project.problem } : {}),
      };
    }),
    ...features.map(
      (feature): StudioLibraryEntry => ({
        id: `feature:${feature.slug}`,
        featureSlug: feature.slug,
        title: feature.title,
        word: feature.sequenceId,
        updatedAt: feature.savedAt,
        kind: "showcase",
      })
    ),
  ].sort((a, b) => b.updatedAt - a.updatedAt);
  const titles = new Map<string, number>();
  for (const entry of entries)
    titles.set(titleKey(entry), (titles.get(titleKey(entry)) ?? 0) + 1);
  return entries.map((entry) =>
    entry.featureSlug && (titles.get(titleKey(entry)) ?? 0) > 1
      ? { ...entry, subtitle: folderSubtitle(entry.featureSlug, entry.title) }
      : entry
  );
}
