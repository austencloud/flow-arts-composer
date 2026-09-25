export interface PostStudioShareExport {
  render: () => Promise<boolean>;
  cancel: () => void;
}
