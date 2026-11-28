import { NextRequest } from "next/server";

import { clientIp } from "@/lib/auth/request";
import { enforceRateLimit } from "@/lib/rate-limit/simple";

const normalizeUsername = (username: string): string => username.trim().toLowerCase() || "unknown";

type LoginRateLimitResult = {
  allowed: boolean;
  retryAfterSec: number;
};

export const enforcePreParseRateLimit = async (
  req: NextRequest
): Promise<LoginRateLimitResult> => {
  const limit = await enforceRateLimit(`login:pre:${clientIp(req)}`, { max: 120, windowSec: 60 });
  return limit.allowed
    ? { allowed: true, retryAfterSec: 0 }
    : { allowed: false, retryAfterSec: limit.retryAfterSec };
};

export const enforceLoginRateLimit = async (
  req: NextRequest,
  username: string
): Promise<LoginRateLimitResult> => {
  const normalizedUsername = normalizeUsername(username);
  const ip = clientIp(req);

  const [usernameLimit, globalLimit, ipLimit] = await Promise.all([
    enforceRateLimit(`login:user:${normalizedUsername}`, { max: 20, windowSec: 300 }),
    enforceRateLimit("login:global", { max: 300, windowSec: 60 }),
    ip === "direct"
      ? Promise.resolve(null)
      : enforceRateLimit(`login:ip:${ip}`, { max: 10, windowSec: 60 })
  ]);

  const blocked = [ipLimit, usernameLimit, globalLimit].filter(
    (limit): limit is NonNullable<typeof limit> => limit !== null && !limit.allowed
  );
  if (blocked.length === 0) {
    return { allowed: true, retryAfterSec: 0 };
  }

  return {
    allowed: false,
    retryAfterSec: Math.max(...blocked.map((limit) => limit.retryAfterSec))
  };
};
