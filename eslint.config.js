import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginSvelte from "eslint-plugin-svelte";

import globals from "globals";

export default tseslint.config(
  // Global ignores (replaces .eslintignore)
  {
    ignores: [
      "build/",
      ".svelte-kit/",
      "dist/",
      "dev-dist/",
      "node_modules/",
      "**/*.generated.*",
      "**/*.svelte",
      "scripts/",
      "tools/",
      "*.config.ts",
      "*.config.js",
      "*.shims.d.ts",
      "src/lib/shared/sequence-engine/**/*.d.ts",
      "static/",
      "temp-scripts/",
      "**/*.old.*",
      "tests/",
      "src/stories/",
      ".storybook/",
      "coverage/",
      "archive/",
      "deployment/",
      "firebase-functions/",
      "docs/migrations/",
      ".claude/hooks/",
      // Has .json in folder name which confuses TypeScript parser
      "src/routes/.well-known/assetlinks.json/",
    ],
  },

  // Base configs
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Prettier (must be last to override other formatting rules)
  eslintConfigPrettier,

  // Main configuration for TypeScript files
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2020,
        ...globals.node,
      },
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      // Keep valuable rules
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",

      // Disable pedantic/noisy rules
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",

      // Block raw navigator.vibrate — use getHapticFeedback() service instead
      "no-restricted-properties": [
        "error",
        {
          object: "navigator",
          property: "vibrate",
          message:
            "Use getHapticFeedback() service instead of raw navigator.vibrate. See docs/superpowers/specs/2026-04-26-haptic-feedback-v2-design.md",
        },
      ],

      // Enforce architectural boundaries with path aliases
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["$services", "$services/*"],
              message:
                "Use relative imports instead of $services alias to avoid circular dependencies",
            },
            {
              group: ["$domain", "$domain/*"],
              message:
                "Use $shared/domain or relative imports instead of $domain alias",
            },
            {
              group: ["$implementations", "$implementations/*"],
              message:
                "Use relative imports within modules instead of $implementations alias",
            },
            {
              group: ["$state", "$state/*"],
              message:
                "Use module-specific state imports instead of global $state alias",
            },
          ],
        },
      ],
    },
  },

  // Enforce shared/ → features/ boundary (composition root is the only exception)
  {
    files: ["src/lib/shared/**/*.ts", "src/lib/shared/**/*.svelte"],
    ignores: ["src/lib/shared/composition-root/**", "src/lib/shared/di/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["#lib/features/*", "#lib/features/**"],
              message:
                "shared/ must not import from features/ (one-way dependency). Use the registration pattern in composition-root/ or extract an interface to shared/.",
            },
          ],
        },
      ],
    },
  },

  // Filename convention disabled — codebase uses PascalCase (classes),
  // camelCase (getters), and kebab-case (modules) by established convention.

  // Test files override
  {
    files: ["tests/**/*.ts", "tests/**/*.js", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
