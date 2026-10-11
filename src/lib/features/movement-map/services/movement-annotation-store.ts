/**
 * Where the annotation corpus lives.
 *
 * This is a months-long labeling effort, so the storage has to be durable
 * across reloads, browser restarts and crashes, and it has to hold far more
 * than a handful of records. That rules out localStorage, whose few-megabyte
 * quota fails by throwing mid-write - exactly the moment when losing a session's
 * work hurts most. It gets its own IndexedDB database rather than a table in the
 * app-wide one, so a research instrument never forces a schema migration on
 * everybody else's sequences.
 *
 * Nothing is written to Firestore. The corpus is read constantly while
 * annotating and would be a standing unbounded-query cost for data only one
 * person uses, which `.claude/rules/firestore-cost-discipline.md` exists to
 * prevent. Export writes a file when the corpus needs to leave the machine.
 */

import Dexie, { type Table } from "dexie";
import { browser } from "$app/env";
import type { MovementAnnotation } from "../domain/movement-annotation";

const DB_NAME = "tka-movement-map";

class MovementMapDatabase extends Dexie {
  annotations!: Table<MovementAnnotation, string>;

  constructor() {
    super(DB_NAME);
    // videoId and stepIndex are indexed because the editor constantly asks
    // "what has already been said about this clip, at this step".
    this.version(1).stores({
      annotations: "id, videoId, stepIndex, sequenceId, updatedAt",
    });
  }
}

export class MovementAnnotationStore {
  private db: MovementMapDatabase | null = null;

  private getDb(): MovementMapDatabase | null {
    if (!browser) return null;
    if (!this.db) this.db = new MovementMapDatabase();
    return this.db;
  }

  async loadAll(): Promise<MovementAnnotation[]> {
    const db = this.getDb();
    if (!db) return [];
    return db.annotations.toArray();
  }

  async loadForVideo(videoId: string): Promise<MovementAnnotation[]> {
    const db = this.getDb();
    if (!db) return [];
    return db.annotations.where("videoId").equals(videoId).toArray();
  }

  async save(annotation: MovementAnnotation): Promise<void> {
    const db = this.getDb();
    if (!db) return;
    await db.annotations.put(annotation);
  }

  async remove(id: string): Promise<void> {
    const db = this.getDb();
    if (!db) return;
    await db.annotations.delete(id);
  }

  async count(): Promise<number> {
    const db = this.getDb();
    if (!db) return 0;
    return db.annotations.count();
  }

  /**
   * Merges an imported corpus in rather than replacing, so importing a file
   * from another machine cannot silently wipe work done on this one. A record
   * with a known id is treated as the newer edit of that annotation.
   */
  async importAll(annotations: readonly MovementAnnotation[]): Promise<number> {
    const db = this.getDb();
    if (!db) return 0;
    await db.annotations.bulkPut([...annotations]);
    return annotations.length;
  }
}

let instance: MovementAnnotationStore | null = null;

export function getMovementAnnotationStore(): MovementAnnotationStore {
  if (!instance) instance = new MovementAnnotationStore();
  return instance;
}
