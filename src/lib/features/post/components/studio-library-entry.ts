import type { PostProjectChoice } from "../services/post-workspace-projects.js";
import type { FeatureVideoSummary } from "#lib/shared/media-composition/domain/feature-video.js";
import { studioProjectKindFromId } from "#lib/shared/media-composition/domain/studio-project-id.js";

export type StudioIntent = "tutorial" | "showcase" | "arrangement";
export interface StudioLibraryEntry {
  id: string;
  title: string;
  word: string;
  updatedAt: number;
  kind: StudioIntent;
  sequenceId?: string;
  featureSlug?: string;
}

export function studioLibraryEntries(
  projects: PostProjectChoice[],
  features: FeatureVideoSummary[]
): StudioLibraryEntry[] {
  return [
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
}
