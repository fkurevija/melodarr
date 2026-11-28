import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestStatus, RequestType } from "@prisma/client";

const prismaRequest = {
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn()
};

const prisma = { request: prismaRequest };

const clientInstance = {
  getEffectiveAddDefaults: vi.fn(),
  getExistingArtistByForeignId: vi.fn(),
  getExistingAlbumByForeignId: vi.fn(),
  addArtist: vi.fn(),
  deleteAlbum: vi.fn(),
  deleteArtist: vi.fn(),
  isAlbumFullyAvailable: vi.fn(),
  getAlbumById: vi.fn(),
  getArtistById: vi.fn()
};

const LidarrClient = vi.fn(function LidarrClientMock() {
  return clientInstance;
});

vi.mock("@/lib/db/prisma", () => ({ prisma }));
vi.mock("@/lib/settings/store", () => ({ getRuntimeConfig: vi.fn() }));
vi.mock("@/lib/lidarr/client", () => ({ LidarrClient }));

describe("request state ownership", () => {
  let getRuntimeConfig: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    const store = await import("@/lib/settings/store");
    getRuntimeConfig = vi.mocked(store.getRuntimeConfig);
    getRuntimeConfig.mockResolvedValue({
      lidarrUrl: "http://lidarr",
      lidarrApiKey: "test-key",
      lidarrRootFolder: "/music",
      lidarrQualityProfileId: 7,
      lidarrMetadataProfileId: 3,
      lidarrMonitorMode: "all",
      requestAutoApprove: false
    });
    clientInstance.getEffectiveAddDefaults.mockResolvedValue({
      rootFolderPath: "/music",
      qualityProfileId: 7,
      metadataProfileId: 3
    });
    clientInstance.addArtist.mockResolvedValue({ id: 41, artistName: "U2" });
  });
  afterEach(() => { vi.useRealTimers(); });

  it("approves a pending request exactly once even under concurrency", async () => {
    prismaRequest.findUnique.mockResolvedValue({
      id: "req-1",
      requestType: RequestType.ALBUM,
      status: RequestStatus.PENDING,
      artistName: "U2",
      albumTitle: "War",
      foreignArtistId: undefined,
      foreignAlbumId: undefined
    });
    prismaRequest.updateMany.mockResolvedValue({ count: 1 });
    clientInstance.getExistingArtistByForeignId.mockResolvedValue(null);
    clientInstance.getExistingAlbumByForeignId.mockResolvedValue(null);
    clientInstance.addArtist.mockResolvedValue({ id: 7, artistName: "U2", foreignArtistId: null });
    prismaRequest.update.mockResolvedValue({ id: "req-1", status: RequestStatus.SUBMITTED });

    const { approvePendingRequest } = await import("../lib/requests/service");
    const result = await approvePendingRequest("req-1");

    expect(prismaRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "req-1", status: RequestStatus.PENDING },
      data: { status: RequestStatus.APPROVED }
    });
    expect(clientInstance.addArtist).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(RequestStatus.SUBMITTED);
  });

  it("does not submit again when another approval already won", async () => {
    prismaRequest.findUnique.mockResolvedValue({
      id: "req-1",
      requestType: RequestType.ALBUM,
      status: RequestStatus.PENDING,
      artistName: "U2",
      albumTitle: "War",
      foreignArtistId: undefined,
      foreignAlbumId: undefined
    });
    prismaRequest.updateMany.mockResolvedValue({ count: 0 });

    const { approvePendingRequest } = await import("../lib/requests/service");
    await approvePendingRequest("req-1");

    expect(clientInstance.addArtist).not.toHaveBeenCalled();
  });

  it("deletes only the Lidarr target that matches the request identity", async () => {
    prismaRequest.findUnique.mockResolvedValue({
      id: "req-2",
      requestType: RequestType.ALBUM,
      status: RequestStatus.SUBMITTED,
      artistName: "U2",
      albumTitle: "War",
      lidarrAlbumId: 99,
      foreignAlbumId: "album-war"
    });
    clientInstance.getAlbumById.mockResolvedValue({
      id: 99,
      title: "War",
      foreignAlbumId: "album-war",
      monitored: true
    });

    const { deleteRequestFromLidarr } = await import("../lib/requests/service");
    await deleteRequestFromLidarr("req-2");

    expect(clientInstance.deleteAlbum).toHaveBeenCalledWith(99, true);
    expect(prismaRequest.update).toHaveBeenCalledWith({
      where: { id: "req-2" },
      data: expect.objectContaining({ lidarrAlbumId: null })
    });
  });

  it("aborts deletion when the resolved Lidarr target does not match the request", async () => {
    prismaRequest.findUnique.mockResolvedValue({
      id: "req-3",
      requestType: RequestType.ALBUM,
      status: RequestStatus.SUBMITTED,
      artistName: "U2",
      albumTitle: "War",
      lidarrAlbumId: 99,
      foreignAlbumId: "album-war"
    });
    clientInstance.getAlbumById.mockResolvedValue({
      id: 99,
      title: "Different",
      foreignAlbumId: "album-other"
    });

    const { deleteRequestFromLidarr } = await import("../lib/requests/service");
    await expect(deleteRequestFromLidarr("req-3")).rejects.toThrow(/does not match this request/i);
    expect(clientInstance.deleteAlbum).not.toHaveBeenCalled();
  });

  it("sync completes per-row and keeps going when one row fails", async () => {
    prismaRequest.findMany.mockResolvedValue([
      { id: "r1", status: RequestStatus.SUBMITTED, requestType: RequestType.ALBUM, lidarrAlbumId: 1 },
      { id: "r2", status: RequestStatus.SUBMITTED, requestType: RequestType.ALBUM, lidarrAlbumId: 2 }
    ]);
    clientInstance.getAlbumById
      .mockResolvedValueOnce({ id: 1, monitored: true })
      .mockRejectedValueOnce(new Error("Lidarr gone"));
    clientInstance.isAlbumFullyAvailable.mockResolvedValue(true);
    prismaRequest.updateMany.mockResolvedValue({ count: 1 });

    const { syncSubmittedAlbumRequests } = await import("../lib/requests/service");
    const completed = await syncSubmittedAlbumRequests();

    expect(completed).toEqual(["r1"]);
    expect(prismaRequest.updateMany).toHaveBeenCalledTimes(1);
  });

  it("advances the sync cooldown even when sync throws", async () => {
    prismaRequest.findMany.mockResolvedValue([]);
    prismaRequest.updateMany.mockResolvedValue({ count: 0 });

    const { syncSubmittedAlbumRequestsIfStale } = await import("../lib/requests/service");
    await expect(syncSubmittedAlbumRequestsIfStale()).resolves.toEqual([]);
    vi.setSystemTime(Date.now() + 100);
    await expect(syncSubmittedAlbumRequestsIfStale()).resolves.toEqual([]);
  });

  it("does not treat a missing album as completed during sync", async () => {
    prismaRequest.findMany.mockResolvedValue([
      { id: "r1", status: RequestStatus.SUBMITTED, requestType: RequestType.ALBUM, lidarrAlbumId: 1 }
    ]);
    clientInstance.getAlbumById.mockResolvedValue(null);

    const { syncSubmittedAlbumRequests } = await import("../lib/requests/service");
    await syncSubmittedAlbumRequests();

    expect(prismaRequest.updateMany).not.toHaveBeenCalled();
  });
});
