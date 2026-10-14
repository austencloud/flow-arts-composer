/** Only route templates belong here: never document IDs or document contents. */
export interface PublishOperation {
  step: string;
  path:
    | "contentAppeals"
    | "users/{uid}"
    | "users/{uid}/sequences/{sequenceId}"
    | "users/{uid}/collections/{collectionId}"
    | "users/{uid}/tags"
    | "publicSequences/{sequenceId}"
    | "publicSequenceHashes/{claimId}"
    | "sequenceRevisions/{revisionId}";
  operation: "get" | "list" | "set" | "update" | "delete";
}

export class PublishPermissionError extends Error {
  readonly code = "permission-denied";

  constructor(
    cause: unknown,
    operations: readonly PublishOperation[],
    phase: "operation" | "transaction-commit"
  ) {
    const details = operations
      .map(({ step, path, operation }) => `${step}: ${operation} ${path}`)
      .join("; ");
    super(
      `Missing or insufficient permissions. Publish ${phase}: ${details}` +
        (phase === "transaction-commit"
          ? ". Firestore did not identify which attempted write was denied."
          : ""),
      { cause }
    );
    this.name = "PublishPermissionError";
  }
}

export function annotatePublishPermissionError(
  error: unknown,
  operations: readonly PublishOperation[],
  phase: "operation" | "transaction-commit" = "operation"
): unknown {
  if (error instanceof PublishPermissionError) return error;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  return code === "permission-denied" || code === "firestore/permission-denied"
    ? new PublishPermissionError(error, operations, phase)
    : error;
}

export async function publishOperation<T>(
  operation: PublishOperation,
  run: () => Promise<T>
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw annotatePublishPermissionError(error, [operation]);
  }
}
