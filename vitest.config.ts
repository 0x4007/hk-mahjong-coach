import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const coverageRun = process.argv.some(
  (argument) => argument === "--coverage" || argument.startsWith("--coverage."),
);

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
    // Precise V8 instrumentation turns one synchronous natural hand into a multi-minute workload
    // and distorts wall-clock measurements. Ordinary tests and dedicated workflows retain those
    // real integration/performance proofs without instrumenting them.
    exclude: coverageRun
      ? [
          ...configDefaults.exclude,
          "packages/test-fixtures/src/simulation-natural.test.ts",
          "tests/persistence-performance.test.ts",
        ]
      : configDefaults.exclude,
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      include: ["packages/{core,hk-rules,protocol,analysis,bots,coach,persistence}/src/**/*.ts"],
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
        "packages/coach/src/**/*.ts": {
          statements: 85,
        },
        "packages/persistence/src/**/*.ts": {
          statements: 85,
        },
      },
    },
  },
});
