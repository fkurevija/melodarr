import { NextRequest } from "next/server";

import { env } from "@/lib/env";

export const clientIp = (req: NextRequest): string => {
  if (!env.trustedProxy) return "direct";

  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return "direct";

  const hops = forwarded.split(",").map((value) => value.trim()).filter(Boolean);
  return hops.at(-1) || "direct";
};
