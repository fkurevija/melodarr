import { describe, expect, it, vi } from "vitest";

import { getSafeReturnPath } from "../lib/navigation/return-path";

describe("getSafeReturnPath", () => {
  it("keeps app-relative paths", () => {
    expect(getSafeReturnPath("/discover")).toBe("/discover");
    expect(getSafeReturnPath("/discover/artist-1?artistName=Name&view=grid")).toBe(
      "/discover/artist-1?artistName=Name&view=grid"
    );
  });

  it("prefixes safe return paths when a subpath is configured", () => {
    vi.stubEnv("BASE_PATH", "/melodarr");

    expect(getSafeReturnPath("/discover")).toBe("/melodarr/discover");
    expect(getSafeReturnPath("https://example.com", "/requests")).toBe("/melodarr/requests");
    expect(getSafeReturnPath("/melodarr/discover")).toBe("/melodarr/discover");

    vi.unstubAllEnvs();
  });

  it("rejects external and scheme-based URLs", () => {
    expect(getSafeReturnPath("https://example.com", "/requests")).toBe("/requests");
    expect(getSafeReturnPath("//example.com/path", "/requests")).toBe("/requests");
    expect(getSafeReturnPath("javascript:alert(1)", "/requests")).toBe("/requests");
    expect(getSafeReturnPath("data:text/html,hello", "/requests")).toBe("/requests");
  });

  it("rejects empty, whitespace-only, and malformed values", () => {
    expect(getSafeReturnPath(null, "/requests")).toBe("/requests");
    expect(getSafeReturnPath("   ", "/requests")).toBe("/requests");
    expect(getSafeReturnPath("discover", "/requests")).toBe("/requests");
    expect(getSafeReturnPath("/discover\n//example.com", "/requests")).toBe("/requests");
  });
});
