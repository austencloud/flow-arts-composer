#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { freemem } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildWindowsCommandLine,
  choosePushedCommit,
  createNativeBuildEnv,
  createSnapshotCheckoutPlan,
  describeNativeOutcome,
  formatLockHolder,
  inspectZipFilenameFlags,
  parseAdbDevices,
  parseJavaMajor,
  parsePushUpdates,
  readJavaProperty,
  selectAndroidDevice,
  selectAndroidSdkRoot,
} from "./lib/native-push-deploy-core.mjs";

const MIN_FREE_MEMORY_BYTES = 4 * 1024 ** 3;
const LOCK_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const APP_ID = "com.tkaflowarts.composer";
const MAIN_ACTIVITY = `${APP_ID}/.MainActivity`;

// Where the run is when it fails, so the final outcome line can say whether
// nothing was built, which build step broke, or which phone the install failed on.
const progress = { phase: "setup", stage: null, device: null };

function step(label) {
  progress.stage = label;
  console.log(`[native] ${label}`);
}

class CommandFailure extends Error {
  constructor(command, args, result) {
    const status = result.status ?? result.signal ?? "unknown";
    super(`${command} ${args.join(" ")} exited with ${status}`);
    this.name = "CommandFailure";
  }
}

function run(command, args, options = {}) {
  const useCommandInterpreter =
    process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command);
  const executable = useCommandInterpreter
    ? (process.env.ComSpec ?? "cmd.exe")
    : command;
  const executableArgs = useCommandInterpreter
    ? ["/d", "/s", "/c", buildWindowsCommandLine(command, args)]
    : args;
  const result = spawnSync(executable, executableArgs, {
    cwd: options.cwd,
    env: options.env,
    encoding: options.capture ? "utf8" : undefined,
    shell: false,
    stdio: options.capture ? "pipe" : "inherit",
    windowsHide: true,
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new CommandFailure(command, args, result);
  }

  return result;
}

function capture(command, args, options = {}) {
  const result = run(command, args, { ...options, capture: true });
  return result.stdout.trim();
}

function enableWindowsUtf8CodePage() {
  if (process.platform !== "win32") return;

  const executable = process.env.SystemRoot
    ? join(process.env.SystemRoot, "System32", "chcp.com")
    : "chcp.com";
  const output = capture(executable, ["65001"]);
  if (!/\b65001\b/.test(output)) {
    throw new Error(
      `Windows did not activate UTF-8 code page 65001: ${output || "no output"}`
    );
  }
  console.log("[native] Windows code page: UTF-8 (65001).");
}

function listRelativeFiles(root) {
  const files = [];
  const directories = [""];

  while (directories.length > 0) {
    const relativeDirectory = directories.pop();
    const absoluteDirectory = join(root, relativeDirectory);
    for (const entry of readdirSync(absoluteDirectory, {
      withFileTypes: true,
    })) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      if (entry.isDirectory()) {
        directories.push(relativePath);
      } else {
        files.push(relativePath);
      }
    }
  }

  return files;
}

function assertInside(parent, target) {
  const relativePath = relative(resolve(parent), resolve(target));
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Refusing to modify unsafe native build path: ${target}`);
  }
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function acquireLock(lockPath) {
  mkdirSync(dirname(lockPath), { recursive: true });

  const tryCreate = () => {
    const descriptor = openSync(lockPath, "wx");
    writeFileSync(
      descriptor,
      JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })
    );
    closeSync(descriptor);
  };

  try {
    tryCreate();
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;

    let stale = false;
    let holder = "details unreadable";
    try {
      const lock = JSON.parse(readFileSync(lockPath, "utf8"));
      holder = formatLockHolder(lock);
      const age = Date.now() - Date.parse(lock.createdAt);
      stale = age > LOCK_MAX_AGE_MS || !processIsRunning(Number(lock.pid));
    } catch {
      stale = true;
    }

    if (!stale) {
      throw new Error(
        `Another Android push build is already running (${holder}).`
      );
    }

    rmSync(lockPath, { force: true });
    tryCreate();
  }

  return () => rmSync(lockPath, { force: true });
}

function resolveAndroidSdkRoot(repoRoot) {
  const localProperties = join(repoRoot, "android", "local.properties");
  return selectAndroidSdkRoot(
    {
      androidHome: process.env.ANDROID_HOME,
      androidSdkRoot: process.env.ANDROID_SDK_ROOT,
      localProperties: existsSync(localProperties)
        ? readFileSync(localProperties, "utf8")
        : "",
      localAppData: process.env.LOCALAPPDATA,
    },
    existsSync
  );
}

function resolveAdb(repoRoot, androidSdkRoot) {
  const candidates = [];
  if (process.env.ADB) candidates.push(process.env.ADB);

  if (androidSdkRoot) {
    candidates.push(join(androidSdkRoot, "platform-tools", "adb.exe"));
  }

  const match = candidates.find(
    (candidate) => candidate && existsSync(candidate)
  );
  if (match) return match;

  const lookup =
    process.platform === "win32"
      ? run("where.exe", ["adb"], { capture: true, allowFailure: true })
      : run("which", ["adb"], { capture: true, allowFailure: true });
  if (lookup.status === 0) return lookup.stdout.split(/\r?\n/)[0].trim();

  return null;
}

function readConnectedDevices(adb, repoRoot) {
  if (!adb) return [];
  const result = run(adb, ["devices", "-l"], {
    cwd: repoRoot,
    capture: true,
    allowFailure: true,
  });
  return result.status === 0 ? parseAdbDevices(result.stdout) : [];
}

function resolveJavaHome() {
  const candidates = [];
  if (process.platform === "win32" && process.env.ProgramFiles) {
    candidates.push(
      join(process.env.ProgramFiles, "Android", "Android Studio1", "jbr"),
      join(process.env.ProgramFiles, "Android", "Android Studio", "jbr")
    );
  }
  candidates.push(process.env.JAVA_HOME);

  return (
    candidates.find((candidate) => {
      if (!candidate) return false;
      const compiler = join(
        candidate,
        "bin",
        process.platform === "win32" ? "javac.exe" : "javac"
      );
      if (!existsSync(compiler)) return false;

      const version = run(compiler, ["-version"], {
        capture: true,
        allowFailure: true,
      });
      const major = parseJavaMajor(`${version.stdout}\n${version.stderr}`);
      return version.status === 0 && major !== null && major >= 21;
    }) ?? null
  );
}

function copyLocalBuildInputs(repoRoot, snapshotRoot) {
  const examplePath = join(repoRoot, ".env.example");
  const localPath = join(repoRoot, ".env");
  const nativeEnv = createNativeBuildEnv(
    existsSync(examplePath) ? readFileSync(examplePath, "utf8") : "",
    existsSync(localPath) ? readFileSync(localPath, "utf8") : ""
  );
  writeFileSync(join(snapshotRoot, ".env"), nativeEnv);

  const localProperties = join(repoRoot, "android", "local.properties");
  if (existsSync(localProperties)) {
    const destination = join(snapshotRoot, "android", "local.properties");
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(localProperties, destination);
  }
}

function createSnapshot(repoRoot, snapshotRoot, snapshotIndex, commit) {
  mkdirSync(snapshotRoot, { recursive: true });
  const checkout = createSnapshotCheckoutPlan(
    dirname(snapshotRoot),
    snapshotRoot,
    snapshotIndex,
    commit
  );
  const checkoutEnv = {
    ...process.env,
    GIT_INDEX_FILE: checkout.indexPath,
  };

  try {
    run("git", checkout.readTreeArgs, { cwd: repoRoot, env: checkoutEnv });
    run("git", checkout.checkoutArgs, { cwd: repoRoot, env: checkoutEnv });
  } finally {
    rmSync(snapshotIndex, { force: true });
    rmSync(`${snapshotIndex}.lock`, { force: true });
  }

  copyLocalBuildInputs(repoRoot, snapshotRoot);

  const sourceModules = join(repoRoot, "node_modules");
  if (!existsSync(sourceModules)) {
    throw new Error("node_modules is missing. The Android build cannot start.");
  }
  symlinkSync(
    sourceModules,
    join(snapshotRoot, "node_modules"),
    process.platform === "win32" ? "junction" : "dir"
  );
}

function removeSnapshot(buildRoot, snapshotRoot, snapshotIndex) {
  assertInside(buildRoot, snapshotRoot);
  assertInside(buildRoot, snapshotIndex);

  const moduleLink = join(snapshotRoot, "node_modules");
  if (existsSync(moduleLink)) unlinkSync(moduleLink);
  rmSync(snapshotRoot, { recursive: true, force: true });
  rmSync(snapshotIndex, { force: true });
  rmSync(`${snapshotIndex}.lock`, { force: true });
}

function describeDevice(device) {
  const model = device.attributes.model?.replaceAll("_", " ");
  return model ? `${model} (${device.serial})` : device.serial;
}

function printNoDeviceReason(devices, reason, requestedSerial) {
  const unauthorized = devices.filter(({ state }) => state !== "device");
  if (reason === "requested-device-unavailable") {
    console.warn(
      `[native] APK ready. ANDROID_SERIAL=${requestedSerial} is not an authorized device.`
    );
    return;
  }

  if (reason.startsWith("multiple")) {
    const serials = devices
      .filter(({ state }) => state === "device")
      .map(({ serial }) => serial)
      .join(", ");
    console.warn(
      `[native] APK ready. Multiple devices are connected (${serials}). Set ANDROID_SERIAL to choose one.`
    );
    return;
  }

  if (unauthorized.length > 0) {
    console.warn(
      "[native] APK ready. Confirm the USB debugging prompt on the Android device, then push again."
    );
    return;
  }

  console.log(
    "[native] APK ready. No Android device is connected, so install was skipped."
  );
}

function parseArgs(argv) {
  const options = {
    dryRun: process.env.TKA_NATIVE_PUSH_DRY_RUN === "1",
    ref: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dry-run") options.dryRun = true;
    if (argv[index] === "--ref") options.ref = argv[index + 1] ?? null;
  }

  return options;
}

async function readHookInput() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export async function main() {
  const options = parseArgs(process.argv.slice(2));
  enableWindowsUtf8CodePage();
  const repoRoot = resolve(capture("git", ["rev-parse", "--show-toplevel"]));
  const headOid = capture("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
  const headRefResult = run("git", ["symbolic-ref", "-q", "HEAD"], {
    cwd: repoRoot,
    capture: true,
    allowFailure: true,
  });
  const headRef =
    headRefResult.status === 0 ? headRefResult.stdout.trim() : null;
  const hookInput = options.ref ? "" : await readHookInput();
  const updates = parsePushUpdates(hookInput);
  const requestedCommit =
    options.ref ?? choosePushedCommit(updates, headOid, headRef);

  if (!requestedCommit) {
    console.log("[native] No commit is being pushed. Android build skipped.");
    return;
  }

  const commit = capture("git", ["rev-parse", `${requestedCommit}^{commit}`], {
    cwd: repoRoot,
  });
  const shortCommit = commit.slice(0, 10);
  const androidSdkRoot = resolveAndroidSdkRoot(repoRoot);
  const adb = resolveAdb(repoRoot, androidSdkRoot);
  const javaHome = resolveJavaHome();

  if (options.dryRun) {
    const initialSelection = selectAndroidDevice(
      readConnectedDevices(adb, repoRoot),
      process.env.ANDROID_SERIAL
    );
    const target = initialSelection.device
      ? describeDevice(initialSelection.device)
      : "APK only";
    const sdk = androidSdkRoot ?? "Android SDK missing";
    const jdk = javaHome ?? "JDK 21 missing";
    console.log(
      `[native] Dry run: build ${shortCommit}; target: ${target}; SDK: ${sdk}; JDK: ${jdk}.`
    );
    return;
  }

  if (freemem() < MIN_FREE_MEMORY_BYTES) {
    throw new Error("Less than 4 GB of memory is available.");
  }

  const gitCommonDirRaw = capture("git", ["rev-parse", "--git-common-dir"], {
    cwd: repoRoot,
  });
  const gitCommonDir = resolve(repoRoot, gitCommonDirRaw);
  const buildRoot = join(gitCommonDir, "tka-native-push");
  const snapshotRoot = join(buildRoot, "source");
  const snapshotIndex = join(buildRoot, "source.index");
  const lockPath = join(buildRoot, "build.lock");
  assertInside(gitCommonDir, buildRoot);
  if (!javaHome) {
    throw new Error("JDK 21 or newer is required for the Android debug build.");
  }

  const releaseLock = acquireLock(lockPath);
  mkdirSync(buildRoot, { recursive: true });

  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const buildEnv = {
    ...process.env,
    DISABLE_PWA: "true",
    JAVA_HOME: javaHome,
    ...(androidSdkRoot
      ? {
          ANDROID_HOME: androidSdkRoot,
          ANDROID_SDK_ROOT: androidSdkRoot,
        }
      : {}),
  };

  let snapshotCreated = false;
  try {
    progress.phase = "build";
    progress.stage = "snapshot checkout";
    console.log(`[native] Building Android app from ${shortCommit}.`);
    removeSnapshot(buildRoot, snapshotRoot, snapshotIndex);
    createSnapshot(repoRoot, snapshotRoot, snapshotIndex, commit);
    snapshotCreated = true;

    step("1/4 Build web bundle");
    run(pnpm, ["run", "build"], { cwd: snapshotRoot, env: buildEnv });

    step("Verify release surface");
    run(process.execPath, ["scripts/verify-native-release-surface.mjs"], {
      cwd: snapshotRoot,
      env: buildEnv,
    });

    step("2/4 Generate native environment");
    run(process.execPath, ["scripts/generate-native-env.mjs"], {
      cwd: snapshotRoot,
      env: buildEnv,
    });

    step("3/4 Sync Capacitor Android");
    run(pnpm, ["exec", "cap", "sync", "android"], {
      cwd: snapshotRoot,
      env: buildEnv,
    });

    step("4/4 Assemble debug APK");
    const androidDir = join(snapshotRoot, "android");
    const gradle =
      process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew";
    run(gradle, ["assembleDebug", "--console=plain", "--no-daemon"], {
      cwd: androidDir,
      env: buildEnv,
    });

    progress.stage = "APK verification";
    const builtApk = join(
      androidDir,
      "app",
      "build",
      "outputs",
      "apk",
      "debug",
      "app-debug.apk"
    );
    if (!existsSync(builtApk) || statSync(builtApk).size < 1024 * 1024) {
      throw new Error("Gradle finished without producing a valid debug APK.");
    }

    const zipReport = inspectZipFilenameFlags(readFileSync(builtApk));
    const assetsRoot = join(androidDir, "app", "src", "main", "assets");
    const expectedUnicodeEntries = listRelativeFiles(assetsRoot)
      .filter((path) => /[^\x00-\x7f]/.test(path))
      .map((path) => `assets/${path}`);
    if (expectedUnicodeEntries.length === 0) {
      throw new Error(
        "Synced Android assets contain no Unicode names; native asset verification is incomplete."
      );
    }

    const packagedEntries = new Set(zipReport.filenames);
    const missingUnicodeEntries = expectedUnicodeEntries.filter(
      (path) => !packagedEntries.has(path)
    );
    if (missingUnicodeEntries.length > 0) {
      throw new Error(
        `APK renamed or omitted ${missingUnicodeEntries.length} Unicode asset(s): ${missingUnicodeEntries.slice(0, 5).join(", ")}`
      );
    }
    console.log(
      `[native] Verified ${expectedUnicodeEntries.length} Unicode APK filename(s) byte-for-byte.`
    );

    const outputDir = join(
      repoRoot,
      "android",
      "app",
      "build",
      "outputs",
      "apk",
      "debug"
    );
    const outputApk = join(outputDir, "app-debug.apk");
    mkdirSync(outputDir, { recursive: true });
    copyFileSync(builtApk, outputApk);
    writeFileSync(join(outputDir, "app-debug.commit.txt"), `${commit}\n`);

    const apkMiB = (statSync(outputApk).size / 1024 ** 2).toFixed(1);
    console.log(
      `[native] APK ready: android/app/build/outputs/apk/debug/app-debug.apk (${apkMiB} MiB).`
    );

    if (!adb) {
      console.warn(
        "[native] adb was not found. The APK was built but not installed."
      );
      return;
    }

    const devices = readConnectedDevices(adb, repoRoot);
    const selection = selectAndroidDevice(devices, process.env.ANDROID_SERIAL);
    if (!selection.device) {
      printNoDeviceReason(
        devices,
        selection.reason,
        process.env.ANDROID_SERIAL
      );
      return;
    }

    progress.phase = "install";
    progress.device = describeDevice(selection.device);
    console.log(`[native] Installing on ${progress.device}.`);
    run(adb, ["-s", selection.device.serial, "install", "-r", outputApk], {
      cwd: repoRoot,
    });
    const launch = run(
      adb,
      [
        "-s",
        selection.device.serial,
        "shell",
        "am",
        "start",
        "-n",
        MAIN_ACTIVITY,
      ],
      { cwd: repoRoot, allowFailure: true, capture: true }
    );
    if (launch.status !== 0) {
      console.warn(
        "[native] Installed successfully, but Android did not open the app."
      );
    } else {
      console.log(`[native] Installed and opened ${APP_ID}.`);
    }
  } finally {
    try {
      if (
        snapshotCreated ||
        existsSync(snapshotRoot) ||
        existsSync(snapshotIndex)
      ) {
        removeSnapshot(buildRoot, snapshotRoot, snapshotIndex);
      }
    } finally {
      releaseLock();
    }
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // On stdout, next to the hook's own summary line, so a log that captures
    // the push shows the reason and the summary together.
    const outcome = describeNativeOutcome(progress, error);
    console.log(outcome.line);
    process.exitCode = outcome.exitCode;
  });
}
