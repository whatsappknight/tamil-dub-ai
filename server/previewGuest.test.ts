import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("never activates guest access in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PREVIEW_GUEST_MODE", "true");
    expect(isPreviewGuestModeEnabled()).toBe(false);
    await expect(resolveRequestUser({} as never, { authenticate: async () => { throw new Error("no session"); }, findOwner: async () => owner })).resolves.toBeNull();
  });
});
