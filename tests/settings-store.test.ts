import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const upsert = vi.fn();
const decryptText = vi.fn(async (value: string) => `decrypted:${value}`);
const encryptText = vi.fn(async (value: string) => `encrypted:${value}`);

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    appConfig: { findUnique, update, upsert }
  }
}));

vi.mock("@/lib/crypto/secrets", () => ({ decryptText, encryptText }));

vi.mock("@/lib/env", () => ({
  env: {
    appUrl: undefined,
    jellyfinUrl: undefined,
    jellyfinApiKey: undefined,
    lidarrUrl: undefined,
    lidarrApiKey: undefined,
    lidarrRootFolder: undefined,
    lidarrQualityProfileId: undefined,
    lidarrMetadataProfileId: undefined,
    lidarrMonitorMode: undefined,
    requestAutoApprove: undefined,
    sessionSecret: undefined
  }
}));

describe("runtime config cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    findUnique.mockResolvedValue(null);
    update.mockResolvedValue({});
    upsert.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("collapses concurrent and sequential reads into one database load", async () => {
    const { getRuntimeConfig } = await import("../lib/settings/store");

    const [first, second] = await Promise.all([getRuntimeConfig(), getRuntimeConfig()]);
    const third = await getRuntimeConfig();

    expect(first).toEqual(second);
    expect(second).toEqual(third);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(decryptText).not.toHaveBeenCalled();
  });

  it("reloads after updateConfig changes persisted settings", async () => {
    const { getRuntimeConfig, updateConfig } = await import("../lib/settings/store");

    await getRuntimeConfig();
    await updateConfig({ lidarrUrl: "http://lidarr" });
    await getRuntimeConfig();

    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lidarrUrl: "http://lidarr" } })
    );
  });

  it("reloads once the cache ttl has elapsed", async () => {
    const start = Date.UTC(2026, 0, 1);
    vi.useFakeTimers();
    vi.setSystemTime(start);

    const { getRuntimeConfig } = await import("../lib/settings/store");
    await getRuntimeConfig();
    vi.setSystemTime(start + 30_000);
    await getRuntimeConfig();

    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});
