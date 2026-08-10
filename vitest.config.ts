import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@hk-mahjong/core/public": fromRoot("./packages/core/src/public.ts"),
      "@hk-mahjong/core": fromRoot("./packages/core/src/index.ts"),
      "@hk-mahjong/hk-rules": fromRoot("./packages/hk-rules/src/index.ts"),
      "@hk-mahjong/analysis": fromRoot("./packages/analysis/src/index.ts"),
      "@hk-mahjong/bots": fromRoot("./packages/bots/src/index.ts"),
      "@hk-mahjong/coach": fromRoot("./packages/coach/src/index.ts"),
      "@hk-mahjong/protocol": fromRoot("./packages/protocol/src/index.ts"),
      "@hk-mahjong/persistence": fromRoot("./packages/persistence/src/index.ts"),
      "@hk-mahjong/tile-ui": fromRoot("./packages/tile-ui/src/index.ts"),
      "@hk-mahjong/test-fixtures": fromRoot("./packages/test-fixtures/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      include: ["packages/{core,hk-rules,protocol,analysis,bots}/src/**/*.ts"],
      thresholds: {
        "packages/core/src/**/*.ts": {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        "packages/hk-rules/src/**/*.ts": {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        "packages/protocol/src/**/*.ts": {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        "packages/analysis/src/**/*.ts": {
          statements: 85,
        },
        "packages/bots/src/**/*.ts": {
          statements: 85,
        },
      },
    },
  },
});
