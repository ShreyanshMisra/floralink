import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const signOut = vi.fn();
const signInAnonymously = vi.fn();

vi.mock("@/lib/supabase-browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { getUser, signOut, signInAnonymously },
  }),
}));

import { ensureAnonymousAuth } from "@/features/auth/ensure-anonymous-auth";

describe("ensureAnonymousAuth", () => {
  beforeEach(() => {
    getUser.mockReset();
    signOut.mockReset().mockResolvedValue({ error: null });
    signInAnonymously.mockReset();
  });

  it("reuses a server-validated contribution user", async () => {
    const user = { id: "11111111-1111-4111-8111-111111111111" };
    getUser.mockResolvedValue({ data: { user }, error: null });

    await expect(ensureAnonymousAuth()).resolves.toBe(user);
    expect(signOut).not.toHaveBeenCalled();
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("replaces a stale local session with a new anonymous user", async () => {
    const user = { id: "22222222-2222-4222-8222-222222222222" };
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("stale") });
    signInAnonymously.mockResolvedValue({ data: { user }, error: null });

    await expect(ensureAnonymousAuth()).resolves.toBe(user);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(signInAnonymously).toHaveBeenCalledOnce();
  });
});
