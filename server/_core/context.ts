import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId } from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export function isPreviewGuestModeEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.PREVIEW_GUEST_MODE === "true" && Boolean(ENV.ownerOpenId);
}

export async function resolveRequestUser(
  req: CreateExpressContextOptions["req"],
  dependencies: { authenticate?: typeof sdk.authenticateRequest; findOwner?: typeof getUserByOpenId } = {},
): Promise<User | null> {
  try {
    const authenticated = await (dependencies.authenticate ?? sdk.authenticateRequest)(req);
    if (authenticated) return authenticated;
  } catch {
    // Public procedures and preview guest resolution may continue without a session.
  }
  if (!isPreviewGuestModeEnabled()) return null;
  return (await (dependencies.findOwner ?? getUserByOpenId)(ENV.ownerOpenId)) ?? null;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const user = await resolveRequestUser(opts.req);

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
