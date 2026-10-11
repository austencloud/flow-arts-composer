import type { KeptExport } from "@austencloud/video-editor";

export interface PostStudioShareExport {
  render: () => Promise<boolean>;
  cancel: () => void;
  /**
   * Renders once the editor is ready and resolves with where the host kept
   * the file (tka: the dev bridge's `post-project.mjs render`).
   */
  renderTo?: (name?: string) => Promise<KeptExport>;
  /** How far the current render is; null between renders. */
  progress?: () => { phase: string; percent: number } | null;
}
