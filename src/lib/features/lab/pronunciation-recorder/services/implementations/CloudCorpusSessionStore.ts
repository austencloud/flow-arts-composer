import { getAuthSync, getStorageInstance } from "#lib/shared/auth/firebase.js";

import type {
  ConnectedSessionFolder,
  ICorpusSessionStore,
  SessionRecord,
  WordEntry,
} from "../contracts/ICorpusSessionStore";
import { buildWordFiles } from "./CorpusSessionStore";

/**
 * The session lands in Firebase Storage under the signed-in account, so nothing
 * asks where to put it.
 *
 * The local-directory store this replaces made the reader answer a question the
 * reader has no way to answer — the folder only ever mattered to the offline
 * aligner, which does not care where the bytes sat before it got them.
 * `scripts/fetch-pronunciation-session.mjs` pulls a session down into the exact
 * `<id>.wav` beside `<id>.lab` layout MFA wants, so the folder is now the
 * download script's problem rather than his.
 *
 * Layout mirrors what the aligner reads, one prefix per session:
 *
 *   pronunciation-corpus/{uid}/{sessionId}/001.wav
 *   pronunciation-corpus/{uid}/{sessionId}/001.lab
 *   pronunciation-corpus/{uid}/{sessionId}/words.json
 *   pronunciation-corpus/{uid}/{sessionId}/session.json
 */
export class CloudCorpusSessionStore implements ICorpusSessionStore {
  private prefix: string | null = null;
  private entries: WordEntry[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  supportsDirectSave(): boolean {
    return true;
  }

  async connect(): Promise<ConnectedSessionFolder> {
    const userId = getAuthSync().currentUser?.uid;
    if (!userId) {
      throw new Error("Sign in before recording — the corpus is saved to your account.");
    }

    // Sortable, collision-free within a second, and readable in the Storage
    // console without cross-referencing anything.
    const sessionId = `corpus-${this.now().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
    this.prefix = `pronunciation-corpus/${userId}/${sessionId}`;
    return { name: sessionId, directSave: true };
  }

  async writeWord(id: string, letters: readonly string[], wav: Blob): Promise<void> {
    const files = buildWordFiles(id, letters);

    await this.upload(files.wavName, wav, "audio/wav");
    await this.upload(files.labName, new Blob([files.labText]), "text/plain");

    // Only once the word's own two files are up. Recorded first, a rejected
    // upload left a phantom row in words.json promising the aligner a wav that
    // is not there.
    this.entries.push(files.entry);
    await this.upload(
      "words.json",
      new Blob([`${JSON.stringify(this.entries, null, 2)}\n`]),
      "application/json"
    );
  }

  async writeSession(record: SessionRecord): Promise<void> {
    await this.upload(
      "session.json",
      new Blob([`${JSON.stringify(record, null, 2)}\n`]),
      "application/json"
    );
  }

  async finish(): Promise<void> {
    // Every word was uploaded as it was read. There is nothing held back to
    // flush, which is the point: a closed tab costs the current word, not the
    // session.
  }

  private async upload(name: string, blob: Blob, contentType: string): Promise<void> {
    if (!this.prefix) throw new Error("connect() must run before any write");

    const { ref, uploadBytes } = await import("firebase/storage");
    const storage = await getStorageInstance();
    await uploadBytes(ref(storage, `${this.prefix}/${name}`), blob, { contentType });
  }
}
