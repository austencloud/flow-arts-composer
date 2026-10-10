/**
 * Device footage kept for the editor in this browser's private file storage
 * (the origin private file system). A post saves only a device video's name,
 * size and date, so before this every reload asked for each video again. The
 * vault keeps a copy per account, keyed by the take, and the editor reopens it
 * on its own. It is a convenience: anything it cannot keep or find falls back
 * to picking the file again, and other browsers and devices still need that.
 */
import { takeFileKey, type PostTake } from "../domain/post-plan.js";

export interface PostFootageVault {
  /** Keeps a copy of a device take's file. Never throws. */
  keep(take: PostTake, file: File): Promise<void>;
  /** The kept file for a device take, or null when there is none. */
  open(take: PostTake): Promise<File | null>;
}

/** Room the vault may take before it drops its oldest copies. */
export const FOOTAGE_VAULT_MAX_BYTES = 6 * 1024 ** 3;
/** Share of the browser's quota the vault leaves for everything else. */
const QUOTA_HEADROOM = 0.2;
const VAULT_DIRECTORY = "post-studio-footage";
const LOCK_NAME = "tka:post-studio-footage";

type LocalTake = PostTake & {
  ref: Extract<PostTake["ref"], { kind: "local" }>;
};

function isLocal(take: PostTake): take is LocalTake {
  return take.ref.kind === "local";
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/** The private file system stores no media type, so it comes from the name. */
function videoType(name: string): string {
  const extension = name.toLowerCase().split(".").pop();
  if (extension === "mov") return "video/quicktime";
  if (extension === "webm") return "video/webm";
  if (extension === "mkv") return "video/x-matroska";
  return "video/mp4";
}

/** TypeScript's DOM lib here leaves out the directory iterator. */
function entriesOf(
  directory: FileSystemDirectoryHandle
): AsyncIterable<[string, FileSystemHandle]> {
  return (
    directory as unknown as {
      entries(): AsyncIterable<[string, FileSystemHandle]>;
    }
  ).entries();
}

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return locks ? locks.request(LOCK_NAME, task) : task();
}

export interface FootageVaultStorage {
  root(): Promise<FileSystemDirectoryHandle>;
  estimate?(): Promise<{ usage?: number; quota?: number }>;
  persist?(): Promise<boolean>;
}

function browserStorage(): FootageVaultStorage | null {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory)
    return null;
  if (
    typeof FileSystemFileHandle === "undefined" ||
    typeof FileSystemFileHandle.prototype.createWritable !== "function"
  )
    return null;
  const storage = navigator.storage;
  return {
    root: () => storage.getDirectory(),
    estimate: () => storage.estimate(),
    persist: () => storage.persist(),
  };
}

const noVault: PostFootageVault = {
  keep: async () => undefined,
  open: async () => null,
};

/**
 * A vault for one account (`account:<uid>`) or for guests (`guest`). Copies
 * are never read across scopes.
 */
export function createLocalFootageVault(
  scope: string,
  storage: FootageVaultStorage | null = browserStorage(),
  maxBytes = FOOTAGE_VAULT_MAX_BYTES
): PostFootageVault {
  if (!storage) return noVault;
  const store = storage;
  let persistAsked = false;

  async function vaultDirectory(create: boolean) {
    const root = await store.root();
    return root.getDirectoryHandle(VAULT_DIRECTORY, { create });
  }

  async function scopeDirectory(create: boolean) {
    const vault = await vaultDirectory(create);
    return vault.getDirectoryHandle(await digest(scope), { create });
  }

  /** Takes cut from one recording share its file, and so one copy. */
  async function entryName(take: LocalTake): Promise<string> {
    return digest(takeFileKey(take.ref));
  }

  /** Every kept copy across scopes, oldest first. */
  async function keptCopies() {
    const copies: {
      directory: FileSystemDirectoryHandle;
      name: string;
      size: number;
      keptAt: number;
    }[] = [];
    const vault = await vaultDirectory(true);
    for await (const [, scopeEntry] of entriesOf(vault)) {
      if (scopeEntry.kind !== "directory") continue;
      const scopeHandle = scopeEntry as FileSystemDirectoryHandle;
      for await (const [name, entry] of entriesOf(scopeHandle)) {
        if (entry.kind !== "file") continue;
        const file = await (entry as FileSystemFileHandle).getFile();
        copies.push({
          directory: scopeHandle,
          name,
          size: file.size,
          keptAt: file.lastModified,
        });
      }
    }
    return copies.sort((a, b) => a.keptAt - b.keptAt);
  }

  /** Drops the oldest copies until `incoming` more bytes fit. */
  async function makeRoom(incoming: number): Promise<boolean> {
    const estimate = await store.estimate?.().catch(() => undefined);
    const quotaRoom =
      estimate?.quota !== undefined
        ? estimate.quota * (1 - QUOTA_HEADROOM) - (estimate.usage ?? 0)
        : Infinity;
    const copies = await keptCopies();
    let kept = copies.reduce((total, copy) => total + copy.size, 0);
    let freed = 0;
    for (const copy of copies) {
      if (kept + incoming <= maxBytes && incoming <= quotaRoom + freed) break;
      await copy.directory.removeEntry(copy.name);
      kept -= copy.size;
      freed += copy.size;
    }
    return kept + incoming <= maxBytes && incoming <= quotaRoom + freed;
  }

  return {
    async keep(take, file) {
      if (!isLocal(take) || file.size !== take.ref.size) return;
      if (file.size > maxBytes) return;
      try {
        await withLock(async () => {
          const directory = await scopeDirectory(true);
          const name = await entryName(take);
          const existing = await directory
            .getFileHandle(name)
            .then((handle) => handle.getFile())
            .catch(() => null);
          if (existing?.size === file.size) return;
          if (!(await makeRoom(file.size))) return;
          if (!persistAsked) {
            persistAsked = true;
            await store.persist?.().catch(() => false);
          }
          const handle = await directory.getFileHandle(name, { create: true });
          // The new bytes replace the entry only when close() commits them.
          const writable = await handle.createWritable();
          try {
            await writable.write(file);
            await writable.close();
          } catch (cause) {
            await writable.abort().catch(() => undefined);
            throw cause;
          }
          const written = await handle.getFile();
          if (written.size !== file.size) await directory.removeEntry(name);
        });
      } catch (cause) {
        console.warn("[Post] This device video was not kept:", cause);
      }
    },

    async open(take) {
      if (!isLocal(take)) return null;
      try {
        const directory = await scopeDirectory(false);
        const handle = await directory.getFileHandle(await entryName(take));
        const kept = await handle.getFile();
        if (kept.size !== take.ref.size) return null;
        return new File([kept], take.ref.name, {
          type: kept.type || videoType(take.ref.name),
          lastModified: take.ref.lastModified,
        });
      } catch {
        return null;
      }
    },
  };
}
