import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { enforceLoginRateLimit, enforcePreParseRateLimit } from "../lib/auth/login-rate-limit";
import { enforceRateLimit } from "../lib/rate-limit/simple";

const { trustedProxyState } = vi.hoisted(() => ({ trustedProxyState: { value: false } }));

vi.mock("@/lib/env", () => ({
  env: { get trustedProxy() { return trustedProxyState.value; } }
}));

vi.mock("@/lib/rate-limit/simple", () => ({
  enforceRateLimit: vi.fn()
}));

const mockedEnforceRateLimit = vi.mocked(enforceRateLimit);

describe("enforceLoginRateLimit", () => {
  it("checks username and global buckets for direct clients", async () => {
    trustedProxyState.value = false;
    mockedEnforceRateLimit.mockResolvedValue({ allowed: true, remaining: 1, retryAfterSec: 60 });

    const request = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.10" }
    });

    await expect(enforceLoginRateLimit(request, " Admin ")).resolves.toEqual({
      allowed: true,
      retryAfterSec: 0
    });

    expect(mockedEnforceRateLimit).not.toHaveBeenCalledWith("login:ip:203.0.113.10", expect.anything());
    expect(mockedEnforceRateLimit).toHaveBeenCalledWith("login:user:admin", {
      max: 20,
      windowSec: 300
    });
    expect(mockedEnforceRateLimit).toHaveBeenCalledWith("login:global", {
      max: 300,
      windowSec: 60
    });
  });

  it("uses the last forwarded hop as the client ip when TRUSTED_PROXY is enabled", async () => {
    trustedProxyState.value = true;
    mockedEnforceRateLimit.mockResolvedValue({ allowed: true, remaining: 1, retryAfterSec: 60 });

    const request = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" }
    });

    await enforceLoginRateLimit(request, "admin");
    expect(mockedEnforceRateLimit).toHaveBeenCalledWith("login:ip:10.0.0.1", {
      max: 10,
      windowSec: 60
    });
  });

  it("limits malformed login bodies before parsing", async () => {
    trustedProxyState.value = false;
    mockedEnforceRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 45 });

    await expect(enforcePreParseRateLimit(new NextRequest("http://localhost:3000/api/auth/login")))
      .resolves.toEqual({ allowed: false, retryAfterSec: 45 });
    expect(mockedEnforceRateLimit).toHaveBeenCalledWith("login:pre:direct", {
      max: 120,
      windowSec: 60
    });
  });

  it("blocks when any bucket is exhausted", async () => {
    mockedEnforceRateLimit
      .mockResolvedValueOnce({ allowed: true, remaining: 1, retryAfterSec: 60 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 240 })
      .mockResolvedValueOnce({ allowed: true, remaining: 1, retryAfterSec: 60 });

    const request = new NextRequest("http://localhost:3000/api/auth/login", { method: "POST" });

    await expect(enforceLoginRateLimit(request, "admin")).resolves.toEqual({
      allowed: false,
      retryAfterSec: 240
    });
  });
});
