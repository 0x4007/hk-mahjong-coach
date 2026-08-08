import { describe, expect, it } from "vitest";
import {
  parseVitestJsonResults,
  repositoryStateKey,
  repositoryStatesEqual,
  testResultFileName,
  type TestBusRepositoryState,
} from "../apps/server/src/test-bus";

const report = {
  numFailedTests: 1,
  numFailedTestSuites: 1,
  numPassedTests: 1,
  numPassedTestSuites: 0,
  numPendingTests: 0,
  numPendingTestSuites: 0,
  numTodoTests: 0,
  numTotalTests: 2,
  numTotalTestSuites: 1,
  startTime: 1_700_000_000_000,
  success: false,
  testResults: [
    {
      message: "one assertion failed",
      name: "/worktree/packages/core/src/example.test.ts",
      status: "failed",
      startTime: 1_700_000_000_001,
      endTime: 1_700_000_000_025,
      assertionResults: [
        {
          ancestorTitles: ["example"],
          fullName: "example > passes",
          status: "passed",
          title: "passes",
          duration: 8,
          failureMessages: [],
          location: { line: 10, column: 3 },
          tags: [],
        },
        {
          ancestorTitles: ["example"],
          fullName: "example > fails",
          status: "failed",
          title: "fails",
          duration: 16,
          failureMessages: ["Expected 1 to be 2"],
          location: null,
          tags: ["regression"],
        },
      ],
    },
  ],
} as const;

describe("centralized test bus result contract", () => {
  const repositoryState = (
    overrides: Partial<TestBusRepositoryState> = {},
  ): TestBusRepositoryState => ({
    headHash: "0123456789abcdef",
    dirty: false,
    dirtyHash: null,
    fingerprint: "fingerprint-a",
    ...overrides,
  });

  it("compares the commit and content-aware dirty fingerprint", () => {
    const clean = repositoryState();
    const same = repositoryState();
    const changedCommit = repositoryState({
      headHash: "fedcba9876543210",
      fingerprint: "fingerprint-b",
    });
    const changedDirtyContent = repositoryState({
      dirty: true,
      dirtyHash: "dirty-content-b",
      fingerprint: "fingerprint-c",
    });

    expect(repositoryStateKey(clean)).toBe(repositoryStateKey(same));
    expect(repositoryStatesEqual(clean, same)).toBe(true);
    expect(repositoryStatesEqual(clean, changedCommit)).toBe(false);
    expect(repositoryStatesEqual(clean, changedDirtyContent)).toBe(false);
  });

  it("validates the Vitest JSON shape and preserves per-assertion details", () => {
    const parsed = parseVitestJsonResults(report);
    const [file] = parsed.testResults;
    const [passing, failing] = file?.assertionResults ?? [];

    expect(parsed.success).toBe(false);
    expect(parsed.numTotalTests).toBe(2);
    expect(passing?.fullName).toBe("example > passes");
    expect(failing?.failureMessages).toEqual(["Expected 1 to be 2"]);
    expect(failing?.tags).toEqual(["regression"]);
  });

  it("names output files from the test identity while remaining safe and collision-resistant", () => {
    const testId = "packages/core/src/example.test.ts::example > reads /tmp and handles spaces";
    const fileName = testResultFileName(testId);

    expect(fileName).toMatch(
      /^packages-core-src-example-test-ts-example-reads-tmp-and-handles-spaces-[0-9a-f]{10}\.json$/u,
    );
    expect(fileName).not.toContain("/");
    expect(testResultFileName(`${testId} changed`)).not.toBe(fileName);
  });

  it("rejects malformed reports instead of publishing ambiguous results", () => {
    expect(() => parseVitestJsonResults({ testResults: [] })).toThrow(
      "Vitest JSON field numFailedTests must be a finite number",
    );
  });
});
