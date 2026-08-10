interface DenoJson {
  deploy?: { org?: string; app?: string };
}

const API_BASE = "https://api.deno.com/v2";
const deployConfig = {
  install: null,
  build: null,
  predeploy: null,
  runtime: { type: "dynamic", entrypoint: "main.ts" },
};
const token = requiredEnv("DENO_DEPLOY_TOKEN_0X4007");
if (!token.startsWith("ddo_")) {
  throw new Error(
    "DENO_DEPLOY_TOKEN_0X4007 must be a Deno Deploy organization API token starting with ddo_.",
  );
}

const config = JSON.parse(await Deno.readTextFile("deno.json")) as DenoJson;
const org = requiredConfig(config.deploy?.org, "deploy.org");
const app = requiredConfig(config.deploy?.app, "deploy.app");
const desiredDatabase = `${app}-kv`;
await ensureApp(app);

let database = desiredDatabase;
const provision = await runDenoDeploy([
  "database",
  "provision",
  desiredDatabase,
  "--kind",
  "denokv",
  "--token",
  token,
  "--org",
  org,
]);
if (!provision.success) {
  const output = `${provision.stdout}\n${provision.stderr}`;
  if (!/already|exist/i.test(output)) {
    if (!/limit/i.test(output)) throw new Error(`Could not provision Deno KV database:\n${output}`);
    const list = await runDenoDeploy(["database", "list", "--token", token, "--org", org]);
    database = firstDenoKvDatabase(`${list.stdout}\n${list.stderr}`) ?? "";
    if (!list.success || !database) {
      throw new Error(`No existing Deno KV database found after provision failed:\n${output}`);
    }
  }
}

const assign = await runDenoDeploy([
  "database",
  "assign",
  database,
  "--token",
  token,
  "--org",
  org,
  "--app",
  app,
]);
if (!assign.success && !/already|assigned|exist/i.test(`${assign.stdout}\n${assign.stderr}`)) {
  throw new Error(`Could not assign Deno KV database:\n${assign.stdout}\n${assign.stderr}`);
}
console.log(`Deno KV database assigned: ${database}`);

async function ensureApp(appSlug: string): Promise<void> {
  const existing = await fetch(`${API_BASE}/apps/${encodeURIComponent(appSlug)}`, {
    headers: authHeaders(),
  });
  if (existing.status === 404) {
    await api("/apps", { method: "POST", body: { slug: appSlug, config: deployConfig } });
    console.log(`Created Deno Deploy app ${appSlug}`);
    return;
  }
  if (!existing.ok) throw await responseError("GET", `/apps/${appSlug}`, existing);
  await api(`/apps/${encodeURIComponent(appSlug)}`, {
    method: "PATCH",
    body: { config: deployConfig },
  });
  console.log(`Configured Deno Deploy app ${appSlug}`);
}

async function runDenoDeploy(
  args: string[],
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  const output = await new Deno.Command(Deno.execPath(), {
    args: ["deploy", ...args],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const decoder = new TextDecoder();
  return {
    success: output.success,
    stdout: decoder.decode(output.stdout),
    stderr: decoder.decode(output.stderr),
  };
}

async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) throw await responseError(method, path, response);
  return await response.json() as T;
}

async function responseError(method: string, path: string, response: Response): Promise<Error> {
  return new Error(
    `${method} ${path} failed with HTTP ${response.status}: ${await response.text()}`,
  );
}

function firstDenoKvDatabase(output: string): string | null {
  for (const line of output.split("\n")) {
    if (!/denokv/i.test(line)) continue;
    const cells = line.split("│").map((cell) => cell.trim()).filter(Boolean);
    const candidate = cells.find((cell) => cell && !/denokv|created|updated/i.test(cell));
    if (candidate) return candidate;
    const words = line.trim().split(/\s+/).filter(Boolean);
    const name = words.find((word) => !/denokv/i.test(word) && !/[│┌┐└┘─]/.test(word));
    if (name) return name;
  }
  return null;
}

function authHeaders(): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredConfig(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.includes("{{") || trimmed.includes("}}")) {
    throw new Error(`${name} is required in deno.json`);
  }
  return trimmed;
}
