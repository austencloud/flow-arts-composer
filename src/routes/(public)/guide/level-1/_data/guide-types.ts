import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

export interface GuideChapterData {
  pictographs: Record<string, PictographData>;
  sequences: Record<string, PictographData[]>;
}

export interface GuideNavSection {
  id: string;
  title: string;
}

export interface GuideNavChapter {
  slug: string;
  title: string;
  sections: GuideNavSection[];
}
