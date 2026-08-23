import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { COOKIE_NAME } from "@shared/const";
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

function hasSessionSignal(req: CreateExpressContextOptions["req"]) {
  const headers = req.headers ?? {};
  const authorization = headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) return true;
  const cookieHeader = headers.cookie;
  return Boolean(cookieHeader?.split(";").some(cookie => cookie.trim().startsWith(`${COOKIE_NAME}=`)));
}

async function authenticateWithPreviewTimeout(
  req: CreateExpressContextOptions["req"],
  authenticate: typeof sdk.authenticateRequest,
  previewGuestEnabled: boolean,
) {
  if (!previewGuestEnabled) return authenticate(req);
  const timeout = new Promise<null>(resolve => {
    setTimeout(() => resolve(null), 1_500);
  });
  return await Promise.race([authenticate(req), timeout]);
}

export async function resolveRequestUser(
  req: CreateExpressContextOptions["req"],
  dependencies: { authenticate?: typeof sdk.authenticateRequest; findOwner?: typeof getUserByOpenId } = {},
): Promise<User | null> {
  const previewGuestEnabled = isPreviewGuestModeEnabled();
  if (previewGuestEnabled && !hasSessionSignal(req)) {
    return (await (dependencies.findOwner ?? getUserByOpenId)(ENV.ownerOpenId)) ?? null;
  }
  try {
    const authenticated = await authenticateWithPreviewTimeout(req, dependencies.authenticate ?? sdk.authenticateRequest, previewGuestEnabled);
    if (authenticated) return authenticated;
  } catch {
    // Public procedures and preview guest resolution may continue without a session.
  }
  if (!previewGuestEnabled) return null;
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
