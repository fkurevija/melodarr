import { beforeEach, describe, expect, it, vi } from "vitest";

const getRuntimeSecret = vi.fn(async () => "test-secret");
vi.mock("@/lib/runtime/secret", () => ({ getRuntimeSecret }));

describe("encrypted payload versioning", () => {
  beforeEach(() => { getRuntimeSecret.mockClear(); });

  it("round-trips a versioned payload", async () => {
    const { encryptText, decryptText } = await import("../lib/crypto/secrets");
    const encrypted = await encryptText("api-key-value");
    expect(encrypted.startsWith("v1:")).toBe(true);
    await expect(decryptText(encrypted)).resolves.toBe("api-key-value");
  });

  it("still reads legacy unversioned payloads", async () => {
    const { encryptText, decryptText } = await import("../lib/crypto/secrets");
    const current = await encryptText("legacy-value");
    const legacy = current.split(":").slice(1).join(":");
    await expect(decryptText(legacy)).resolves.toBe("legacy-value");
  });

  it("rejects an unknown payload version", async () => {
    const { decryptText } = await import("../lib/crypto/secrets");
    await expect(decryptText("v99:aaa:bbb:ccc")).rejects.toThrow(/version/i);
  });
});
