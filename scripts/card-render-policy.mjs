const protectedFiles = new Set([
  ".github/workflows/web-ci.yml",
  ".github/workflows/card-render-policy-review.yml",
  "scripts/card-render-policy.mjs",
  "tests/config/vitest.card-mcp-parity.config.ts",
  "tests/helpers/browser-commands/render-mcp-card.ts",
  "tests/unit/card-profile-cases.test.ts",
  "mcp-server-pkg/package.json",
  "mcp-server-pkg/build.mjs",
  "mcp-server-pkg/card-renderer.ts",
  "package.json",
]);

export function needsCardPolicyApproval(path) {
  return (
    protectedFiles.has(path) ||
    path.startsWith("tests/render-parity/") ||
    path.startsWith("mcp-server-pkg/scripts/")
  );
}

export function changedCardPolicyFiles(files) {
  return [
    ...new Set(
      files
        .flatMap((file) => [file.filename, file.previous_filename])
        .filter((path) => path && needsCardPolicyApproval(path))
    ),
  ];
}
