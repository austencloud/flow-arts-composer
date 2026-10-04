import type { WhereFilterOp } from "firebase/firestore";

export interface WhereClause {
  field: string;
  op: WhereFilterOp;
  value: unknown;
}

export interface ListOptions {
  where?: WhereClause[];
  orderBy?: { field: string; direction?: "asc" | "desc" }[];
  limit?: number;
  startAfter?: unknown;
}

export interface WriteOptions {
  merge?: boolean;
  trackOffline?: boolean;
  repoName?: string;
  onError?: (error: Error) => void;
}

export interface ReadOptions {
  onError?: (error: Error) => void;
  /** Require a server answer when cached results could hide cloud documents. */
  serverOnly?: boolean;
}
