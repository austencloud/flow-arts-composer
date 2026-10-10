import type { VideoCache } from "#lib/shared/video/services/video-cache.js";
import type { SequenceMatcher } from "../services/sequence-matcher";
import type * as videoCuratorPersisterModule from "../services/video-curator-persister";
import type {
  MatchedSequence,
  ShowcaseVideo,
  UserProfile,
  VideoCategory,
} from "../types";

export type VideoCuratorPersister = typeof videoCuratorPersisterModule;

export type VideoEditorMode =
  | "closed"
  | "browse"
  | "curate"
  | "link"
  | "rename";

export interface VideoEditorState {
  mode: VideoEditorMode;
  currentVideo: ShowcaseVideo | null;
  videoUrl: string | null;
  currentIndex: number;
  saving: boolean;
  showAddCategory: boolean;
  newCategoryLabel: string;
  newCategoryColor: string;
  showAddPerformer: boolean;
  sequenceSearchQuery: string;
  matchedSequences: MatchedSequence[];
  sequenceSearching: boolean;
  selectedSequenceForLink: MatchedSequence | null;
}

export interface VideoEditorControllerOptions {
  videos: ShowcaseVideo[];
  categories: VideoCategory[];
  quickPerformers: UserProfile[];
  persister: VideoCuratorPersister;
  sequenceMatcher: SequenceMatcher;
  videoCache: VideoCache;
  onVideosUpdate: (videos: ShowcaseVideo[]) => void;
}
