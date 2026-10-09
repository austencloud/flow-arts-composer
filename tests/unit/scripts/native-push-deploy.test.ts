import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  buildWindowsCommandLine,
  choosePushedCommit,
  createNativeBuildEnv,
  createSnapshotCheckoutPlan,
  describeNativeOutcome,
  formatLockHolder,
  inspectNativeReleaseSurface,
  inspectZipFilenameFlags,
  parseAdbDevices,
  parseJavaMajor,
  parsePushUpdates,
  readJavaProperty,
  selectAndroidDevice,
  selectAndroidSdkRoot,
} from "../../../scripts/lib/native-push-deploy-core.mjs";

describe("native release surface verification", () => {
  it("reports every forbidden marker with its generated asset", () => {
    const report = inspectNativeReleaseSurface([
      {
        path: "_app/immutable/chunks/viewer.js",
        contents: 'label:"View in coven hub",url:"/coven?seq="',
      },
      {
        path: "_app/immutable/nodes/coven.js",
        contents: 'id:"coven-seed"',
      },
    ]);

    expect(report).toEqual({
      checkedFileCount: 2,
      violations: [
        {
          path: "_app/immutable/chunks/viewer.js",
          marker: "View in coven hub",
        },
        {
          path: "_app/immutable/chunks/viewer.js",
          marker: "/coven?seq=",
        },
        {
          path: "_app/immutable/nodes/coven.js",
          marker: "coven-seed",
        },
      ],
    });
  });

  it("accepts production assets without internal navigation or hub code", () => {
    expect(
      inspectNativeReleaseSurface([
        {
          path: "_app/immutable/chunks/viewer.js",
          contents: 'label:"Practice Mode",url:"/browse/gallery"',
        },
      ])
    ).toEqual({ checkedFileCount: 1, violations: [] });
  });

  it("fails closed when the generated build directory is missing", () => {
    const missingBuild = resolve(
      "test-results",
      `missing-native-surface-${process.pid}`
    );
    const result = spawnSync(
      process.execPath,
      [resolve("scripts/verify-native-release-surface.mjs"), missingBuild],
      { encoding: "utf8" }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `[native-surface] Build directory not found: ${missingBuild}`
    );
  });
});

function makeZipDirectory(
  entries: Array<{ name: string; utf8: boolean }>
): Buffer {
  const centralEntries = entries.map(({ name, utf8 }) => {
    const filename = Buffer.from(name, "utf8");
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(utf8 ? 0x0800 : 0, 8);
    header.writeUInt16LE(filename.length, 28);
    return Buffer.concat([header, filename]);
  });
  const centralDirectory = Buffer.concat(centralEntries);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(0, 16);
  return Buffer.concat([centralDirectory, end]);
}

describe("native APK filename verification", () => {
  it("detects Unicode ZIP entries missing the UTF-8 flag", () => {
    const report = inspectZipFilenameFlags(
      makeZipDirectory([
        { name: "assets/A.svg", utf8: false },
        { name: "assets/γ.svg", utf8: false },
        { name: "assets/⊕.svg", utf8: true },
      ])
    );

    expect(report).toEqual({
      entryCount: 3,
      nonAsciiEntryCount: 2,
      nonUtf8EntryCount: 1,
      nonUtf8Names: ["assets/γ.svg"],
      filenames: ["assets/A.svg", "assets/γ.svg", "assets/⊕.svg"],
    });
  });

  it("accepts canonical Unicode names carrying the UTF-8 flag", () => {
    const report = inspectZipFilenameFlags(
      makeZipDirectory([
        { name: "assets/Σ.svg", utf8: true },
        { name: "assets/γ.svg", utf8: true },
      ])
    );

    expect(report.nonAsciiEntryCount).toBe(2);
    expect(report.nonUtf8EntryCount).toBe(0);
  });
});

describe("native snapshot extraction", () => {
  it("uses a private Git index and an absolute checkout prefix", () => {
    const buildRoot = resolve("test-results", "native-push");
    const snapshotRoot = join(buildRoot, "source");
    const indexPath = join(buildRoot, "source.index");
    const commit = "a".repeat(40);
    const plan = createSnapshotCheckoutPlan(
      buildRoot,
      snapshotRoot,
      indexPath,
      commit
    );

    expect(plan).toEqual({
      indexPath,
      readTreeArgs: ["read-tree", "--no-sparse-checkout", commit],
      checkoutArgs: [
        "checkout-index",
        "--all",
        "--ignore-skip-worktree-bits",
        `--prefix=${snapshotRoot.replaceAll("\\", "/")}/`,
      ],
    });
  });

  it("materializes Unicode filenames through Git on the host platform", () => {
    const root = mkdtempSync(join(tmpdir(), "tka-native-snapshot-"));
    const repoRoot = join(root, "repo");
    const buildRoot = join(root, "build");
    const snapshotRoot = join(buildRoot, "source");
    const indexPath = join(buildRoot, "source.index");
    const unicodePath = join("assets", "Δ", "Σ.json");
    const contents = '{"symbol":"Σ"}\n';
    const git = (args: string[], env = process.env) => {
      const result = spawnSync("git", args, {
        cwd: repoRoot,
        encoding: "utf8",
        env,
      });
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      return result.stdout.trim();
    };

    try {
      mkdirSync(join(repoRoot, "assets", "Δ"), { recursive: true });
      mkdirSync(snapshotRoot, { recursive: true });
      writeFileSync(join(repoRoot, unicodePath), contents);
      git(["init", "--quiet"]);
      git(["config", "core.autocrlf", "false"]);
      git(["add", unicodePath]);
      git([
        "-c",
        "user.name=TKA Test",
        "-c",
        "user.email=test@tkaflowarts.com",
        "commit",
        "--quiet",
        "-m",
        "fixture",
      ]);

      const commit = git(["rev-parse", "HEAD"]);
      const plan = createSnapshotCheckoutPlan(
        buildRoot,
        snapshotRoot,
        indexPath,
        commit
      );
      const checkoutEnv = {
        ...process.env,
        GIT_INDEX_FILE: plan.indexPath,
      };
      git(plan.readTreeArgs, checkoutEnv);
      git(plan.checkoutArgs, checkoutEnv);

      expect(readFileSync(join(snapshotRoot, unicodePath), "utf8")).toBe(
        contents
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects checkout targets outside the build directory", () => {
    const buildRoot = resolve("test-results", "native-push");

    expect(() =>
      createSnapshotCheckoutPlan(
        buildRoot,
        resolve(buildRoot, "..", "outside"),
        join(buildRoot, "source.index"),
        "a".repeat(40)
      )
    ).toThrow("must stay inside");
  });

  it("rejects unresolved commit names", () => {
    const buildRoot = resolve("test-results", "native-push");

    expect(() =>
      createSnapshotCheckoutPlan(
        buildRoot,
        join(buildRoot, "source"),
        join(buildRoot, "source.index"),
        "HEAD"
      )
    ).toThrow("resolved Git object ID");
  });
});

describe("native push commit selection", () => {
  const head = "1".repeat(40);
  const other = "2".repeat(40);
  const remote = "3".repeat(40);

  it("builds the current branch commit from the pre-push input", () => {
    const updates = parsePushUpdates(
      `refs/heads/other ${other} refs/heads/other ${remote}\n` +
        `refs/heads/main ${head} refs/heads/main ${remote}\n`
    );

    expect(choosePushedCommit(updates, head, "refs/heads/main")).toBe(head);
  });

  it("falls back to HEAD when invoked outside a hook", () => {
    expect(choosePushedCommit([], head, "refs/heads/main")).toBe(head);
  });

  it("skips a deletion-only push", () => {
    const updates = parsePushUpdates(
      `(delete) ${"0".repeat(40)} refs/heads/old ${remote}\n`
    );

    expect(choosePushedCommit(updates, head, "refs/heads/main")).toBeNull();
  });
});

describe("Android device selection", () => {
  const output = `List of devices attached
RFCY30FJN5D device product:q6qsqw model:SM_F956U device:q6q transport_id:6
emulator-5554 device product:sdk_gphone model:sdk_gphone64_x86_64 transport_id:9
adb-wireless._adb-tls-connect._tcp device product:q6qsqw model:SM_F956U transport_id:12
OFFLINE123 unauthorized usb:1-2 transport_id:7
`;

  it("prefers the single USB phone over emulators and wireless entries", () => {
    const devices = parseAdbDevices(output);
    const selection = selectAndroidDevice(devices);

    expect(selection.reason).toBe("single-usb");
    expect(selection.device?.serial).toBe("RFCY30FJN5D");
    expect(selection.device?.attributes.model).toBe("SM_F956U");
  });

  it("honors ANDROID_SERIAL when the requested device is authorized", () => {
    const devices = parseAdbDevices(output);
    const selection = selectAndroidDevice(devices, "emulator-5554");

    expect(selection.reason).toBe("requested");
    expect(selection.device?.serial).toBe("emulator-5554");
  });

  it("does not guess when multiple USB devices are connected", () => {
    const devices = parseAdbDevices(
      "List of devices attached\nPHONE1 device\nPHONE2 device\n"
    );

    expect(selectAndroidDevice(devices)).toEqual({
      device: null,
      reason: "multiple-usb",
    });
  });

  it("ignores unauthorized devices", () => {
    const devices = parseAdbDevices(
      "List of devices attached\nPHONE1 unauthorized\n"
    );

    expect(selectAndroidDevice(devices)).toEqual({
      device: null,
      reason: "none",
    });
  });
});

describe("Android SDK property parsing", () => {
  it("decodes Windows backslashes from local.properties", () => {
    expect(
      readJavaProperty(
        "sdk.dir=C:\\\\Users\\\\Austen\\\\AppData\\\\Local\\\\Android\\\\Sdk\n",
        "sdk.dir"
      )
    ).toBe("C:\\Users\\Austen\\AppData\\Local\\Android\\Sdk");
  });

  it("falls back to the standard user SDK when a worktree has no local.properties", () => {
    const localAppData = resolve("test-results", "local-app-data");
    const expected = join(localAppData, "Android", "Sdk");

    expect(
      selectAndroidSdkRoot(
        {
          androidHome: resolve("test-results", "missing-sdk"),
          localAppData,
        },
        (candidate) => candidate === expected
      )
    ).toBe(expected);
  });

  it("prefers a valid explicit SDK over local and default candidates", () => {
    const explicit = resolve("test-results", "explicit-sdk");

    expect(
      selectAndroidSdkRoot(
        {
          androidHome: explicit,
          localProperties: `sdk.dir=${resolve("test-results", "property-sdk")}`,
          localAppData: resolve("test-results", "local-app-data"),
        },
        (candidate) => candidate === explicit
      )
    ).toBe(explicit);
  });
});

describe("Android JDK selection", () => {
  it("reads the Java major version from javac output", () => {
    expect(parseJavaMajor("javac 21.0.10")).toBe(21);
    expect(parseJavaMajor('openjdk version "24.0.1" 2026-04-15')).toBe(24);
    expect(parseJavaMajor('java version "1.8.0_411"')).toBe(8);
  });
});

describe("Windows command execution", () => {
  it("builds a shell-free command line for the fixed pnpm and Gradle commands", () => {
    expect(buildWindowsCommandLine("pnpm.cmd", ["run", "build"])).toBe(
      "pnpm.cmd run build"
    );
    expect(buildWindowsCommandLine(".\\gradlew.bat", ["assembleDebug"])).toBe(
      ".\\gradlew.bat assembleDebug"
    );
  });

  it("rejects tokens that would need cmd.exe quoting", () => {
    expect(() =>
      buildWindowsCommandLine("pnpm.cmd", ["run", "build & deploy"])
    ).toThrow("unsupported quoting");
  });
});

describe("native build environment", () => {
  it("copies local public values without copying local secrets", () => {
    const example = [
      "PUBLIC_FIREBASE_API_KEY=example-public",
      "ANTHROPIC_API_KEY=example-placeholder",
      "PUBLIC_APP_NAME=Flow Arts Composer",
    ].join("\n");
    const local = [
      "PUBLIC_FIREBASE_API_KEY=real-public",
      "VITE_R2_PUBLIC_URL=https://assets.example.com",
      "ANTHROPIC_API_KEY=local-secret",
    ].join("\n");

    const result = createNativeBuildEnv(example, local);

    expect(result).toContain("PUBLIC_FIREBASE_API_KEY=real-public");
    expect(result).toContain("VITE_R2_PUBLIC_URL=https://assets.example.com");
    expect(result).toContain("ANTHROPIC_API_KEY=example-placeholder");
    expect(result).not.toContain("local-secret");
    expect(result).not.toContain("example-public");
  });
});

describe("native outcome reporting", () => {
  it("reports a stop before the build as skipped, with exit code 2", () => {
    expect(
      describeNativeOutcome(
        { phase: "setup", stage: null, device: null },
        new Error(
          "Another Android push build is already running (pid 69148, started 2026-10-08T05:20:04Z, 8 min ago)."
        )
      )
    ).toEqual({
      exitCode: 2,
      line:
        "[native] Skipped before building: Another Android push build is already running (pid 69148, started 2026-10-08T05:20:04Z, 8 min ago). Nothing was built or installed.",
    });
  });

  it("names the build step that failed, with exit code 1", () => {
    expect(
      describeNativeOutcome(
        { phase: "build", stage: "4/4 Assemble debug APK", device: null },
        new Error(
          ".\\gradlew.bat assembleDebug --console=plain --no-daemon exited with 1"
        )
      )
    ).toEqual({
      exitCode: 1,
      line:
        "[native] Build failed at 4/4 Assemble debug APK: .\\gradlew.bat assembleDebug --console=plain --no-daemon exited with 1.",
    });
  });

  it("names the device when the install fails and points at the built APK", () => {
    expect(
      describeNativeOutcome(
        {
          phase: "install",
          stage: "install",
          device: "SM F956U (RFCX71MRJ6J)",
        },
        new Error("adb.exe -s RFCX71MRJ6J install -r app-debug.apk exited with 1")
      )
    ).toEqual({
      exitCode: 1,
      line:
        "[native] Install failed on SM F956U (RFCX71MRJ6J): adb.exe -s RFCX71MRJ6J install -r app-debug.apk exited with 1. The APK was built and is at android/app/build/outputs/apk/debug/app-debug.apk.",
    });
  });

  it("describes the lock holder by pid, start time, and age", () => {
    expect(
      formatLockHolder(
        { pid: 69148, createdAt: "2026-10-08T05:20:04.123Z" },
        Date.parse("2026-10-08T05:28:21Z")
      )
    ).toBe("pid 69148, started 2026-10-08T05:20:04Z, 8 min ago");
    expect(formatLockHolder({}, Date.now())).toBe("details unreadable");
  });

  it("prints the outcome on stdout and exits 2 when the commit cannot be resolved", () => {
    const result = spawnSync(
      process.execPath,
      [
        resolve("scripts/native-push-deploy.mjs"),
        "--dry-run",
        "--ref",
        "0".repeat(40),
      ],
      { encoding: "utf8" }
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toContain(
      "[native] Skipped before building: git rev-parse "
    );
    expect(result.stdout).toContain(
      "exited with 128. Nothing was built or installed."
    );
  });
});
