import { isAbsolute, join, relative, resolve, sep } from "node:path";

const ZERO_OID = /^0+$/;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_MAX_COMMENT_BYTES = 0xffff;

export const NATIVE_RELEASE_FORBIDDEN_MARKERS = Object.freeze([
  "View in coven hub",
  "/coven?seq=",
  "coven-seed",
]);

export function inspectNativeReleaseSurface(
  files,
  forbiddenMarkers = NATIVE_RELEASE_FORBIDDEN_MARKERS
) {
  const violations = [];

  for (const file of files) {
    for (const marker of forbiddenMarkers) {
      if (file.contents.includes(marker)) {
        violations.push({ path: file.path, marker });
      }
    }
  }

  return {
    checkedFileCount: files.length,
    violations,
  };
}

export function inspectZipFilenameFlags(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const minimumEndOffset = Math.max(
    0,
    buffer.length - ZIP_MAX_COMMENT_BYTES - 22
  );
  let endOffset = -1;

  for (
    let offset = buffer.length - 22;
    offset >= minimumEndOffset;
    offset -= 1
  ) {
    if (
      buffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      endOffset = offset;
      break;
    }
  }

  if (endOffset < 0) {
    throw new Error("ZIP end-of-central-directory record was not found.");
  }

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
  if (entryCount === 0xffff || centralDirectoryOffset === 0xffffffff) {
    throw new Error("ZIP64 filename inspection is not supported.");
  }

  let cursor = centralDirectoryOffset;
  let nonAsciiEntryCount = 0;
  let nonUtf8EntryCount = 0;
  const filenames = [];
  const nonUtf8Names = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (
      cursor + 46 > buffer.length ||
      buffer.readUInt32LE(cursor) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      throw new Error(`Invalid ZIP central-directory entry at index ${index}.`);
    }

    const flags = buffer.readUInt16LE(cursor + 8);
    const filenameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const filenameStart = cursor + 46;
    const entryEnd =
      filenameStart + filenameLength + extraLength + commentLength;
    if (entryEnd > buffer.length) {
      throw new Error(
        `Truncated ZIP central-directory entry at index ${index}.`
      );
    }

    const filename = buffer.subarray(
      filenameStart,
      filenameStart + filenameLength
    );
    const decodedFilename = filename.toString("utf8");
    filenames.push(decodedFilename);
    const hasNonAsciiByte = filename.some((byte) => byte > 0x7f);
    if (hasNonAsciiByte) {
      nonAsciiEntryCount += 1;
      if ((flags & ZIP_UTF8_FLAG) === 0) {
        nonUtf8EntryCount += 1;
        if (nonUtf8Names.length < 5) {
          nonUtf8Names.push(decodedFilename);
        }
      }
    }

    cursor = entryEnd;
  }

  if (cursor !== centralDirectoryOffset + centralDirectorySize) {
    throw new Error("ZIP central-directory size does not match its entries.");
  }

  return {
    entryCount,
    nonAsciiEntryCount,
    nonUtf8EntryCount,
    nonUtf8Names,
    filenames,
  };
}

export function createSnapshotCheckoutPlan(
  buildRoot,
  snapshotRoot,
  indexPath,
  commit
) {
  const paths = [snapshotRoot, indexPath].map((path) =>
    relative(buildRoot, path)
  );
  const escapesBuildRoot = (path) =>
    !path || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);

  if (paths.some(escapesBuildRoot)) {
    throw new Error(
      "Snapshot checkout paths must stay inside the native build root."
    );
  }

  if (!/^[0-9a-f]{40,64}$/i.test(commit)) {
    throw new Error("Snapshot commit must be a resolved Git object ID.");
  }

  const prefix = `${resolve(snapshotRoot).replaceAll("\\", "/")}/`;
  return {
    indexPath: resolve(indexPath),
    readTreeArgs: ["read-tree", "--no-sparse-checkout", commit],
    checkoutArgs: [
      "checkout-index",
      "--all",
      "--ignore-skip-worktree-bits",
      `--prefix=${prefix}`,
    ],
  };
}

export function parsePushUpdates(input) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [localRef, localOid, remoteRef, remoteOid] = line.split(/\s+/);
      return { localRef, localOid, remoteRef, remoteOid };
    })
    .filter(
      ({ localRef, localOid, remoteRef, remoteOid }) =>
        localRef && localOid && remoteRef && remoteOid
    );
}

export function choosePushedCommit(updates, headOid, headRef) {
  const commits = updates.filter(
    ({ localRef, localOid }) =>
      localRef !== "(delete)" && localOid && !ZERO_OID.test(localOid)
  );

  if (commits.length === 0) return updates.length === 0 ? headOid : null;

  return (
    commits.find(({ localRef }) => localRef === headRef)?.localOid ??
    commits.find(({ localOid }) => localOid === headOid)?.localOid ??
    commits[0].localOid
  );
}

export function parseAdbDevices(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("List of devices"))
    .map((line) => {
      const [serial, state, ...details] = line.split(/\s+/);
      const attributes = Object.fromEntries(
        details
          .map((detail) => detail.split(/:(.*)/s).slice(0, 2))
          .filter(([key, value]) => key && value)
      );
      const connection = serial.startsWith("emulator-")
        ? "emulator"
        : serial.startsWith("adb-") || serial.includes(":")
          ? "wireless"
          : "usb";

      return { serial, state, connection, attributes };
    })
    .filter(({ serial, state }) => serial && state);
}

export function selectAndroidDevice(devices, requestedSerial = "") {
  const authorized = devices.filter(({ state }) => state === "device");

  if (requestedSerial) {
    const requested = authorized.find(
      ({ serial }) => serial === requestedSerial
    );
    return requested
      ? { device: requested, reason: "requested" }
      : { device: null, reason: "requested-device-unavailable" };
  }

  const usb = authorized.filter(({ connection }) => connection === "usb");
  if (usb.length === 1) return { device: usb[0], reason: "single-usb" };
  if (usb.length > 1) return { device: null, reason: "multiple-usb" };

  const hardware = authorized.filter(
    ({ connection }) => connection !== "emulator"
  );
  if (hardware.length === 1) {
    return { device: hardware[0], reason: "single-hardware" };
  }
  if (hardware.length > 1) {
    return { device: null, reason: "multiple-hardware" };
  }

  if (authorized.length === 1) {
    return { device: authorized[0], reason: "single-emulator" };
  }
  if (authorized.length > 1) {
    return { device: null, reason: "multiple-emulators" };
  }

  return { device: null, reason: "none" };
}

export function readJavaProperty(contents, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = contents.match(
    new RegExp(`^\\s*${escapedKey}\\s*=\\s*(.+?)\\s*$`, "m")
  );
  if (!match) return null;

  return match[1]
    .replace(/\\\\/g, "\\")
    .replace(/\\:/g, ":")
    .replace(/\\ /g, " ");
}

export function selectAndroidSdkRoot(
  {
    androidHome = "",
    androidSdkRoot = "",
    localProperties = "",
    localAppData = "",
  },
  pathExists = () => true
) {
  const propertyRoot = readJavaProperty(localProperties, "sdk.dir");
  const defaultRoot = localAppData
    ? join(localAppData, "Android", "Sdk")
    : null;

  return (
    [androidHome, androidSdkRoot, propertyRoot, defaultRoot]
      .filter(Boolean)
      .find((candidate) => pathExists(candidate)) ?? null
  );
}

export function parseJavaMajor(versionOutput) {
  const match = versionOutput.match(
    /(?:javac\s+|version\s+\"?)(\d+)(?:\.(\d+))?/i
  );
  if (!match) return null;

  const first = Number(match[1]);
  return first === 1 && match[2] ? Number(match[2]) : first;
}

export function buildWindowsCommandLine(command, args) {
  const tokens = [command, ...args];
  const unsafe = tokens.find((token) => /[\s\"&|<>^%!()]/.test(token));
  if (unsafe) {
    throw new Error(
      `Windows command token requires unsupported quoting: ${unsafe}`
    );
  }
  return tokens.join(" ");
}

export function createNativeBuildEnv(exampleContents, localContents) {
  const localPublicLines = new Map();
  for (const line of localContents.split(/\r?\n/)) {
    const match = line.match(/^\s*((?:PUBLIC_|VITE_)[A-Z0-9_]+)\s*=.*$/);
    if (match) localPublicLines.set(match[1], line);
  }

  const exampleLines = exampleContents.split(/\r?\n/).filter((line) => {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=/);
    return !match || !localPublicLines.has(match[1]);
  });

  return [...localPublicLines.values(), ...exampleLines].join("\n");
}

const APK_OUTPUT_PATH = "android/app/build/outputs/apk/debug/app-debug.apk";

function asSentence(text) {
  const trimmed = String(text ?? "").trim() || "unknown error";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function formatLockHolder(lock, now = Date.now()) {
  const parts = [];
  const pid = Number(lock?.pid);
  if (Number.isInteger(pid) && pid > 0) parts.push(`pid ${pid}`);

  const createdAt = Date.parse(lock?.createdAt);
  if (Number.isFinite(createdAt)) {
    const started = new Date(createdAt).toISOString().replace(/\.\d{3}Z$/, "Z");
    const minutes = Math.max(0, Math.round((now - createdAt) / 60000));
    parts.push(`started ${started}`, `${minutes} min ago`);
  }

  return parts.length > 0 ? parts.join(", ") : "details unreadable";
}

// One line that says which of three different things happened: the run stopped
// before building anything (lock held, low memory, no JDK, bad commit), a build
// step broke, or the APK built fine but the install to the phone broke. The hook
// only sees an exit code, so the code carries the first distinction too.
export function describeNativeOutcome(progress, error) {
  const reason = asSentence(error?.message ?? error);

  if (progress?.phase === "install") {
    const device = progress.device ?? "the selected device";
    return {
      exitCode: 1,
      line: `[native] Install failed on ${device}: ${reason} The APK was built and is at ${APK_OUTPUT_PATH}.`,
    };
  }

  if (progress?.phase === "build") {
    const stage = progress.stage ?? "the build";
    return {
      exitCode: 1,
      line: `[native] Build failed at ${stage}: ${reason}`,
    };
  }

  return {
    exitCode: 2,
    line: `[native] Skipped before building: ${reason} Nothing was built or installed.`,
  };
}
