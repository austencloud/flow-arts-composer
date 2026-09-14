// Installed assets do not participate in Composer's development hot reload.
// This is the production path of resilientLazyImport, with failures preserved.
export function resilientLazyImport<T>(loader: () => Promise<T>): () => Promise<T> {
  return async () => loader();
}
