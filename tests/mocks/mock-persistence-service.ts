import type { UserProject } from "$lib/features/account/domain/models/library-models";
import { injectable } from "inversify";

@injectable()
export class MockPersistenceService implements IPersistenceService {
  // In-memory stores
  private sequences = new Map<string, SequenceData>();
  private pictographs = new Map<string, PictographData>();
  private projects = new Map<number, UserProject>();
  private settings: AppSettings | null = null;
  private userWork = new Map<string, unknown>();
  private activeTab: TabId | null = null;
  private tabStates = new Map<TabId, unknown>();
  private BrowseState: CompleteBrowseState | null = null;
  private currentSequenceState: unknown | null = null;

  private _isInitialized = false;
  private _isAvailable = true;

  initialize(): Promise<void> {
    this._isInitialized = true;
  }

  isAvailable(): boolean {
    return this._isAvailable;
  }

  saveSequence(sequence: SequenceData): Promise<void> {
    this.sequences.set(sequence.id, sequence);
  }

  loadSequence(id: string): Promise<SequenceData | null> {
    return this.sequences.get(id) ?? null;
  }

  getAllSequences(filter?: {
    author?: string;
    level?: number;
    isFavorite?: boolean;
    tags?: string[];
  }): Promise<SequenceData[]> {
    let results = Array.from(this.sequences.values());

    if (filter) {
      if (filter.author) {
        results = results.filter((seq) => seq.author === filter.author);
      }
      if (filter.level !== undefined) {
        results = results.filter((seq) => seq.level === filter.level);
      }
      if (filter.isFavorite !== undefined) {
        results = results.filter((seq) => seq.isFavorite === filter.isFavorite);
      }
      if (filter.tags && filter.tags.length > 0) {
        results = results.filter((seq) =>
          filter.tags!.some((tag) => seq.tags.includes(tag))
        );
      }
    }

    return results;
  }

  deleteSequence(id: string): Promise<void> {
    this.sequences.delete(id);
  }

  searchSequences(query: string): Promise<SequenceData[]> {
    const searchTerm = query.toLowerCase();
    return Array.from(this.sequences.values()).filter(
      (seq) =>
        seq.name.toLowerCase().includes(searchTerm) ||
        seq.word.toLowerCase().includes(searchTerm) ||
        (seq.author?.toLowerCase().includes(searchTerm) ?? false)
    );
  }

  savePictograph(pictograph: PictographData): Promise<void> {
    this.pictographs.set(pictograph.id, pictograph);
  }

  loadPictograph(id: string): Promise<PictographData | null> {
    return this.pictographs.get(id) ?? null;
  }

  getPictographsByLetter(letter: string): Promise<PictographData[]> {
    return Array.from(this.pictographs.values()).filter(
      (p) => p.letter === letter
    );
  }

  getAllPictographs(): Promise<PictographData[]> {
    return Array.from(this.pictographs.values());
  }

  saveActiveTab(tabId: TabId): Promise<void> {
    this.activeTab = tabId;
  }

  getActiveTab(): Promise<TabId | null> {
    return this.activeTab;
  }

  saveTabState(tabId: TabId, state: unknown): Promise<void> {
    this.tabStates.set(tabId, state);
  }

  loadTabState<T = unknown>(tabId: TabId): Promise<T | null> {
    return (this.tabStates.get(tabId) as T) || null;
  }

  saveBrowseState(state: CompleteBrowseState): Promise<void> {
    this.BrowseState = state;
  }

  loadBrowseState(): Promise<CompleteBrowseState | null> {
    return this.BrowseState;
  }

  saveSettings(settings: AppSettings): Promise<void> {
    this.settings = settings;
  }

  loadSettings(): Promise<AppSettings | null> {
    return this.settings;
  }

  saveProject(project: UserProject): Promise<void> {
    const id = project.id ?? this.getNextProjectId();
    this.projects.set(id, { ...project, id });
  }

  loadProjects(): Promise<UserProject[]> {
    return Array.from(this.projects.values()).sort(
      (a, b) => b.lastModified.getTime() - a.lastModified.getTime()
    );
  }

  deleteProject(id: number): Promise<void> {
    this.projects.delete(id);
  }

  private getNextProjectId(): number {
    const ids = Array.from(this.projects.keys());
    return ids.length > 0 ? Math.max(...ids) + 1 : 1;
  }

  exportAllData(): Promise<unknown> {
    return {
      sequences: Array.from(this.sequences.values()),
      pictographs: Array.from(this.pictographs.values()),
      userWork: Array.from(this.userWork.entries()),
      userProjects: Array.from(this.projects.values()),
      settings: this.settings,
      exportedAt: new Date().toISOString(),
      version: 1,
    };
  }

  importData(data: unknown): Promise<void> {
    // Mock implementation - would need proper validation
    console.log("Mock import:", data);
  }

  clearAllData(): Promise<void> {
    this.sequences.clear();
    this.pictographs.clear();
    this.projects.clear();
    this.settings = null;
    this.userWork.clear();
    this.activeTab = null;
    this.tabStates.clear();
    this.BrowseState = null;
    this.currentSequenceState = null;
  }

  getStorageInfo() {
    return {
      sequences: this.sequences.size,
      pictographs: this.pictographs.size,
      userWork: this.userWork.size,
      projects: this.projects.size,
    };
  }

  saveCurrentSequenceState(state: {
    currentSequence: SequenceData | null;
    selectedStartPlacement: PictographData | null;
    hasStartPlacement: boolean;
    activeBuildSection?: string;
  }): Promise<void> {
    this.currentSequenceState = state;
  }

  loadCurrentSequenceState(): Promise<{
    currentSequence: SequenceData | null;
    selectedStartPlacement: PictographData | null;
    hasStartPlacement: boolean;
    activeBuildSection?: string;
  } | null> {
    return this.currentSequenceState as {
      currentSequence: SequenceData | null;
      selectedStartPlacement: PictographData | null;
      hasStartPlacement: boolean;
      activeBuildSection?: string;
    } | null;
  }

  clearCurrentSequenceState(): Promise<void> {
    this.currentSequenceState = null;
  }
}
