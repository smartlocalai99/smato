import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, getUser, createUser } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

function request(body = { mobile: "9876543210", pin: "123456" }) {
  return new Request("http://localhost/api/admin/create-admin", {
    method: "POST",
    headers: {
      authorization: "Bearer caller-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function loadPost() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  return (await import("@/app/api/admin/create-admin/route")).POST;
}

function clients() {
  createClient
    .mockReturnValueOnce({ auth: { getUser } })
    .mockReturnValueOnce({ auth: { admin: { createUser } } });
}

beforeEach(() => {
  createClient.mockReset();
  getUser.mockReset();
  createUser.mockReset();
  createUser.mockResolvedValue({ data: { user: { id: "new-admin" } }, error: null });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/admin/create-admin", () => {
  it("rejects a request with no bearer token", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    clients();
    const POST = await loadPost();

    const response = await POST(
      new Request("http://localhost/api/admin/create-admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mobile: "9876543210", pin: "123456" }),
      })
    );

    expect(response.status).toBe(401);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rejects a token that doesn't resolve to a real session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    clients();
    const POST = await loadPost();

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("creates another admin for any currently signed-in caller", async () => {
    // Reaching this endpoint at all already required the admin role to get
    // into /admin in the first place (components/admin/AdminShell.js) — the
    // route itself only needs to know the caller has a valid session, not
    // re-derive the role from a token that may predate it being granted.
    getUser.mockResolvedValue({
      data: { user: { id: "caller", app_metadata: {}, is_anonymous: false } },
      error: null,
    });
    clients();
    const POST = await loadPost();

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(createUser).toHaveBeenCalledWith({
      email: "9876543210@smato.local",
      password: "123456",
      email_confirm: true,
      app_metadata: { role: "admin" },
    });
  });

  it("still gives the new login trusted app metadata for a caller with the role", async () => {
    getUser.mockResolvedValue({
      data: { user: { app_metadata: { role: "admin" }, is_anonymous: false } },
      error: null,
    });
    clients();
    const POST = await loadPost();

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(createUser).toHaveBeenCalledWith({
      email: "9876543210@smato.local",
      password: "123456",
      email_confirm: true,
      app_metadata: { role: "admin" },
    });
  });
});
