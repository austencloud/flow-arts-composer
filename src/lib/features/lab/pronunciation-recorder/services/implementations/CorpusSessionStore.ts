import { getLetterPronunciation } from "#lib/shared/pronunciation/pronunciation-plan.js";

import type {
  ConnectedSessionFolder,
  ICorpusSessionStore,
  SessionRecord,
  WordEntry,
} from "../contracts/ICorpusSessionStore";

// The File System Access API's entry points (as opposed to the handle
// interfaces themselves, which lib.dom.d.ts does define) aren't in
// TypeScript's bundled DOM lib yet. Declare the one method this module calls.
declare global {
  interface Window {
    showDirectoryPicker(options?: {
      mode?: "read" | "readwrite";
    }): Promise<FileSystemDirectoryHandle>;
  }
}

export interface WordFiles {
  wavName: string;
  labName: string;
  labText: string;
  entry: WordEntry;
}

export function nextWordId(recorded: number): string {
  return String(recorded + 1).padStart(3, "0");
}

/**
 * The two representations one recorded word needs.
 *
 * `words.json` carries the TKA letters, which is what
 * `scripts/measure-word-segmentation.ts` already reads and tokenizes. The
 * `.lab` carries the SHORT names, because that is what the prompt asked for and
 * therefore what is on the tape — hand the aligner "Sigma dash" for a recording
 * of "sig dash" and it places the boundary on audio that is not there.
 * `tools/pronunciation/tka-letters.dict` defines every one of these tokens.
 */
export function buildWordFiles(id: string, letters: readonly string[]): WordFiles {
  return {
    wavName: `${id}.wav`,
    labName: `${id}.lab`,
    // Lowercased: MFA folds case on input, so a dictionary that is lowercase
    // throughout can never half-match a transcript that is not.
    labText: letters
      .map((letter) => getLetterPronunciation(letter as never)?.shortName ?? letter)
      .join(" ")
      .toLowerCase(),
    entry: { file: `${id}.wav`, word: letters.join(""), letters: [...letters] },
  };
}

/**
 * Writes an MFA corpus directly: `<id>.wav` beside `<id>.lab` IS the aligner's
 * input format, so the offline stage runs on the session output with no
 * conversion step and no chance of the two drifting apart.
 *
 * `words.json` and `session.json` are rewritten after every word rather than at
 * the end, so a closed tab or a lost microphone leaves a directory both the
 * aligner and the TS harness can still read.
 */
export class CorpusSessionStore implements ICorpusSessionStore {
  private directory: FileSystemDirectoryHandle | null = null;
  private zipFiles = new Map<string, Blob>();
  private entries: WordEntry[] = [];

  supportsDirectSave(): boolean {
    return typeof window !== "undefined" && "showDirectoryPicker" in window;
  }

  async connect(): Promise<ConnectedSessionFolder> {
    if (!this.supportsDirectSave()) {
      return { name: "session.zip", directSave: false };
    }
    this.directory = await window.showDirectoryPicker({ mode: "readwrite" });
    return { name: this.directory.name, directSave: true };
  }

  async writeWord(id: string, letters: readonly string[], wav: Blob): Promise<void> {
    const files = buildWordFiles(id, letters);

    await this.write(files.wavName, wav);
    await this.write(files.labName, new Blob([files.labText], { type: "text/plain" }));

    // Only once the word's own two files are down. Recorded first, a failed
    // write left a phantom row in words.json promising the aligner a wav that is
    // not there.
    this.entries.push(files.entry);
    await this.write(
      "words.json",
      new Blob([`${JSON.stringify(this.entries, null, 2)}\n`], { type: "application/json" })
    );
  }

  async writeSession(record: SessionRecord): Promise<void> {
    await this.write(
      "session.json",
      new Blob([`${JSON.stringify(record, null, 2)}\n`], { type: "application/json" })
    );
  }

  async finish(): Promise<void> {
    if (this.directory) return;

    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (const [name, blob] of this.zipFiles) zip.file(name, blob);

    const archive = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(archive);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pronunciation-session.zip";
    link.click();
    URL.revokeObjectURL(url);
  }

  private async write(name: string, blob: Blob): Promise<void> {
    if (!this.directory) {
      this.zipFiles.set(name, blob);
      return;
    }
    const handle = await this.directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }
}
