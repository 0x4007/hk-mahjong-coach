import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_BUS_SCHEMA_VERSION = 2;
export const TEST_BUS_INTERVAL_MS = 5 * 60 * 1000;

const DEFAULT_ROOT_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const RUNS_DIRECTORY_NAME = "runs";
const LOCK_DIRECTORY_NAME = "lock";
const ROOT_MANIFEST_NAME = "manifest.json";

const TEST_STATUSES = new Set(["passed", "failed", "skipped", "pending", "todo", "disabled"]);

type TestStatus = "passed" | "failed" | "skipped" | "pending" | "todo" | "disabled";
type TestBusRunStatus = "passed" | "failed" | "error" | "aborted";

interface VitestJsonAssertion {
  readonly ancestorTitles: readonly string[];
  readonly fullName: string;
  readonly status: TestStatus;
  readonly title: string;
  readonly durationMs: number | null;
  readonly failureMessages: readonly string[];
  readonly location: { readonly line: number; readonly column: number } | null;
  readonly tags: readonly string[];
}

interface VitestJsonTestFile {
  readonly message: string;
  readonly name: string;
  readonly status: "failed" | "passed";
  readonly startTime: number;
  readonly endTime: number;
  readonly assertionResults: readonly VitestJsonAssertion[];
}

interface VitestJsonResults {
  readonly numFailedTests: number;
  readonly numFailedTestSuites: number;
  readonly numPassedTests: number;
  readonly numPassedTestSuites: number;
  readonly numPendingTests: number;
  readonly numPendingTestSuites: number;
  readonly numTodoTests: number;
  readonly numTotalTests: number;
  readonly numTotalTestSuites: number;
  readonly startTime: number;
  readonly success: boolean;
  readonly testResults: readonly VitestJsonTestFile[];
}

export interface TestBusResultFile {
  readonly testId: string;
  readonly testName: string;
  readonly testFile: string;
  readonly status: TestStatus;
  readonly path: string;
}

/** The source state observed immediately before a test-bus run. */
export interface TestBusRepositoryState {
  readonly headHash: string;
  readonly dirty: boolean;
  readonly dirtyHash: string | null;
  readonly fingerprint: string;
}

export interface TestBusManifest {
  readonly schemaVersion: 2;
  readonly runId: string;
  readonly status: TestBusRunStatus;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly intervalMs: number;
  readonly rootDirectory: string;
  readonly repositoryState: TestBusRepositoryState | null;
  readonly repositoryStateError: string | null;
  readonly runDirectory: string;
  readonly reportPath: string;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly error: string | null;
  readonly summary: {
    readonly success: boolean;
    readonly totalTests: number;
    readonly passedTests: number;
    readonly failedTests: number;
    readonly pendingTests: number;
    readonly todoTests: number;
    readonly totalTestSuites: number;
    readonly failedTestSuites: number;
  } | null;
  readonly suiteMessages: readonly {
    readonly testFile: string;
    readonly status: "failed" | "passed";
    readonly message: string;
  }[];
  readonly results: readonly TestBusResultFile[];
}

export interface TestBusOptions {
  readonly rootDirectory?: string;
  readonly outputDirectory?: string;
  readonly intervalMs?: number;
}

export interface TestBusRunOptions {
  readonly rootDirectory?: string;
  readonly outputDirectory?: string;
  readonly intervalMs?: number;
  readonly signal?: AbortSignal;
  readonly repositoryState?: TestBusRepositoryState | null;
  readonly repositoryStateError?: string | null;
}

export interface TestBusHandle {
  readonly active: boolean;
  readonly runNow: () => Promise<TestBusManifest | null>;
  readonly stop: () => void;
}

interface ProcessRunResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly spawnError: string | null;
}

interface LockOwner {
  readonly pid: number;
  readonly startedAt: string;
}

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const errorCode = (error: unknown): string | null => {
  if (!isRecord(error) || typeof error.code !== "string") {
    return null;
  }
  return error.code;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === "string" ? error : String(error);

interface GitCommandResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly spawnError: string | null;
}

export interface RepositoryStateReadResult {
  readonly state: TestBusRepositoryState | null;
  readonly error: string | null;
}

const runGitCommand = async (
  rootDirectory: string,
  args: readonly string[],
  stdoutHash?: ReturnType<typeof createHash>,
): Promise<GitCommandResult> => {
  let child: ChildProcess;
  try {
    child = spawn("git", args, {
      cwd: rootDirectory,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    return {
      exitCode: null,
      signal: null,
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
      spawnError: errorMessage(error),
    };
  }

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout?.on("data", (chunk: Buffer) => {
    if (stdoutHash === undefined) {
      stdoutChunks.push(chunk);
    } else {
      stdoutHash.update(chunk);
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  return await new Promise<GitCommandResult>((resolveResult) => {
    let spawnError: string | null = null;
    child.once("error", (error: Error) => {
      spawnError = errorMessage(error);
    });
    child.once("close", (exitCode, closeSignal) => {
      resolveResult({
        exitCode,
        signal: closeSignal,
        stdout: stdoutHash === undefined ? Buffer.concat(stdoutChunks) : Buffer.alloc(0),
        stderr: Buffer.concat(stderrChunks),
        spawnError,
      });
    });
  });
};

const commandFailure = (command: string, result: GitCommandResult): Error =>
  new Error(
    `${command} failed${result.spawnError === null ? "" : `: ${result.spawnError}`}${
      result.stderr.length === 0 ? "" : `: ${result.stderr.toString("utf8").trim()}`
    }`,
  );

const untrackedPaths = (status: Buffer): readonly string[] =>
  status
    .toString("utf8")
    .split("\0")
    .filter((entry) => entry.startsWith("?? "))
    .map((entry) => entry.slice(3));

const updateHashWithFile = async (
  hash: ReturnType<typeof createHash>,
  path: string,
): Promise<void> => {
  await new Promise<void>((resolveResult, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk: string | Buffer) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolveResult);
  });
};

/** Build a content-aware fingerprint of the checked-out repository state. */
export const readTestBusRepositoryState = async (
  rootDirectory: string,
): Promise<RepositoryStateReadResult> => {
  try {
    const headResult = await runGitCommand(rootDirectory, ["rev-parse", "--verify", "HEAD"]);
    if (headResult.exitCode !== 0 || headResult.spawnError !== null) {
      throw commandFailure("git rev-parse", headResult);
    }
    const headHash = headResult.stdout.toString("utf8").trim();
    if (headHash === "") {
      throw new Error("git rev-parse returned an empty HEAD hash");
    }

    const statusResult = await runGitCommand(rootDirectory, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "-z",
    ]);
    if (statusResult.exitCode !== 0 || statusResult.spawnError !== null) {
      throw commandFailure("git status", statusResult);
    }

    const dirty = statusResult.stdout.length > 0;
    let dirtyHash: string | null = null;
    if (dirty) {
      const hash = createHash("sha256");
      hash.update(statusResult.stdout);

      const diffResult = await runGitCommand(
        rootDirectory,
        ["diff", "HEAD", "--binary", "--no-ext-diff", "--no-color"],
        hash,
      );
      if (diffResult.exitCode !== 0 || diffResult.spawnError !== null) {
        throw commandFailure("git diff", diffResult);
      }
      for (const path of [...untrackedPaths(statusResult.stdout)].sort()) {
        const absolutePath = resolve(rootDirectory, path);
        hash.update(Buffer.from(`untracked:${path}\0`, "utf8"));
        await updateHashWithFile(hash, absolutePath);
      }
      dirtyHash = hash.digest("hex");
    }

    const fingerprint = createHash("sha256")
      .update(headHash)
      .update("\0")
      .update(dirtyHash ?? "clean")
      .digest("hex");
    return {
      state: { headHash, dirty, dirtyHash, fingerprint },
      error: null,
    };
  } catch (error) {
    return { state: null, error: errorMessage(error) };
  }
};

/** Return the stable comparison key used to decide whether a scheduled pass is needed. */
export const repositoryStateKey = (state: TestBusRepositoryState): string =>
  `${state.fingerprint}:${state.headHash}:${state.dirty ? "dirty" : "clean"}:${state.dirtyHash ?? ""}`;

export const repositoryStatesEqual = (
  left: TestBusRepositoryState,
  right: TestBusRepositoryState,
): boolean => repositoryStateKey(left) === repositoryStateKey(right);

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new TypeError(`Vitest JSON field ${field} must be a string`);
  }
  return value;
};

const requiredNumber = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Vitest JSON field ${field} must be a finite number`);
  }
  return value;
};

const optionalNumber = (value: unknown, field: string): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return requiredNumber(value, field);
};

const requiredBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== "boolean") {
    throw new TypeError(`Vitest JSON field ${field} must be a boolean`);
  }
  return value;
};

const stringArray = (value: unknown, field: string): readonly string[] => {
  if (!Array.isArray(value)) {
    throw new TypeError(`Vitest JSON field ${field} must be an array of strings`);
  }
  const entries: unknown[] = value;
  if (entries.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`Vitest JSON field ${field} must be an array of strings`);
  }
  return entries.filter((entry): entry is string => typeof entry === "string");
};

const parseStatus = (value: unknown, field: string): TestStatus => {
  if (typeof value !== "string" || !TEST_STATUSES.has(value)) {
    throw new TypeError(`Vitest JSON field ${field} has an unknown test status`);
  }
  return value as TestStatus;
};

const parseLocation = (
  value: unknown,
  field: string,
): { readonly line: number; readonly column: number } | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    throw new TypeError(`Vitest JSON field ${field} must be an object or null`);
  }
  return {
    line: requiredNumber(value.line, `${field}.line`),
    column: requiredNumber(value.column, `${field}.column`),
  };
};

const parseAssertion = (value: unknown, index: number): VitestJsonAssertion => {
  if (!isRecord(value)) {
    throw new TypeError(`Vitest JSON assertion ${String(index)} must be an object`);
  }
  const failureMessages = value.failureMessages;
  if (
    failureMessages !== null &&
    failureMessages !== undefined &&
    !Array.isArray(failureMessages)
  ) {
    throw new TypeError(
      `Vitest JSON assertion ${String(index)}.failureMessages must be an array or null`,
    );
  }
  return {
    ancestorTitles: stringArray(value.ancestorTitles, `assertion[${String(index)}].ancestorTitles`),
    fullName: requiredString(value.fullName, `assertion[${String(index)}].fullName`),
    status: parseStatus(value.status, `assertion[${String(index)}].status`),
    title: requiredString(value.title, `assertion[${String(index)}].title`),
    durationMs: optionalNumber(value.duration, `assertion[${String(index)}].duration`),
    failureMessages:
      failureMessages === null || failureMessages === undefined
        ? []
        : stringArray(failureMessages, `assertion[${String(index)}].failureMessages`),
    location: parseLocation(value.location, `assertion[${String(index)}].location`),
    tags: stringArray(value.tags, `assertion[${String(index)}].tags`),
  };
};

const parseTestFile = (value: unknown, index: number): VitestJsonTestFile => {
  if (!isRecord(value)) {
    throw new TypeError(`Vitest JSON test result ${String(index)} must be an object`);
  }
  const status = requiredString(value.status, `testResults[${String(index)}].status`);
  if (status !== "failed" && status !== "passed") {
    throw new TypeError(`Vitest JSON test result ${String(index)} has an unknown suite status`);
  }
  if (!Array.isArray(value.assertionResults)) {
    throw new TypeError(
      `Vitest JSON test result ${String(index)}.assertionResults must be an array`,
    );
  }
  return {
    message: requiredString(value.message, `testResults[${String(index)}].message`),
    name: requiredString(value.name, `testResults[${String(index)}].name`),
    status,
    startTime: requiredNumber(value.startTime, `testResults[${String(index)}].startTime`),
    endTime: requiredNumber(value.endTime, `testResults[${String(index)}].endTime`),
    assertionResults: value.assertionResults.map((entry, assertionIndex) =>
      parseAssertion(entry, assertionIndex),
    ),
  };
};

/** Parse and validate the subset of Vitest's JSON reporter used by the test bus. */
export const parseVitestJsonResults = (value: unknown): VitestJsonResults => {
  if (!isRecord(value)) {
    throw new TypeError("Vitest JSON report must be an object");
  }
  if (!Array.isArray(value.testResults)) {
    throw new TypeError("Vitest JSON report testResults must be an array");
  }
  return {
    numFailedTests: requiredNumber(value.numFailedTests, "numFailedTests"),
    numFailedTestSuites: requiredNumber(value.numFailedTestSuites, "numFailedTestSuites"),
    numPassedTests: requiredNumber(value.numPassedTests, "numPassedTests"),
    numPassedTestSuites: requiredNumber(value.numPassedTestSuites, "numPassedTestSuites"),
    numPendingTests: requiredNumber(value.numPendingTests, "numPendingTests"),
    numPendingTestSuites: requiredNumber(value.numPendingTestSuites, "numPendingTestSuites"),
    numTodoTests: requiredNumber(value.numTodoTests, "numTodoTests"),
    numTotalTests: requiredNumber(value.numTotalTests, "numTotalTests"),
    numTotalTestSuites: requiredNumber(value.numTotalTestSuites, "numTotalTestSuites"),
    startTime: requiredNumber(value.startTime, "startTime"),
    success: requiredBoolean(value.success, "success"),
    testResults: value.testResults.map((entry, index) => parseTestFile(entry, index)),
  };
};

const normalizedTestFile = (name: string, rootDirectory: string): string => {
  const withoutVitestPrefix = name.startsWith(":") ? name.slice(1) : name;
  const absoluteName = resolve(rootDirectory, withoutVitestPrefix);
  const relativeName = relative(rootDirectory, absoluteName);
  return (relativeName === "" ? withoutVitestPrefix : relativeName).replaceAll("\\", "/");
};

const slug = (value: string): string => {
  const normalized = value
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase();
  return normalized.slice(0, 120) || "unnamed-test";
};

const shortHash = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 10);

/** Return a readable, collision-resistant filename derived from a test's file and full name. */
export const testResultFileName = (testId: string): string =>
  `${slug(testId)}-${shortHash(testId)}.json`;

const timestamp = (milliseconds: number): string => new Date(milliseconds).toISOString();

const relativeOutputPath = (rootDirectory: string, path: string): string =>
  relative(rootDirectory, path).replaceAll("\\", "/");

const writeJsonAtomically = async (path: string, value: unknown): Promise<void> => {
  const temporaryPath = `${path}.${String(process.pid)}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
};

const writeTextAtomically = async (path: string, value: string): Promise<void> => {
  const temporaryPath = `${path}.${String(process.pid)}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, value, "utf8");
    await rename(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
};

const parseLockOwner = (value: string): LockOwner | null => {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !isRecord(parsed) ||
      typeof parsed.pid !== "number" ||
      typeof parsed.startedAt !== "string"
    ) {
      return null;
    }
    return { pid: parsed.pid, startedAt: parsed.startedAt };
  } catch {
    return null;
  }
};

const processIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== "ESRCH";
  }
};

const acquireLock = async (lockDirectory: string, owner: LockOwner): Promise<boolean> => {
  const ownerPath = join(lockDirectory, "owner.json");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await mkdir(lockDirectory);
      await writeFile(ownerPath, `${JSON.stringify(owner)}\n`, "utf8");
      return true;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") {
        throw error;
      }
      try {
        const existing = parseLockOwner(await readFile(ownerPath, "utf8"));
        if (existing !== null && processIsAlive(existing.pid)) {
          return false;
        }
      } catch (readError) {
        if (errorCode(readError) !== "ENOENT") {
          return false;
        }
      }
      await rm(lockDirectory, { recursive: true, force: true });
    }
  }
  return false;
};

const releaseLock = async (lockDirectory: string, owner: LockOwner): Promise<void> => {
  const ownerPath = join(lockDirectory, "owner.json");
  try {
    const current = parseLockOwner(await readFile(ownerPath, "utf8"));
    if (current?.pid === owner.pid && current.startedAt === owner.startedAt) {
      await rm(lockDirectory, { recursive: true, force: true });
    }
  } catch {
    // The lock is advisory. A later server start can recover a stale lock.
  }
};

const runVitest = async (
  rootDirectory: string,
  reportPath: string,
  signal: AbortSignal | undefined,
): Promise<ProcessRunResult> => {
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  let child: ChildProcess;
  try {
    child = spawn(
      executable,
      ["exec", "vitest", "run", "--reporter=json", "--outputFile", reportPath],
      {
        cwd: rootDirectory,
        env: { ...process.env, CI: process.env.CI ?? "1" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    return {
      exitCode: null,
      signal: null,
      stdout: "",
      stderr: "",
      spawnError: errorMessage(error),
    };
  }

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => stdoutChunks.push(chunk));
  child.stderr?.on("data", (chunk: string) => stderrChunks.push(chunk));

  const abortChild = (): void => {
    if (child.exitCode === null && !child.killed) {
      child.kill("SIGTERM");
    }
  };
  if (signal !== undefined) {
    if (signal.aborted) {
      abortChild();
    } else {
      signal.addEventListener("abort", abortChild, { once: true });
    }
  }

  return await new Promise<ProcessRunResult>((resolveResult) => {
    let spawnError: string | null = null;
    child.once("error", (error: Error) => {
      spawnError = errorMessage(error);
    });
    child.once("close", (exitCode, closeSignal) => {
      resolveResult({
        exitCode,
        signal: closeSignal,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        spawnError,
      });
    });
  }).finally(() => {
    signal?.removeEventListener("abort", abortChild);
  });
};

const emptySummary = (): TestBusManifest["summary"] => null;

const createBaseManifest = (
  runId: string,
  startedAtMs: number,
  intervalMs: number,
  rootDirectory: string,
  repositoryState: TestBusRepositoryState | null,
  repositoryStateError: string | null,
  runDirectory: string,
  reportPath: string,
  stdoutPath: string,
  stderrPath: string,
): TestBusManifest => ({
  schemaVersion: TEST_BUS_SCHEMA_VERSION,
  runId,
  status: "error",
  startedAt: timestamp(startedAtMs),
  finishedAt: timestamp(startedAtMs),
  durationMs: 0,
  intervalMs,
  rootDirectory,
  repositoryState,
  repositoryStateError,
  runDirectory: relativeOutputPath(rootDirectory, runDirectory),
  reportPath: relativeOutputPath(rootDirectory, reportPath),
  stdoutPath: relativeOutputPath(rootDirectory, stdoutPath),
  stderrPath: relativeOutputPath(rootDirectory, stderrPath),
  exitCode: null,
  signal: null,
  error: null,
  summary: emptySummary(),
  suiteMessages: [],
  results: [],
});

const writeManifest = async (
  rootDirectory: string,
  outputDirectory: string,
  runDirectory: string,
  manifest: TestBusManifest,
): Promise<void> => {
  await writeJsonAtomically(join(runDirectory, ROOT_MANIFEST_NAME), manifest);
  await writeJsonAtomically(join(outputDirectory, ROOT_MANIFEST_NAME), manifest);
  // Keep a small human-readable pointer beside the machine-readable manifest.
  await writeTextAtomically(
    join(outputDirectory, "latest-run.txt"),
    `${relativeOutputPath(rootDirectory, runDirectory)}\n`,
  );
};

const parseReportFile = async (reportPath: string): Promise<VitestJsonResults> => {
  const reportText = await readFile(reportPath, "utf8");
  if (reportText.trim() === "") {
    throw new Error("Vitest did not produce a JSON report");
  }
  return parseVitestJsonResults(JSON.parse(reportText) as unknown);
};

const buildTestResult = (
  runId: string,
  rootDirectory: string,
  testFile: string,
  fileResult: VitestJsonTestFile,
  assertion: VitestJsonAssertion,
  path: string,
): RecordValue => ({
  schemaVersion: TEST_BUS_SCHEMA_VERSION,
  runId,
  testId: `${testFile}::${assertion.fullName}`,
  testFile,
  testName: assertion.fullName,
  title: assertion.title,
  ancestorTitles: assertion.ancestorTitles,
  status: assertion.status,
  durationMs: assertion.durationMs,
  startedAt: timestamp(fileResult.startTime),
  finishedAt: timestamp(fileResult.endTime),
  failureMessages: assertion.failureMessages,
  location: assertion.location,
  tags: assertion.tags,
  suiteStatus: fileResult.status,
  suiteMessage: fileResult.message,
  resultPath: relativeOutputPath(rootDirectory, path),
});

/** Run one complete Vitest unit-test pass and persist its per-test snapshot. */
export const runTestBusOnce = async (options: TestBusRunOptions = {}): Promise<TestBusManifest> => {
  const rootDirectory = resolve(options.rootDirectory ?? DEFAULT_ROOT_DIRECTORY);
  const outputDirectory = resolve(options.outputDirectory ?? join(rootDirectory, ".data/test-bus"));
  const intervalMs = options.intervalMs ?? TEST_BUS_INTERVAL_MS;
  let repositoryState: TestBusRepositoryState | null = options.repositoryState ?? null;
  let repositoryStateError: string | null = options.repositoryStateError ?? null;
  if (options.repositoryState === undefined && options.repositoryStateError === undefined) {
    const repositoryStateResult = await readTestBusRepositoryState(rootDirectory);
    repositoryState = repositoryStateResult.state;
    repositoryStateError = repositoryStateResult.error;
  }
  const startedAtMs = Date.now();
  const runId = `${String(startedAtMs)}-${String(process.pid)}-${randomUUID().slice(0, 8)}`;
  const runDirectory = join(outputDirectory, RUNS_DIRECTORY_NAME, runId);
  const testsDirectory = join(runDirectory, "tests");
  const reportPath = join(runDirectory, "vitest.json");
  const stdoutPath = join(runDirectory, "stdout.log");
  const stderrPath = join(runDirectory, "stderr.log");
  let manifest = createBaseManifest(
    runId,
    startedAtMs,
    intervalMs,
    rootDirectory,
    repositoryState,
    repositoryStateError,
    runDirectory,
    reportPath,
    stdoutPath,
    stderrPath,
  );

  try {
    await mkdir(testsDirectory, { recursive: true });
    const processResult = await runVitest(rootDirectory, reportPath, options.signal);
    await writeTextAtomically(stdoutPath, processResult.stdout);
    await writeTextAtomically(stderrPath, processResult.stderr);

    let parsedReport: VitestJsonResults | null = null;
    let reportError: string | null = processResult.spawnError;
    try {
      parsedReport = await parseReportFile(reportPath);
    } catch (error) {
      reportError = reportError ?? errorMessage(error);
    }

    const results: TestBusResultFile[] = [];
    const suiteMessages: {
      readonly testFile: string;
      readonly status: "failed" | "passed";
      readonly message: string;
    }[] = [];
    if (parsedReport !== null) {
      const usedNames = new Set<string>();
      for (const fileResult of parsedReport.testResults) {
        const testFile = normalizedTestFile(fileResult.name, rootDirectory);
        suiteMessages.push({
          testFile,
          status: fileResult.status,
          message: fileResult.message,
        });
        for (const assertion of fileResult.assertionResults) {
          const testId = `${testFile}::${assertion.fullName}`;
          const baseName = testResultFileName(testId);
          let fileName = baseName;
          let duplicateIndex = 2;
          while (usedNames.has(fileName)) {
            fileName = `${baseName.slice(0, -5)}-${String(duplicateIndex)}.json`;
            duplicateIndex += 1;
          }
          usedNames.add(fileName);
          const resultPath = join(testsDirectory, fileName);
          await writeJsonAtomically(
            resultPath,
            buildTestResult(runId, rootDirectory, testFile, fileResult, assertion, resultPath),
          );
          results.push({
            testId,
            testName: assertion.fullName,
            testFile,
            status: assertion.status,
            path: relativeOutputPath(rootDirectory, resultPath),
          });
        }
      }
    }

    const finishedAtMs = Date.now();
    const aborted = options.signal?.aborted === true;
    const status: TestBusRunStatus = aborted
      ? "aborted"
      : reportError !== null
        ? "error"
        : parsedReport?.success === true && processResult.exitCode === 0
          ? "passed"
          : "failed";
    manifest = {
      ...manifest,
      status,
      finishedAt: timestamp(finishedAtMs),
      durationMs: finishedAtMs - startedAtMs,
      exitCode: processResult.exitCode,
      signal: processResult.signal,
      error: reportError,
      summary:
        parsedReport === null
          ? null
          : {
              success: parsedReport.success,
              totalTests: parsedReport.numTotalTests,
              passedTests: parsedReport.numPassedTests,
              failedTests: parsedReport.numFailedTests,
              pendingTests: parsedReport.numPendingTests,
              todoTests: parsedReport.numTodoTests,
              totalTestSuites: parsedReport.numTotalTestSuites,
              failedTestSuites: parsedReport.numFailedTestSuites,
            },
      suiteMessages,
      results,
    };
  } catch (error) {
    manifest = {
      ...manifest,
      finishedAt: timestamp(Date.now()),
      durationMs: Date.now() - startedAtMs,
      error: errorMessage(error),
    };
  }

  try {
    await mkdir(outputDirectory, { recursive: true });
    await writeManifest(rootDirectory, outputDirectory, runDirectory, manifest);
  } catch (error) {
    // A failed disk write must not bring down the UI server. The in-memory result is still returned.
    console.error(`[test-bus] could not persist run ${runId}: ${errorMessage(error)}`);
  }
  return manifest;
};

const inactiveHandle = (): TestBusHandle => ({
  active: false,
  runNow: () => Promise.resolve(null),
  stop: () => undefined,
});

/** Start the single test-bus scheduler owned by this worktree's UI server. */
export const startTestBus = async (options: TestBusOptions = {}): Promise<TestBusHandle> => {
  const rootDirectory = resolve(options.rootDirectory ?? DEFAULT_ROOT_DIRECTORY);
  const outputDirectory = resolve(options.outputDirectory ?? join(rootDirectory, ".data/test-bus"));
  const intervalMs = options.intervalMs ?? TEST_BUS_INTERVAL_MS;
  const lockDirectory = join(outputDirectory, LOCK_DIRECTORY_NAME);
  const owner: LockOwner = { pid: process.pid, startedAt: new Date().toISOString() };

  await mkdir(outputDirectory, { recursive: true });
  if (!(await acquireLock(lockDirectory, owner))) {
    return inactiveHandle();
  }

  let stopped = false;
  let running: Promise<TestBusManifest | null> | null = null;
  let checking: Promise<TestBusManifest | null> | null = null;
  let activeController: AbortController | null = null;
  let lastRepositoryState: TestBusRepositoryState | null = null;
  let hasCompletedRun = false;
  const runNow = (): Promise<TestBusManifest | null> => {
    if (stopped) {
      return Promise.resolve(null);
    }
    if (running !== null) {
      return running;
    }
    if (checking !== null) {
      return checking;
    }

    const checkPromise = (async (): Promise<TestBusManifest | null> => {
      const repositoryStateResult = await readTestBusRepositoryState(rootDirectory);
      if (
        hasCompletedRun &&
        repositoryStateResult.state !== null &&
        lastRepositoryState !== null &&
        repositoryStatesEqual(lastRepositoryState, repositoryStateResult.state)
      ) {
        return null;
      }

      activeController = new AbortController();
      const controller = activeController;
      const runPromise = runTestBusOnce({
        rootDirectory,
        outputDirectory,
        intervalMs,
        signal: controller.signal,
        repositoryState: repositoryStateResult.state,
        repositoryStateError: repositoryStateResult.error,
      });
      const trackedRun = runPromise.then((manifest) => {
        if (
          repositoryStateResult.state !== null &&
          manifest.status !== "error" &&
          manifest.status !== "aborted"
        ) {
          lastRepositoryState = repositoryStateResult.state;
          hasCompletedRun = true;
        }
        return manifest;
      });
      running = trackedRun;
      void trackedRun.then(
        () => {
          if (activeController === controller) {
            activeController = null;
          }
          if (running === trackedRun) {
            running = null;
          }
        },
        () => {
          if (activeController === controller) {
            activeController = null;
          }
          if (running === trackedRun) {
            running = null;
          }
        },
      );
      return await trackedRun;
    })();
    checking = checkPromise;
    void checkPromise.then(
      () => {
        if (checking === checkPromise) {
          checking = null;
        }
      },
      () => {
        if (checking === checkPromise) {
          checking = null;
        }
      },
    );
    return checkPromise;
  };

  const timer = setInterval(() => {
    void runNow();
  }, intervalMs);
  timer.unref();
  const onProcessExit = (): void => {
    activeController?.abort();
  };
  process.once("exit", onProcessExit);

  const stop = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearInterval(timer);
    activeController?.abort();
    process.removeListener("exit", onProcessExit);
    void releaseLock(lockDirectory, owner);
  };

  void runNow();
  return { active: true, runNow, stop };
};
