import { createHandler } from "./main.ts";
import { createAuthService } from "./src/auth.ts";

Deno.test("Deno Deploy auth bootstraps a super admin and keeps session data private", async () => {
  await withApp(async (request) => {
    const anonymous = await request("/api/account/session");
    assertEquals(anonymous.status, 200);
    assertEquals((await anonymous.json()).setupRequired, true);

    const register = await request("/api/auth/register", {
      method: "POST",
      body: {
        email: "owner@example.com",
        password: "correct horse battery staple",
        name: "Owner",
      },
    });
    assertEquals(register.status, 201);
    const ownerCookie = cookie(register);
    const owner = await register.json();
    assertEquals(owner.user.role, "super_admin");
    assertEquals("password" in owner.user, false);
    assertEquals("ok" in owner, false);

    const user = await request("/api/admin/users", {
      method: "POST",
      cookie: ownerCookie,
      body: {
        email: "learner@example.com",
        password: "correct horse battery staple",
        name: "Learner",
      },
    });
    assertEquals(user.status, 201);

    const token = await request("/api/admin/agent-tokens", {
      method: "POST",
      cookie: ownerCookie,
      body: { email: "learner@example.com", label: "Coach CLI" },
    });
    assertEquals(token.status, 201);
    const tokenBody = await token.json();
    assert(tokenBody.token.startsWith("agent_"));
    assertEquals("tokenHash" in tokenBody.agentToken, false);

    const login = await request("/api/auth/agent-token/login", {
      method: "POST",
      body: { token: tokenBody.token },
    });
    assertEquals(login.status, 200);
    const session = await request("/api/account/session", { cookie: cookie(login) });
    const sessionBody = await session.json();
    assertEquals(sessionBody.authenticated, true);
    assertEquals(sessionBody.auth, "agent_token");
    assertEquals(sessionBody.user.email, "learner@example.com");
  });
});

Deno.test("Deno Deploy auth rejects invalid credentials and protects admin routes", async () => {
  await withApp(async (request) => {
    const register = await request("/api/auth/register", {
      method: "POST",
      body: { email: "owner@example.com", password: "correct horse battery staple" },
    });
    assertEquals(register.status, 201);
    const invalid = await request("/api/auth/login", {
      method: "POST",
      body: { email: "owner@example.com", password: "wrong password" },
    });
    assertEquals(invalid.status, 401);
    const forbidden = await request("/api/admin/users");
    assertEquals(forbidden.status, 401);
  });
});

async function withApp(fn: (request: RequestFn) => Promise<void>): Promise<void> {
  const path = await Deno.makeTempFile({ prefix: "hk-mahjong-auth-", suffix: ".sqlite" });
  const kv = await Deno.openKv(path);
  const handler = createHandler(createAuthService(kv));
  try {
    await fn((pathName, init = {}) => {
      const headers = new Headers(init.headers);
      if (init.body !== undefined) headers.set("content-type", "application/json");
      if (init.cookie) headers.set("cookie", init.cookie);
      return handler(
        new Request(`http://localhost${pathName}`, {
          method: init.method ?? "GET",
          headers,
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        }),
      );
    });
  } finally {
    kv.close();
    await Deno.remove(path).catch(() => undefined);
  }
}

type RequestFn = (
  path: string,
  init?: { method?: string; headers?: HeadersInit; cookie?: string; body?: unknown },
) => Promise<Response>;

function cookie(response: Response): string {
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

function assert(value: unknown): asserts value {
  if (!value) throw new Error("Expected value to be truthy.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}
