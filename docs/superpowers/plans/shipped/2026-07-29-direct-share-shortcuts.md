# Direct Share — Sharing Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put up to four recent 1:1 conversations directly in the Android system share sheet, so sharing a photo to a person takes one tap in the sheet plus one tap to send.

**Architecture:** A thin new Capacitor plugin (Java) publishes Sharing Shortcuts and reads `Intent.EXTRA_SHORTCUT_ID` off the launch intent. `@capgo/capacitor-share-target` keeps owning the payload; the new plugin only answers "who was tapped." A Svelte host observes the existing `inboxState.conversations` state and republishes on change. The shortcut id rides the existing `SharedIntake` record the same way `receiptId` already does.

**Tech Stack:** Capacitor 8.4.2, `androidx.core` `ShortcutManagerCompat` / `ShortcutInfoCompat` / `Person` / `IconCompat`, Svelte 5 runes, vitest.

**Spec:** `docs/superpowers/specs/2026-07-29-direct-share-shortcuts-design.md`

---

## Verified facts this plan rests on

Confirmed before writing, not assumed:

- **`EXTRA_SHORTCUT_ID` is delivered.** Android docs, Provide Direct Share targets: "The received intent of type `Intent.ACTION_SEND` will contain a String `EXTRA_SHORTCUT_ID`… The id passed in the constructor will become `EXTRA_SHORTCUT_ID` in the received Intent."
- **`setCategories` is required** for share shortcuts, so the system can filter shortcuts against share intents. A shortcut without it never appears.
- **Android 11+ (API 30+) supplies Direct Share targets ONLY via the Sharing Shortcuts API.** `ChooserTargetService` is dead. There is no fallback path to build.
- **Google's own guidance:** a Direct Share tap must take the user somewhere they can act on that target directly — "don't present a disambiguation UI." This is why Task 8 lets an explicit shortcut target override the shipped cards-win rule.
- **`setLongLived(true)`** keeps the shortcut cached by system services after removal, which is what lets the sheet keep showing a face across republishes.
- **Existing seams** (read 2026-07-29): `inboxState.conversations` is `$state<ConversationPreview[]>` (`inbox-state.svelte.ts:37`), populated app-wide by `InboxSubscriptionProvider.svelte`. `ConversationPreview` has `id`, normalized `type`, `otherParticipant?: ParticipantInfo`, `updatedAt: Date`. `ParticipantInfo` is `{ userId, displayName, avatar?, joinedAt }` (`messaging/domain/models/conversation-models.ts:18-76`). `openAttachmentShare(attachment, { note?, receiptId? })` is at `inbox-state.svelte.ts:250`.
- **`MainActivity.java` is 5 lines** — `public class MainActivity extends BridgeActivity {}`. No custom native precedent, and nothing in the way.

## Two hazards that have already cost this project real time

Every task below inherits these. They are not hypothetical; each bit us during the share-target work on 2026-07-28/29.

1. **`vi.mock` factories are hoisted above plain `const` declarations.** A factory that dereferences a `const` throws `Cannot access 'X' before initialization`. This hit four separate task test files. Use `vi.hoisted()` — see `tests/unit/share-intake/open-filed-card.test.ts`.
2. **`noUncheckedIndexedAccess` is on.** `arr[i]` is `T | undefined` even inside `if (arr.length > 0)`. Guard the extracted value; never cast. This broke plan code twice.

Also: targeted vitest runs do **not** typecheck. Tasks that touch shipped code run `pnpm run check` (baseline **0 errors, 5 warnings in 4 files**). Only one `svelte-check` may run machine-wide — check with
`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'svelte-check' }` and wait rather than starting a second. svelte-check color-escapes line starts, so `grep "^Error"` silently matches nothing; grep `-iE "error|warning"` and read the summary line.

## File structure

| File | Responsibility |
|---|---|
| `android/.../TkaSharingShortcutsPlugin.java` (new) | Publish/clear shortcuts; consume-once read of `EXTRA_SHORTCUT_ID` |
| `android/.../MainActivity.java` (modify) | Register the plugin |
| `android/app/src/main/res/xml/shortcuts.xml` (new) | `<share-target>` declaration — MIME types + category |
| `android/app/src/main/AndroidManifest.xml` (modify) | `android.app.shortcuts` meta-data pointing at the xml |
| `src/lib/shared/share-intake/domain/share-target-selection.ts` (new) | Pure: `ConversationPreview[]` → `ShareTarget[]`. No I/O |
| `src/lib/shared/share-intake/services/sharing-shortcuts-publisher.ts` (new) | Avatar fetch, diff, publish/clear. All I/O |
| `src/lib/shared/share-intake/components/SharingShortcutsHost.svelte` (new) | `$effect` over `inboxState.conversations` + auth |
| `src/lib/shared/share-intake/domain/share-intake-models.ts` (modify) | `targetConversationId?: string` |
| `src/lib/shared/share-intake/services/native-share-adapter.ts` (modify) | Stamp the shortcut id onto the record |
| `src/lib/shared/share-intake/services/intake-router.ts` (modify) | Honor the target; precedence over cards-win; fallback |
| `src/lib/shared/inbox/state/inbox-state.svelte.ts` (modify) | `conversationId` option → pre-select |
| `src/lib/shared/inbox/state/send-sequence-state.svelte.ts` (modify) | Pass `conversationId` through |
| `src/lib/shared/application/components/MainApplication.svelte` (modify) | Mount the host |

Selection is split from publishing on purpose: the ranking rules are the part worth unit-testing exhaustively, and they should not require mocking a Capacitor plugin or `fetch` to test.

---

### Task 1: The Java plugin — DONE (`6abc00a146`)

**Files:**
- Create: `android/app/src/main/java/com/tkaflowarts/composer/TkaSharingShortcutsPlugin.java`
- Modify: `android/app/src/main/java/com/tkaflowarts/composer/MainActivity.java`

There is no JS test for this task — it is native code with no bridge yet. Task 3's contract test pins the category string, and Task 10 verifies behavior on device. Do not fake a test to have one.

- [ ] **Step 1: Write the plugin**

Create `android/app/src/main/java/com/tkaflowarts/composer/TkaSharingShortcutsPlugin.java`:

```java
package com.tkaflowarts.composer;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import androidx.core.app.Person;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Publishes Android Sharing Shortcuts so specific conversations appear as
 * Direct Share targets in the system share sheet.
 *
 * Deliberately NOT part of @capgo/capacitor-share-target. That plugin owns the
 * shared payload and its event is {title, texts, files} - it never reads
 * EXTRA_SHORTCUT_ID, so it cannot say WHO was tapped. Forking it to add one
 * getStringExtra would mean maintaining a fork of a dependency forever. Both
 * plugins read the same intent, read-only and order-independent, so they cannot
 * conflict.
 */
@CapacitorPlugin(name = "TkaSharingShortcuts")
public class TkaSharingShortcutsPlugin extends Plugin {

    /**
     * Must be byte-identical to the <category> in res/xml/shortcuts.xml and to
     * SHARE_TARGET_CATEGORY in sharing-shortcuts-publisher.ts. A mismatch in any
     * one of the three means targets silently never appear, with no error
     * anywhere. A contract test pins all three (Task 3).
     */
    private static final String CATEGORY = "com.tkaflowarts.composer.category.SHARE_TARGET";

    /** The share sheet displays about four. Pushing more is wasted work. */
    private static final int MAX_TARGETS = 4;

    @PluginMethod
    public void publish(PluginCall call) {
        JSArray targets = call.getArray("targets");
        if (targets == null) {
            call.reject("targets is required");
            return;
        }

        Context context = getContext();
        List<ShortcutInfoCompat> shortcuts = new ArrayList<>();

        try {
            List<JSONObject> raw = targets.toList();
            for (int i = 0; i < raw.size() && i < MAX_TARGETS; i++) {
                JSONObject entry = raw.get(i);
                String id = entry.optString("id", "");
                String name = entry.optString("name", "");
                if (id.isEmpty() || name.isEmpty()) continue;

                IconCompat icon = decodeIcon(entry.optString("iconBase64", ""));

                Person.Builder person = new Person.Builder().setName(name).setKey(id);
                if (icon != null) person.setIcon(icon);

                // A ShortcutInfoCompat REQUIRES an intent even though the share
                // sheet supplies its own ACTION_SEND on tap. This one is what
                // runs if the shortcut is launched from a launcher long-press.
                Intent launch = new Intent(Intent.ACTION_MAIN);
                launch.setClass(context, MainActivity.class);
                launch.putExtra(Intent.EXTRA_SHORTCUT_ID, id);

                ShortcutInfoCompat.Builder builder = new ShortcutInfoCompat.Builder(context, id)
                    .setShortLabel(name)
                    .setLongLabel(name)
                    // Keeps the shortcut cached by system services after removal,
                    // so the sheet keeps showing a face across republishes.
                    .setLongLived(true)
                    .setCategories(Collections.singleton(CATEGORY))
                    .setPerson(person.build())
                    .setIntent(launch);

                if (icon != null) builder.setIcon(icon);
                shortcuts.add(builder.build());
            }
        } catch (Exception caught) {
            call.reject("could not build shortcuts: " + caught.getMessage(), caught);
            return;
        }

        try {
            ShortcutManagerCompat.removeAllDynamicShortcuts(context);
            for (ShortcutInfoCompat shortcut : shortcuts) {
                // Returns false when rate limited (the system throttles pushes
                // while the app is backgrounded). That is normal, not an error -
                // rejecting here would throw into the inbox subscription.
                ShortcutManagerCompat.pushDynamicShortcut(context, shortcut);
            }
        } catch (Exception caught) {
            call.reject("could not publish shortcuts: " + caught.getMessage(), caught);
            return;
        }

        JSObject result = new JSObject();
        result.put("published", shortcuts.size());
        call.resolve(result);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        ShortcutManagerCompat.removeAllDynamicShortcuts(getContext());
        call.resolve();
    }

    /**
     * Read EXTRA_SHORTCUT_ID off the launch intent, ONCE.
     *
     * Consume-once is load-bearing. BridgeActivity calls onNewIntent(getIntent())
     * right after load(), and the activity keeps the launch intent for its whole
     * lifetime. Without removing the extra and calling setIntent, a warm resume
     * or a second share would re-read a stale id and silently send someone's
     * photo to the wrong person.
     */
    @PluginMethod
    public void consumeLaunchShortcutId(PluginCall call) {
        JSObject result = new JSObject();
        Intent intent = getActivity() == null ? null : getActivity().getIntent();
        String id = intent == null ? null : intent.getStringExtra(Intent.EXTRA_SHORTCUT_ID);

        if (id != null && intent != null) {
            intent.removeExtra(Intent.EXTRA_SHORTCUT_ID);
            getActivity().setIntent(intent);
        }

        result.put("shortcutId", id);
        call.resolve(result);
    }

    /** Person icons are round in the sheet, so adaptive is the correct form. */
    private IconCompat decodeIcon(String base64) {
        if (base64 == null || base64.isEmpty()) return null;
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) return null;
            return IconCompat.createWithAdaptiveBitmap(bitmap);
        } catch (Exception caught) {
            // A missing face is better than a missing person: publish without.
            return null;
        }
    }
}
```

- [ ] **Step 2: Register the plugin**

App-local plugins are not auto-discovered; they must be registered before `super.onCreate`. Replace `android/app/src/main/java/com/tkaflowarts/composer/MainActivity.java` entirely:

```java
package com.tkaflowarts.composer;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must precede super.onCreate: the bridge registers plugins during it.
        registerPlugin(TkaSharingShortcutsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

- [ ] **Step 3: Compile it**

```
cd android && JAVA_HOME="C:\Program Files\Android\Android Studio1\jbr" ./gradlew.bat assembleDebug --console=plain
```

Expected: `BUILD SUCCESSFUL`.

Two environment notes. Capacitor 8 needs **JDK 21**; the machine's `JAVA_HOME` is JDK 17 and fails with `invalid source release: 21`. `C:\Program Files\Android\Android Studio1\jbr` is 21. The other install, `C:\Program Files\Android\Android Studio\jbr`, is **broken** (missing `jvm.cfg`) — do not use it.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/com/tkaflowarts/composer/TkaSharingShortcutsPlugin.java
git commit -m "feat(share-intake): native plugin to publish sharing shortcuts and read the tapped target" -- android/app/src/main/java/com/tkaflowarts/composer/TkaSharingShortcutsPlugin.java android/app/src/main/java/com/tkaflowarts/composer/MainActivity.java
```

---

### Task 2: Declare the share target — DONE (`42dcfc0d5e`)

**Files:**
- Create: `android/app/src/main/res/xml/shortcuts.xml`
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Create the shortcuts resource**

Create `android/app/src/main/res/xml/shortcuts.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<!--
  Declares which shares this app can be a Direct Share target for.

  The MIME list MUST match the ACTION_SEND intent filter in AndroidManifest.xml.
  If the manifest advertises a type this file omits, the app appears in the
  share sheet as a plain app row but never with a person's face for that type.

  The category MUST be byte-identical to CATEGORY in
  TkaSharingShortcutsPlugin.java and SHARE_TARGET_CATEGORY in
  sharing-shortcuts-publisher.ts. Mismatch = targets silently never appear.
-->
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
  <share-target android:targetClass="com.tkaflowarts.composer.MainActivity">
    <data android:mimeType="image/jpeg" />
    <data android:mimeType="image/png" />
    <data android:mimeType="image/webp" />
    <category android:name="com.tkaflowarts.composer.category.SHARE_TARGET" />
  </share-target>
</shortcuts>
```

`text/plain` is deliberately absent. The manifest advertises it on `ACTION_SEND`, but a Direct Share face means "send this to that person," and a shared tka.run link routes to the viewer rather than a conversation. Advertising people for text would promise a destination the router does not honor.

- [ ] **Step 2: Point the manifest at it**

In `android/app/src/main/AndroidManifest.xml`, inside the `.MainActivity` `<activity>` element, after the existing `<intent-filter>` blocks and before `</activity>`, add:

```xml
            <meta-data
                android:name="android.app.shortcuts"
                android:resource="@xml/shortcuts" />
```

- [ ] **Step 3: Build to prove the resource links**

```
cd android && JAVA_HOME="C:\Program Files\Android\Android Studio1\jbr" ./gradlew.bat assembleDebug --console=plain
```

Expected: `BUILD SUCCESSFUL`. A malformed `shortcuts.xml` fails at `:app:processDebugResources`, so this step is the real check.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/res/xml/shortcuts.xml
git commit -m "feat(share-intake): declare the sharing-shortcuts share target" -- android/app/src/main/res/xml/shortcuts.xml android/app/src/main/AndroidManifest.xml
```

---

### Task 3: Contract test for the three-way category match — DONE (`9e5132fb99`)

**Files:**
- Test: `tests/unit/share-intake/sharing-shortcuts-contract.test.ts`

This is the only guard against the feature's silent-failure mode. Nothing at runtime can detect a category mismatch — the sheet just never shows a face. Modeled on `tests/unit/share-intake/share-intake-host-contract.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/share-intake/sharing-shortcuts-contract.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const PLUGIN =
  "android/app/src/main/java/com/tkaflowarts/composer/TkaSharingShortcutsPlugin.java";
const SHORTCUTS_XML = "android/app/src/main/res/xml/shortcuts.xml";
const MANIFEST = "android/app/src/main/AndroidManifest.xml";
const PUBLISHER =
  "src/lib/shared/share-intake/services/sharing-shortcuts-publisher.ts";

const CATEGORY = "com.tkaflowarts.composer.category.SHARE_TARGET";

/** Every android:mimeType in a <share-target> block. */
function shareTargetMimes(xml: string): string[] {
  const block = xml.slice(xml.indexOf("<share-target"), xml.indexOf("</share-target>"));
  return [...block.matchAll(/android:mimeType="([^"]+)"/g)].map((m) => m[1] ?? "").sort();
}

/** Every android:mimeType inside the ACTION_SEND (not SEND_MULTIPLE) filter. */
function sendFilterMimes(manifest: string): string[] {
  const start = manifest.indexOf('android.intent.action.SEND"');
  const block = manifest.slice(start, manifest.indexOf("</intent-filter>", start));
  return [...block.matchAll(/android:mimeType="([^"]+)"/g)]
    .map((m) => m[1] ?? "")
    .filter((mime) => mime.startsWith("image/"))
    .sort();
}

describe("sharing shortcuts contract", () => {
  it("uses the same category string in all three places", () => {
    // A mismatch in ANY of these means Direct Share targets never appear and
    // nothing logs an error. This test is the only thing that can catch it.
    expect(read(PLUGIN)).toContain(`"${CATEGORY}"`);
    expect(read(SHORTCUTS_XML)).toContain(`android:name="${CATEGORY}"`);
    expect(read(PUBLISHER)).toContain(CATEGORY);
  });

  it("declares the same image types the manifest advertises for ACTION_SEND", () => {
    // The manifest advertising a type the share-target omits means the app
    // appears as a plain row but never with a face for that type.
    expect(shareTargetMimes(read(SHORTCUTS_XML))).toEqual(sendFilterMimes(read(MANIFEST)));
  });

  it("points the manifest at the shortcuts resource", () => {
    expect(read(MANIFEST)).toContain('android:name="android.app.shortcuts"');
    expect(read(MANIFEST)).toContain('android:resource="@xml/shortcuts"');
  });

  it("registers the plugin before super.onCreate", () => {
    // Capacitor registers plugins during super.onCreate; registering after is a
    // silent no-op and every plugin call rejects as unimplemented.
    const main = read(
      "android/app/src/main/java/com/tkaflowarts/composer/MainActivity.java"
    );
    const register = main.indexOf("registerPlugin(TkaSharingShortcutsPlugin.class)");
    const superCall = main.indexOf("super.onCreate");
    expect(register).toBeGreaterThan(-1);
    expect(register).toBeLessThan(superCall);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/sharing-shortcuts-contract.test.ts`

Expected: FAIL. Tasks 1 and 2 exist, so the category, MIME and manifest tests pass — but the publisher file does not exist yet, so the first test fails with `ENOENT` on `sharing-shortcuts-publisher.ts`. That is the correct failure and it is what Task 5 clears.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/share-intake/sharing-shortcuts-contract.test.ts
git commit -m "test(share-intake): pin the sharing-shortcuts category across xml, java and ts" -- tests/unit/share-intake/sharing-shortcuts-contract.test.ts
```

The suite is red until Task 5. That is intentional and it is the TDD signal for the publisher.

---

### Task 4: Pure target selection — DONE (`cf43af138f`)

**Files:**
- Create: `src/lib/shared/share-intake/domain/share-target-selection.ts`
- Test: `tests/unit/share-intake/share-target-selection.test.ts`

Split from publishing so the ranking rules can be tested without mocking a plugin or `fetch`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/share-intake/share-target-selection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  selectShareTargets,
  MAX_SHARE_TARGETS,
} from "$lib/shared/share-intake/domain/share-target-selection";
import type { ConversationPreview } from "$lib/shared/messaging/domain/models/conversation-models";

function direct(
  id: string,
  name: string,
  minutesAgo: number,
  avatar?: string
): ConversationPreview {
  return {
    id,
    type: "direct",
    otherParticipant: {
      userId: `u_${id}`,
      displayName: name,
      ...(avatar ? { avatar } : {}),
      joinedAt: new Date(0),
    },
    unreadCount: 0,
    updatedAt: new Date(Date.now() - minutesAgo * 60_000),
  };
}

function group(id: string, minutesAgo: number): ConversationPreview {
  return {
    id,
    type: "group",
    groupName: "Fire jam",
    participantCount: 4,
    unreadCount: 0,
    updatedAt: new Date(Date.now() - minutesAgo * 60_000),
  };
}

describe("selectShareTargets", () => {
  it("returns the most recent direct conversations, newest first", () => {
    const result = selectShareTargets([
      direct("c1", "Paul", 30),
      direct("c2", "Nina", 5),
      direct("c3", "Lion", 90),
    ]);

    expect(result.map((t) => t.name)).toEqual(["Nina", "Paul", "Lion"]);
  });

  it("excludes groups", () => {
    // v1 scope: a group icon needs an avatar stack composited into one bitmap.
    const result = selectShareTargets([group("g1", 1), direct("c1", "Paul", 10)]);

    expect(result.map((t) => t.id)).toEqual(["c1"]);
  });

  it("caps at MAX_SHARE_TARGETS", () => {
    const many = Array.from({ length: 12 }, (_, i) => direct(`c${i}`, `P${i}`, i));

    expect(selectShareTargets(many)).toHaveLength(MAX_SHARE_TARGETS);
  });

  it("drops a direct conversation with no other participant", () => {
    // The field is optional on the type, so a malformed doc must not produce a
    // nameless face in the system share sheet.
    const malformed = { ...direct("c1", "Paul", 1) };
    delete (malformed as { otherParticipant?: unknown }).otherParticipant;

    expect(selectShareTargets([malformed, direct("c2", "Nina", 2)])).toHaveLength(1);
  });

  it("carries the avatar url through, and null when there is none", () => {
    const result = selectShareTargets([
      direct("c1", "Paul", 1, "https://cdn/paul.webp"),
      direct("c2", "Nina", 2),
    ]);

    expect(result[0]?.avatarUrl).toBe("https://cdn/paul.webp");
    expect(result[1]?.avatarUrl).toBeNull();
  });

  it("is empty for an empty list", () => {
    expect(selectShareTargets([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/share-target-selection.test.ts`
Expected: FAIL — `Failed to resolve import ".../share-target-selection"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/shared/share-intake/domain/share-target-selection.ts`:

```ts
import type { ConversationPreview } from "$lib/shared/messaging/domain/models/conversation-models";

/**
 * The system share sheet displays roughly four Direct Share targets. Pushing
 * more is work the user never sees.
 */
export const MAX_SHARE_TARGETS = 4;

/** One person to publish as a Direct Share target. */
export interface ShareTarget {
  /** The conversation id. Becomes the shortcut id, and comes back as EXTRA_SHORTCUT_ID. */
  id: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Pick which conversations become Direct Share targets.
 *
 * Pure on purpose: ranking is the part worth testing exhaustively, and it
 * should not require a Capacitor plugin or a fetch mock to exercise.
 *
 * Groups are excluded in v1 - a group face means compositing an avatar stack
 * into a single bitmap, which is real work for a 48px icon.
 */
export function selectShareTargets(
  conversations: ConversationPreview[]
): ShareTarget[] {
  return conversations
    .filter((conversation) => conversation.type === "direct")
    .slice()
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .flatMap((conversation) => {
      const other = conversation.otherParticipant;
      // Optional on the type, so a malformed doc would otherwise publish a
      // nameless face into the system share sheet.
      if (!other?.displayName) return [];
      return [
        {
          id: conversation.id,
          name: other.displayName,
          avatarUrl: other.avatar ?? null,
        },
      ];
    })
    .slice(0, MAX_SHARE_TARGETS);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/share-target-selection.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/share-intake/domain/share-target-selection.ts tests/unit/share-intake/share-target-selection.test.ts
git commit -m "feat(share-intake): choose which conversations become direct share targets" -- src/lib/shared/share-intake/domain/share-target-selection.ts tests/unit/share-intake/share-target-selection.test.ts
```

---

### Task 5: The publisher — DONE (`7ef7679b56`)

**Files:**
- Create: `src/lib/shared/share-intake/services/sharing-shortcuts-publisher.ts`
- Test: `tests/unit/share-intake/sharing-shortcuts-publisher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/share-intake/sharing-shortcuts-publisher.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { publish, clear, isNativePlatform } = vi.hoisted(() => ({
  publish: vi.fn(async () => ({ published: 0 })),
  clear: vi.fn(async () => undefined),
  isNativePlatform: vi.fn(() => true),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform },
  registerPlugin: () => ({ publish, clear }),
}));

import {
  publishShareTargets,
  clearShareTargets,
  __resetPublisherForTests,
} from "$lib/shared/share-intake/services/sharing-shortcuts-publisher";
import type { ShareTarget } from "$lib/shared/share-intake/domain/share-target-selection";

function target(id: string, name: string, avatarUrl: string | null = null): ShareTarget {
  return { id, name, avatarUrl };
}

/** A 1x1 png, enough for the fetch path to produce bytes. */
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

beforeEach(() => {
  publish.mockClear();
  clear.mockClear();
  isNativePlatform.mockReturnValue(true);
  __resetPublisherForTests();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => PNG_BYTES.buffer.slice(0) as ArrayBuffer,
    }))
  );
});

describe("publishShareTargets", () => {
  it("publishes targets with base64 icons", async () => {
    await publishShareTargets([target("c1", "Paul", "https://cdn/paul.webp")]);

    expect(publish).toHaveBeenCalledTimes(1);
    const arg = publish.mock.calls[0]?.[0] as { targets: Array<Record<string, unknown>> };
    expect(arg.targets[0]).toMatchObject({ id: "c1", name: "Paul" });
    expect(arg.targets[0]?.iconBase64).toBeTruthy();
  });

  it("skips a republish when the target set is unchanged", async () => {
    const targets = [target("c1", "Paul")];

    await publishShareTargets(targets);
    await publishShareTargets(targets);

    // The conversation subscription fires on every message. Re-pushing an
    // identical set burns the system's shortcut rate limit for nothing.
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("republishes when a name changes", async () => {
    await publishShareTargets([target("c1", "Paul")]);
    await publishShareTargets([target("c1", "Paul C")]);

    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("republishes when the order changes", async () => {
    await publishShareTargets([target("c1", "Paul"), target("c2", "Nina")]);
    await publishShareTargets([target("c2", "Nina"), target("c1", "Paul")]);

    // Order IS the ranking, so a reorder is a real change.
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("publishes without an icon when the avatar fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));

    await publishShareTargets([target("c1", "Paul", "https://cdn/paul.webp")]);

    const arg = publish.mock.calls[0]?.[0] as { targets: Array<Record<string, unknown>> };
    // A nameless gap in the sheet is worse than a generic icon.
    expect(arg.targets[0]).toMatchObject({ id: "c1", iconBase64: "" });
  });

  it("publishes without an icon when the avatar response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })));

    await publishShareTargets([target("c1", "Paul", "https://cdn/paul.webp")]);

    const arg = publish.mock.calls[0]?.[0] as { targets: Array<Record<string, unknown>> };
    expect(arg.targets[0]).toMatchObject({ iconBase64: "" });
  });

  it("does nothing off native", async () => {
    isNativePlatform.mockReturnValue(false);

    await publishShareTargets([target("c1", "Paul")]);

    expect(publish).not.toHaveBeenCalled();
  });

  it("never throws when the plugin rejects", async () => {
    publish.mockRejectedValueOnce(new Error("rate limited"));

    // This runs inside a Svelte $effect over the inbox subscription. Throwing
    // would take the subscription down with it.
    await expect(publishShareTargets([target("c1", "Paul")])).resolves.toBeUndefined();
  });
});

describe("clearShareTargets", () => {
  it("clears and forgets the last published set", async () => {
    await publishShareTargets([target("c1", "Paul")]);
    await clearShareTargets();
    await publishShareTargets([target("c1", "Paul")]);

    expect(clear).toHaveBeenCalledTimes(1);
    // Sign-out then sign-in as the same user must republish, not dedup away.
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("never throws when the plugin rejects", async () => {
    clear.mockRejectedValueOnce(new Error("boom"));

    await expect(clearShareTargets()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/sharing-shortcuts-publisher.test.ts`
Expected: FAIL — `Failed to resolve import ".../sharing-shortcuts-publisher"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/shared/share-intake/services/sharing-shortcuts-publisher.ts`:

```ts
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { ShareTarget } from "../domain/share-target-selection";

/**
 * Must be byte-identical to CATEGORY in TkaSharingShortcutsPlugin.java and the
 * <category> in res/xml/shortcuts.xml. Not read at runtime on this side - it is
 * here so the contract test can pin all three from one place, because a
 * mismatch makes targets silently never appear.
 */
export const SHARE_TARGET_CATEGORY =
  "com.tkaflowarts.composer.category.SHARE_TARGET";

interface PublishedTarget {
  id: string;
  name: string;
  /** Empty string means "no icon"; the sheet falls back to the app icon. */
  iconBase64: string;
}

interface TkaSharingShortcutsPlugin {
  publish(options: { targets: PublishedTarget[] }): Promise<{ published: number }>;
  clear(): Promise<void>;
  consumeLaunchShortcutId(): Promise<{ shortcutId: string | null }>;
}

const plugin = registerPlugin<TkaSharingShortcutsPlugin>("TkaSharingShortcuts");

/**
 * Fingerprint of the last published set. The inbox conversation subscription
 * fires on every message; re-pushing an identical set would burn the system's
 * shortcut rate limit for no visible change.
 */
let lastPublished: string | null = null;

/** Test seam. Module state would otherwise leak between cases. */
export function __resetPublisherForTests(): void {
  lastPublished = null;
}

function fingerprint(targets: ShareTarget[]): string {
  // Order is included deliberately: order IS the ranking.
  return JSON.stringify(targets.map((t) => [t.id, t.name, t.avatarUrl]));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Fetch an avatar as base64. Done here rather than in Java because avatars sit
 * behind authed storage and the browser context already carries that; a Java
 * fetch would duplicate the auth logic for nothing.
 */
async function fetchIcon(url: string | null): Promise<string> {
  if (!url) return "";
  try {
    const response = await fetch(url);
    if (!response.ok) return "";
    return toBase64(new Uint8Array(await response.arrayBuffer()));
  } catch {
    // A missing face is better than a missing person.
    return "";
  }
}

/**
 * Publish the Direct Share targets, unless nothing changed.
 *
 * Never throws. This is called from a Svelte $effect over the inbox
 * subscription, and a rejection here would take that subscription down.
 */
export async function publishShareTargets(targets: ShareTarget[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const next = fingerprint(targets);
  if (next === lastPublished) return;

  try {
    const published = await Promise.all(
      targets.map(async (target) => ({
        id: target.id,
        name: target.name,
        iconBase64: await fetchIcon(target.avatarUrl),
      }))
    );

    await plugin.publish({ targets: published });
    lastPublished = next;
  } catch (caught) {
    // Rate limiting while backgrounded is normal and lands here. Leaving
    // lastPublished unset means the next change retries.
    console.warn("[SharingShortcuts] publish skipped:", caught);
  }
}

/** Remove every target. Called on sign-out - names must not outlive the session. */
export async function clearShareTargets(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await plugin.clear();
  } catch (caught) {
    console.warn("[SharingShortcuts] clear failed:", caught);
  } finally {
    // Forget regardless, so signing back in republishes rather than deduping.
    lastPublished = null;
  }
}

/**
 * Which target the user tapped, or null for an ordinary share.
 *
 * Consume-once on the native side: BridgeActivity keeps the launch intent for
 * the activity's lifetime, so without clearing it a later share would re-read a
 * stale id and send someone's photo to the wrong person.
 */
export async function consumeLaunchShortcutId(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;

  try {
    const { shortcutId } = await plugin.consumeLaunchShortcutId();
    return shortcutId ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run both suites and watch them pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/sharing-shortcuts-publisher.test.ts tests/unit/share-intake/sharing-shortcuts-contract.test.ts`

Expected: PASS. Publisher 10 tests, contract 4 tests. The contract suite was red from Task 3 and goes green here because the publisher file now exists with the category constant in it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/share-intake/services/sharing-shortcuts-publisher.ts tests/unit/share-intake/sharing-shortcuts-publisher.test.ts
git commit -m "feat(share-intake): publish direct share targets with cached icons and change detection" -- src/lib/shared/share-intake/services/sharing-shortcuts-publisher.ts tests/unit/share-intake/sharing-shortcuts-publisher.test.ts
```

---

### Task 6: Mount the publisher — DONE (`97220620d7`)

**Files:**
- Create: `src/lib/shared/share-intake/components/SharingShortcutsHost.svelte`
- Modify: `src/lib/shared/application/components/MainApplication.svelte`
- Test: add to `tests/unit/share-intake/sharing-shortcuts-contract.test.ts`

- [ ] **Step 1: Add the failing contract assertion**

Append to the `describe("sharing shortcuts contract", ...)` block in
`tests/unit/share-intake/sharing-shortcuts-contract.test.ts`:

```ts
  it("mounts the publisher host inside the app shell", () => {
    // Same structural reason ShareIntakeHost lives here: the host must not run
    // on the marketing landing, and mounting it beside the drawers makes that a
    // fact rather than a timing hope.
    expect(
      read("src/lib/shared/application/components/MainApplication.svelte")
    ).toContain("share-intake/components/SharingShortcutsHost.svelte");
  });

  it("the host republishes on conversation change and clears on sign-out", () => {
    const host = read(
      "src/lib/shared/share-intake/components/SharingShortcutsHost.svelte"
    );
    expect(host).toContain("inboxState.conversations");
    expect(host).toContain("clearShareTargets");
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/sharing-shortcuts-contract.test.ts`
Expected: FAIL — `ENOENT` on `SharingShortcutsHost.svelte`.

- [ ] **Step 3: Write the host**

Create `src/lib/shared/share-intake/components/SharingShortcutsHost.svelte`:

```svelte
<script lang="ts">
	/**
	 * Keeps the Android share sheet's Direct Share targets in step with the
	 * inbox.
	 *
	 * Renders nothing. Mounted inside MainApplication for the same structural
	 * reason as ShareIntakeHost: inboxState.conversations is only populated
	 * under the app shell, so observing it from here means the publisher cannot
	 * run against an empty list on the marketing landing.
	 *
	 * authState has no callback subscription API - it is getters over a $state
	 * rune - so a $effect is the only way to observe a sign-out.
	 */
	import { authState } from "$lib/shared/auth/state/auth-state.svelte";
	import { inboxState } from "$lib/shared/inbox/state/inbox-state.svelte";
	import { selectShareTargets } from "../domain/share-target-selection";
	import {
		clearShareTargets,
		publishShareTargets,
	} from "../services/sharing-shortcuts-publisher";

	$effect(() => {
		// Read both dependencies unconditionally so the effect re-runs on either.
		const signedIn = authState.isFullAccount;
		const conversations = inboxState.conversations;

		if (!signedIn) {
			// Contact names must not outlive the session in a system-level surface.
			void clearShareTargets();
			return;
		}

		void publishShareTargets(selectShareTargets(conversations));
	});
</script>
```

- [ ] **Step 4: Mount it**

In `src/lib/shared/application/components/MainApplication.svelte`, add the import beside the existing `ShareIntakeHost` import:

```ts
	import SharingShortcutsHost from "$lib/shared/share-intake/components/SharingShortcutsHost.svelte";
```

and render it immediately after the existing `<ShareIntakeHost />` element:

```svelte
<SharingShortcutsHost />
```

- [ ] **Step 5: Run the contract suite and the type check**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/`
Expected: PASS, contract suite now 6 tests.

Then, because this modifies shipped app-shell code, run the type check **once** (see the hazards section for the resource rule and the grep caveat):

```
pnpm run check > /tmp/check-shortcuts-6.log 2>&1
```
Expected summary line: `0 errors`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/share-intake/components/SharingShortcutsHost.svelte
git commit -m "feat(share-intake): keep direct share targets in step with the inbox" -- src/lib/shared/share-intake/components/SharingShortcutsHost.svelte src/lib/shared/application/components/MainApplication.svelte tests/unit/share-intake/sharing-shortcuts-contract.test.ts
```

---

### Task 7: Carry the tapped target onto the record — DONE (`dfad2e616d`)

**Files:**
- Modify: `src/lib/shared/share-intake/domain/share-intake-models.ts`
- Modify: `src/lib/shared/share-intake/services/native-share-adapter.ts`
- Test: `tests/unit/share-intake/native-share-adapter.test.ts`

- [ ] **Step 1: Widen the model**

In `src/lib/shared/share-intake/domain/share-intake-models.ts`, add one field to `SharedIntake`, after `problems`:

```ts
  /**
   * The conversation the user picked straight from the Android share sheet, if
   * they used a Direct Share target rather than the plain app row.
   *
   * Persisted with the record on purpose: it must survive the same reload,
   * crash and sign-in round trip the bytes do, or the share silently
   * downgrades to "pick someone" after an auth detour.
   */
  targetConversationId?: string;
```

- [ ] **Step 2: Write the failing test**

Add to `tests/unit/share-intake/native-share-adapter.test.ts`, inside the existing top-level `describe`. The file already mocks the plugin listener and `putIntake`; extend its `vi.hoisted()` block with a `consumeLaunchShortcutId` mock and mock the publisher module alongside the existing mocks:

```ts
// Add to the existing vi.hoisted() block:
//   consumeLaunchShortcutId: vi.fn(async () => null as string | null),
//
// Add beside the other vi.mock calls:
// vi.mock("$lib/shared/share-intake/services/sharing-shortcuts-publisher", () => ({
//   consumeLaunchShortcutId,
// }));

  it("stamps the tapped conversation onto the record", async () => {
    consumeLaunchShortcutId.mockResolvedValueOnce("conv_paul");

    await fire({ title: "", texts: [], files: [descriptor("a.png")] });

    const [record] = await listIntakes();
    expect(record?.targetConversationId).toBe("conv_paul");
  });

  it("leaves the field unset for an ordinary share", async () => {
    consumeLaunchShortcutId.mockResolvedValueOnce(null);

    await fire({ title: "", texts: [], files: [descriptor("a.png")] });

    const [record] = await listIntakes();
    expect(record?.targetConversationId).toBeUndefined();
  });

  it("reads the shortcut id once per delivery, not once per retained event", async () => {
    consumeLaunchShortcutId.mockResolvedValue("conv_paul");

    // The cold-launch double fire. The in-flight key already collapses these to
    // one intake; the shortcut read must not run twice either, because the
    // native side nulls the extra on first read and the second would get null.
    const event = { title: "", texts: [], files: [descriptor("a.png")] };
    await Promise.all([fire(event), fire(event)]);

    expect(consumeLaunchShortcutId).toHaveBeenCalledTimes(1);
  });
```

Match the existing file's `fire()` and `descriptor()` helpers rather than inventing new ones — read the file first.

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/native-share-adapter.test.ts`
Expected: FAIL — `targetConversationId` is `undefined` where `"conv_paul"` was expected.

- [ ] **Step 4: Wire the adapter**

In `src/lib/shared/share-intake/services/native-share-adapter.ts`, import the reader:

```ts
import { consumeLaunchShortcutId } from "./sharing-shortcuts-publisher";
```

Inside `handleShareReceived`, after the in-flight claim has already deduped the delivery and before building the record, read the id:

```ts
  // AFTER the synchronous in-flight claim, so the cold-launch twin never gets
  // here. The native side nulls the extra on first read, so a second call would
  // return null and quietly downgrade the share to "pick someone".
  const targetConversationId = await consumeLaunchShortcutId();
```

and include it on the record passed to `putIntake`, omitting the key entirely when null so the stored shape stays clean:

```ts
    ...(targetConversationId ? { targetConversationId } : {}),
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/native-share-adapter.test.ts`
Expected: PASS, 12 tests (9 existing + 3 new).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(share-intake): carry the tapped share-sheet target onto the intake record" -- src/lib/shared/share-intake/domain/share-intake-models.ts src/lib/shared/share-intake/services/native-share-adapter.ts tests/unit/share-intake/native-share-adapter.test.ts
```

---

### Task 8: Route to the tapped conversation — DONE (`c11dfcc625`; inversion narrowed to shares carrying a photo)

**Files:**
- Modify: `src/lib/shared/share-intake/services/intake-router.ts`
- Modify: `src/lib/shared/inbox/state/inbox-state.svelte.ts`
- Modify: `src/lib/shared/inbox/state/send-sequence-state.svelte.ts`
- Test: `tests/unit/share-intake/intake-router.test.ts`

This task contains the one deliberate behavior inversion. Read the reasoning before changing code.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/share-intake/intake-router.test.ts`. Reuse the file's existing helpers and mocks:

```ts
  it("pre-selects the tapped conversation for an image share", async () => {
    await routeIntake(
      { items: [{ kind: "image", file: pngFile("a.png") }], textCode: null, residualText: null, problems: [] },
      "user-1",
      { receiptId: "si_1", targetConversationId: "conv_paul" }
    );

    expect(openSendAttachmentSheet).toHaveBeenCalledWith(
      expect.objectContaining({ type: "image" }),
      expect.objectContaining({ conversationId: "conv_paul" })
    );
  });

  it("prefers an explicitly tapped person over a card in the same share", async () => {
    // Cards normally win a mixed share. But tapping a face in the system sheet
    // states a destination, and Android's own guidance is that a Direct Share
    // tap must act on THAT target rather than show a disambiguation UI. So an
    // explicit target inverts the rule - only when one is present.
    resolveForImport.mockResolvedValue(resolution("AB12"));

    const result = await routeIntake(
      {
        items: [
          { kind: "card", code: "AB12", file: pngFile("card.png") },
          { kind: "image", file: pngFile("photo.png") },
        ],
        textCode: null,
        residualText: null,
        problems: [],
      },
      "user-1",
      { receiptId: "si_1", targetConversationId: "conv_paul" }
    );

    expect(result.opened).toBe("picker");
    expect(openFiledCard).not.toHaveBeenCalled();
    expect(result.queued).toHaveLength(1);
  });

  it("still lets cards win when no target was tapped", async () => {
    resolveForImport.mockResolvedValue(resolution("AB12"));

    const result = await routeIntake(
      {
        items: [
          { kind: "card", code: "AB12", file: pngFile("card.png") },
          { kind: "image", file: pngFile("photo.png") },
        ],
        textCode: null,
        residualText: null,
        problems: [],
      },
      "user-1",
      { receiptId: "si_1" }
    );

    expect(result.opened).toBe("card");
    expect(openFiledCard).toHaveBeenCalled();
  });

  it("opens the plain picker when the tapped conversation is gone", async () => {
    // The user left the group, or the shortcut outlived its conversation. The
    // photo is what they care about; never dead-end on a stale id.
    conversationExists.mockResolvedValueOnce(false);

    await routeIntake(
      { items: [{ kind: "image", file: pngFile("a.png") }], textCode: null, residualText: null, problems: [] },
      "user-1",
      { receiptId: "si_1", targetConversationId: "conv_gone" }
    );

    const options = openSendAttachmentSheet.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(options.conversationId).toBeUndefined();
  });
```

Add a `conversationExists` mock to the file's `vi.hoisted()` block and mock the conversation service accordingly. Read `src/lib/shared/messaging/services/conversation-manager.ts` for the real method name and signature before writing the mock; do not invent one.

- [ ] **Step 2: Run and watch fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/intake-router.test.ts`
Expected: FAIL — the router ignores `targetConversationId`.

- [ ] **Step 3: Widen the router context and honor the target**

In `src/lib/shared/share-intake/services/intake-router.ts`, add `targetConversationId?: string` to the `context` parameter type.

Then, at the top of the card branch, guard it. The existing branch begins `const first = cards[0]; if (first) {`. Change the condition so an explicit target skips it:

```ts
  const first = cards[0];
  // An explicitly tapped share-sheet target beats cards-win. Tapping a face
  // states a destination; a QR we found in the pixels only infers one. Android's
  // guidance for Direct Share is to act on the chosen target, not to disambiguate.
  if (first && !context.targetConversationId) {
```

and in the image branch, resolve the target before opening:

```ts
    // A shortcut can outlive its conversation. Falling back to the plain picker
    // keeps the photo reachable; erroring would strand it.
    const targetId = context.targetConversationId;
    const conversationId =
      targetId && (await conversationExists(targetId)) ? targetId : undefined;

    openSendAttachmentSheet(
      { /* ...unchanged attachment... */ },
      {
        receiptId: context.receiptId,
        ...(conversationId ? { conversationId } : {}),
        ...(classification.residualText ? { note: classification.residualText } : {}),
      }
    );
```

When an explicit target suppressed the card branch, the cards must still be recorded rather than vanish. In the image branch's queueing loop area, add:

```ts
    for (const card of cards) {
      problems.push({
        name: card.code,
        reason: "send-dropped",
        detail: "a tapped share-sheet target took precedence",
      });
    }
```

- [ ] **Step 4: Thread `conversationId` through the inbox**

In `src/lib/shared/inbox/state/inbox-state.svelte.ts`, widen `openAttachmentShare`'s options at line 250 and pre-select:

```ts
  openAttachmentShare(
    attachment: PendingMessageAttachment,
    options: { note?: string; receiptId?: string; conversationId?: string } = {}
  ) {
```

and replace the existing `this.pendingConversationId = null;` line in that method with:

```ts
    // Set by a Direct Share tap: the send sheet opens with this conversation
    // already chosen, so the user's next tap is Send.
    this.pendingConversationId = options.conversationId ?? null;
```

In `src/lib/shared/inbox/state/send-sequence-state.svelte.ts`, widen the pass-through options type identically:

```ts
export function openSendAttachmentSheet(
  attachment: PendingMessageAttachment,
  options: { note?: string; receiptId?: string; conversationId?: string } = {}
): void {
  inboxState.openAttachmentShare(attachment, options);
}
```

- [ ] **Step 5: Run and watch pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/`
Expected: PASS, 23 tests in `intake-router.test.ts` (19 existing + 4 new), whole directory green.

Then the type check **once** (shipped inbox code is modified):

```
pnpm run check > /tmp/check-shortcuts-8.log 2>&1
```
Expected summary line: `0 errors`.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(share-intake): send to the conversation tapped in the android share sheet" -- src/lib/shared/share-intake/services/intake-router.ts src/lib/shared/inbox/state/inbox-state.svelte.ts src/lib/shared/inbox/state/send-sequence-state.svelte.ts tests/unit/share-intake/intake-router.test.ts
```

---

### Task 9: Verify the send sheet actually honors the pre-selection — DONE (`f4251b2319`, field split `974b0e3520`)

**Files:**
- Test: `src/lib/shared/inbox/components/messages/SendAttachmentSheet.svelte.test.ts`

Task 8 sets `pendingConversationId`. Nothing yet proves the sheet reads it. This is the seam most likely to be quietly wrong, because the state write can succeed while the component ignores the field.

- [ ] **Step 1: Read the component first**

Read `src/lib/shared/inbox/components/messages/SendAttachmentSheet.svelte` and find how it derives its selected conversation. If it does not consult `inboxState.pendingConversationId`, that is the bug this task fixes — wire it, following the component's existing selection pattern rather than adding a parallel one.

- [ ] **Step 2: Write the failing component test**

Add to `src/lib/shared/inbox/components/messages/SendAttachmentSheet.svelte.test.ts`, matching the file's existing render helpers:

```ts
  it("opens with the direct-share conversation already selected", async () => {
    inboxState.openAttachmentShare(
      {
        type: "image",
        file: new File([new Uint8Array([1])], "a.png", { type: "image/png" }),
        messageId: "m1",
        attachmentId: "a1",
      },
      { conversationId: "conv_paul", receiptId: "si_1" }
    );

    render(SendAttachmentSheet, { /* match the existing tests' props */ });

    // The whole point of a Direct Share tap: the next tap is Send, not a pick.
    await expect
      .element(page.getByRole("button", { name: /send/i }))
      .toBeEnabled();
  });
```

- [ ] **Step 3: Run it**

Run: `npx vitest run --config tests/config/vitest.components.config.ts src/lib/shared/inbox/components/messages/SendAttachmentSheet.svelte.test.ts`

Expected: FAIL if the sheet ignores `pendingConversationId`, PASS if it already honors it. **Report which.** If it passes immediately, say so plainly rather than manufacturing a failure — the assertion still has value as a regression guard.

- [ ] **Step 4: Commit**

```bash
git commit -m "test(inbox): the send sheet opens pre-selected for a direct share tap" -- src/lib/shared/inbox/components/messages/SendAttachmentSheet.svelte.test.ts
```

(Include the component in the pathspec if step 1 required wiring it.)

---

### Task 10: Device verification — BLOCKED, needs the phone (ask Austen first)

Unit tests structurally cannot confirm this feature. Every test above can pass while no face ever appears in the share sheet.

**The phone may be in use.** Do not drive it without checking with Austen first — a prior session captured his private messages by screenshotting during a share test. Ask before connecting.

- [ ] **Step 1: Connect**

```bash
ADB="C:/Users/Austen/AppData/Local/Android/Sdk/platform-tools/adb.exe"
"$ADB" mdns services          # discovers the device; never ask for the IP
"$ADB" connect <ip>:<port>
```

- [ ] **Step 2: Build and install**

```bash
pnpm run build && node scripts/generate-native-env.mjs && npx cap sync android
```

`generate-native-env.mjs` is **not optional**. adapter-cloudflare serves `_app/env.js` from the Worker; the native shell has no Worker, so skipping it means the client never hydrates and the whole app is dead on device. This exact step was missing from the previous plan's verification and cost a full debug cycle.

```
cd android && JAVA_HOME="C:\Program Files\Android\Android Studio1\jbr" ./gradlew.bat assembleDebug --console=plain
"$ADB" install -r android/app/build/outputs/apk/debug/app-debug.apk
```

- [ ] **Step 3: Confirm the shortcuts were published**

```bash
"$ADB" shell "dumpsys shortcut | grep -A20 com.tkaflowarts.composer"
```

Expected: dynamic shortcuts listed, one per recent conversation, each with the category
`com.tkaflowarts.composer.category.SHARE_TARGET` and `longLived=true`.

An empty list means either the publisher never ran (check `[SharingShortcuts]` in logcat) or the app was backgrounded and the push was rate limited.

- [ ] **Step 4: Confirm the faces appear, and that tapping one routes**

Share a photo from Gallery. Expected: recent conversations appear as faces above the app list. Tap one; TKA opens on the send sheet with that conversation selected.

Then confirm the id survived the bridge:

```bash
"$ADB" logcat -d | grep -iE "ShareIntake|SharingShortcuts"
```

Expected: one intake, and the routed conversation id matching the face tapped. **If `EXTRA_SHORTCUT_ID` does not survive Capacitor's `BridgeActivity`, this is where it shows up** — the share arrives but routes to the plain picker. That is the single highest-risk assumption in this plan.

- [ ] **Step 5: Confirm sign-out clears**

Sign out, then open a share sheet from Gallery. Expected: no TKA faces; the plain app row remains.

- [ ] **Step 6: Confirm the stale-id fallback**

With shortcuts published, delete one of those conversations in another client, then tap its (still cached, because `longLived`) face. Expected: the send sheet opens on the plain picker with the photo staged. No error, no dead end.

- [ ] **Step 7: Measure the real cold-share timing**

The deferred item from the spec. Time from `am start` to the `[ShareIntake]` log line, using **a valid card code** and **a real photo** — not the invalid code that produced the misleading ~8s figure. Record both numbers in the spec. They decide whether boot-path work is justified at all.

- [ ] **Step 8: Clean up and report**

Remove any test images pushed to the device, `"$ADB" disconnect`, and report the measured timings plus any step that failed.

---

## Self-review

**Spec coverage.** Publisher → Tasks 4-6. Java plugin → Task 1. `shortcuts.xml` → Task 2. Category contract test → Task 3. `targetConversationId` seam → Task 7. Router precedence and stale-id fallback → Task 8. Pre-selection actually honored → Task 9. Every device check plus the deferred timing measurement → Task 10. Groups are excluded by decision and Task 4 tests that exclusion.

**Known gap, deliberately left open:** Task 9 cannot be fully specified without reading `SendAttachmentSheet.svelte`, which is why its step 1 is "read the component first" and its step 3 says to report whether the test passed immediately. Writing speculative component internals here would be a placeholder wearing a code block.

**Type consistency.** `ShareTarget` (`{ id, name, avatarUrl }`) is defined in Task 4 and consumed unchanged in Tasks 5-6. `PublishedTarget` (`{ id, name, iconBase64 }`) is the wire shape and exists only inside the publisher. `targetConversationId` is spelled identically in Tasks 7 and 8 and in the model. The category string is one literal repeated in three files and pinned by Task 3.

**Ordering note.** Task 3 leaves its suite red until Task 5. That is intentional and stated in both tasks.
