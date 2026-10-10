import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { FeatureVideoSummary } from "#lib/shared/media-composition/domain/feature-video.js";
import type { PostProject } from "#lib/shared/media-composition/domain/post-project.js";
import type { FeatureVideoSync } from "#lib/shared/media-composition/services/feature-video-client.js";
import {
  loadSyncedPostDraft,
  listSyncedPostProjects,
  resolveSyncedPostSequence,
} from "../services/post-account-projects";
import {
  lastSelectedPostSequenceId,
  selectPostSequence,
  type PostProjectChoice,
} from "../services/post-workspace-projects";

export interface PostModuleServices {
  list: typeof listSyncedPostProjects;
  resolve: typeof resolveSyncedPostSequence;
  loadDraft: typeof loadSyncedPostDraft;
  /**
   * Feature videos are folders the dev server reads, so only a dev build
   * passes these two. Without them the page lists none and opens none.
   */
  listFeatures?: () => Promise<{
    projects: FeatureVideoSummary[];
    unreadable: string[];
  }>;
  /** Reads one feature video and binds it for the editor. */
  loadFeature?: (slug: string) => Promise<FeatureVideoSync>;
}

const FEATURE_SELECTION = "feature:";

/** A feature video's selection id, apart from every sequence id. */
export const featureSelectionId = (slug: string) =>
  `${FEATURE_SELECTION}${slug}`;

export function createPostModuleState(services: PostModuleServices) {
  let projects = $state<PostProjectChoice[]>([]);
  let catalogError = $state<string | null>(null);
  let loadingCatalog = $state(false);
  let loadingProject = $state(false);
  let selectedId = $state<string | null>(null);
  let sequence = $state<SequenceData | null>(null);
  let draft = $state<PostProject | null>(null);
  let diskAvailable = $state(false);
  let projectError = $state<string | null>(null);
  let showingProjects = $state(true);
  let features = $state<FeatureVideoSummary[]>([]);
  let unreadableFeatures = $state<string[]>([]);
  let featureError = $state<string | null>(null);
  // Raw: the editor needs the sync's getters and closures as they are, not
  // through a deep proxy.
  let feature = $state.raw<FeatureVideoSync | null>(null);
  const editorReady = $derived(
    sequence !== null ||
      draft?.sourceKind === "none" ||
      feature?.initialProject.sourceKind === "none"
  );
  let request = 0;
  let catalogRequest = 0;
  let featureRequest = 0;

  async function refreshPosts(): Promise<void> {
    const current = ++catalogRequest;
    loadingCatalog = true;
    try {
      const loaded = await services.list();
      if (current !== catalogRequest) return;
      projects = loaded.projects;
      catalogError = loaded.error;
    } catch {
      if (current !== catalogRequest) return;
      catalogError = "Projects could not be listed on this device.";
    } finally {
      if (current === catalogRequest) loadingCatalog = false;
    }
  }

  async function refreshFeatures(): Promise<void> {
    const listFeatures = services.listFeatures;
    if (!listFeatures) return;
    const current = ++featureRequest;
    try {
      const loaded = await listFeatures();
      if (current !== featureRequest) return;
      features = loaded.projects;
      unreadableFeatures = loaded.unreadable;
      featureError = null;
    } catch (cause) {
      if (current !== featureRequest) return;
      features = [];
      unreadableFeatures = [];
      featureError =
        cause instanceof Error
          ? cause.message
          : "Feature videos could not be listed.";
    }
  }

  async function refreshProjects(): Promise<void> {
    await Promise.all([refreshPosts(), refreshFeatures()]);
  }

  async function open(sequenceId: string): Promise<void> {
    if (sequenceId === selectedId && editorReady) {
      showingProjects = false;
      selectPostSequence(sequenceId);
      return;
    }
    const current = ++request;
    selectedId = sequenceId;
    showingProjects = false;
    loadingProject = true;
    projectError = null;
    sequence = null;
    draft = null;
    feature = null;
    diskAvailable = false;
    try {
      const loaded = await services.loadDraft(sequenceId);
      if (current !== request) return;
      const sourceFree = loaded.project?.sourceKind === "none";
      const resolved = sourceFree ? null : await services.resolve(sequenceId);
      if (current !== request) return;
      if (!sourceFree && !resolved) {
        projectError = `The sequence for this post (${sequenceId}) could not be found. The saved post is still here.`;
        return;
      }
      sequence = resolved;
      draft = loaded.project;
      diskAvailable = loaded.diskAvailable;
      projectError = loaded.error;
      selectPostSequence(sequenceId);
    } catch (cause) {
      if (current === request)
        projectError =
          cause instanceof Error
            ? cause.message
            : "This post could not be opened.";
    } finally {
      if (current === request) loadingProject = false;
    }
  }

  /**
   * Opens a feature video: its own post on its sequence, read from its
   * folder. The sequence's ordinary post is never loaded, and the choice is
   * not remembered, so /post on its own still opens the last ordinary post.
   */
  async function openFeature(slug: string): Promise<void> {
    const id = featureSelectionId(slug);
    if (id === selectedId && editorReady && feature) {
      showingProjects = false;
      return;
    }
    const current = ++request;
    selectedId = id;
    showingProjects = false;
    loadingProject = true;
    projectError = null;
    sequence = null;
    draft = null;
    feature = null;
    diskAvailable = false;
    try {
      if (!services.loadFeature) {
        projectError = "Feature videos open only on a dev server.";
        return;
      }
      const loaded = await services.loadFeature(slug);
      if (current !== request) return;
      const sequenceId = loaded.initialProject.sequenceId;
      const sourceFree = loaded.initialProject.sourceKind === "none";
      const resolved = sourceFree ? null : await services.resolve(sequenceId);
      if (current !== request) return;
      if (!sourceFree && !resolved) {
        projectError = `The sequence for this feature video (${sequenceId}) could not be found.`;
        return;
      }
      feature = loaded;
      sequence = resolved;
    } catch (cause) {
      if (current === request)
        projectError =
          cause instanceof Error
            ? cause.message
            : "This feature video could not be opened.";
    } finally {
      if (current === request) loadingProject = false;
    }
  }

  /** Tries the last failed open again, a post or a feature video. */
  function retry(): Promise<void> {
    if (!selectedId) return Promise.resolve();
    return selectedId.startsWith(FEATURE_SELECTION)
      ? openFeature(selectedId.slice(FEATURE_SELECTION.length))
      : open(selectedId);
  }

  function showProjects(): void {
    ++request;
    showingProjects = true;
    loadingProject = false;
    void refreshProjects();
  }

  function resetForAccount(): void {
    ++request;
    projects = [];
    catalogError = null;
    features = [];
    unreadableFeatures = [];
    featureError = null;
    selectedId = null;
    sequence = null;
    draft = null;
    feature = null;
    loadingProject = false;
    projectError = null;
    diskAvailable = false;
    showingProjects = true;
    void refreshProjects();
  }

  return {
    get projects() {
      return projects;
    },
    get catalogError() {
      return catalogError;
    },
    get loadingCatalog() {
      return loadingCatalog;
    },
    get loadingProject() {
      return loadingProject;
    },
    get selectedId() {
      return selectedId;
    },
    get sequence() {
      return sequence;
    },
    get editorReady() {
      return editorReady;
    },
    get draft() {
      return draft;
    },
    get diskAvailable() {
      return diskAvailable;
    },
    get projectError() {
      return projectError;
    },
    get showingProjects() {
      return showingProjects;
    },
    get features() {
      return features;
    },
    get unreadableFeatures() {
      return unreadableFeatures;
    },
    get featureError() {
      return featureError;
    },
    /** The open feature video, or null for an ordinary post. */
    get feature() {
      return feature;
    },
    refreshProjects,
    open,
    openFeature,
    retry,
    showProjects,
    resetForAccount,
    lastSelectedId: lastSelectedPostSequenceId,
  };
}

export type PostModuleState = ReturnType<typeof createPostModuleState>;
