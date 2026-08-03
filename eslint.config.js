import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "coverage/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      ".codex-worktrees/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-magic-numbers": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["packages/{analysis,bots}/src/**/*.{ts,tsx}"],
    ignores: ["packages/{analysis,bots}/src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@hk-mahjong/core",
              message:
                "Live analysis and bot code must import only the curated @hk-mahjong/core/public surface.",
            },
          ],
          patterns: [
            {
              group: [
                "@hk-mahjong/core/*",
                "!@hk-mahjong/core/public",
                "../core/**",
                "../../core/**",
                "../../../packages/core/**",
              ],
              message:
                "Live analysis and bot code must not reach authoritative core state or internals.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.config.js", "eslint.config.js"],
    ...eslint.configs.recommended,
  },
);
