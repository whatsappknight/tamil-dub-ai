import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../shared/const";
import { isPreviewGuestModeEnabled, resolveRequestUser } from "./_core/context";

const owner = { id: 1, openId: process.env.OWNER_OPEN_ID || "owner", name: "Owner", email: null, loginMethod: "preview", role: "admin" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };

afterEach(() => vi.unstubAllEnvs());

describe("preview guest access", () => {
  it("resolves the existing owner only when the non-production guest toggle is enabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PREVIEW_GUEST_MODE", "true");
    expect(isPreviewGuestModeEnabled()).toBe(true);
    await expect(resolveRequestUser({} as never, { authenticate: async () => { throw new Error("no session"); }, findOwner: async () => owner })).resolves.toMatchObject({ id: 1, role: "admin" });
  });

  it("does not wait for external authentication when development preview guest access is enabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PREVIEW_GUEST_MODE", "true");
    const authenticate = vi.fn(async () => new Promise<never>(() => undefined));
    await expect(resolveRequestUser({} as never, { authenticate, findOwner: async () => owner })).resolves.toMatchObject({ id: 1 });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("keeps a signed-in user ahead of the preview guest fallback", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PREVIEW_GUEST_MODE", "true");
    const signedInUser = { ...owner, id: 44, openId: "signed-in-user", name: "Signed in" };
    const authenticate = vi.fn(async () => signedInUser);
    const findOwner = vi.fn(async () => owner);
    await expect(resolveRequestUser({ headers: { cookie: `${COOKIE_NAME}=session-token` } } as never, { authenticate, findOwner })).resolves.toMatchObject({ id: 44, openId: "signed-in-user" });
    expect(authenticate).toHaveBeenCalledOnce();
    expect(findOwner).not.toHaveBeenCalled();
  });

  it("falls back to the preview owner when a signed-session lookup stalls", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PREVIEW_GUEST_MODE", "true");
    const authenticate = vi.fn(async () => new Promise<never>(() => undefined));
    await expect(resolveRequestUser({ headers: { cookie: `${COOKIE_NAME}=session-token` } } as never, { authenticate, findOwner: async () => owner })).resolves.toMatchObject({ id: 1, openId: owner.openId });
    expect(authenticate).toHaveBeenCalledOnce();
  }, 3_000);

  it("never activates guest access in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PREVIEW_GUEST_MODE", "true");
    expect(isPreviewGuestModeEnabled()).toBe(false);
    await expect(resolveRequestUser({} as never, { authenticate: async () => { throw new Error("no session"); }, findOwner: async () => owner })).resolves.toBeNull();
  });
});
