/**
 * Static contract test for where the Post editor's saves go.
 *
 * The Post page keys one editor per post and swaps it when another post
 * opens, a feature video or a sequence's own. A copy the autosave still
 * holds then saves after the swap. Svelte reads a prop when it is used, so a
 * save that read `onSaveDraft` then got the next post's save: a feature
 * video's post went into the ordinary post, or the reverse.
 *
 * This test locks the shape that fixed it: the editor reads its save once,
 * when it opens, and the Post page binds the account save to the account
 * and sequence when it hands it over. A feature video's add-video button names the
 * command that copies footage into its folder instead of opening a picker.
 *
 * If this test fails, fix the component; do not loosen the assertions.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const read = (relative: string) =>
  readFileSync(path.join(repoRoot, relative), "utf8");

const WORKSPACE =
  "src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte";
const POST_MODULE = "src/lib/features/post/PostModule.svelte";

describe("where a waiting Post save goes", () => {
  it("the editor reads its save once, when it opens", () => {
    const source = read(WORKSPACE);
    expect(source).toContain("const saveDraft = onSaveDraft;");
    expect(source).toContain("await saveDraft(project)");
    // Every other use of the prop only reads whether there is one.
    expect(source).not.toMatch(/\bonSaveDraft\(/);
  });

  it("the Post page binds the account save to its account and sequence", () => {
    const source = read(POST_MODULE);
    expect(source).toContain(
      "saveSyncedFor(authState.user.uid, moduleState.sequence)"
    );
    expect(source).not.toContain(
      "saveSyncedPostDraft(project, moduleState.sequence"
    );
    // A retry left from the previous account is dropped on an account change.
    expect(source).toContain("cancelPostCloudRetries()");
  });

  it("a feature video's add-video button names the command for footage", () => {
    const source = read(WORKSPACE);
    const start = source.indexOf("function pickDeviceVideo");
    const pick = source.slice(
      start,
      source.indexOf("fileInput?.click()", start)
    );
    expect(pick).toContain("if (featureVideo)");
    expect(pick).toContain("node scripts/post-project.mjs add-take");
  });
});
