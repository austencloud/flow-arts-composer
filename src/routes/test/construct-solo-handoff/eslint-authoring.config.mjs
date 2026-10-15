// The repository lint config skips Svelte and tests. Check this restored harness explicitly.
import base from "../../../../eslint.config.js";
import svelte from "eslint-plugin-svelte";
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
  ...base.filter((config) => !(config.ignores && !config.files)),
  ...svelte.configs["flat/recommended"],
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
      globals: { ...globals.browser },
    },
  },
  {
    files: ["**/*.svelte.ts"],
    languageOptions: { parser: tseslint.parser },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: ["tests/**/*.ts"],
    languageOptions: { parserOptions: { project: null } },
  },
];
