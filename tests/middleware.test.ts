import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

describe("runtime base path middleware", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes requests through when no base path is configured", () => {
    vi.stubEnv("BASE_PATH", "");

    const response = middleware(new NextRequest("https://example.com/discover"));

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("rewrites prefixed requests to their internal path", () => {
    vi.stubEnv("BASE_PATH", "/melodarr");

    const response = middleware(new NextRequest("https://example.com/melodarr/discover?q=x"));

    expect(response.headers.get("x-middleware-rewrite")).toContain("/discover?q=x");
  });

  it("rewrites the bare prefix to the landing page", () => {
    vi.stubEnv("BASE_PATH", "/melodarr");

    const response = middleware(new NextRequest("https://example.com/melodarr"));

    expect(response.headers.get("x-middleware-rewrite")).toBe("https://example.com/discover");
    expect(response.status).toBe(200);
  });
});
