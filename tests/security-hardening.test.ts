import { beforeEach, describe, expect, it, vi } from "vitest";

let trustedProxy = false;

const { getEffectiveAppUrl, getStoredRuntimeFields, upsert } = vi.hoisted(() => ({
  getEffectiveAppUrl: vi.fn(async () => "https://melodarr.example.com"),
  getStoredRuntimeFields: vi.fn(),
  upsert: vi.fn()
}));

vi.mock("@/lib/env", () => ({
  env: {
    get trustedProxy() { return trustedProxy; },
    get sessionSecret() { return undefined; }
  }
}));

vi.mock("@/lib/runtime/app-config", () => ({ getEffectiveAppUrl, getStoredRuntimeFields }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { appConfig: { upsert } } }));

import { validateMutationRequest } from "../lib/http/mutation-guard";
import { enforcePreParseRateLimit } from "../lib/auth/login-rate-limit";
import { getRuntimeSecret } from "../lib/runtime/secret";
import { toSafeApiError } from "../lib/http/upstream-errors";
import { isValidForeignId } from "../lib/search/foreign-id";

const mutationRequest = (headers: Record<string, string>, url = "http://localhost:3000/api/auth/logout") => ({
  method: "POST",
  headers: new Headers(headers),
  url
});

describe("trusted proxy origin handling", () => {
  beforeEach(() => {
    trustedProxy = false;
    getEffectiveAppUrl.mockResolvedValue("https://melodarr.example.com");
  });

  it("rejects an origin supplied only through forwarded headers by default", async () => {
    const response = await validateMutationRequest(mutationRequest({
      host: "localhost:3000",
      origin: "https://evil.example.com",
      "x-forwarded-host": "evil.example.com",
      "x-forwarded-proto": "https"
    }));

    expect(response?.status).toBe(403);
  });

  it("honours forwarded headers when TRUSTED_PROXY is enabled", async () => {
    trustedProxy = true;

    const response = await validateMutationRequest(mutationRequest({
      host: "localhost:3000",
      origin: "https://music.example.com",
      "x-forwarded-host": "music.example.com",
      "x-forwarded-proto": "https"
    }));

    expect(response).toBeNull();
  });
});

describe("runtime secret safety", () => {
  beforeEach(() => {
    trustedProxy = false;
    upsert.mockClear();
    getStoredRuntimeFields.mockResolvedValue({
      appUrl: null,
      runtimeSecret: null,
      jellyfinApiKeyEncrypted: "v1:aaa:bbb:ccc",
      lidarrApiKeyEncrypted: null
    });
    vi.resetModules();
  });

  it("refuses to generate a new secret when encrypted keys exist", async () => {
    const secretModule = await import("../lib/runtime/secret");
    await expect(secretModule.getRuntimeSecret()).rejects.toThrow(/encrypted settings/i);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("upstream error mapping", () => {
  it("does not relay raw upstream error bodies", () => {
    const mapped = toSafeApiError(new Error("Lidarr API error (500): api-key=super-secret"), "details failed");
    expect(mapped.message).not.toContain("api-key");
    expect(mapped.status).toBe(502);
  });

  it("preserves explicitly safe client errors", () => {
    expect(toSafeApiError(Object.assign(new Error("Album ID is required"), { status: 400 }), "details failed"))
      .toEqual({ message: "Album ID is required", status: 400 });
  });
});

describe("foreign id validation", () => {
  it("accepts a MusicBrainz style id", () => {
    expect(isValidForeignId("a2b3c4d5-1234-5678-9abc-def012345678")).toBe(true);
  });

  it("rejects path traversal and separators", () => {
    expect(isValidForeignId("../../etc/passwd")).toBe(false);
    expect(isValidForeignId("abc/def")).toBe(false);
  });
});
