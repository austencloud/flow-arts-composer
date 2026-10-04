import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PostProject } from "$lib/shared/media-composition/domain/post-project";
import { loadSyncedPostDraft, listSyncedPostProjects, resolveSyncedPostSequence } from "../services/post-account-projects";
import {
  lastSelectedPostSequenceId,
  selectPostSequence,
  type PostProjectChoice,
} from "../services/post-workspace-projects";

export interface PostModuleServices {
  list: typeof listSyncedPostProjects;
  resolve: typeof resolveSyncedPostSequence;
  loadDraft: typeof loadSyncedPostDraft;
}

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
  let request = 0;
  let catalogRequest = 0;

  async function refreshProjects(): Promise<void> {
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

  async function open(sequenceId: string): Promise<void> {
    if (sequenceId === selectedId && sequence) {
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
    try {
      const resolved = await services.resolve(sequenceId);
      if (current !== request) return;
      if (!resolved) {
        projectError = `The sequence for this post (${sequenceId}) could not be found. The saved post is still here.`;
        return;
      }
      const loaded = await services.loadDraft(sequenceId);
      if (current !== request) return;
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
    selectedId = null;
    sequence = null;
    draft = null;
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
    refreshProjects,
    open,
    showProjects,
    resetForAccount,
    lastSelectedId: lastSelectedPostSequenceId,
  };
}

export type PostModuleState = ReturnType<typeof createPostModuleState>;
