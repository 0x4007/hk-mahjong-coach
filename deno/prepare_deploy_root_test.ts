import { prepareDeployRoot } from "./prepare_deploy_root.ts";

Deno.test("deploy root contains the Deno runtime, portal, and optional game build", async () => {
  const temp = await Deno.makeTempDir({ prefix: "hk-mahjong-deploy-test-" });
  const root = `${temp}/hk-deploy-root`;
  try {
    const prepared = await prepareDeployRoot({ requestedRoot: root });
    const files: string[] = [];
    for await (const file of walk(prepared)) files.push(file);
    files.sort();
    assert(files.includes("main.ts"));
    assert(files.includes("src/auth.ts"));
    assert(files.includes("public/index.html"));
    assert(files.includes("deno.json"));
    assert(!files.some((file) => file.startsWith("node_modules/")));
    assert(!files.some((file) => file.startsWith(".git/")));
  } finally {
    await Deno.remove(temp, { recursive: true });
  }
});

Deno.test("deploy root refuses a repository-root target", async () => {
  let rejected = false;
  try {
    await prepareDeployRoot({ requestedRoot: Deno.cwd(), repoRoot: Deno.cwd() });
  } catch {
    rejected = true;
  }
  assert(rejected);
});

async function* walk(root: string, prefix = ""): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(root)) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory) yield* walk(`${root}/${entry.name}`, relative);
    else if (entry.isFile) yield relative;
  }
}

function assert(value: unknown): asserts value {
  if (!value) throw new Error("Expected assertion to hold");
}
