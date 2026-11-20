import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaRequest = {
  count: vi.fn()
};

const getRuntimeConfig = vi.fn();
const syncSubmittedAlbumRequests = vi.fn();
const syncSubmittedAlbumRequestsIfStale = vi.fn();
const withOptimizedImageUrlsForMany = vi.fn(async <T>(items: T[]) => items);

const clientInstance = {
  isAvailable: vi.fn(),
  getAllAlbums: vi.fn(),
  getAlbumFileCounts: vi.fn(),
  albumNeedsFileCountFallback: vi.fn(),
  isAlbumFullyAvailable: vi.fn(),
  getRecentImportedAlbums: vi.fn()
};

const LidarrClient = vi.fn(function LidarrClientMock() {
  return clientInstance;
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    request: prismaRequest
  }
}));

vi.mock("@/lib/settings/store", () => ({
  getRuntimeConfig
}));

vi.mock("@/lib/requests/service", () => ({
  syncSubmittedAlbumRequests,
  syncSubmittedAlbumRequestsIfStale
}));

vi.mock("@/lib/images", () => ({
  withOptimizedImageUrlsForMany
}));

vi.mock("@/lib/lidarr/client", () => ({
  LidarrClient
}));

describe("getDiscoverHomeData", () => {
  const configureLidarr = () => {
    getRuntimeConfig.mockResolvedValue({
      lidarrUrl: "http://lidarr",
      lidarrApiKey: "test-key"
    });
    clientInstance.isAvailable.mockResolvedValue(true);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clientInstance.getAlbumFileCounts.mockResolvedValue({});
    clientInstance.albumNeedsFileCountFallback.mockReturnValue(false);
    clientInstance.getAllAlbums.mockResolvedValue([]);
    clientInstance.getRecentImportedAlbums.mockResolvedValue([]);
    syncSubmittedAlbumRequestsIfStale.mockResolvedValue([]);
    prismaRequest.count.mockResolvedValue(0);
  });

  it("uses cooldown-capped sync and counts the queue after it completes", async () => {
    const callOrder: string[] = [];
    const importedAt = new Date(Date.now() - 60_000).toISOString();

    configureLidarr();
    clientInstance.getAllAlbums.mockResolvedValue([
      {
        id: 99,
        title: "1984",
        foreignAlbumId: "album-1984",
        albumType: "Album",
        artist: {
          artistName: "Van Halen",
          foreignArtistId: "artist-van-halen"
        },
        statistics: {
          trackFileCount: 9,
          trackCount: 9
        }
      },
      {
        id: 100,
        title: "Unavailable",
        artist: {
          artistName: "Van Halen"
        },
        statistics: {
          trackFileCount: 1,
          trackCount: 9
        }
      }
    ]);
    clientInstance.isAlbumFullyAvailable.mockImplementation((album: { id: number; statistics?: { trackFileCount?: number; trackCount?: number } }) =>
      album.id === 99 && album.statistics?.trackFileCount === album.statistics?.trackCount
    );
    clientInstance.getRecentImportedAlbums.mockResolvedValue([
      {
        albumId: 99,
        importedAt: new Date(Date.now() - 120_000).toISOString()
      },
      {
        albumId: 99,
        importedAt
      },
      {
        albumId: 100,
        importedAt
      }
    ]);
    syncSubmittedAlbumRequestsIfStale.mockImplementation(async () => {
      callOrder.push("sync");
      return ["request-1"];
    });
    prismaRequest.count.mockImplementation(async () => {
      callOrder.push("count");
      return 0;
    });

    const { getDiscoverHomeData } = await import("../lib/discover/home");
    const result = await getDiscoverHomeData();

    expect(syncSubmittedAlbumRequests).not.toHaveBeenCalled();
    expect(syncSubmittedAlbumRequestsIfStale).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["sync", "count"]);
    expect(result.queuedRequestCount).toBe(0);
    expect(result.readyToPlayCount).toBe(1);
    expect(result.freshPickCount).toBe(1);
    expect(result.freshThisWeek).toEqual([
      expect.objectContaining({
        id: 99,
        title: "1984",
        artistName: "Van Halen",
        addedAt: importedAt
      })
    ]);
  });

  it("starts library loading while request sync is still in flight", async () => {
    configureLidarr();

    let resolveSync!: (value: string[]) => void;
    let resolveAlbums!: (value: unknown[]) => void;
    const libraryStart = vi.fn();

    syncSubmittedAlbumRequestsIfStale.mockImplementation(() =>
      new Promise<string[]>((resolve) => {
        resolveSync = resolve;
      })
    );
    clientInstance.getAllAlbums.mockImplementation(() => {
      libraryStart();
      return new Promise<unknown[]>((resolve) => {
        resolveAlbums = resolve;
      });
    });

    const { getDiscoverHomeData } = await import("../lib/discover/home");
    const pending = getDiscoverHomeData();

    await vi.waitFor(() => {
      expect(libraryStart).toHaveBeenCalledTimes(1);
    });
    expect(prismaRequest.count).not.toHaveBeenCalled();

    resolveAlbums([]);
    resolveSync([]);
    await pending;

    expect(prismaRequest.count).toHaveBeenCalledTimes(1);
  });

  it("fetches file-count fallbacks and import history in parallel", async () => {
    configureLidarr();
    clientInstance.getAllAlbums.mockResolvedValue([
      { id: 7, title: "No statistics" }
    ]);
    clientInstance.albumNeedsFileCountFallback.mockReturnValue(true);

    let resolveCounts!: (value: Record<number, number>) => void;
    let resolveHistory!: (value: unknown[]) => void;
    const countsStart = vi.fn();
    const historyStart = vi.fn();

    clientInstance.getAlbumFileCounts.mockImplementation(() => {
      countsStart();
      return new Promise<Record<number, number>>((resolve) => {
        resolveCounts = resolve;
      });
    });
    clientInstance.getRecentImportedAlbums.mockImplementation(() => {
      historyStart();
      return new Promise<unknown[]>((resolve) => {
        resolveHistory = resolve;
      });
    });

    const { getDiscoverHomeData } = await import("../lib/discover/home");
    const pending = getDiscoverHomeData();

    await vi.waitFor(() => {
      expect(countsStart).toHaveBeenCalledTimes(1);
      expect(historyStart).toHaveBeenCalledTimes(1);
    });

    resolveCounts({});
    resolveHistory([]);
    await pending;
  });

  it("returns unavailable state with queued count when Lidarr cannot be reached", async () => {
    getRuntimeConfig.mockResolvedValue({
      lidarrUrl: "http://lidarr",
      lidarrApiKey: "test-key"
    });
    clientInstance.isAvailable.mockResolvedValue(false);
    prismaRequest.count.mockResolvedValue(2);

    const { getDiscoverHomeData } = await import("../lib/discover/home");
    const result = await getDiscoverHomeData();

    expect(syncSubmittedAlbumRequestsIfStale).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      freshPickCount: 0,
      queuedRequestCount: 2,
      readyToPlayCount: 0,
      freshThisWeek: [],
      libraryStatus: "unavailable"
    });
  });
});
