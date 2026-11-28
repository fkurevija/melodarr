import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

const resolvedAddress = { address: "93.184.216.34", family: 4 } as const;

const httpRequestMock = vi.fn();
const httpsRequestMock = vi.fn();

vi.mock("node:http", () => ({
  request: httpRequestMock,
}));

vi.mock("node:https", () => ({
  request: httpsRequestMock,
}));

describe("requestPinnedUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("honours Node autoSelectFamily's lookup with all:true", async () => {
    const lookupCalls: unknown[][] = [];

    httpsRequestMock.mockImplementation(({ lookup }: { lookup?: unknown }, onResponse: unknown) => {
      const cb = lookup as (hostname: string, options: unknown, callback: (err: unknown, address: unknown, family?: number) => void) => void;
      if (typeof cb === "function") {
        cb("example.com", { hints: 32, all: true }, (err: unknown, addrs: unknown) => {
          lookupCalls.push(["all", addrs, err]);
        });
        cb("example.com", { hints: 32 }, (err: unknown, addr: unknown, family: unknown) => {
          lookupCalls.push(["single", addr, err, family]);
        });
      }

      const stream = Readable.from([Buffer.from("image-bytes")]) as unknown as Readable & { statusCode: number; headers: Record<string, string>; resume: () => void };
      stream.statusCode = 200;
      stream.headers = {};
      stream.resume = vi.fn();
      const req = { destroy: vi.fn(), on: vi.fn(), end: vi.fn() };
      (onResponse as (response: unknown) => void)(stream);
      return req as unknown;
    });

    const { requestPinnedUrl } = await import("../lib/http/pinned-request");
    const body = await requestPinnedUrl(new URL("https://example.com/album.jpg"), resolvedAddress);

    expect(body.status).toBe(200);
    expect(httpsRequestMock).toHaveBeenCalledTimes(1);

    const allCall = lookupCalls.find(([mode]) => mode === "all");
    expect(allCall).toBeDefined();
    expect(Array.isArray(allCall?.[1])).toBe(true);
    expect((allCall?.[1] as unknown[])[0]).toMatchObject({ address: resolvedAddress.address, family: resolvedAddress.family });

    const singleCall = lookupCalls.find(([mode]) => mode === "single");
    expect(singleCall).toBeDefined();
    expect(singleCall?.[1]).toBe(resolvedAddress.address);
    expect(singleCall?.[3]).toBe(resolvedAddress.family);
  });

  it("sends a default User-Agent like the native fetch it replaced", async () => {
    httpsRequestMock.mockImplementation((opts: { headers?: Record<string, string> }, onResponse?: (response: unknown) => void) => {
      const stream = Readable.from([Buffer.from("image-bytes")]) as unknown as Readable & { statusCode: number; headers: Record<string, string>; resume: () => void };
      stream.statusCode = 200;
      stream.headers = {};
      stream.resume = vi.fn();
      const req = { destroy: vi.fn(), on: vi.fn(), end: vi.fn() };
      onResponse?.(stream);
      return req as unknown;
    });

    const { requestPinnedUrl } = await import("../lib/http/pinned-request");
    await requestPinnedUrl(new URL("https://example.com/album.jpg"), resolvedAddress);

    const { headers } = httpsRequestMock.mock.calls[0][0] as { headers?: Record<string, string> };
    expect(headers?.["user-agent"]).toBeDefined();
  });
  });

describe("requestPinnedUrl", () => {
  it("rejects cleanly when called with an already aborted signal", async () => {
    const errorHandlers: Array<(error: Error) => void> = [];
    const closeHandlers: Array<() => void> = [];
    const destroyMock = vi.fn((error?: Error) => {
      if (error) {
        for (const handler of errorHandlers) {
          handler(error);
        }
      }

      for (const handler of closeHandlers) {
        handler();
      }
    });

    httpsRequestMock.mockImplementation(() => ({
      destroy: destroyMock,
      end: vi.fn(),
      on(event: string, handler: (error?: Error) => void) {
        if (event === "error") {
          errorHandlers.push(handler as (error: Error) => void);
        }

        if (event === "close") {
          closeHandlers.push(handler as () => void);
        }

        return this;
      },
    }));

    const { requestPinnedUrl } = await import("../lib/http/pinned-request");
    const controller = new AbortController();
    controller.abort();

    await expect(
      requestPinnedUrl(
        new URL("https://images.example/cover.jpg"),
        { address: "93.184.216.34", family: 4 },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ message: "Image request timed out", status: 504 });

    expect(destroyMock).toHaveBeenCalledTimes(1);
  });
});
